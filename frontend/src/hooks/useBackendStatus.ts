import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logError } from '../lib/log';
import { BootstrapStatus } from '../types';

export interface BackendStatusResult {
  status: BootstrapStatus | null;
  isReady: boolean;
  isHealthy: boolean;
}

const READY_STAGE = 'ready';
const POLL_INTERVAL_MS = 900;

export function useBackendStatus(poll = true): BackendStatusResult {
  const [status, setStatus] = useState<BootstrapStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const bootstrap = await invoke<BootstrapStatus>('get_bootstrap_status');
      setStatus(bootstrap);
    } catch (err) {
      logError('useBackendStatus', 'Poll failed', err);
      setStatus({
        backend_status: { Failed: { error: String(err) } },
        is_healthy: false,
        stage: 'failed',
        message: String(err),
      });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    if (!poll) return;

    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus, poll]);

  return {
    status,
    isReady: status?.is_healthy === true && status?.stage === READY_STAGE,
    isHealthy: status?.is_healthy === true,
  };
}
