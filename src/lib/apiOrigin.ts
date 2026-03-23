/**
 * Base URL for API calls.
 * - Default / empty: use **relative** paths like `/api/...` so the browser hits the same origin
 *   (Express+Vite on :3000 via `npm run dev`, or Vite on :5173 with `vite.config` proxy → :3000).
 * - Set `VITE_API_ORIGIN=http://localhost:3000` only if you must call the API by absolute URL
 *   (e.g. multipart workarounds). Do **not** set this to `http://localhost:5173` — that breaks API routing.
 */
const raw = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim() ?? "";
export const API_ORIGIN = raw.replace(/\/$/, "");

/**
 * Build API URL: relative `/api/...` when `VITE_API_ORIGIN` is unset (preferred for dev proxy).
 */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!API_ORIGIN) return p;
  return `${API_ORIGIN}${p}`;
}
