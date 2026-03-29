/** HTTPS Supabase/public video URLs only — blocks localhost, placeholders, and invalid sources. */
export function isValidVideoUrl(url: string | null | undefined): boolean {
  const u = String(url ?? '').trim();
  if (!u) return false;
  const l = u.toLowerCase();
  if (!u.startsWith('https://')) return false;
  if (l.includes('localhost') || l.includes('127.0.0.1')) return false;
  if (l.includes('picsum') || l.includes('placeholder')) return false;
  return true;
}
