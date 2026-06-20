import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Send a structured diagnostic event to Rust's dedicated log files
 * (`omniclon2-debug.log` / `omniclon2-errors.log`) and mirror to console.
 *
 * Safe to call from non-Tauri contexts (e.g. unit tests, browser) — it falls
 * back to console only.
 */
export async function logDiagnostic(
  level: LogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown> | unknown
): Promise<void> {
  const ctx = context ? JSON.stringify(context) : undefined;

  // Always mirror to the browser console so devtools show live context.
  if (level === 'ERROR') {
    console.error(`[${level}] ${component}: ${message}`, context ?? '');
  } else if (level === 'WARN') {
    console.warn(`[${level}] ${component}: ${message}`, context ?? '');
  } else {
    console.log(`[${level}] ${component}: ${message}`, context ?? '');
  }

  if (!isTauri()) return;

  try {
    await invoke('log_diagnostic_event', {
      level,
      component,
      message,
      context: ctx,
    });
  } catch (e) {
    // Never throw from the logging path — that would hide the original error.
    console.error('Failed to send diagnostic log to Rust:', e);
  }
}

export function logInfo(component: string, message: string, context?: Record<string, unknown> | unknown): Promise<void> {
  return logDiagnostic('INFO', component, message, context);
}

export function logWarn(component: string, message: string, context?: Record<string, unknown> | unknown): Promise<void> {
  return logDiagnostic('WARN', component, message, context);
}

export function logError(
  component: string,
  message: string,
  error: unknown,
  context?: Record<string, unknown> | unknown
): Promise<void> {
  const err = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const ctx = context && typeof context === 'object' && !Array.isArray(context)
    ? (context as Record<string, unknown>)
    : context !== undefined
      ? { extra: context }
      : {};
  return logDiagnostic('ERROR', component, message, {
    error: err,
    stack,
    ...ctx,
  });
}
