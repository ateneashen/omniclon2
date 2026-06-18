import { useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { ScriptItem } from '../../types';

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
  const text = useEditorStore((s) => s.voiceText);
  const setText = useEditorStore((s) => s.setVoiceText);

  useEffect(() => {
    saveScripts(scripts);
  }, [scripts]);

  const handleSave = useCallback(() => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const trimmedTitle = title.trim() || truncate(trimmedText.replace(/\s+/g, ' '), 40);
    const next: ScriptItem = {
      id: makeId(),
      title: trimmedTitle,
      text: trimmedText,
      createdAt: Date.now(),
    };
    setScripts((prev) => [next, ...prev]);
    setTitle('');
  }, [text, title]);

  const handleLoad = useCallback((script: ScriptItem) => {
    setText(script.text);
  }, [setText]);

  const handleDelete = useCallback((id: string) => {
    setScripts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="font-medium mb-3 flex items-center justify-between">
        Scripts
        <span className="text-[10px] text-white/40">{scripts.length} saved</span>
      </div>

      <div className="mb-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full mb-2 px-2 py-1 bg-black/40 border border-white/20 rounded text-white text-xs focus:outline-none focus:border-[#00b4d8]/50"
        />
        <button
          onClick={handleSave}
          disabled={!text.trim()}
          className="w-full px-2 py-1 bg-[#00b4d8] text-black text-xs font-medium rounded hover:bg-[#0099b8] disabled:opacity-50 transition"
        >
          Save current text as script
        </button>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {scripts.length === 0 ? (
          <div className="text-white/30 text-xs text-center py-4">
            No saved scripts yet.
            <br />
            Write text in the Voice panel and save it here.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {scripts.map((script) => (
              <li
                key={script.id}
                className="group p-2 bg-[#1a1a1a] border border-white/10 rounded hover:border-white/20 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => handleLoad(script)}
                    className="text-left flex-1"
                    title="Load into Voice panel"
                  >
                    <div className="text-xs text-white/80 font-medium truncate">
                      {script.title}
                    </div>
                    <div className="text-[10px] text-white/40 line-clamp-2 mt-0.5">
                      {truncate(script.text, 120)}
                    </div>
                    <div className="text-[9px] text-white/30 mt-0.5">
                      {new Date(script.createdAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDelete(script.id)}
                    className="text-red-400 hover:text-red-300 text-xs px-1 opacity-0 group-hover:opacity-100 transition"
                    title="Delete script"
                  >
                    ✕
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
