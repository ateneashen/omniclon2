import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { BootstrapStatus } from '../types';
import { logError } from '../lib/log';
import ModelsSplashSection from './splash/ModelsSplashSection';

interface LogLine {
  line: string;
  timestamp: number;
}

interface Props {
  backendStatus: BootstrapStatus | null;
}

const STAGE_LABELS: Record<string, { label: string; description: string }> = {
  checking: {
    label: 'Checking environment',
    description: 'Preparing Python environment and dependencies...',
  },
  starting_backend: {
    label: 'Starting backend',
    description: 'Launching the Python voice engine (this can take a moment on first run)...',
  },
  ready: {
    label: 'Ready',
    description: 'Backend is healthy. Loading interface...',
  },
  failed: {
    label: 'Setup failed',
    description: 'Something went wrong during startup.',
  },
};

function detectHints(logs: string[]): string[] {
  const combined = logs.join('\n').toLowerCase();
  const hints: string[] = [];

  if (combined.includes('no such file') || combined.includes('venv') || combined.includes('python')) {
    hints.push('Python environment issue detected. Try "Force Restart".');
  }
  if (combined.includes('port') && combined.includes('in use')) {
    hints.push('Port 17493 is already in use. Close other OmniClon instances.');
  }
  if (combined.includes('uvicorn') && combined.includes('error')) {
    hints.push('Backend failed to start. Check the logs below for details.');
  }
  if (combined.includes('module not found') || combined.includes('import')) {
    hints.push('Missing Python dependency. A full restart may help.');
  }
  if (hints.length === 0 && logs.some((l) => l.toLowerCase().includes('error'))) {
    hints.push('An error occurred. Use "Copy Error" and paste it for support.');
  }

  return hints.length > 0 ? hints : ['If the problem persists, use "Copy Error" for diagnostics.'];
}

export default function BootstrapSplash({ backendStatus }: Props) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [logsOpen, setLogsOpen] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const pollLogs = async () => {
    try {
      const errorLogs: string = await invoke('tail_errors', { maxLines: 80 });
      const debugLogs: string = await invoke('tail_debug', { maxLines: 30 });

      const allLines = [...errorLogs.split('\n'), ...debugLogs.split('\n')]
        .filter((l) => l.trim().length > 0)
        .slice(-100);

      setLogs(
        allLines.map((line) => ({
          line,
          timestamp: Date.now(),
        }))
      );
    } catch (e) {
      logError('BootstrapSplash', 'Log poll failed', e);
    }
  };

  useEffect(() => {
    const interval = setInterval(pollLogs, 650);
    pollLogs();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!copyNotice) return;
    const t = setTimeout(() => setCopyNotice(null), 2500);
    return () => clearTimeout(t);
  }, [copyNotice]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await invoke('stop_backend');
      await new Promise((r) => setTimeout(r, 400));
      await invoke('start_backend');
    } catch (e) {
      logError('BootstrapSplash', 'Retry backend failed', e);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleForceRestart = async () => {
    setIsRetrying(true);
    try {
      await invoke('stop_backend');
      await new Promise((r) => setTimeout(r, 800));
      await invoke('start_backend');
    } catch (e) {
      logError('BootstrapSplash', 'Force restart backend failed', e);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCopyError = async () => {
    const errorText = logs
      .filter((l) => l.line.toLowerCase().includes('error') || l.line.toLowerCase().includes('failed'))
      .map((l) => l.line)
      .join('\n');

    const full = errorText || logs.slice(-30).map((l) => l.line).join('\n');
    try {
      await navigator.clipboard.writeText(full);
      setCopyNotice('Last errors copied to clipboard.');
    } catch {
      setCopyNotice('Could not copy automatically.');
    }
  };

  const handleCopyFullLog = async () => {
    const fullLog = logs.map((l) => l.line).join('\n');
    try {
      await navigator.clipboard.writeText(fullLog);
      setCopyNotice('Full recent log copied.');
    } catch {
      setCopyNotice('Could not copy automatically.');
    }
  };

  const handleOpenLogs = async () => {
    try {
      const logsDir = await invoke<string>('get_logs_dir');
      await openPath(logsDir);
    } catch (err) {
      logError('BootstrapSplash', 'Open logs folder failed', err);
      setCopyNotice('Could not open logs folder automatically.');
    }
  };

  const currentStage = backendStatus?.stage || 'checking';
  const stageInfo = STAGE_LABELS[currentStage] || STAGE_LABELS.checking;
  const hints = detectHints(logs.map((l) => l.line));

  const isReady = backendStatus?.is_healthy && currentStage === 'ready';

  return (
    <div className="fixed inset-0 bg-[var(--nle-bg-app)] flex items-center justify-center z-50 text-white overflow-y-auto py-8">
      <div className="w-full max-w-[820px] px-6 sm:px-8 my-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8 gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">OmniClon 2</h1>
            <p className="text-sm text-white/50 mt-1">Voice Clone Studio</p>
          </div>
          <span className="nle-badge text-white/35 normal-case tracking-normal shrink-0">Phase 0</span>
        </div>

        <div className="nle-panel p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className={`nle-status-dot ${isReady ? 'bg-emerald-500' : 'bg-[#00b4d8] animate-pulse'}`} />
            <div className="text-lg sm:text-xl font-semibold">{stageInfo.label}</div>
          </div>
          <div className="text-white/65 text-sm pl-5">{stageInfo.description}</div>
          {backendStatus?.message && <div className="pl-5 mt-1 text-xs text-white/45">{backendStatus.message}</div>}

          <div className="pl-5 mt-3">
            <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isReady ? 'bg-emerald-500 w-full' : 'bg-[#00b4d8] w-2/3 animate-pulse'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Models Section */}
        <ModelsSplashSection />

        {/* Hints */}
        {currentStage === 'failed' && hints.length > 0 && (
          <div className="mb-6 nle-panel border-red-500/30 bg-red-950/25 p-4 text-sm">
            <div className="font-semibold text-red-400 mb-2 text-[10px] uppercase tracking-wider">Problemas detectados</div>
            <ul className="list-disc pl-5 space-y-1 text-red-300/90 text-xs">
              {hints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        {copyNotice && (
          <div className="mb-4 text-center text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/30 rounded-md py-2">
            {copyNotice}
          </div>
        )}

        <div className="nle-panel overflow-hidden">
          <button
            onClick={() => setLogsOpen((v) => !v)}
            className="nle-panel-header w-full normal-case tracking-normal hover:bg-white/[0.03] transition"
            aria-expanded={logsOpen}
          >
            <span>Logs de diagnóstico</span>
            <span className="text-white/35 font-normal">Últimas 100 líneas {logsOpen ? '▴' : '▾'}</span>
          </button>

          {logsOpen && (
            <div className="h-[220px] sm:h-[260px] overflow-auto p-3 font-mono text-[11px] leading-tight bg-black/35">
              {logs.length === 0 ? (
                <div className="text-white/30">Waiting for output...</div>
              ) : (
                logs.slice(-100).map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all text-white/80">
                    {log.line}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          <button onClick={handleRetry} disabled={isRetrying} className="nle-btn flex-1 min-w-[110px] py-2.5 text-xs disabled:opacity-50">
            {isRetrying ? 'Reiniciando…' : 'Reintentar'}
          </button>
          <button onClick={handleForceRestart} disabled={isRetrying} className="nle-btn flex-1 min-w-[110px] py-2.5 text-xs disabled:opacity-50">
            Reinicio forzado
          </button>
          <button onClick={handleCopyError} className="nle-btn py-2.5 text-xs">
            Copiar error
          </button>
          <button onClick={handleCopyFullLog} className="nle-btn py-2.5 text-xs">
            Copiar log
          </button>
          <button onClick={handleOpenLogs} className="nle-btn py-2.5 text-xs">
            Abrir logs
          </button>
        </div>

        <div className="mt-5 text-center text-[10px] text-white/30">
          Toda la actividad de arranque se registra en los logs de diagnóstico.
        </div>
      </div>
    </div>
  );
}
