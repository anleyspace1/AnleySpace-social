/**
 * Base URL for API calls.
 * - Default / empty: use **relative** paths like `/api/...` so the browser hits the same origin
 *   (Express+Vite on :3000 via `npm run dev`, or Vite on :5173 with `vite.config` proxy → :3000).
 * - Set `VITE_API_ORIGIN` (or `NEXT_PUBLIC_API_ORIGIN`) to your **deployed** API base URL when the
 *   frontend is on static hosting (e.g. Vercel) and the Express API is elsewhere. **Required** for
 *   voice/video calls: `POST /api/calls/start` and Socket.IO signaling both use this origin (see
 *   `socketIoClient.ts`). Without it, the browser talks to Vercel static hosting, which has no API.
 * - Do **not** set this to `http://localhost:...` in production — browsers will try the user's
 *   own machine, `fetch` throws "Failed to fetch", and feed fallbacks never run.
 */
function resolveApiOrigin(): string {
  const raw =
    (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim() ||
    (import.meta.env.NEXT_PUBLIC_API_ORIGIN as string | undefined)?.trim() ||
    "";
  let o = raw.replace(/\/$/, "");
  if (import.meta.env.PROD && o && /localhost|127\.0\.0\.1/i.test(o)) {
    console.warn(
      '[apiOrigin] Ignoring localhost/127.0.0.1 API origin in production. Use your deployed API URL or leave unset (Supabase fallbacks for feed like/comment).'
    );
    o = '';
  }
  return o;
}

export const API_ORIGIN = resolveApiOrigin();

/**
 * Build API URL: relative `/api/...` when `VITE_API_ORIGIN` is unset (preferred for dev proxy).
 */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!API_ORIGIN) return p;
  return `${API_ORIGIN}${p}`;
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
