import { useEffect } from 'react';
import { Activity, Cpu, Sparkles } from 'lucide-react';
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
    ? { text: 'Backend conectado', color: 'text-emerald-400', dot: 'bg-emerald-400' }
    : stage === 'failed'
      ? { text: 'Backend fallido', color: 'text-red-400', dot: 'bg-red-400' }
      : { text: 'Iniciando backend…', color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' };

  const primaryModel = voiceStatus?.primary_cloning_model || null;
  const k2Loaded = !!voiceStatus?.k2fsa_loaded;
  const k2Verified = !!voiceStatus?.k2fsa_files_verified;

  const modelBadge = voiceLoading
    ? { text: 'Detectando modelos…', color: 'text-white/40' }
    : !voiceStatus?.ready || voiceStatus.error
      ? { text: 'Servicio de voz limitado', color: 'text-orange-400/80' }
      : primaryModel
        ? {
            text: `${primaryModel}${k2Loaded ? ' · listo' : k2Verified ? ' · verificado' : ''}`,
            color: k2Loaded ? 'text-emerald-400' : 'text-emerald-300/80',
          }
        : { text: 'Sin modelo de voz', color: 'text-white/50' };

  const device = voiceStatus?.device;
  const deviceLabel = device === 'cuda'
    ? { text: 'GPU', color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', icon: <Sparkles size={10} /> }
    : { text: 'CPU', color: 'bg-white/[0.06] text-white/55 border-white/[0.08]', icon: <Cpu size={10} /> };

  return (
    <header className="h-11 border-b border-white/[0.08] flex items-center px-3 sm:px-4 text-sm font-medium justify-between shrink-0 bg-[#161616] gap-3">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <span className="font-semibold tracking-tight truncate">OmniClon 2</span>
        <span className="hidden sm:inline nle-badge text-white/30 normal-case tracking-normal font-normal">
          Voice Clone Studio
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 text-[10px] shrink-0">
        <div className={`hidden sm:flex items-center gap-1.5 ${backendLabel.color}`}>
          <span className={`nle-status-dot ${backendLabel.dot}`} />
          <Activity size={11} className="opacity-60" />
          <span>{backendLabel.text}</span>
        </div>

        <div className={`hidden lg:flex items-center gap-1.5 max-w-[200px] ${modelBadge.color}`}>
          <span className="text-white/25">Modelo</span>
          <span className="truncate">{modelBadge.text}</span>
        </div>

        <div className={`nle-badge ${deviceLabel.color} gap-1`}>
          {deviceLabel.icon}
          {deviceLabel.text}
        </div>
      </div>
    </header>
  );
}
