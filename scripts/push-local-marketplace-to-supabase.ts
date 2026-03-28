/**
 * Reads listing rows from local SQLite (`anleyspace.db` → `products` table only)
 * and inserts missing rows into Supabase `public.marketplace` (never `public.products`).
 *
 * Mapping to Supabase: id, title, price, image_url ← image, user_id ← seller_id
 *
 * Skips rows whose id or seller_id are not UUIDs (e.g. seeded p1–p4 / u1),
 * because public.marketplace uses uuid columns.
 *
 * Requires: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Run from repo root: npx tsx scripts/push-local-marketplace-to-supabase.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/** Supabase only has `marketplace`; do not use `products` here. */
const SUPABASE_MARKETPLACE_TABLE = 'marketplace' as const;

/** Local SQLite schema (see src/lib/db.ts). This is not a Supabase table name. */
const SQLITE_LISTINGS_TABLE = 'products' as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(String(s).trim());
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'anleyspace.db');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !key) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const db = new Database(dbPath);
const rows = db
  .prepare(
    `SELECT id, title, price, image, seller_id FROM ${SQLITE_LISTINGS_TABLE} ORDER BY id`
  )
  .all() as {
  id: string;
  title: string;
  price: number;
  image: string | null;
  seller_id: string;
}[];

const skipped: string[] = [];
const payload: {
  id: string;
  title: string;
  price: number;
  image_url: string | null;
  user_id: string;
}[] = [];

for (const r of rows) {
  if (!isUuid(r.id) || !isUuid(r.seller_id)) {
    skipped.push(
      `skip id=${r.id} (id uuid ok: ${isUuid(r.id)}, seller_id uuid ok: ${isUuid(r.seller_id)})`
    );
    continue;
  }
  payload.push({
    id: r.id,
    title: String(r.title ?? '').trim() || '(untitled)',
    price: Number(r.price),
    image_url: r.image != null ? String(r.image).trim() || null : null,
    user_id: r.seller_id,
  });
}

if (skipped.length) {
  console.warn('Skipped (non-UUID id or seller_id — cannot map to marketplace uuid columns):');
  skipped.forEach((s) => console.warn(' ', s));
}

if (!payload.length) {
  console.log('Nothing to insert.');
  process.exit(0);
}

const supabase = createClient(url, key);
const { data: existing, error: exErr } = await supabase
  .from(SUPABASE_MARKETPLACE_TABLE)
  .select('id');
if (exErr) {
  console.error('Failed to read marketplace ids:', exErr.message);
  process.exit(1);
}
const have = new Set((existing ?? []).map((r: { id: string }) => String(r.id)));
const toInsert = payload.filter((p) => !have.has(p.id));

if (!toInsert.length) {
  console.log('All local UUID listings already exist in Supabase marketplace; nothing to insert.');
  process.exit(0);
}

const { data, error } = await supabase.from(SUPABASE_MARKETPLACE_TABLE).insert(toInsert);

if (error) {
  console.error('Supabase error:', error.message);
  process.exit(1);
}

console.log(`Inserted ${toInsert.length} row(s) into ${SUPABASE_MARKETPLACE_TABLE}.`, data);
