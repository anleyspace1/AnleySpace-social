/**
 * Pushes local SQLite listing rows (`anleyspace.db` → `products`) into Supabase `public.marketplace`.
 * Does not modify app runtime code — run manually when needed.
 *
 * Mapping: id (uuid, generated if local id is not a uuid), title, price,
 *          image_url ← image, user_id ← seller_id (or PUSH_MARKETPLACE_DEFAULT_USER_ID for non-uuid sellers)
 *
 * Env (required):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (service role — not anon)
 *
 * Optional:
 *   PUSH_MARKETPLACE_DEFAULT_USER_ID=<uuid>  — used when local seller_id is not a uuid (e.g. u1)
 *   MARKETPLACE_SEED_DEMO=1                    — if nothing would be inserted, seed 3 demo rows (needs default user id)
 *
 * Run: npx tsx scripts/push-local-marketplace-to-supabase.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env'), quiet: true });

const SUPABASE_TABLE = 'marketplace' as const;
const SQLITE_TABLE = 'products' as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(String(s).trim());
}

function titleUserKey(title: string, userId: string): string {
  return `${String(title).trim().toLowerCase()}::${String(userId).trim().toLowerCase()}`;
}

const dbPath = join(__dirname, '..', 'anleyspace.db');

const url = process.env.SUPABASE_URL?.trim() || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

const urlOk = Boolean(url);
const keyOk = Boolean(key);

if (!urlOk || !keyOk) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role, not anon) in project root .env');
  process.exit(1);
}

const defaultUserId = (process.env.PUSH_MARKETPLACE_DEFAULT_USER_ID || '').trim();
if (defaultUserId && !isUuid(defaultUserId)) {
  console.warn('[env] PUSH_MARKETPLACE_DEFAULT_USER_ID is set but is not a valid UUID — non-uuid seller rows will be skipped.');
}

type SqliteRow = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  seller_id: string;
};

let rows: SqliteRow[] = [];
try {
  const db = new Database(dbPath);
  rows = db
    .prepare(`SELECT id, title, price, image, seller_id FROM ${SQLITE_TABLE} ORDER BY id`)
    .all() as SqliteRow[];
  db.close();
} catch (e) {
  console.warn('Could not read local SQLite (optional):', (e as Error).message);
}

const supabase = createClient(url, key);

const { data: existingRows, error: fetchErr } = await supabase
  .from(SUPABASE_TABLE)
  .select('id, title, user_id');

if (fetchErr) {
  console.error('Failed to read marketplace:', fetchErr.message);
  process.exit(1);
}

const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => String(r.id)));
const existingTitleUser = new Set(
  (existingRows ?? []).map((r: { title: string; user_id: string }) =>
    titleUserKey(String(r.title ?? ''), String(r.user_id ?? ''))
  )
);

const toInsert: {
  id: string;
  title: string;
  price: number;
  image_url: string | null;
  user_id: string;
}[] = [];

const skipped: string[] = [];

for (const r of rows) {
  const title = String(r.title ?? '').trim() || '(untitled)';
  let userId = String(r.seller_id ?? '').trim();

  if (!userId) {
    skipped.push(`skip id=${r.id}: empty seller_id`);
    continue;
  }
  if (!isUuid(userId)) {
    if (defaultUserId && isUuid(defaultUserId)) {
      userId = defaultUserId;
    } else {
      skipped.push(
        `skip id=${r.id}: seller_id "${r.seller_id}" is not a uuid — set PUSH_MARKETPLACE_DEFAULT_USER_ID to a profile uuid`
      );
      continue;
    }
  }

  let rowId = String(r.id ?? '').trim();
  if (!isUuid(rowId)) {
    rowId = uuidv4();
  }

  if (existingIds.has(rowId)) {
    skipped.push(`skip: marketplace already has id ${rowId}`);
    continue;
  }
  if (existingTitleUser.has(titleUserKey(title, userId))) {
    skipped.push(`skip: duplicate title+user_id "${title}" / ${userId}`);
    continue;
  }

  const row = {
    id: rowId,
    title,
    price: Number(r.price),
    image_url: r.image != null ? String(r.image).trim() || null : null,
    user_id: userId,
  };
  toInsert.push(row);
  existingIds.add(rowId);
  existingTitleUser.add(titleUserKey(title, userId));
}

if (!toInsert.length && process.env.MARKETPLACE_SEED_DEMO === '1') {
  if (!defaultUserId || !isUuid(defaultUserId)) {
    console.warn('MARKETPLACE_SEED_DEMO=1 but PUSH_MARKETPLACE_DEFAULT_USER_ID is missing or not a uuid — skipping seed.');
  } else {
    const demos = [
      { title: 'Demo listing — Wireless earbuds', price: 49, image_url: null as string | null },
      { title: 'Demo listing — Desk lamp', price: 35, image_url: null as string | null },
      { title: 'Demo listing — Water bottle', price: 12, image_url: null as string | null },
    ];
    for (const d of demos) {
      const uid = defaultUserId;
      if (existingTitleUser.has(titleUserKey(d.title, uid))) continue;
      const id = uuidv4();
      toInsert.push({
        id,
        title: d.title,
        price: d.price,
        image_url: d.image_url,
        user_id: uid,
      });
      existingIds.add(id);
      existingTitleUser.add(titleUserKey(d.title, uid));
    }
  }
}

if (skipped.length) {
  console.warn('Skipped rows:');
  skipped.forEach((s) => console.warn(' ', s));
}

if (!toInsert.length) {
  const reasons: string[] = [];
  if (!rows.length) reasons.push('no rows in local SQLite products table');
  else {
    const emptySeller = skipped.filter((s) => s.includes('empty seller_id')).length;
    const badSeller = skipped.filter((s) => s.includes('not a uuid')).length;
    const dupId = skipped.filter((s) => s.includes('already has id')).length;
    const dupTitle = skipped.filter((s) => s.includes('duplicate title+user_id')).length;
    if (emptySeller) reasons.push(`${emptySeller} row(s): empty seller_id`);
    if (badSeller) reasons.push(`${badSeller} row(s): seller_id not a UUID and no valid PUSH_MARKETPLACE_DEFAULT_USER_ID`);
    if (dupId) reasons.push(`${dupId} row(s): id already in Supabase`);
    if (dupTitle) reasons.push(`${dupTitle} row(s): duplicate title+user_id vs existing data`);
    if (!reasons.length) reasons.push('all local rows were filtered — see skipped list above');
  }
  console.log('Pushed 0 products to Supabase.');
  console.log('Why nothing was inserted:', reasons.join('; ') || 'unknown');
  process.exit(0);
}

const { error } = await supabase.from(SUPABASE_TABLE).insert(toInsert);

if (error) {
  console.error('Supabase insert error:', error.message);
  process.exit(1);
}

console.log(`Pushed ${toInsert.length} products to Supabase`);

const { count: totalAfter, error: countErr } = await supabase
  .from(SUPABASE_TABLE)
  .select('*', { count: 'exact', head: true });

if (countErr) {
  console.warn('Could not verify row count:', countErr.message);
} else {
  console.log(`Verified: public.marketplace now has ${totalAfter ?? '?'} row(s) (total count).`);
}
