import { useEffect } from 'react';
import { Boxes, Copy } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import { useVoiceStore, startVoiceStatusPolling } from '../../stores/voiceStore';

export default function ModelsSplashSection() {
  const status = useModelStore((s) => s.status);
  const fetchStatus = useModelStore((s) => s.fetchStatus);
  const copyToDedicated = useModelStore((s) => s.copyToDedicated);
  const isCopying = useModelStore((s) => s.isCopying);
  const { status: voiceStatus } = useVoiceStore();

  useEffect(() => {
    fetchStatus().catch(() => {});
    startVoiceStatusPolling();
  }, [fetchStatus]);

  const installed = status?.installed_models ?? 0;
  const total = status?.total_models ?? 0;
  const mode = status?.config.mode ?? 'shared';

  const missingCritical = status?.models?.filter((m) =>
    !m.installed && (m.role === 'VoiceClone' || m.role === 'TTS')
  ).length ?? 0;

  const handleQuickCopy = async () => {
    if (!status) return;

    const priority = ['k2-fsa/OmniVoice', 'k2-fsa/OmniVoice-TTS'];
    const toCopy = priority.filter((id) =>
      status.models.some((m) => m.repo_id === id && !m.installed)
    );

    if (toCopy.length === 0) return;
    await copyToDedicated(toCopy);
  };

  return (
    <div className="mb-6 nle-panel p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Boxes size={14} className="text-[#8ab4f8] shrink-0" />
            Estado de modelos
            <span className={`nle-badge normal-case tracking-normal ${mode === 'dedicated' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-[#8ab4f8] border-[#5b8def]/30 bg-[#5b8def]/10'}`}>
              {mode === 'dedicated' ? 'Dedicated' : 'Shared'}
            </span>
          </div>
          <div className="text-xs text-white/55 mt-1">
            {total > 0
              ? `${installed} de ${total} modelos disponibles`
              : 'Cargando información de modelos…'}
          </div>
        </div>

        {missingCritical > 0 && (
          <button
            onClick={handleQuickCopy}
            disabled={isCopying || !status}
            className="nle-btn nle-btn--primary shrink-0 text-[10px]"
          >
            <Copy size={11} />
            {isCopying ? 'Copiando…' : `${missingCritical} críticos`}
          </button>
        )}
      </div>

      <p className="text-[11px] text-white/65 leading-snug">
        {mode === 'shared' && missingCritical > 0 && (
          <>
            Faltan <span className="text-orange-400 font-medium">{missingCritical} modelos importantes</span> (VoiceClone/TTS).
            Copiarlos te da independencia de OmniVoice.
          </>
        )}
        {mode === 'shared' && missingCritical === 0 && 'Usando modelos compartidos de OmniVoice.'}
        {mode === 'dedicated' && 'Usando tu propia copia de modelos. Excelente para autonomía.'}
      </p>

      {voiceStatus?.primary_cloning_model && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] text-[10px] text-emerald-300/85">
          Motor de clonación: <span className="font-medium">{voiceStatus.primary_cloning_model}</span>
          {voiceStatus.k2fsa_loaded ? ' · pesos listos' : voiceStatus.k2fsa_files_verified ? ' · assets verificados' : ''}
        </div>
      )}
    </div>
  );
}
