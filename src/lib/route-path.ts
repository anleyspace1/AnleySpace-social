/** Strips trailing slashes so `/messages/` and `/groups/x/chat/` match SPA routes (common on static hosts). */
export function normalizeAppPathname(pathname: string): string {
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '');
}

export function isChatRoutePath(pathname: string): boolean {
  const p = normalizeAppPathname(pathname);
  return p === '/messages' || /^\/groups\/[^/]+\/chat$/.test(p);
}
