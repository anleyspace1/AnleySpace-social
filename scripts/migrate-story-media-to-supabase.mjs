/**
 * One-off migration: upload local uploads/stories/* to Supabase Storage bucket "stories"
 * and rewrite public.stories media_url / image_url to public object URLs.
 *
 * Requires: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Run: node scripts/migrate-story-media-to-supabase.mjs
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const uploadsDir = path.join(root, "uploads", "stories");

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return "application/octet-stream";
}

async function ensurePublicStoriesBucket() {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error("listBuckets:", listErr.message);
    throw listErr;
  }
  const exists = buckets?.some((b) => b.name === "stories");
  if (exists) {
    console.log('Bucket "stories" already exists.');
    return;
  }
  const { error: createErr } = await supabase.storage.createBucket("stories", {
    public: true,
    fileSizeLimit: 52428800,
  });
  if (createErr) {
    console.error("createBucket:", createErr.message);
    throw createErr;
  }
  console.log('Created public bucket "stories".');
}

async function main() {
  if (!fs.existsSync(uploadsDir)) {
    console.error("No folder:", uploadsDir);
    process.exit(1);
  }

  await ensurePublicStoriesBucket();

  const files = fs.readdirSync(uploadsDir).filter((f) => fs.statSync(path.join(uploadsDir, f)).isFile());
  console.log("Local files:", files.length);

  for (const name of files) {
    const localPath = path.join(uploadsDir, name);
    const buf = fs.readFileSync(localPath);
    const contentType = guessContentType(name);

    const { error: upErr } = await supabase.storage.from("stories").upload(name, buf, {
      contentType,
      upsert: true,
    });
    if (upErr) {
      console.error("Upload failed:", name, upErr.message);
      continue;
    }

    const { data: pub } = supabase.storage.from("stories").getPublicUrl(name);
    const publicUrl = pub.publicUrl;
    console.log("Uploaded:", name, "->", publicUrl);

    const oldPath = `/uploads/stories/${name}`;

    const { data: mediaRows, error: selErr } = await supabase
      .from("stories")
      .select("id")
      .eq("media_url", oldPath);
    if (selErr) console.error("select media_url:", selErr.message);

    const { error: u1 } = await supabase.from("stories").update({ media_url: publicUrl }).eq("media_url", oldPath);
    if (u1) console.error("update media_url:", u1.message);
    else if (mediaRows?.length) console.log("  Updated media_url rows:", mediaRows.length);
  }

  // Second pass: any row still using /uploads/stories/ — map to public URL (object must exist in bucket from uploads above)
  const { data: allStories, error: allErr } = await supabase.from("stories").select("id, media_url");
  if (allErr) {
    console.warn("Could not list stories for second pass:", allErr.message);
  } else {
    const uploadedNames = new Set(files);
    for (const row of allStories || []) {
      const u = row.media_url;
      if (typeof u !== "string" || !u.startsWith("/uploads/stories/")) continue;
      const fn = u.replace("/uploads/stories/", "").split("?")[0];
      if (!uploadedNames.has(fn)) {
        console.warn("Skip (file not in local uploads/stories):", fn, "id=", row.id);
        continue;
      }
      const { data: p } = supabase.storage.from("stories").getPublicUrl(fn);
      const { error: ue } = await supabase.from("stories").update({ media_url: p.publicUrl }).eq("id", row.id);
      if (ue) console.error("second pass update", row.id, ue.message);
      else console.log("Second pass id", row.id);
    }
  }

  console.log("Migration finished.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
