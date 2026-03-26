/**
 * One-time client diagnostics for production vs local (Vercel, env, API routing).
 * Does not change UI — console only.
 */

let clientEnvLogged = false;

function safeHost(url: string | undefined): string {
  if (!url) return '(missing)';
  try {
    return new URL(url).host;
  } catch {
    return '(invalid URL)';
  }
}

/** Log Vite env hints once (no secrets: only hostnames / booleans). */
export function logClientDeployEnvOnce(): void {
  if (clientEnvLogged) return;
  clientEnvLogged = true;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonPresent = !!(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.length;
  const apiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim() || '';

  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '(ssr)';

  console.log('[DEPLOY_DEBUG] Client env', {
    mode: import.meta.env.MODE,
    hostname,
    supabaseHost: safeHost(supabaseUrl),
    supabaseAnonKeyPresent: anonPresent,
    viteApiOrigin: apiOrigin || '(empty — requests use same-origin /api/...)',
  });

  if (hostname.includes('vercel.app') || hostname.endsWith('vercel.com')) {
    console.warn(
      '[DEPLOY_DEBUG] Vercel host detected. If GET /api/reels or /api/stories returns HTML (SPA shell), ' +
        'your deployment may rewrite all routes to index.html — Express API routes from server.ts are not running on static hosting.'
    );
  }
}

export type ApiFetchLog = {
  label: string;
  url: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  bodyPreview: string;
  looksLikeSpaHtml: boolean;
};

/** Parse response body as JSON after logging; returns { data, rawText, log }. */
export async function fetchJsonWithDeployLog(
  label: string,
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: unknown; rawText: string; log: ApiFetchLog }> {
  const res = await fetch(url, init);
  const contentType = res.headers.get('content-type');
  const rawText = await res.text();
  const bodyPreview = rawText.slice(0, 400);
  const looksLikeSpaHtml =
    (contentType?.includes('text/html') ?? false) ||
    rawText.trimStart().toLowerCase().startsWith('<!doctype') ||
    rawText.trimStart().toLowerCase().startsWith('<html');

  const log: ApiFetchLog = {
    label,
    url,
    status: res.status,
    ok: res.ok,
    contentType,
    bodyPreview,
    looksLikeSpaHtml,
  };

  console.log('[DEPLOY_DEBUG] fetch', log);

  if (looksLikeSpaHtml) {
    console.warn(
      `[DEPLOY_DEBUG] ${label}: response looks like HTML/SPA, not API JSON. ` +
        'Check Vercel rewrites and whether API is deployed.'
    );
  }

  let data: unknown = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      console.warn(`[DEPLOY_DEBUG] ${label}: JSON parse failed`, { bodyPreview });
    }
  }

  return { ok: res.ok, status: res.status, data, rawText, log };
}
