/**
 * Background batch job: compress existing Supabase Storage videos (H.264, max 720p, faststart),
 * upload to optimized/... paths, generate JPG thumbnails, update posts.video_url + posts.image_url.
 *
 * Does NOT delete originals. Skips rows whose video_url already points under optimized/.
 *
 * Requirements:
 *   - ffmpeg.exe at the fixed path below (see ffmpegPath)
 *   - .env: SUPABASE_URL or VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   - STORAGE_BUCKET (default: posts)
 *   - OPTIMIZE_VIDEOS_DRY_RUN=1  (no uploads / DB writes)
 *
 * Run: npm run optimize-videos
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  mkdir,
  rm,
  readFile,
  writeFile,
  access,
} from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { randomBytes } from "crypto";

const ffmpegPath =
  "C:\\Users\\dinab\\Downloads\\ffmpeg-8.1-essentials_build\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe";

const supabaseUrl = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = (process.env.STORAGE_BUCKET || "posts").trim();
const DRY_RUN = String(process.env.OPTIMIZE_VIDEOS_DRY_RUN || "") === "1";

if (!supabaseUrl || !serviceKey) {
  console.error(
    "[optimize-videos] Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** @param {string} cmd */
function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: opts.silent ? "ignore" : "inherit",
      shell: false,
      ...opts,
    });
    let stderr = "";
    if (child.stderr && opts.collect) {
      child.stderr.on("data", (c) => {
        stderr += c.toString();
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`${cmd} exited ${code}${opts.collect ? `: ${stderr}` : ""}`));
    });
  });
}

async function ensureFfmpeg() {
  try {
    await runCmd(ffmpegPath, ["-version"], { silent: true });
  } catch {
    console.error(
      "[optimize-videos] ffmpeg not found or failed at:",
      ffmpegPath
    );
    process.exit(1);
  }
}

/**
 * @param {string} publicUrl
 * @returns {{ bucket: string; objectPath: string } | null}
 */
function parseStoragePublicUrl(publicUrl) {
  try {
    const u = new URL(publicUrl);
    const m = u.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], objectPath: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

function isAlreadyOptimizedUrl(url) {
  return typeof url === "string" && url.includes("/optimized/");
}

function safeSegment(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * @param {string} inputPath
 * @param {string} outputMp4
 */
async function transcode720pFaststart(inputPath, outputMp4) {
  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "scale=-2:720:force_divisible_by=2:flags=lanczos",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    outputMp4,
  ];
  await runCmd(ffmpegPath, args, { silent: true });
}

/**
 * @param {string} inputPath
 * @param {string} outputJpg
 */
async function extractThumbnail(inputPath, outputJpg) {
  const args = [
    "-y",
    "-ss",
    "00:00:01",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputJpg,
  ];
  await runCmd(ffmpegPath, args, { silent: true });
}

async function pathExists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("[optimize-videos] Starting…");
  console.log("[optimize-videos] Bucket:", BUCKET, DRY_RUN ? "(DRY RUN)" : "");
  await ensureFfmpeg();

  const pageSize = 80;
  let offset = 0;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from("posts")
      .select("id, video_url, image_url")
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[optimize-videos] Query error:", error.message);
      process.exit(1);
    }

    if (!rows?.length) break;

    for (const row of rows) {
      const postId = row.id;
      const videoUrl = String(row.video_url || "").trim();
      if (!videoUrl.startsWith("http")) {
        console.log(`[optimize-videos] Skip post ${postId}: non-http video_url`);
        totalSkipped++;
        continue;
      }
      if (isAlreadyOptimizedUrl(videoUrl)) {
        console.log(`[optimize-videos] Skip post ${postId}: already optimized path`);
        totalSkipped++;
        continue;
      }

      const parsed = parseStoragePublicUrl(videoUrl);
      if (!parsed || parsed.bucket !== BUCKET) {
        console.log(
          `[optimize-videos] Skip post ${postId}: URL not in public bucket "${BUCKET}" (${parsed?.bucket || "unparsed"})`
        );
        totalSkipped++;
        continue;
      }

      const workId = randomBytes(6).toString("hex");
      const workDir = path.join(os.tmpdir(), `optimize-videos-${postId}-${workId}`);
      const inExt = path.extname(parsed.objectPath) || ".mp4";
      const localIn = path.join(workDir, `input${inExt}`);
      const localOut = path.join(workDir, "optimized.mp4");
      const localThumb = path.join(workDir, "thumb.jpg");

      try {
        await mkdir(workDir, { recursive: true });
        console.log(`[optimize-videos] Post ${postId}: downloading…`);
        const res = await fetch(videoUrl);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(localIn, buf);

        console.log(`[optimize-videos] Post ${postId}: transcoding (max 720p H.264 + faststart)…`);
        await transcode720pFaststart(localIn, localOut);
        if (!(await pathExists(localOut))) throw new Error("missing output mp4");

        console.log(`[optimize-videos] Post ${postId}: thumbnail…`);
        await extractThumbnail(localOut, localThumb);
        if (!(await pathExists(localThumb))) throw new Error("missing thumbnail");

        const base = `optimized/${safeSegment(postId)}`;
        const outVideoPath = `${base}/video.mp4`;
        const outThumbPath = `${base}/thumb.jpg`;

        const videoBytes = await readFile(localOut);
        const thumbBytes = await readFile(localThumb);

        if (DRY_RUN) {
          console.log(
            `[optimize-videos] DRY RUN post ${postId}: would upload ${outVideoPath}, ${outThumbPath} and update DB`
          );
          totalProcessed++;
          await rm(workDir, { recursive: true, force: true });
          continue;
        }

        console.log(`[optimize-videos] Post ${postId}: uploading video…`);
        const { error: upVidErr } = await supabase.storage
          .from(BUCKET)
          .upload(outVideoPath, videoBytes, {
            contentType: "video/mp4",
            upsert: true,
          });
        if (upVidErr) throw upVidErr;

        console.log(`[optimize-videos] Post ${postId}: uploading thumbnail…`);
        const { error: upThumbErr } = await supabase.storage
          .from(BUCKET)
          .upload(outThumbPath, thumbBytes, {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (upThumbErr) throw upThumbErr;

        const {
          data: { publicUrl: newVideoUrl },
        } = supabase.storage.from(BUCKET).getPublicUrl(outVideoPath);
        const {
          data: { publicUrl: newThumbUrl },
        } = supabase.storage.from(BUCKET).getPublicUrl(outThumbPath);

        console.log(`[optimize-videos] Post ${postId}: updating database…`);
        const { error: upRowErr } = await supabase
          .from("posts")
          .update({
            video_url: newVideoUrl,
            image_url: newThumbUrl,
          })
          .eq("id", postId);
        if (upRowErr) throw upRowErr;

        console.log(`[optimize-videos] Post ${postId}: done → ${newVideoUrl}`);
        totalProcessed++;
      } catch (e) {
        console.error(`[optimize-videos] Post ${postId}: ERROR`, e?.message || e);
        totalErrors++;
      } finally {
        try {
          await rm(workDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }

  console.log(
    `[optimize-videos] Finished. Optimized: ${totalProcessed}, skipped: ${totalSkipped}, errors: ${totalErrors}`
  );
}

main().catch((e) => {
  console.error("[optimize-videos] Fatal:", e);
  process.exit(1);
});
