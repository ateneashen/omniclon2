use crate::diagnostics;
use std::path::Path;
use tauri::{command, AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;

/// List audio tracks embedded in a media file.
#[command]
pub async fn audio_tracks(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Media",
        "Listing audio tracks",
        Some(&format!("path={}", path)),
    );

    let shell = app.shell();
    let output = shell
        .command("ffprobe")
        .args([
            "-v", "error",
            "-show_streams",
            "-print_format", "json",
            &path,
        ])
        .output()
        .await;

    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let data: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;
            let tracks: Vec<serde_json::Value> = data
                .get("streams")
                .and_then(|s| s.as_array())
                .map(|streams| {
                    streams
                        .iter()
                        .filter(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("audio"))
                        .map(|s| {
                            serde_json::json!({
                                "index": s.get("index"),
                                "codec_name": s.get("codec_name").and_then(|c| c.as_str()).unwrap_or(""),
                                "language": s.get("tags").and_then(|t| t.get("language")).and_then(|l| l.as_str()).unwrap_or("unknown"),
                                "title": s.get("tags").and_then(|t| t.get("title")).and_then(|l| l.as_str()).unwrap_or(""),
                                "channels": s.get("channels").and_then(|c| c.as_u64()).unwrap_or(0),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            Ok(serde_json::json!({ "success": true, "tracks": tracks }))
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("ffprobe error: {}", stderr))
        }
        Err(e) => Err(format!("ffprobe failed: {}", e)),
    }
}

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
    let mut fps = 30.0f64;

    let shell = app.shell();
    let ffprobe_output = shell.command("ffprobe")
        .args(["-v", "error", "-show_entries", "format=duration:stream=width,height,r_frame_rate", "-of", "default=noprint_wrappers=1", &path])
        .output()
        .await;

    if let Ok(output) = ffprobe_output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.trim().lines() {
                if let Some((key, value)) = line.split_once('=') {
                    match key {
                        "duration" => { if let Ok(d) = value.parse::<f64>() { duration = d; } }
                        "width" => { if let Ok(w) = value.parse::<i64>() { width = w; } }
                        "height" => { if let Ok(h) = value.parse::<i64>() { height = h; } }
                        "r_frame_rate" => {
                            // Take the first valid frame rate (skip 0/0)
                            if value != "0/0" {
                                if let Some((num, den)) = value.split_once('/') {
                                    if let (Ok(num), Ok(den)) = (num.parse::<f64>(), den.parse::<f64>()) {
                                        if den != 0.0 {
                                            fps = num / den;
                                        }
                                    }
                                } else if let Ok(f) = value.parse::<f64>() {
                                    fps = f;
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
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
/// Produces an adaptive number of points suitable for timeline rendering,
/// keeping memory and extraction time reasonable for very long videos.
#[command]
pub async fn extract_waveform(
    app: AppHandle,
    path: String,
    duration: f64,
    target_points: Option<usize>,
    audio_track_index: Option<usize>,
) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Media",
        "Extracting real waveform",
        Some(&format!("path={} duration={:.1}s", path, duration)),
    );

    let app_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let temp_dir = app_data.join("temp");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let temp_wav = temp_dir.join(format!("wf_{}.wav", Uuid::new_v4()));

    // Default target points: ~2 points per second, clamped between 500 and 2000.
    let requested_points = target_points
        .unwrap_or_else(|| ((duration * 2.0) as usize).clamp(500, 2000))
        .clamp(100, 20000)
        .max(1);

    // Pick the lowest common sample rate that gives us enough samples for the
    // requested resolution. We want roughly 2-3 raw samples per downsampled point
    // so the min/max per point remains meaningful.
    let min_sample_rate = ((requested_points as f64 * 2.5) / duration.max(1.0)).ceil() as u32;
    let sample_rate = if min_sample_rate <= 8000 {
        8000
    } else if min_sample_rate <= 11025 {
        11025
    } else if min_sample_rate <= 16000 {
        16000
    } else if min_sample_rate <= 22050 {
        22050
    } else if min_sample_rate <= 44100 {
        44100
    } else {
        48000
    };

    // Don't request more points than the sample rate allows us to resolve
    // (we need at least 2 raw samples per min/max bucket).
    let max_possible_points = ((sample_rate as f64 * duration) / 2.0).floor() as usize;
    let target_points = requested_points.min(max_possible_points.max(1));

    // Use ffmpeg via shell plugin
    let shell = app.shell();

    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-i".to_string(), path.clone(),
    ];
    if let Some(idx) = audio_track_index {
        args.push("-map".to_string());
        args.push(format!("0:a:{}", idx));
    }
    args.extend_from_slice(&[
        "-vn".to_string(),
        "-acodec".to_string(), "pcm_s16le".to_string(),
        "-ar".to_string(), sample_rate.to_string(),
        "-ac".to_string(), "1".to_string(),
        temp_wav.to_str().unwrap().to_string(),
    ]);

    let output = shell
        .command("ffmpeg")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg error: {}", stderr));
    }

    // Parse WAV and downsample
    let (samples, spec) = parse_wav_to_downsampled(&temp_wav, target_points)
        .map_err(|e| format!("Failed to parse waveform: {}", e))?;

    // Cleanup
    let _ = std::fs::remove_file(&temp_wav);

    let sample_rate = spec.sample_rate;
    let channels = spec.channels as usize;
    let total_samples = samples.len();
    let duration = if sample_rate == 0 || channels == 0 {
        0.0
    } else {
        (total_samples / channels) as f64 / sample_rate as f64
    };

    let samples_json: Vec<serde_json::Value> = samples
        .into_iter()
        .map(|(min, max)| serde_json::json!({ "min": min, "max": max }))
        .collect();

    Ok(serde_json::json!({
        "samples": samples_json,
        "sample_rate": sample_rate,
        "duration": duration,
        "channels": channels
    }))
}

/// Real A-B segment extraction.
#[command]
pub async fn extract_segment(
    app: AppHandle,
    path: String,
    start_time: f64,
    end_time: f64,
    audio_track_index: Option<usize>,
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
    // Put -ss before -i for a clean, fast seek; -t defines the output duration.
    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-ss".to_string(), start_time.to_string(),
        "-t".to_string(), duration.to_string(),
        "-i".to_string(), path.clone(),
    ];
    if let Some(idx) = audio_track_index {
        args.push("-map".to_string());
        args.push(format!("0:a:{}", idx));
    }
    args.extend_from_slice(&[
        "-vn".to_string(),
        "-acodec".to_string(), "pcm_s16le".to_string(),
        "-ar".to_string(), "24000".to_string(),
        "-ac".to_string(), "1".to_string(),
        output_path.to_str().unwrap().to_string(),
    ]);

    let output = shell
        .command("ffmpeg")
        .args(args)
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
fn parse_wav_to_downsampled(path: &Path, target_points: usize) -> Result<(Vec<(f32, f32)>, hound::WavSpec), String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| format!("WAV open error: {}", e))?;
    let spec = reader.spec();

    // Capture spec values before consuming the reader via .samples().
    let sample_format = spec.sample_format;
    let channels = spec.channels;
    let bits_per_sample = spec.bits_per_sample;

    // Read samples in the native format and normalize to [-1, 1] keeping sign
    // so we can render positive peaks up and negative troughs down.
    let samples: Vec<f32> = match sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("WAV float sample read error: {}", e))?
            .into_iter()
            .map(|s| s.clamp(-1.0, 1.0))
            .collect(),
        hound::SampleFormat::Int => {
            let max_val = ((1u64 << bits_per_sample.saturating_sub(1)) as f32).max(1.0);
            reader
                .samples::<i32>()
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("WAV int sample read error: {}", e))?
                .into_iter()
                .map(|s| (s as f32 / max_val).clamp(-1.0, 1.0))
                .collect()
        }
    };

    // Average channels if stereo (interleaved samples)
    let samples = if channels == 2 {
        samples
            .chunks_exact(2)
            .map(|c| (c[0] + c[1]) / 2.0)
            .collect::<Vec<_>>()
    } else {
        samples
    };

    // Downsample to target_points by keeping min/max amplitude per bucket.
    let mut downsampled = vec![(0.0f32, 0.0f32); target_points];
    let bucket_size = (samples.len() as f64 / target_points as f64).max(1.0) as usize;

    for i in 0..target_points {
        let start = (i * bucket_size).min(samples.len());
        let end = ((i + 1) * bucket_size).min(samples.len());
        if start < end {
            let (min, max) = samples[start..end]
                .iter()
                .fold((0.0f32, 0.0f32), |(min, max), &s| (min.min(s), max.max(s)));
            downsampled[i] = (min, max);
        }
    }

    Ok((downsampled, spec))
}