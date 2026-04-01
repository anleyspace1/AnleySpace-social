/**
 * Base URL for API calls.
 *
 * Resolution: `VITE_API_ORIGIN` (or `NEXT_PUBLIC_API_ORIGIN`) → else `window.location.origin`.
 * - **Dev (Vite):** env unset → same origin as the dev server; `/api/*` and `/socket.io` proxy to Express.
 * - **Production (e.g. Vercel static):** set `VITE_API_ORIGIN=https://your-api.example.com` (no trailing slash)
 *   so `fetch` and Socket.IO hit your deployed Node server. Without it, requests use the static host and
 *   calls fail (`Could not start call`).
 *
 * Do **not** set production env to `localhost` — it is ignored in production builds.
 */

function warnMissingViteApiOriginInProdOnce(): void {
  if (!import.meta.env.PROD) return;
  const env =
    (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim() ||
    (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
    (import.meta.env.NEXT_PUBLIC_API_ORIGIN as string | undefined)?.trim();
  if (!env) {
    console.error('Missing VITE_API_ORIGIN – calls will fail on Vercel');
  }
}

warnMissingViteApiOriginInProdOnce();

/**
 * API base: env when set and valid, otherwise `window.location.origin` in the browser, else `''`.
 * Matches: `import.meta.env.VITE_API_ORIGIN || window.location.origin` (with trimming / prod localhost guard).
 */
export function getApiBase(): string {
  const raw =
    (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim() ||
    (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
    (import.meta.env.NEXT_PUBLIC_API_ORIGIN as string | undefined)?.trim() ||
    '';
  let fromEnv = raw.replace(/\/$/, '');
  if (import.meta.env.PROD && fromEnv && /localhost|127\.0\.0\.1/i.test(fromEnv)) {
    console.warn(
      '[apiOrigin] Ignoring localhost/127.0.0.1 API origin in production. Use your deployed API URL or leave unset to use window.location.origin.'
    );
    fromEnv = '';
  }
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

/**
 * Absolute API URL: `{getApiBase()}{path}`. In the browser, `getApiBase()` is never empty, so paths are always
 * same-origin absolute (dev) or pointed at `VITE_API_ORIGIN` (deployed API).
 */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase();
  if (!base) return p;
  return `${base.replace(/\/$/, '')}${p}`;
}

/**
 * `fetch` that does not throw on network failure — returns `null` so callers can fall back
 * (e.g. Supabase) when the static host has no `/api/*` server or the API URL is unreachable.
 */
export async function fetchFeedApiSafe(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch (e) {
    console.warn('[fetchFeedApiSafe] request failed (fallback may apply):', url, e);
    return null;
  }
}

/**
 * True only when the response looks like a real JSON API (not Vercel SPA HTML).
 * Static hosts often return 200 + `text/html` for unknown `/api/*` — `res.ok` is still true,
 * so callers must not treat that as a successful API call.
 */
export function responseLooksLikeJsonApi(res: Response | null): boolean {
  if (!res || !res.ok) return false;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json');
}
