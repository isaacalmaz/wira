import * as Sentry from '@sentry/react';

/**
 * Inisialisasi Sentry Crash & Error Reporting untuk Wira Mitra.
 * Berjalan jika VITE_SENTRY_DSN tersedia di environment (misal di Vercel / .env).
 * Jika DSN kosong, Sentry tidak aktif dan aplikasi berjalan normal tanpa error.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.info('[Sentry] VITE_SENTRY_DSN not configured. Sentry monitoring is inactive.');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || (import.meta.env.DEV ? 'development' : 'production'),
    release: 'wira-mitra@1.4',
    tracesSampleRate: 0.2,
    ignoreErrors: [
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      'Network request failed',
      'Failed to fetch',
      'AbortError',
      'Load failed',
    ],
  });

  console.info('[Sentry] Initialized for Wira Mitra (release: wira-mitra@1.4)');
}

/**
 * Helper terpusat untuk merekam error ke Sentry secara aman
 */
export function captureAppError(error, context = {}) {
  console.error('[AppError]', error, context);
  if (import.meta.env.VITE_SENTRY_DSN) {
    try {
      Sentry.captureException(error, {
        extra: context,
      });
    } catch (e) {
      console.warn('[Sentry] Failed to capture exception:', e);
    }
  }
}

export { Sentry };
