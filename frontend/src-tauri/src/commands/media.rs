use crate::diagnostics;
use std::path::Path;
use tauri::{command, AppHandle, Manager};
use uuid::Uuid;

/// Simple media import that returns basic metadata.
#[command]
pub async fn import_media(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Media",
        "Importing media",
        Some(&format!("path={}", path)),
    );

    let id = Uuid::new_v4().to_string();
    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // TODO: Real ffprobe call for accurate duration, resolution, fps
    Ok(serde_json::json!({
        "id": id,
        "name": name,
        "path": path,
        "duration": 10.0,
        "width": 1920,
        "height": 1080,
        "fps": 30.0
    }))
}

/// Real waveform extraction using ffmpeg + downsampling.
/// Produces ~2000 points suitable for timeline rendering.
#[command]
pub async fn extract_waveform(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Media",
        "Extracting real waveform",
        Some(&format!("path={}", path)),
    );

    let app_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let temp_dir = app_data.join("temp");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let temp_wav = temp_dir.join(format!("wf_{}.wav", Uuid::new_v4()));

    // Use ffmpeg via shell plugin (we can improve to direct call later)
    let shell = app.shell();

    // Extract mono 16kHz WAV
    let output = shell
        .command("ffmpeg")
        .args([
            "-y",
            "-i", &path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            temp_wav.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg error: {}", stderr));
    }

    // Parse WAV and downsample
    let samples = parse_wav_to_downsampled(&temp_wav, 2000)
        .map_err(|e| format!("Failed to parse waveform: {}", e))?;

    // Cleanup
    let _ = std::fs::remove_file(&temp_wav);

    Ok(serde_json::json!({
        "samples": samples,
        "sample_rate": 16000,
        "duration": 10.0, // TODO: get real duration
        "channels": 1
    }))
}

/// Real A-B segment extraction.
#[command]
pub async fn extract_segment(
    app: AppHandle,
    path: String,
    start_time: f64,
    end_time: f64,
) -> Result<String, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Media",
        "Extracting real A-B segment",
        Some(&format!("start={:.2} end={:.2}", start_time, end_time)),
    );

    let app_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let exports_dir = app_data.join("exports");
    std::fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

    let output_name = format!("segment_{:.2}_{:.2}_{}.wav", start_time, end_time, Uuid::new_v4());
    let output_path = exports_dir.join(&output_name);

    let duration = end_time - start_time;

    let shell = app.shell();
    let output = shell
        .command("ffmpeg")
        .args([
            "-y",
            "-i", &path,
            "-vn",
            "-ss", &start_time.to_string(),
            "-t", &duration.to_string(),
            "-acodec", "pcm_s16le",
            "-ar", "24000",
            "-ac", "1",
            output_path.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg error: {}", stderr));
    }

    Ok(output_path.to_string_lossy().to_string())
}

// --- Internal WAV parser (simplified but functional) ---
fn parse_wav_to_downsampled(path: &Path, target_points: usize) -> Result<Vec<f32>, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};

    let mut file = File::open(path).map_err(|e| e.to_string())?;

    // Very simplified WAV reader (assumes standard 16-bit mono PCM)
    let mut header = [0u8; 44];
    file.read_exact(&mut header).map_err(|e| e.to_string())?;

    if &header[0..4] != b"RIFF" || &header[8..12] != b"WAVE" {
        return Err("Invalid WAV".into());
    }

    let sample_rate = u32::from_le_bytes([header[24], header[25], header[26], header[27]]);
    let bits = u16::from_le_bytes([header[34], header[35]]);

    if bits != 16 {
        return Err("Only 16-bit supported for now".into());
    }

    // Find data chunk
    let mut data_size = 0u32;
    loop {
        let mut chunk_id = [0u8; 4];
        file.read_exact(&mut chunk_id).map_err(|e| e.to_string())?;
        let mut size = [0u8; 4];
        file.read_exact(&mut size).map_err(|e| e.to_string())?;
        let chunk_size = u32::from_le_bytes(size);

        if &chunk_id == b"data" {
            data_size = chunk_size;
            break;
        } else {
            file.seek(SeekFrom::Current(chunk_size as i64)).ok();
        }
    }

    let num_samples = (data_size / 2) as usize;
    let samples_to_read = num_samples.min(10_000_000);
    let mut raw = vec![0u8; samples_to_read * 2];
    file.read_exact(&mut raw).map_err(|e| e.to_string())?;

    let mut samples = Vec::with_capacity(samples_to_read);
    for i in 0..samples_to_read {
        let val = i16::from_le_bytes([raw[i*2], raw[i*2+1]]) as f32 / 32768.0;
        samples.push(val.abs());
    }

    // Downsample to target_points
    let mut downsampled = vec![0f32; target_points];
    let bucket_size = samples.len() / target_points;

    for i in 0..target_points {
        let start = i * bucket_size;
        let end = ((i + 1) * bucket_size).min(samples.len());
        let max = samples[start..end].iter().fold(0f32, |a, &b| a.max(b));
        downsampled[i] = max;
    }

    Ok(downsampled)
}