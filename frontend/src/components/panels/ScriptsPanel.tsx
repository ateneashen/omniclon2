import { useState, useCallback, useEffect } from 'react';
import { FileText, Save, Trash2, Clock, Film, Braces } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { ScriptItem } from '../../types';
import { applyScriptSnapshot } from '../../lib/applyScriptSnapshot';
import { optionsDifferFromDefault } from '../../lib/voiceOptions';

const SCRIPTS_STORAGE_KEY = 'omniclon2-scripts-session';

function loadScripts(): ScriptItem[] {
  try {
    const raw = localStorage.getItem(SCRIPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveScripts(scripts: ScriptItem[]) {
  try {
    localStorage.setItem(SCRIPTS_STORAGE_KEY, JSON.stringify(scripts));
  } catch {
    // ignore
  }
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export default function ScriptsPanel() {
  const [scripts, setScripts] = useState<ScriptItem[]>(loadScripts);
  const [title, setTitle] = useState('');
  const [loadNotice, setLoadNotice] = useState<string | null>(null);

  const text = useEditorStore((s) => s.voiceText);
  const refText = useEditorStore((s) => s.voiceRefText);
  const activeClipId = useEditorStore((s) => s.activeClipId);
  const region = useEditorStore((s) => s.region);
  const generationOptions = useEditorStore((s) => s.generationOptions);
  const selectedAudioTrack = useEditorStore((s) => s.selectedAudioTrack);
  const selectedSubtitleTrack = useEditorStore((s) => s.selectedSubtitleTrack);
  const clips = useEditorStore((s) => s.clips);

  const activeClip = clips.find((c) => c.id === activeClipId);

  useEffect(() => {
    saveScripts(scripts);
  }, [scripts]);

  useEffect(() => {
    if (!loadNotice) return;
    const t = setTimeout(() => setLoadNotice(null), 3000);
    return () => clearTimeout(t);
  }, [loadNotice]);

  const handleSave = useCallback(() => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const trimmedTitle = title.trim() || truncate(trimmedText.replace(/\s+/g, ' '), 40);
    const next: ScriptItem = {
      id: makeId(),
      title: trimmedTitle,
      text: trimmedText,
      createdAt: Date.now(),
      refText: refText.trim() || undefined,
      clipId: activeClipId,
      clipPath: activeClip?.path || null,
      clipName: activeClip?.name || null,
      region: region.end > region.start ? { start: region.start, end: region.end } : null,
      voiceOptions: { ...generationOptions },
      selectedAudioTrack,
      selectedSubtitleTrack,
    };
    setScripts((prev) => [next, ...prev]);
    setTitle('');
  }, [
    text,
    title,
    refText,
    activeClipId,
    activeClip,
    region,
    generationOptions,
    selectedAudioTrack,
    selectedSubtitleTrack,
  ]);

  const handleLoad = useCallback(async (script: ScriptItem) => {
    const result = await applyScriptSnapshot(script);
    setLoadNotice(result.message);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setScripts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 text-sm">
      <div className="nle-panel-header mb-3 rounded-t-md shrink-0">
        <span className="flex items-center gap-1.5">
          <FileText size={12} className="text-[#c9a0ff]" />
          Guiones
        </span>
        <span className="nle-badge text-white/45 normal-case tracking-normal">{scripts.length} guardados</span>
      </div>

      <div className="nle-panel p-2.5 mb-3 shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (opcional)"
          className="nle-input mb-2"
        />
        <button
          onClick={handleSave}
          disabled={!text.trim()}
          className="nle-btn nle-btn--primary w-full disabled:opacity-50"
        >
          <Save size={12} />
          Guardar guion completo
        </button>
        <p className="text-[9px] text-white/35 mt-2 leading-relaxed">
          Incluye texto, A/B, transcripción, pistas y parámetros de voz.
        </p>
        {loadNotice && (
          <p className="text-[9px] text-emerald-300/80 mt-1.5">{loadNotice}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {scripts.length === 0 ? (
          <div className="nle-empty-state">
            <FileText size={20} className="text-white/20 mb-2" />
            <p>Sin guiones guardados.</p>
            <p className="mt-1 text-white/25">Configura voz y A/B, escribe el texto y guárdalo aquí.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {scripts.map((script) => (
              <li
                key={script.id}
                className="group nle-panel p-2.5 hover:border-white/[0.14] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => handleLoad(script)}
                    className="text-left flex-1 min-w-0"
                    title="Restaurar guion, A/B y parámetros de voz"
                  >
                    <div className="text-xs text-white/85 font-medium truncate">{script.title}</div>
                    <div className="text-[10px] text-white/40 line-clamp-2 mt-0.5 leading-relaxed">
                      {truncate(script.text, 120)}
                    </div>
                    <div className="text-[9px] text-white/30 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-0.5">
                        <Clock size={9} />
                        {new Date(script.createdAt).toLocaleString()}
                      </span>
                      {script.clipName && (
                        <span className="inline-flex items-center gap-0.5 text-[#5b8def]/70 max-w-full truncate" title={script.clipName}>
                          <Film size={9} />
                          {script.clipName}
                        </span>
                      )}
                      {script.region && script.region.end > script.region.start && (
                        <span className="nle-timecode text-[#f5c542]/70">
                          [{script.region.start.toFixed(1)}s – {script.region.end.toFixed(1)}s]
                        </span>
                      )}
                      {script.voiceOptions && optionsDifferFromDefault(script.voiceOptions) && (
                        <span className="inline-flex items-center gap-0.5 text-[#3ecf8e]/70">
                          <Braces size={9} />
                          voz
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDelete(script.id)}
                    className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition shrink-0"
                    title="Eliminar guion"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
