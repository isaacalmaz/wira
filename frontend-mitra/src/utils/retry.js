// Retry for writes that matter in the field (GPS, order status) when the
// connection drops. Only network failures are retried - a request the server
// answered with an error (RLS, "order already taken") is never repeated.

const NETWORK_ERROR = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|err_internet_disconnected/i;

export function isNetworkError(err) {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return NETWORK_ERROR.test(String(err.message || err));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until the browser reports a connection again (or `ms` passes). */
function waitForOnline(ms) {
  if (typeof navigator === 'undefined' || navigator.onLine) return wait(0);
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener('online', done); clearTimeout(t); resolve(); };
    const t = setTimeout(done, ms);
    window.addEventListener('online', done);
  });
}

/**
 * Wraps an async function so network failures are retried with backoff
 * (0.8s, 1.6s, 3.2s...), waiting for the connection to return in between.
 */
export function withNetworkRetry(fn, { tries = 4, baseMs = 800 } = {}) {
  return async (...args) => {
    let lastErr;
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        lastErr = err;
        if (!isNetworkError(err) || attempt === tries - 1) throw err;
        await waitForOnline(15000);
        await wait(baseMs * 2 ** attempt);
      }
    }
    throw lastErr;
  };
}
