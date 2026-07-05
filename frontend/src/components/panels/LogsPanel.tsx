import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ClipboardCopy, RefreshCw, AlertCircle, FileText } from 'lucide-react';

const REFRESH_INTERVAL_MS = 2000;
const MAX_LINES = 200;

type LogMode = 'debug' | 'errors';

export default function LogsPanel() {
  const [mode, setMode] = useState<LogMode>('debug');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const text = await invoke<string>(mode === 'debug' ? 'tail_debug' : 'tail_errors', {
        maxLines: MAX_LINES,
      });
      setContent(text);
    } catch (e) {
      setContent(`Error reading logs: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [mode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [content]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-white/90 flex items-center gap-2">
          <FileText size={14} />
          Diagnostic Logs
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('debug')}
            className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wider transition ${
              mode === 'debug'
                ? 'bg-[#00b4d8]/20 border-[#00b4d8]/50 text-[#00b4d8]'
                : 'border-white/10 text-white/50 hover:text-white/80'
            }`}
          >
            Debug
          </button>
          <button
            type="button"
            onClick={() => setMode('errors')}
            className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wider transition ${
              mode === 'errors'
                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                : 'border-white/10 text-white/50 hover:text-white/80'
            }`}
          >
            Errors
          </button>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="p-1.5 rounded border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition"
            title="Refresh now"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition"
            title="Copy to clipboard"
          >
            {copied ? 'Copied!' : <ClipboardCopy size={12} />}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-black/40 rounded border border-white/[0.08] p-2 overflow-auto font-mono leading-relaxed">
        {content ? (
          <pre className="whitespace-pre-wrap break-all text-white/70">
            {content}
            <div ref={bottomRef} />
          </pre>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-white/30 gap-2">
            <AlertCircle size={20} />
            <span>No log entries yet.</span>
          </div>
        )}
      </div>

      <p className="mt-2 text-[10px] text-white/30">
        Logs are stored in{' '}
        <code className="bg-white/[0.08] px-1 py-0.5 rounded">%LOCALAPPDATA%\com.omniclon.studio2\Logs\</code>.
        Auto-refreshes every {REFRESH_INTERVAL_MS / 1000}s.
      </p>
    </div>
  );
}
