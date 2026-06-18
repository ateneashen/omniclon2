import { useEffect } from 'react';
import { useBackendStatus } from '../../hooks/useBackendStatus';
import { useVoiceStore, startVoiceStatusPolling } from '../../stores/voiceStore';

export default function Header() {
  const { isHealthy, status: backendStatus } = useBackendStatus(true);
  const { status: voiceStatus, loading: voiceLoading } = useVoiceStore();

  useEffect(() => {
    startVoiceStatusPolling();
  }, []);

  const stage = backendStatus?.stage ?? 'checking';
  const backendLabel = isHealthy
    ? { text: 'Backend connected', color: 'text-emerald-400' }
    : stage === 'failed'
      ? { text: 'Backend failed', color: 'text-red-400' }
      : { text: 'Backend starting...', color: 'text-amber-400' };

  const primaryModel = voiceStatus?.primary_cloning_model || null;
  const k2Loaded = !!voiceStatus?.k2fsa_loaded;
  const k2Verified = !!voiceStatus?.k2fsa_files_verified;

  const modelBadge = voiceLoading
    ? { text: 'Detecting models…', color: 'text-white/40' }
    : !voiceStatus?.ready || voiceStatus.error
      ? { text: 'Voice service limited', color: 'text-orange-400/80' }
      : primaryModel
        ? {
            text: `${primaryModel}${k2Loaded ? ' • weights ready' : k2Verified ? ' • assets verified' : ''}`,
            color: k2Loaded ? 'text-emerald-400' : 'text-emerald-300/80',
          }
        : { text: 'No voice model', color: 'text-white/50' };

  const device = voiceStatus?.device;
  const deviceLabel = device
    ? device === 'cuda'
      ? { text: 'GPU', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' }
      : { text: 'CPU', color: 'bg-white/10 text-white/60 border-white/10' }
    : { text: 'CPU', color: 'bg-white/10 text-white/60 border-white/10' };

  return (
    <header className="h-12 border-b border-white/10 flex items-center px-4 text-sm font-medium justify-between shrink-0 bg-[#0a0a0a]">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-semibold tracking-tight truncate">OmniClon 2</span>
        <span className="hidden sm:inline text-[10px] text-white/30 font-normal">Voice Clone Studio</span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className={`flex items-center gap-1.5 ${backendLabel.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-400' : stage === 'failed' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`} />
          <span>{backendLabel.text}</span>
        </div>

        <div className={`hidden md:flex items-center gap-1.5 ${modelBadge.color}`}>
          <span className="text-white/30">Model:</span>
          <span className="max-w-[180px] truncate">{modelBadge.text}</span>
        </div>

        <div className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${deviceLabel.color}`}>
          {deviceLabel.text}
        </div>
      </div>
    </header>
  );
}
