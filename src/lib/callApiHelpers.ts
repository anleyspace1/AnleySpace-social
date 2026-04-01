import { responseLooksLikeJsonApi } from './apiOrigin';

/**
 * Parse successful JSON API responses; log helpful errors when static hosts return HTML for `/api/*`.
 */
export async function readCallApiJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    console.error(`[${label}] HTTP ${res.status}`, text.slice(0, 400));
    throw new Error(`HTTP ${res.status}`);
  }
  if (!responseLooksLikeJsonApi(res)) {
    const text = await res.text();
    console.error(`[${label}] expected application/json, got:`, text.slice(0, 400));
    throw new Error(
      'Call API unavailable or misconfigured. Set VITE_API_ORIGIN in Vercel to your deployed Express API base URL (HTTPS, no trailing slash).'
    );
  }
  return res.json() as Promise<T>;
}
