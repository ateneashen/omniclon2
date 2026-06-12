import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import BootstrapSplash from "./components/BootstrapSplash";
import { useEditorStore } from "./stores/editorStore";
import { MediaClip, VoiceReference } from "./types";
import VideoPreview from "./components/preview/VideoPreview";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

import Timeline from './components/timeline/Timeline';
import ModelsPanel from './components/models/ModelsPanel';

// Small status indicator for the voice cloning service (shows k2-fsa_OmniVoice prep state)
function VoiceCloningStatus() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const loadStatus = async (fromCacheFirst = false) => {
    if (fromCacheFirst) {
      try {
        const cached = localStorage.getItem('omni_voice_status');
        if (cached) {
          const parsed = JSON.parse(cached);
          setStatus(parsed.status);
          setLastChecked(parsed.ts ? new Date(parsed.ts).toLocaleTimeString() : null);
        }
      } catch {}
    }
    setLoading(true);
    try {
      const s = await invoke<any>("get_voice_status");
      setStatus(s);
      const ts = Date.now();
      localStorage.setItem('omni_voice_status', JSON.stringify({ status: s, ts }));
      setLastChecked(new Date(ts).toLocaleTimeString());
    } catch (e) {
      setStatus({ error: "status unavailable" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus(true); // cache first for instant UI, then refresh
  }, []);

  if (loading) {
    return <div className="text-[10px] text-white/40 mb-2">Detecting cloning models…</div>;
  }

  if (!status || status.error || !status.ready) {
    return <div className="text-[10px] text-orange-400/70 mb-2">Voice service: limited (no backend status)</div>;
  }

  const primary = status.primary_cloning_model || "unknown";
  const k2Loaded = !!status.k2fsa_loaded;
  const k2Verified = !!status.k2fsa_files_verified;

  let badge = "";
  let color = "text-white/60";
  if (k2Loaded) {
    badge = " ✓ weights in RAM (full path ready)";
    color = "text-emerald-400";
  } else if (k2Verified) {
    badge = " (assets verified on this PC — using improved ref placeholder)";
    color = "text-emerald-300/80";
  } else {
    badge = " (using reference-derived placeholder)";
  }

  return (
    <div className={`text-[9px] ${color} mb-2 px-1 py-0.5 bg-black/30 rounded border border-white/5 flex items-center gap-1`}>
      <span>Primary: <span className="font-medium">{primary}</span>{badge}</span>
      <button
        onClick={() => loadStatus(false)}
        className="ml-auto text-[9px] px-1 opacity-60 hover:opacity-100"
        title="Refresh voice service status (k2-fsa prep)"
      >
        ⟳
      </button>
      {lastChecked && <span className="text-[8px] text-white/30 ml-1">@{lastChecked}</span>}
    </div>
  );
}

// Real editor layout - Timeline + A/B Roll work has begun
function MainInterface() {
  const [leftTab, setLeftTab] = useState<'media' | 'models'>('media');

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-white/10 flex items-center px-4 text-sm font-medium justify-between">
        <div>
          OmniClon 2 — Voice Clone Studio <span className="ml-2 text-xs text-white/40">(Timeline + A/B Roll in active development)</span>
        </div>
        <div className="text-xs text-emerald-400">Backend connected</div>
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Tabbed Panel (Media / Models) */}
        <div className="w-64 border-r border-white/10 p-3 text-sm flex flex-col">
          {/* Tab selector - Pestaña lateral "Models" */}
          <div className="flex mb-3 border-b border-white/10">
            <button
              onClick={() => setLeftTab('media')}
              className={`px-3 py-1 text-xs font-medium border-b-2 transition-colors ${leftTab === 'media' ? 'border-[#00b4d8] text-white' : 'border-transparent text-white/50 hover:text-white/80'}`}
            >
              Media
            </button>
            <button
              onClick={() => setLeftTab('models')}
              className={`px-3 py-1 text-xs font-medium border-b-2 transition-colors ${leftTab === 'models' ? 'border-[#00b4d8] text-white' : 'border-transparent text-white/50 hover:text-white/80'}`}
            >
              Models
            </button>
          </div>

          {leftTab === 'media' ? (
            <>
              <div className="font-medium mb-3 flex items-center justify-between">
                Media
                <div className="flex gap-1">
                  <button 
                    onClick={async () => {
                      try {
                        const selected = await open({
                          multiple: false,
                          filters: [{
                            name: 'Video Files',
                            extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm']
                          }]
                        });
                        if (!selected) return;
                        const clip = await invoke<MediaClip>("import_media", { path: selected as string });
                        useEditorStore.getState().addClip(clip);
                        const wf = await invoke<any>("extract_waveform", { path: clip.path });
                        useEditorStore.getState().setWaveform(wf);
                      } catch (e) {
                        console.error("Import failed", e);
                        alert("Failed to load video: " + e);
                      }
                    }}
                    className="text-xs px-2 py-0.5 bg-[#00b4d8] text-black rounded hover:bg-[#0099b8]"
                  >
                    Load Video...
                  </button>
                  <button 
                    onClick={async () => {
                      const testPath = "C:\\AI\\OmniClon2\\tests\\fixtures\\sample.mp4";
                      try {
                        const clip = await invoke<MediaClip>("import_media", { path: testPath });
                        useEditorStore.getState().addClip(clip);
                        const wf = await invoke<any>("extract_waveform", { path: clip.path });
                        useEditorStore.getState().setWaveform(wf);
                      } catch (e) {
                        console.error("Import failed", e);
                        alert("Test import failed. Check if tests/fixtures/sample.mp4 exists or use Load Video...");
                      }
                    }}
                    className="text-xs px-2 py-0.5 bg-white/10 rounded hover:bg-white/15"
                  >
                    Test
                  </button>
                </div>
              </div>
              <div 
                className="flex-1 text-white/40 text-xs border border-dashed border-white/20 rounded flex items-center justify-center cursor-pointer hover:bg-white/5"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (!file) return;
                  // Note: in Tauri, for full path we still need dialog or webview file, but for demo use name/path if available
                  // For real drag drop of files with path, Tauri has better support via events, but for now fall back to dialog recommendation.
                  alert("Drag & drop from explorer may not give full path in webview. Use 'Load Video...' button for reliable loading.");
                  // TODO: implement proper drag drop with tauri drag-drop plugin if needed.
                }}
                onClick={async () => {
                  // clicking the zone also opens dialog
                  try {
                    const selected = await open({
                      multiple: false,
                      filters: [{ name: 'Video', extensions: ['mp4','mkv','mov','avi','webm'] }]
                    });
                    if (selected) {
                      const clip = await invoke<MediaClip>("import_media", { path: selected as string });
                      useEditorStore.getState().addClip(clip);
                      const wf = await invoke<any>("extract_waveform", { path: clip.path });
                      useEditorStore.getState().setWaveform(wf);
                    }
                  } catch (e) { alert("Load failed: " + e); }
                }}
              >
                Click here or use button to load video<br/> (Drag &amp; drop coming soon)
              </div>
            </>
          ) : (
            <ModelsPanel />
          )}
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Real Video Preview */}
          <VideoPreview />

          {/* Real Timeline Component */}
          <div className="border-t border-white/10 bg-[#111]">
            <div className="flex items-center gap-2 px-3 py-1 text-xs border-b border-white/10">
              <button onClick={() => useEditorStore.getState().setPlaying(!useEditorStore.getState().isPlaying)} className="px-2 py-0.5 bg-white/10 rounded">
                {useEditorStore.getState().isPlaying ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => useEditorStore.getState().setCurrentTime(0)} className="px-2 py-0.5 bg-white/10 rounded">Reset</button>
              <span className="text-white/50">A/B Loop: {useEditorStore.getState().isLooping ? 'ON' : 'OFF'}</span>
            </div>
            <Timeline />
          </div>
        </div>

        {/* Right: Voice Panel (early) */}
        <div className="w-72 border-l border-white/10 p-3 text-sm flex flex-col">
          <div className="font-medium mb-1">Voice & Cloning</div>
          {/* Dynamic status from backend (k2-fsa prep visible here) */}
          <VoiceCloningStatus />
          <div className="flex-1 flex flex-col text-xs">
            <div className="text-white/60 mb-1">Voice Reference (A/B) <span className="text-[9px] text-white/40">(4-10s recommended for top quality)</span></div>

            {/* Current Reference Status */}
            <div className="mb-2 p-2 bg-[#1a1a1a] border border-white/10 rounded">
              {useEditorStore((s) => s.currentVoiceReference) ? (
                <div>
                  <div className="text-emerald-400 font-medium">
                    ✓ Reference ready — {useEditorStore((s) => s.currentVoiceReference!.duration.toFixed(1))}s
                  </div>
                  <div className="text-white/50 text-[10px] truncate">
                    From: {useEditorStore((s) => s.currentVoiceReference!.sourceClipName)}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={async () => {
                        const ref = useEditorStore.getState().currentVoiceReference;
                        if (!ref) return;
                        try {
                          // Read the actual WAV bytes from disk (works for any user path returned by extract_segment)
                          const bytes: Uint8Array = await readFile(ref.audioPath);
                          // Convert Uint8Array to base64 data URL for reliable <audio> playback (no http/port/fs-scope issues)
                          let binary = '';
                          for (let i = 0; i < bytes.length; i++) {
                            binary += String.fromCharCode(bytes[i]);
                          }
                          const b64 = btoa(binary);
                          const audio = new Audio(`data:audio/wav;base64,${b64}`);
                          await audio.play();
                        } catch (e) {
                          alert("Could not read/play reference audio: " + String(e) + "\nFile: " + ref.audioPath + "\n(Generation still works fine — server reads the file directly.)");
                        }
                      }}
                      className="text-[10px] px-2 py-0.5 bg-white/10 rounded hover:bg-white/20"
                    >
                      ▶ Play ref
                    </button>
                    <button
                      onClick={() => useEditorStore.getState().setCurrentVoiceReference(null)}
                      className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-orange-400">
                  No reference yet.<br />
                  Use A/B in the timeline and export.
                </div>
              )}
            </div>

            {/* Export Button */}
            <button 
              onClick={async () => {
                const { activeClipId, clips, region } = useEditorStore.getState();
                if (!activeClipId) return alert("No clip selected");
                const clip = clips.find(c => c.id === activeClipId);
                if (!clip) return;

                const duration = region.end - region.start;
                if (duration < 3) {
                  return alert("La referencia A-B es muy corta.\nRecomendamos 4-10 segundos de habla clara para excelente calidad (nivel OmniVoice).");
                }
                if (duration > 12) {
                  return alert("La referencia es muy larga. Para mejor calidad, usa 4-10 segundos de habla continua.");
                }

                try {
                  const outPath = await invoke<string>("extract_segment", {
                    path: clip.path,
                    startTime: region.start,
                    endTime: region.end
                  });

                  const voiceRef: VoiceReference = {
                    audioPath: outPath,
                    duration: duration,
                    sourceClipId: clip.id,
                    sourceClipName: clip.name,
                    extractedAt: Date.now(),
                  };

                  useEditorStore.getState().setCurrentVoiceReference(voiceRef);
                } catch (e) {
                  alert("Export failed: " + e);
                }
              }}
              className="w-full mb-3 px-3 py-1.5 bg-[#00b4d8] text-black text-xs font-medium rounded hover:bg-[#0099b8] disabled:opacity-50"
              disabled={!useEditorStore((s) => s.activeClipId)}
            >
              Export A-B Segment as Voice Reference
            </button>

            {/* Generation */}
            <div className="flex-1 flex flex-col">
              <div className="text-white/60 mb-1">Text to Synthesize</div>
              <textarea 
                placeholder="Escribe aquí el texto que quieres que diga la voz clonada..."
                className="flex-1 min-h-[80px] bg-black/40 border border-white/20 rounded px-2 py-1 text-white text-xs mb-2 resize-y"
                id="gen-text"
              />

              <button 
                onClick={async () => {
                  const ref = useEditorStore.getState().currentVoiceReference;
                  const textInput = document.getElementById('gen-text') as HTMLTextAreaElement;
                  const text = textInput?.value?.trim();

                  if (!ref) return alert("Primero exporta una referencia A-B desde el timeline.");
                  if (!text) return alert("Escribe el texto a generar.");

                  useEditorStore.getState().setIsGenerating(true);
                  try {
                    const result = await invoke<any>("generate", {
                      reference_audio_path: ref.audioPath,
                      text: text,
                    });

                    if (result.success && result.audio_base64) {
                      useEditorStore.getState().setLastGenerated(result.audio_base64, result.model_used || 'Optimized for this PC');
                      const audio = new Audio(`data:audio/wav;base64,${result.audio_base64}`);
                      audio.play();
                    } else if (result.success && result.output_path) {
                      useEditorStore.getState().setLastGenerated(null, result.model_used || '');
                      // Fallback (rare — backend generate always returns base64 for reliability)
                      const audioUrl = `http://127.0.0.1:17493/${result.output_path.replace(/\\/g, '/')}`;
                      const audio = new Audio(audioUrl);
                      audio.play();
                    } else {
                      alert("Generación fallida: " + (result.error_message || "Error desconocido"));
                    }
                  } catch (e) {
                    alert("Error: " + e);
                  } finally {
                    useEditorStore.getState().setIsGenerating(false);
                  }
                }}
                className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded disabled:opacity-50"
                disabled={!useEditorStore((s) => s.currentVoiceReference) || useEditorStore((s) => s.isGenerating)}
              >
                {useEditorStore((s) => s.isGenerating) ? 'Generating...' : 'Generate Cloned Voice'}
              </button>

              <div className="text-[9px] text-emerald-400/70 mt-1.5 text-center">
                Uses your local k2-fsa_OmniVoice assets (high-quality ref placeholder active until full inference wired).
              </div>

              {useEditorStore((s) => s.lastGeneratedAudio) && (
                <div className="mt-2 p-2 bg-emerald-950/30 border border-emerald-600/50 rounded text-[10px]">
                  <div>Last generated: {useEditorStore((s) => s.lastGeneratedInfo)}</div>
                  <div className="flex gap-1 mt-1">
                    <button 
                      onClick={() => {
                        const audio = new Audio(`data:audio/wav;base64,${useEditorStore.getState().lastGeneratedAudio}`);
                        audio.play();
                      }}
                      className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded"
                    >
                      ▶ Play
                    </button>
                    <button 
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = `data:audio/wav;base64,${useEditorStore.getState().lastGeneratedAudio}`;
                        a.download = 'generated_voice.wav';
                        a.click();
                      }}
                      className="px-2 py-0.5 bg-white/10 text-white text-[10px] rounded hover:bg-white/20"
                    >
                      ⬇ Download
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-white/30 mt-auto pt-2 border-t border-white/10">
            A/B on video → export reference (4-10s clear speech) → Generate Cloned Voice (OmniVoice-level target via k2-fsa)
          </div>

          <div className="text-[10px] text-white/30 mt-auto pt-2 border-t border-white/10">
            Reference timbre preserved in placeholder • k2-fsa_OmniVoice prepared for full quality
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  useKeyboardShortcuts();
  const [isReady, setIsReady] = useState(false);

  // Simple readiness check — in a real ambitious version this would come from the splash itself
  useEffect(() => {
    const check = async () => {
      try {
        const status: any = await invoke("get_bootstrap_status");
        if (status.is_healthy && status.stage === "ready") {
          // Small delay for polish
          setTimeout(() => setIsReady(true), 650);
        }
      } catch {
        // ignore during early bootstrap
      }
    };

    const interval = setInterval(check, 900);
    check();

    return () => clearInterval(interval);
  }, []);

  if (!isReady) {
    return <BootstrapSplash />;
  }

  return <MainInterface />;
}

export default App;