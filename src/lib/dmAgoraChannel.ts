/**
 * DM Agora channel + UID helpers.
 *
 * Raw `uuid1-uuid2` exceeds Agora's 64-byte channel name limit (~73 chars for two UUIDs).
 * Both peers derive the same short channel from the same two user IDs (sorted), so join/publish/subscribe align.
 */
export function buildDmAgoraChannelId(userIdA: string, userIdB: string): string {
  const [x, y] = [String(userIdA).trim(), String(userIdB).trim()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const payload = `${x}|${y}`;
  let h1 = 5381 >>> 0;
  let h2 = 52711 >>> 0;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = (Math.imul(33, h1) + c) >>> 0;
    h2 = (Math.imul(33, h2) + c) >>> 0;
  }
  return `dm_${h1.toString(16)}_${h2.toString(16)}`;
}

/** Unsigned 32-bit UID from profile id (Agora is happiest with numeric UIDs; UUID strings can be problematic). */
export function agoraNumericUid(userId: string): number {
  const s = String(userId).trim();
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(33, h) + s.charCodeAt(i)) >>> 0;
  }
  const n = h >>> 0;
  return n === 0 ? 1 : n;
}
