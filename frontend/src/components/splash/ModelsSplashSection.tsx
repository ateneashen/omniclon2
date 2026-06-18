import { useEffect } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useVoiceStore, startVoiceStatusPolling } from '../../stores/voiceStore';

/**
 * Sección de Modelos para el BootstrapSplash.
 * Visible pero NO bloqueante (el usuario puede continuar sin interactuar).
 */
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

    if (toCopy.length === 0) {
      return;
    }

    await copyToDedicated(toCopy);
  };

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-[#111] p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">
            Estado de Modelos
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${mode === 'dedicated' ? 'bg-emerald-600/70' : 'bg-blue-600/70'}`}>
              {mode === 'dedicated' ? 'Dedicated' : 'Shared'}
            </span>
          </div>
          <div className="text-xs text-white/60 mt-0.5">
            {total > 0
              ? `${installed} de ${total} modelos disponibles`
              : 'Cargando información de modelos...'}
          </div>
        </div>

        {missingCritical > 0 && (
          <button
            onClick={handleQuickCopy}
            disabled={isCopying || !status}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50 transition font-medium"
          >
            {isCopying ? 'Copiando...' : `Copiar ${missingCritical} críticos`}
          </button>
        )}
      </div>

      <div className="text-[11px] text-white/70 leading-snug">
        {mode === 'shared' && missingCritical > 0 && (
          <>Te faltan <span className="text-orange-400 font-medium">{missingCritical} modelos importantes</span> (VoiceClone/TTS).
          Copiarlos te da independencia de OmniVoice.</>
        )}
        {mode === 'shared' && missingCritical === 0 && (
          "Estás usando modelos compartidos de OmniVoice."
        )}
        {mode === 'dedicated' && (
          "Estás usando tu propia copia de modelos. Excelente para autonomía."
        )}
      </div>

      <div className="mt-2 text-[10px] text-white/50">
        Gestiona todo desde la pestaña <span className="font-medium text-white/70">Models</span> (lateral izquierda).
      </div>

      {/* Voice cloning primary model (suggestion: show in splash too, non-blocking) */}
      {voiceStatus && voiceStatus.primary_cloning_model && (
        <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-emerald-300/80">
          Voice Cloning engine: <span className="font-medium">{voiceStatus.primary_cloning_model}</span>
          {voiceStatus.k2fsa_loaded ? " ✓ real weights ready" : voiceStatus.k2fsa_files_verified ? " (assets verified — placeholder + real path prepared)" : ""}
          <span className="text-white/40"> — see right column for Generate</span>
        </div>
      )}
    </div>
  );
}
