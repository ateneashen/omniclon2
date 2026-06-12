use crate::diagnostics;
use std::path::Path;
use tauri::{command, AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
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

    // Try to get real metadata with ffprobe (if available in PATH)
    let mut duration = 10.0f64;
    let mut width = 1920i64;
    let mut height = 1080i64;
    let fps = 30.0f64;

    let shell = app.shell();
    let ffprobe_output = shell.command("ffprobe")
        .args(["-v", "error", "-show_entries", "format=duration:stream=width,height,r_frame_rate", "-of", "default=noprint_wrappers=1:nokey=1", &path])
        .output()
        .await;

    if let Ok(output) = ffprobe_output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let lines: Vec<&str> = stdout.trim().lines().collect();
            if lines.len() >= 1 {
                if let Ok(d) = lines[0].parse::<f64>() { duration = d; }
            }
            if lines.len() >= 3 {
                if let Ok(w) = lines[1].parse::<i64>() { width = w; }
                if let Ok(h) = lines[2].parse::<i64>() { height = h; }
            }
            // Note: r_frame_rate is like "30/1", parsing fps can be added later
        }
    }

    Ok(serde_json::json!({
        "id": id,
        "name": name,
        "path": path,
        "duration": duration,
        "width": width,
        "height": height,
        "fps": fps
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

// --- WAV parser using the robust `hound` crate ---
fn parse_wav_to_downsampled(path: &Path, target_points: usize) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| format!("WAV open error: {}", e))?;
    let spec = reader.spec();

    // Hound normalizes samples to f32 in [-1, 1]. We use absolute amplitude.
    let samples: Vec<f32> = reader
        .samples::<f32>()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("WAV sample read error: {}", e))?
        .into_iter()
        .map(|s| s.abs())
        .collect();

    if samples.is_empty() {
        return Ok(vec![0.0; target_points]);
    }

    // Average channels if stereo (interleaved samples)
    let samples = if spec.channels == 2 {
        samples
            .chunks_exact(2)
            .map(|c| (c[0] + c[1]) / 2.0)
            .collect::<Vec<_>>()
    } else {
        samples
    };

    // Downsample to target_points by taking max amplitude per bucket
    let mut downsampled = vec![0.0f32; target_points];
    let bucket_size = (samples.len() as f64 / target_points as f64).max(1.0) as usize;

    for i in 0..target_points {
        let start = (i * bucket_size).min(samples.len());
        let end = ((i + 1) * bucket_size).min(samples.len());
        if start < end {
            let max = samples[start..end].iter().fold(0.0f32, |a, &b| a.max(b));
            downsampled[i] = max;
        }
    }

    Ok(downsampled)
}