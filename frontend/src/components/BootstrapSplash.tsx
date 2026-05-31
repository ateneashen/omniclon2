import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';

interface BootstrapStatus {
  backend_status: any;
  is_healthy: boolean;
  stage: string;
  message: string | null;
}

interface LogLine {
  line: string;
  timestamp: number;
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
  if (hints.length === 0 && logs.some(l => l.toLowerCase().includes('error'))) {
    hints.push('An error occurred. Use "Copy Error" and paste it for support.');
  }

  return hints.length > 0 ? hints : ['If the problem persists, use "Copy Error" for diagnostics.'];
}

export default function BootstrapSplash() {
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);

  const poll = async () => {
    try {
      const bootstrap: BootstrapStatus = await invoke('get_bootstrap_status');
      setStatus(bootstrap);

      // Fetch recent errors + some debug
      const errorLogs: string = await invoke('tail_errors', { maxLines: 80 });
      const debugLogs: string = await invoke('tail_debug', { maxLines: 30 });

      const allLines = [...errorLogs.split('\n'), ...debugLogs.split('\n')]
        .filter(l => l.trim().length > 0)
        .slice(-100);

      const formatted = allLines.map(line => ({
        line,
        timestamp: Date.now(),
      }));

      setLogs(formatted);
    } catch (e) {
      console.error('Bootstrap poll failed', e);
    }
  };

  useEffect(() => {
    const interval = setInterval(poll, 650);
    poll(); // initial
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await invoke('stop_backend');
      await new Promise(r => setTimeout(r, 400));
      await invoke('start_backend');
    } catch (e) {
      console.error(e);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleForceRestart = async () => {
    setIsRetrying(true);
    try {
      await invoke('stop_backend');
      await new Promise(r => setTimeout(r, 800));
      // In the future we can implement a "clean" restart here
      await invoke('start_backend');
    } catch (e) {
      console.error(e);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCopyError = async () => {
    const errorText = logs
      .filter(l => l.line.toLowerCase().includes('error') || l.line.toLowerCase().includes('failed'))
      .map(l => l.line)
      .join('\n');

    const full = errorText || logs.slice(-30).map(l => l.line).join('\n');
    await navigator.clipboard.writeText(full);
    alert('Last errors copied to clipboard. Paste them when asking for help.');
  };

  const handleOpenLogs = async () => {
    // For now just alert — later we can use shell to open the folder
    alert('Diagnostic logs are at %LOCALAPPDATA%\\OmniClon2\\Logs');
  };

  const currentStage = status?.stage || 'checking';
  const stageInfo = STAGE_LABELS[currentStage] || STAGE_LABELS.checking;
  const hints = detectHints(logs.map(l => l.line));

  const isReady = status?.is_healthy && currentStage === 'ready';

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center z-50 text-white">
      <div className="w-full max-w-[820px] px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">OmniClon 2</h1>
            <p className="text-sm text-white/50 mt-1">Voice Clone Studio — Professional Edition</p>
          </div>
          <div className="text-right text-xs text-white/40">
            Rewrite • Phase 0
          </div>
        </div>

        {/* Stage */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-3 h-3 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-[#00b4d8] animate-pulse'}`} />
            <div className="text-xl font-medium">{stageInfo.label}</div>
          </div>
          <div className="text-white/70 text-sm pl-6">{stageInfo.description}</div>
          {status?.message && (
            <div className="pl-6 mt-1 text-xs text-white/50">{status.message}</div>
          )}
        </div>

        {/* Hints */}
        {currentStage === 'failed' && hints.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm">
            <div className="font-medium text-red-400 mb-2">Detected issues</div>
            <ul className="list-disc pl-5 space-y-1 text-red-300/90">
              {hints.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}

        {/* Live Logs */}
        <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-2 text-xs uppercase tracking-widest text-white/40 border-b border-white/10 flex justify-between">
            <span>Diagnostic Logs</span>
            <span className="text-white/30">Last 100 lines</span>
          </div>
          <div className="h-[260px] overflow-auto p-3 font-mono text-[12px] leading-tight bg-black/40">
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
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="flex-1 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 py-3 text-sm font-medium transition disabled:opacity-50"
          >
            {isRetrying ? 'Restarting...' : 'Retry'}
          </button>

          <button
            onClick={handleForceRestart}
            disabled={isRetrying}
            className="flex-1 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 py-3 text-sm font-medium transition disabled:opacity-50"
          >
            Force Restart
          </button>

          <button
            onClick={handleCopyError}
            className="rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 px-6 text-sm font-medium transition"
          >
            Copy Error
          </button>

          <button
            onClick={handleOpenLogs}
            className="rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 px-6 text-sm font-medium transition"
          >
            Open Logs
          </button>
        </div>

        <div className="mt-6 text-center text-[10px] text-white/30">
          All startup activity is being recorded in the dedicated diagnostic logs for fast troubleshooting.
        </div>
      </div>
    </div>
  );
}