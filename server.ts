import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import db from "./src/lib/db.ts";
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { registerAssetsSystem } from './assets_system/registerAssetsSystem.ts';
import { isMarketplaceEffectivelyFeatured } from './src/lib/marketplaceFeatured.ts';

dotenv.config();

console.log("SERVER: Initializing...");

/** Prefer SUPABASE_URL on server; fall back to VITE_SUPABASE_URL from .env. */
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("USING SERVICE ROLE:", !!supabaseServiceKey);
if (!supabaseServiceKey) {
  console.warn(
    "SERVER: SUPABASE_SERVICE_ROLE_KEY is not set — POST /api/groups and membership sync will return 503 until configured."
  );
}

let supabase: any = null;
/** Service role client — bypasses RLS for server-side inserts (likes, comments, messages, etc.). */
let supabaseAdmin: any = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log("SERVER: Supabase client initialized");
    try {
      const host = new URL(supabaseUrl).host;
      console.log("SERVER: [DEPLOY_DEBUG] Supabase URL host in use:", host);
    } catch {
      console.log("SERVER: [DEPLOY_DEBUG] Supabase URL present but not parseable as URL");
    }
  } catch (err) {
    console.error("SERVER: Failed to initialize Supabase client:", err);
  }
} else {
  console.warn("SERVER: Supabase environment variables missing. Some features may not work.");
  console.warn("SERVER: [DEPLOY_DEBUG] Missing SUPABASE_URL/VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}
if (supabaseServiceUrl && supabaseServiceKey) {
  try {
    supabaseAdmin = createClient(supabaseServiceUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    console.log("SERVER: Supabase admin client initialized (service role — RLS bypass for inserts)");
  } catch (err) {
    console.error("SERVER: Failed to initialize Supabase service client:", err);
  }
} else {
  console.warn(
    "SERVER: SUPABASE_SERVICE_ROLE_KEY or Supabase URL missing — feed likes/comments inserts will fail until configured."
  );
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
const stripeClient: Stripe | null =
  stripeSecretKey && stripeSecretKey.length > 0 ? new Stripe(stripeSecretKey) : null;
if (!stripeClient) {
  console.warn("SERVER: STRIPE_SECRET_KEY not set — coin checkout and webhook will return 503 until configured.");
}

/** USD cents per coin package (Stripe Checkout). */
const STRIPE_COIN_PACKAGES: Record<number, { cents: number }> = {
  100: { cents: 500 },
  250: { cents: 1000 },
  700: { cents: 2000 },
};

/**
 * Reads (GET /api/groups, joined list): prefer service role, else anon — avoids empty lists when only one key is set.
 * Writes (POST create/join): MUST use {@link groupPersistenceClient} only — never anon (RLS / no JWT).
 */
function supabaseForGroupSync(): any {
  return supabaseAdmin || supabase;
}

/** Service role only — required for `groups` / `group_members` writes so RLS is bypassed and user_id is never lost. */
function groupPersistenceClient(): any {
  return supabaseAdmin;
}

type GroupSyncResult = { ok: true } | { ok: false; error: string; code?: string };

async function syncGroupRowToSupabase(args: {
  id: string;
  name: string;
  description: string;
  privacy: string;
  creator_id: string;
}): Promise<GroupSyncResult> {
  const client = groupPersistenceClient();
  if (!client) {
    console.error("[syncGroupRowToSupabase] SUPABASE_SERVICE_ROLE_KEY missing — cannot upsert public.groups");
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured on server" };
  }
  const makeAttempts = (creatorKey: "created_by" | "creator_id") => {
    const creator = { [creatorKey]: args.creator_id };
    return [
      {
        label: `${creatorKey} + name + description + privacy`,
        payload: {
          id: args.id,
          name: args.name,
          description: args.description ?? "",
          privacy: args.privacy,
          ...creator,
        },
      },
      {
        label: `${creatorKey} + name + description`,
        payload: {
          id: args.id,
          name: args.name,
          description: args.description ?? "",
          ...creator,
        },
      },
      {
        label: `${creatorKey} + name + privacy`,
        payload: {
          id: args.id,
          name: args.name,
          privacy: args.privacy,
          ...creator,
        },
      },
      { label: `${creatorKey} + name`, payload: { id: args.id, name: args.name, ...creator } },
    ] as Array<{ label: string; payload: Record<string, unknown> }>;
  };
  // Try created_by first (requested/most common), then creator_id.
  const attempts: Array<{ label: string; payload: Record<string, unknown> }> = [
    ...makeAttempts("created_by"),
    ...makeAttempts("creator_id"),
  ];
  const attemptErrors: Array<{ label: string; code?: string; message: string }> = [];

  for (const attempt of attempts) {
    const { data, error } = await client
      .from("groups")
      .insert([attempt.payload])
      .select("id, name")
      .single();

    if (!error) {
      console.log("[syncGroupRowToSupabase] insert OK", {
        id: args.id,
        creatorFieldUsed: attempt.label,
        returned: data,
      });
      return { ok: true };
    }

    console.error("[syncGroupRowToSupabase] upsert FAILED", {
      creatorFieldAttempted: attempt.label,
      payloadKeys: Object.keys(attempt.payload),
      code: error.code,
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
      creator_id: args.creator_id,
    });
    attemptErrors.push({ label: attempt.label, code: error.code, message: error.message });

    if (error.code === "42P01") {
      return { ok: false, error: error.message, code: error.code };
    }
  }

  const merged = attemptErrors
    .map((e) => `${e.label}: [${e.code || "no_code"}] ${e.message}`)
    .join(" | ");
  return { ok: false, error: merged || "Failed to upsert group row", code: attemptErrors[0]?.code };
}

async function syncGroupMembershipToSupabase(args: {
  group_id: string;
  user_id: string;
  role: string;
  context: string;
}): Promise<GroupSyncResult & { row?: { group_id: string; user_id: string; role: string } }> {
  const client = groupPersistenceClient();
  if (!client) {
    console.error(`[syncGroupMembershipToSupabase] ${args.context}: SUPABASE_SERVICE_ROLE_KEY missing`);
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured on server" };
  }
  const uid = typeof args.user_id === "string" ? args.user_id.trim() : "";
  if (!uid) {
    console.error(`[syncGroupMembershipToSupabase] ${args.context}: refused — user_id empty (would be NULL in DB)`);
    return { ok: false, error: "user_id is required and must be non-empty" };
  }

  const { error: perr } = await client.from("profiles").upsert({ id: uid }, { onConflict: "id" });
  if (perr && perr.code !== "42P01") {
    console.warn(`[syncGroupMembershipToSupabase] ${args.context} profiles upsert:`, perr.code, perr.message);
  }

  const { data: upsertRows, error: upErr } = await client
    .from("group_members")
    .upsert(
      {
        group_id: args.group_id,
        user_id: uid,
        role: args.role,
      },
      { onConflict: "group_id,user_id" }
    )
    .select("group_id, user_id, role");

  if (upErr) {
    console.error(`[syncGroupMembershipToSupabase] ${args.context} group_members upsert FAILED`, {
      code: upErr.code,
      message: upErr.message,
      details: (upErr as any).details,
      hint: (upErr as any).hint,
      group_id: args.group_id,
      user_id: uid,
      role: args.role,
    });
    return { ok: false, error: upErr.message, code: upErr.code };
  }
  console.log(`[syncGroupMembershipToSupabase] ${args.context} membership upsert result`, {
    rows: upsertRows,
  });

  const { data: verify, error: vErr } = await client
    .from("group_members")
    .select("group_id, user_id, role")
    .eq("group_id", args.group_id)
    .eq("user_id", uid)
    .maybeSingle();

  if (vErr) {
    console.error(`[syncGroupMembershipToSupabase] ${args.context} post-upsert verify query FAILED`, vErr);
    return { ok: false, error: vErr.message, code: vErr.code };
  }
  if (!verify || !verify.user_id) {
    // Service-role inserts have no JWT; DB triggers that set user_id = auth.uid() can leave NULL — repair explicitly.
    console.warn(`[syncGroupMembershipToSupabase] ${args.context} verify: missing user_id; attempting repair`, {
      verify,
    });
    const { error: fixErr } = await client
      .from("group_members")
      .update({ user_id: uid })
      .eq("group_id", args.group_id)
      .is("user_id", null);
    if (fixErr) {
      console.error(`[syncGroupMembershipToSupabase] ${args.context} repair user_id FAILED`, fixErr);
      return { ok: false, error: "group_members row missing or user_id null after upsert" };
    }
    const { data: verify2, error: v2Err } = await client
      .from("group_members")
      .select("group_id, user_id, role")
      .eq("group_id", args.group_id)
      .eq("user_id", uid)
      .maybeSingle();
    if (v2Err || !verify2?.user_id) {
      console.error(`[syncGroupMembershipToSupabase] ${args.context} verify after repair failed`, v2Err, verify2);
      return { ok: false, error: "group_members row missing or user_id null after upsert" };
    }
    console.log(`[syncGroupMembershipToSupabase] ${args.context} final group_members row (after repair)`, verify2);
    return { ok: true, row: verify2 as { group_id: string; user_id: string; role: string } };
  }
  console.log(`[syncGroupMembershipToSupabase] ${args.context} final group_members row`, verify);
  return { ok: true, row: verify as { group_id: string; user_id: string; role: string } };
}

/** Authenticated Supabase user id from `Authorization: Bearer <access_token>`. */
async function getAuthUserIdFromJwtHeader(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
  if (!supabase || !token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  const id = String(data.user.id).trim();
  return id || null;
}

/** Public URL for story preview in messages (never rely on relative paths in Supabase). */
function getRequestOrigin(req: Request): string {
  const xfProto = req.get("x-forwarded-proto");
  const xfHost = req.get("x-forwarded-host");
  if (xfHost) {
    const proto = (xfProto && xfProto.split(",")[0].trim()) || "https";
    return `${proto}://${xfHost.split(",")[0].trim()}`;
  }
  const host = req.get("host");
  if (!host) return "";
  return `${req.protocol}://${host}`;
}

function resolveStoryMediaFullUrl(raw: string, requestOrigin: string): string {
  const rawStr = String(raw).trim();
  if (!rawStr) return "";
  if (rawStr.startsWith("http://") || rawStr.startsWith("https://")) return rawStr;
  const path = rawStr.startsWith("/") ? rawStr : `/${rawStr}`;
  const base =
    (process.env.APP_URL && String(process.env.APP_URL).trim()) ||
    (process.env.VITE_API_ORIGIN && String(process.env.VITE_API_ORIGIN).trim()) ||
    (requestOrigin && String(requestOrigin).trim()) ||
    "";
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

function normalizeStoryMediaType(mediaTypeFromDb: string | null | undefined, mediaUrl: string): "image" | "video" {
  const m = (mediaTypeFromDb && String(mediaTypeFromDb).toLowerCase()) || "";
  if (m.includes("video")) return "video";
  if (m.includes("image")) return "image";
  const u = mediaUrl.toLowerCase();
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || u.includes("video")) return "video";
  return "image";
}

/**
 * Validated sender profile (Supabase `profiles.id` = senderId).
 */
async function fetchStoryReplySenderProfile(
  senderId: string
): Promise<{ username: string | null; avatar_url: string | null } | null> {
  const client = supabaseAdmin || supabase;
  if (!client) return null;
  const { data, error } = await client
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", senderId)
    .maybeSingle();
  if (error) {
    console.error("SERVER: fetchStoryReplySenderProfile error:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    username: data.username ?? null,
    avatar_url: data.avatar_url ?? null,
  };
}

/**
 * Mirror story reply into Supabase `messages` (requires service role for RLS).
 * Returns result object — caller decides HTTP status.
 */
async function insertStoryReplyIntoMessagesInbox(
  opts: {
    senderId: string;
    receiverId: string;
    storyId: string;
    text: string;
    /** Absolute URL for story preview (required for UI when present in DB). */
    storyMedia: string;
    storyMediaType: "image" | "video";
  },
  logToFile: (msg: string) => void
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { senderId, receiverId, storyId, text, storyMedia, storyMediaType } = opts;
  logToFile(
    `SERVER: insertStoryReplyIntoMessagesInbox BEFORE insert senderId=${senderId} receiverId=${receiverId} storyId=${storyId} contentLen=${text.length} story_media=${storyMedia ? storyMedia.slice(0, 80) + (storyMedia.length > 80 ? "…" : "") : "[empty]"} story_media_type=${storyMediaType}`
  );
  console.log("[story-reply→messages] story_id:", storyId, "story_media:", storyMedia || null);
  if (!supabaseAdmin) {
    const msg =
      "insertStoryReplyIntoMessagesInbox aborted — SUPABASE_SERVICE_ROLE_KEY not set (required to insert into messages)";
    logToFile(`SERVER: ${msg}`);
    console.log("[story-reply→messages] insert skipped:", msg);
    return { ok: false, error: msg };
  }
  try {
    const { data: existing, error: qErr } = await supabaseAdmin
      .from("messages")
      .select("id")
      .or(
        `and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`
      )
      .limit(1);
    if (qErr) {
      logToFile(`SERVER: insertStoryReplyIntoMessagesInbox prior-messages check error: ${qErr.message}`);
    } else {
      logToFile(
        `SERVER: insertStoryReplyIntoMessagesInbox conversation ${existing?.length ? "existing" : "new"} pair sender=${senderId} receiver=${receiverId}`
      );
    }

    const buildRow = (includeStoryMedia: boolean, includeMediaType: boolean) => {
      const row: Record<string, string> = {
        sender_id: senderId,
        receiver_id: receiverId,
        content: text,
        type: "story_reply",
        story_id: storyId,
      };
      if (includeStoryMedia && storyMedia) {
        row.story_media = storyMedia;
      }
      if (includeMediaType) {
        row.story_media_type = storyMediaType;
      }
      return row;
    };

    // Prefer full row; only fall back by dropping optional columns — never insert as plain text-only.
    const attempts = [
      buildRow(true, true),
      buildRow(true, false),
      buildRow(false, true),
      buildRow(false, false),
    ];

    let lastErr = "";
    for (let i = 0; i < attempts.length; i++) {
      const ins = await supabaseAdmin
        .from("messages")
        .insert([attempts[i]])
        .select("id, story_id, story_media, story_media_type");
      if (!ins.error && ins.data?.[0]) {
        const row = ins.data[0] as Record<string, unknown>;
        logToFile(
          `SERVER: insertStoryReplyIntoMessagesInbox insert OK (attempt ${i + 1}) id=${String(row.id ?? "")} story_id=${String(row.story_id ?? "")} story_media=${row.story_media ? "[set]" : "[empty]"}`
        );
        console.log("[story-reply→messages] messages row inserted:", row);
        return { ok: true };
      }
      lastErr = ins.error?.message ?? "unknown";
      logToFile(
        `SERVER: insertStoryReplyIntoMessagesInbox attempt ${i + 1} failed: ${lastErr}`
      );
      console.log("[story-reply→messages] message insert attempt failed:", i + 1, lastErr);
    }
    const errMsg = `messages insert failed after retries: ${lastErr}`;
    logToFile(`SERVER: insertStoryReplyIntoMessagesInbox ${errMsg}`);
    console.log("[story-reply→messages] message insert result FAILED:", lastErr);
    return { ok: false, error: errMsg };
  } catch (e) {
    const errMsg = `exception: ${e}`;
    logToFile(`SERVER: insertStoryReplyIntoMessagesInbox ${errMsg}`);
    console.log("[story-reply→messages] message insert exception:", e);
    return { ok: false, error: errMsg };
  }
}

async function syncGroupMessages(groupId: string) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('timestamp', { ascending: true })
      .limit(100);

    if (error) {
      if (error.code === '42P01') {
        console.warn('Supabase table "group_messages" does not exist. Skipping sync.');
      } else {
        console.error('Supabase fetch error in syncGroupMessages:', error.code, error.message);
      }
      return;
    }

    if (data && data.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO group_messages (id, group_id, user_id, username, text, timestamp, type, audio_url, image_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          text = excluded.text,
          timestamp = excluded.timestamp,
          type = excluded.type,
          audio_url = excluded.audio_url,
          image_url = excluded.image_url
      `);
      
      const transaction = db.transaction((messages) => {
        for (const msg of messages) {
          stmt.run(msg.id, msg.group_id, msg.user_id, msg.username, msg.text, msg.timestamp, msg.type, msg.audio_url, msg.image_url);
        }
      });
      
      transaction(data);
    }
  } catch (err) {
    console.error('Error in syncGroupMessages:', err);
  }
}

async function startServer() {
  const app = express();
  // CORS must run before any /api routes so cross-origin dev (e.g. Vite on :5173 + API on :3000) works.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;
  const uploadStoryFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024 },
  });

  /** Stories FK requires user_id to exist in local SQLite `users` (Supabase users may not be synced yet). */
  const ensureLocalUserForStory = (userId: string, username: string, avatar: string) => {
    if (!userId) return;
    try {
      db.prepare(`INSERT OR IGNORE INTO users (id, coins) VALUES (?, 1000)`).run(userId);
      db.prepare(
        `UPDATE users SET username = COALESCE(?, username), avatar = COALESCE(?, avatar) WHERE id = ?`
      ).run(username || null, avatar || null, userId);
    } catch (e) {
      console.error('ensureLocalUserForStory:', e);
      logToFile(`SERVER: ensureLocalUserForStory: ${e}`);
    }
  };

  const logFile = path.join(process.cwd(), 'server.log');
  const logToFile = (msg: string) => {
    fs.appendFileSync(logFile, `${msg} - ${new Date().toISOString()}\n`);
  };

  // Isolated plug-in style module registration for assets features.
  registerAssetsSystem(app, db, logToFile);

  /** Display name for notification copy (profiles.username or "Someone"). */
  const fetchUsernameForUserId = async (userId: string): Promise<string> => {
    const client = supabaseAdmin || supabase;
    if (!client) return "Someone";
    try {
      const { data } = await client.from("profiles").select("username").eq("id", userId).maybeSingle();
      const u = typeof data?.username === "string" ? data.username.trim() : "";
      return u || "Someone";
    } catch {
      return "Someone";
    }
  };

  /** Local SQLite row so GET /api/notifications can JOIN actor username (same idea as story_reply sender upsert). */
  const ensureLocalUserFromSupabaseProfile = async (userId: string): Promise<void> => {
    const u = typeof userId === "string" ? userId.trim() : "";
    if (!u) return;
    const client = supabaseAdmin || supabase;
    if (!client) {
      db.prepare("INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)").run(u, u);
      return;
    }
    try {
      const { data, error } = await client.from("profiles").select("username, avatar_url").eq("id", u).maybeSingle();
      if (error) console.warn("SERVER: ensureLocalUserFromSupabaseProfile:", error.message);
      const username = (data?.username && String(data.username).trim()) || u;
      const avatar = (data?.avatar_url && String(data.avatar_url)) || null;
      db.prepare(
        `
        INSERT INTO users (id, username, avatar) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET username = excluded.username, avatar = COALESCE(excluded.avatar, users.avatar)
      `
      ).run(u, username, avatar);
    } catch (e) {
      console.warn("SERVER: ensureLocalUserFromSupabaseProfile exception:", e);
      db.prepare("INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)").run(u, u);
    }
  };

  const pickPostOwnerFromRow = (row: Record<string, unknown> | null | undefined): string | null => {
    if (!row || typeof row !== "object") return null;
    const cand =
      row.user_id ?? row.author_id ?? row.userId ?? row.author_user_id ?? row["userId"];
    if (cand != null && String(cand).trim() !== "") return String(cand).trim();
    return null;
  };

  /**
   * Resolve feed post owner for like/comment notifications.
   * Optional body keys (if ever sent): postOwnerId, post_user_id, ownerId, authorId.
   * Uses service role for `posts` when available — anon reads are often blocked by RLS.
   */
  const getPostOwnerUserIdForFeedNotification = async (
    postId: string,
    raw?: Record<string, unknown>
  ): Promise<string | null> => {
    const b = raw || {};
    const fromBody =
      (typeof b.postOwnerId === "string" && b.postOwnerId.trim()) ||
      (typeof b.post_user_id === "string" && b.post_user_id.trim()) ||
      (typeof b.ownerId === "string" && b.ownerId.trim()) ||
      (typeof b.authorId === "string" && b.authorId.trim()) ||
      "";
    if (fromBody) return fromBody;

    // 1) Service role first (posts.user_id / posts.author_id)
    if (supabaseAdmin) {
      const adminFirst = await supabaseAdmin
        .from("posts")
        .select("user_id, author_id")
        .eq("id", postId)
        .maybeSingle();
      if (adminFirst.error) {
        console.error("SERVER: getPostOwnerUserId posts (service role) error:", adminFirst.error.message, adminFirst.error);
      }
      const idAdmin = pickPostOwnerFromRow(adminFirst.data as Record<string, unknown>);
      if (idAdmin) return idAdmin;
    }

    // 2) Anon client fallback (when RLS allows or row visible to user)
    if (supabase) {
      const anonRes = await supabase
        .from("posts")
        .select("user_id, author_id")
        .eq("id", postId)
        .maybeSingle();
      if (anonRes.error) {
        console.error("SERVER: getPostOwnerUserId posts (anon) error:", anonRes.error.message, anonRes.error);
      }
      const idAnon = pickPostOwnerFromRow(anonRes.data as Record<string, unknown>);
      if (idAnon) return idAnon;
    }

    const client = supabaseAdmin || supabase;
    if (!client) {
      console.warn("SERVER: getPostOwnerUserId — no Supabase client");
      console.error("Missing ownerId for notification", postId);
      return null;
    }

    const star = await client.from("posts").select("*").eq("id", postId).maybeSingle();
    if (star.error) console.error("SERVER: getPostOwnerUserId posts * error:", star.error.message, star.error);
    const idStar = pickPostOwnerFromRow(star.data as Record<string, unknown>);
    if (idStar) return idStar;

    console.error("Missing ownerId for notification", postId);
    return null;
  };

  const recentFeedStoryNotificationExists = (
    receiverId: string,
    actorId: string,
    type: string,
    storyKey: string
  ): boolean => {
    const row = db
      .prepare(
        `
      SELECT id FROM notifications
      WHERE user_id = ? AND actor_id = ? AND type = ? AND story_id = ?
        AND datetime(created_at) > datetime('now', '-25 seconds')
      LIMIT 1
    `
      )
      .get(receiverId, actorId, type, storyKey) as { id: string } | undefined;
    return !!row;
  };

  const recentFollowNotificationExists = (receiverId: string, actorId: string): boolean => {
    const row = db
      .prepare(
        `
      SELECT id FROM notifications
      WHERE user_id = ? AND actor_id = ? AND type = 'follow'
        AND datetime(created_at) > datetime('now', '-25 seconds')
      LIMIT 1
    `
      )
      .get(receiverId, actorId) as { id: string } | undefined;
    return !!row;
  };

  /** Payload shape for Socket.IO + API (optional `entity_id` persisted when column present). */
  type RealtimeNotificationPayload = {
    id: string;
    type: string;
    message: string;
    actor_id: string | null;
    story_id: string | null;
    entity_id?: string | null;
    created_at: string;
  };

  /**
   * Emit a realtime notification to the receiver's room.
   * Clients join `user_<userId>` via `register_user` (receiverId must be the raw user id, not socket.id).
   */
  /** All types: clients join room `user_<receiverUserId>` via `register_user` (not raw socket id). */
  const emitNotificationRealtime = (receiverId: string, notificationData: RealtimeNotificationPayload) => {
    const uid = String(receiverId).replace(/^user_/, "").trim();
    if (!uid) return;
    const room = `user_${uid}`;
    io.to(room).emit("new_notification", notificationData);
    console.log("Realtime notification sent:", notificationData);
    logToFile(
      `SERVER: Realtime notification sent type=${notificationData.type} room=${room} id=${notificationData.id}`
    );
  };

  /**
   * Insert into SQLite `notifications`, then emit Socket.IO `new_notification` to the receiver's room (all types).
   * Optional `dedupe` for inbox_message to avoid double POST from client.
   */
  const insertNotificationWithRealtime = (opts: {
    receiverId: string;
    actorId: string | null;
    type: string;
    message: string;
    storyId: string | null;
    entityId?: string | null;
    dedupe?: boolean;
  }): { id: string; created_at: string } | null => {
    try {
      const { receiverId, actorId, type, message, storyId, entityId, dedupe } = opts;
      if (!receiverId) return null;
      if (actorId && receiverId === actorId) return null;

      const msgTrim = message.slice(0, 500);

      if (dedupe && type === "inbox_message" && actorId) {
        const recent = db
          .prepare(
            `
        SELECT created_at FROM notifications
        WHERE user_id = ? AND type = ? AND actor_id = ? AND message = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 1
      `
          )
          .get(receiverId, type, actorId, msgTrim) as { created_at: string } | undefined;
        if (recent?.created_at) {
          const t = new Date(recent.created_at).getTime();
          if (Number.isFinite(t) && Date.now() - t < 8000) {
            logToFile(`SERVER: insertNotificationWithRealtime skipped duplicate inbox_message → ${receiverId}`);
            return null;
          }
        }
      }

      const notifId = uuidv4();
      const createdAt = new Date().toISOString();
      const entityCol =
        entityId != null && String(entityId).trim() !== "" ? String(entityId).trim() : null;
      try {
        db.prepare(`
        INSERT INTO notifications (id, user_id, type, actor_id, story_id, entity_id, message, read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(notifId, receiverId, type, actorId, storyId, entityCol, msgTrim, createdAt);
      } catch (e) {
        console.error("Notification error:", e);
        logToFile(`SERVER: insertNotificationWithRealtime DB error: ${e}`);
        return null;
      }

      const payload: RealtimeNotificationPayload = {
        id: notifId,
        type,
        message: msgTrim,
        actor_id: actorId,
        story_id: storyId,
        created_at: createdAt,
      };
      if (entityCol != null) {
        payload.entity_id = entityCol;
      }
      try {
        emitNotificationRealtime(receiverId, payload);
      } catch (e) {
        console.error("Notification error:", e);
      }
      return { id: notifId, created_at: createdAt };
    } catch (e) {
      console.error("Notification error:", e);
      return null;
    }
  };

  console.log(`SERVER: NODE_ENV is ${process.env.NODE_ENV}`);
  logToFile(`SERVER: NODE_ENV is ${process.env.NODE_ENV}`);

  /**
   * Server-only story timestamps for POST /api/stories.
   * Never use client or request body for created_at / expires_at.
   * expires_at is always exactly 24 hours after created_at (server clock).
   */
  function storyServerTimestamps(): { createdAtIso: string; expiresAtIso: string } {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const createdAtIso = createdAt.toISOString();
    const expiresAtIso = expiresAt.toISOString();
    if (expiresAt.getTime() <= createdAt.getTime()) {
      throw new Error('storyServerTimestamps: expires_at must be after created_at');
    }
    return { createdAtIso, expiresAtIso };
  }

  // POST /api/stories (multipart) MUST be registered BEFORE express.json / urlencoded
  // so multer receives the raw multipart stream.
  app.post('/api/stories', (req, res, next) => {
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    console.log('[trace:story-upload] L1 POST /api/stories hit', {
      contentType: req.headers['content-type'],
      isMultipart: ct.includes('multipart/form-data'),
    });
    if (!ct.includes('multipart/form-data')) {
      console.log('[trace:story-upload] L1 → next() (not multipart, JSON handler will run after body parsers)');
      return next();
    }
    console.log('[trace:story-upload] L1 running multer single(file)');
    uploadStoryFile.single('file')(req, res, async (err) => {
      if (err) {
        console.log('[trace:story-upload] L1 multer err → 400 Upload error');
        console.error('MULTER ERROR:', err);
        return res.status(400).json({ ok: false, error: 'Upload error' });
      }
      console.log('FINAL CHECK:');
      console.log('REQ.FILE:', req.file);
      console.log('REQ.BODY:', req.body);
      const user_id =
        (typeof req.body?.user_id === 'string' && req.body.user_id.trim()) ||
        (typeof req.body?.userId === 'string' && req.body.userId.trim()) ||
        '';
      const username = (req.body?.username as string) || '';
      const avatar = (req.body?.avatar as string) || '';
      if (!req.file || !user_id || !username) {
        console.log('[trace:story-upload] L1 validation fail → 400 Missing required fields', {
          hasFile: !!req.file,
          hasUserId: !!user_id,
          hasUsername: !!username,
        });
        return res.status(400).json({ ok: false, error: 'Missing required fields' });
      }
      console.log('[trace:story-upload] L1 validation OK → Supabase Storage + DB insert');
      try {
        if (!supabaseAdmin) {
          return res.status(503).json({
            ok: false,
            error: 'Supabase service role required for story uploads (SUPABASE_SERVICE_ROLE_KEY)',
          });
        }
        const buf = req.file.buffer;
        if (!buf || !Buffer.isBuffer(buf)) {
          return res.status(400).json({ ok: false, error: 'Missing file buffer' });
        }
        const safeOrig = path.basename(req.file.originalname || 'file');
        const filePath = `stories/${Date.now()}-${safeOrig}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from('stories')
          .upload(filePath, buf, {
            contentType: req.file.mimetype || 'application/octet-stream',
          });
        if (uploadError) {
          console.error('[trace:story-upload] Supabase storage upload error:', uploadError);
          logToFile(`SERVER: Supabase storage upload error: ${uploadError.message}`);
          return res.status(500).json({ ok: false, error: 'Failed to upload media' });
        }
        const { data: publicUrlData } = supabaseAdmin.storage.from('stories').getPublicUrl(filePath);
        const mediaUrlRaw = publicUrlData?.publicUrl;
        if (!mediaUrlRaw || typeof mediaUrlRaw !== 'string') {
          console.error('[trace:story-upload] getPublicUrl missing publicUrl');
          return res.status(500).json({ ok: false, error: 'Failed to resolve media URL' });
        }
        const mediaUrl = mediaUrlRaw.trim();
        if (!mediaUrl) {
          return res.status(500).json({ ok: false, error: 'Missing media URL' });
        }
        console.log('[trace:story-upload] STORY_MEDIA_URL:', mediaUrl);
        const looksLikeSupabaseStorage =
          /^https:\/\/.+\.supabase\.co\/storage\//i.test(mediaUrl) ||
          (mediaUrl.startsWith('https://') && mediaUrl.includes('/storage/v1/object/public/'));
        if (!looksLikeSupabaseStorage) {
          console.warn(
            '[trace:story-upload] STORY_MEDIA_URL does not match expected Supabase Storage public URL (https://*.supabase.co/storage/...)'
          );
        }

        const mime = req.file.mimetype || '';
        const mediaType: 'image' | 'video' = mime.startsWith('video') ? 'video' : 'image';

        console.log('FINAL STORY DATA:', { media_url: mediaUrl, media_type: mediaType });

        ensureLocalUserForStory(user_id, username, avatar);
        const id = uuidv4();
        const { createdAtIso, expiresAtIso } = storyServerTimestamps();
        console.log('STORY TIME CHECK:', {
          created_at: createdAtIso,
          expires_at: expiresAtIso,
          now: new Date().toISOString(),
        });
        db.prepare(`
          INSERT INTO stories (id, user_id, username, avatar, image_url, media_url, media_type, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, user_id, username, avatar, mediaUrl, mediaUrl, mediaType, createdAtIso, expiresAtIso);
        const { data: insertedRow, error: storyUpsertError } = await supabaseAdmin
          .from('stories')
          .upsert({
            id,
            user_id,
            username,
            avatar,
            image_url: mediaUrl,
            media_url: mediaUrl,
            media_type: mediaType,
            created_at: createdAtIso,
            expires_at: expiresAtIso,
          })
          .select();
        if (storyUpsertError) {
          console.error('SUPABASE UPSERT FAILED:', storyUpsertError);
          logToFile(`SERVER: SUPABASE UPSERT FAILED: ${storyUpsertError.message}`);
          try {
            db.prepare('DELETE FROM stories WHERE id = ?').run(id);
          } catch {
            /* ignore rollback failure */
          }
          return res.status(500).json({ ok: false, error: 'Failed to save story to Supabase' });
        }
        console.log('[trace:story-upload] L1 supabase upsert result (data + error):', {
          user_id,
          created_at: createdAtIso,
          expires_at: expiresAtIso,
          data: insertedRow,
          error: storyUpsertError,
        });

        const { data: verifyRowData, error: verifyRowError } = await supabaseAdmin
          .from('stories')
          .select('*')
          .eq('id', id);
        if (verifyRowError) {
          console.error('SUPABASE VERIFY SELECT ERROR:', verifyRowError);
        }
        const verifyRow = Array.isArray(verifyRowData) ? verifyRowData[0] : null;
        console.log('[trace:story-upload] L1 supabase verify result (data + error):', {
          user_id,
          data: verifyRow,
          error: verifyRowError,
        });
        return res.json({
          ok: true,
          id,
          user_id,
          media_url: mediaUrl,
          media_type: mediaType,
          created_at: createdAtIso,
        });
      } catch (e) {
        console.error('UPLOAD ERROR:', e);
        logToFile(`SERVER: Create story error: ${e}`);
        return res.status(500).json({ ok: false, error: 'Failed to create story' });
      }
    });
  });

  // Stripe webhook — raw body required for signature verification (must be before express.json()).
  app.post(
    '/api/stripe-webhook',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      if (!stripeClient || !stripeWebhookSecret) {
        return res.status(503).json({ error: 'Stripe webhook not configured' });
      }
      const sig = req.headers['stripe-signature'];
      if (typeof sig !== 'string' || !sig) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }
      let event: Stripe.Event;
      try {
        const buf = req.body;
        const payload = Buffer.isBuffer(buf) ? buf : Buffer.from(typeof buf === 'string' ? buf : JSON.stringify(buf ?? ''));
        event = stripeClient.webhooks.constructEvent(payload, sig, stripeWebhookSecret);
      } catch (err) {
        console.warn('[stripe-webhook] signature verification failed', err);
        return res.status(400).send('Webhook signature verification failed');
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[stripe-webhook] checkout.session.completed', {
          id: session.id,
          amount_total: session.amount_total,
          currency: session.currency,
          customer_email: session.customer_email,
          payment_status: session.payment_status,
          metadata: session.metadata,
          mode: session.mode,
        });
        const meta = session.metadata ?? {};
        const userId = typeof meta.user_id === 'string' ? meta.user_id.trim() : '';
        const coinsRaw = typeof meta.coins === 'string' ? meta.coins.trim() : '';
        const coins = coinsRaw ? parseInt(coinsRaw, 10) : NaN;

        if (!userId || !Number.isFinite(coins) || coins <= 0) {
          console.warn('[stripe-webhook] checkout.session.completed missing or invalid metadata', {
            hasUserId: !!userId,
            coinsRaw,
          });
        } else if (!supabaseAdmin) {
          console.error('[stripe-webhook] SUPABASE_SERVICE_ROLE_KEY missing — cannot credit wallet');
        } else {
          const { error: creditErr } = await supabaseAdmin.rpc('credit_wallet_coins', {
            p_user_id: userId,
            p_amount: coins,
          });
          if (creditErr) {
            console.error('[stripe-webhook] credit_wallet_coins failed', creditErr);
          }
        }
      }

      return res.status(200).json({ received: true });
    }
  );

  // JSON/urlencoded parsers — must be registered before any route that reads req.body (e.g. POST /api/story-replies).
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.post('/api/create-checkout-session', async (req, res) => {
    try {
      if (!stripeClient) {
        return res.status(503).json({ error: 'Stripe not configured' });
      }
      const userId = await getAuthUserIdFromJwtHeader(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const rawPkg = req.body?.coinsPackage;
      const pkgKey = typeof rawPkg === 'string' ? parseInt(rawPkg, 10) : Number(rawPkg);
      const pkg = STRIPE_COIN_PACKAGES[pkgKey];
      if (!pkg || ![100, 250, 700].includes(pkgKey)) {
        return res.status(400).json({ error: 'Invalid coins package' });
      }

      const baseRaw =
        (process.env.APP_URL && String(process.env.APP_URL).trim()) ||
        (process.env.CLIENT_URL && String(process.env.CLIENT_URL).trim()) ||
        getRequestOrigin(req) ||
        '';
      const base = baseRaw.replace(/\/$/, '') || 'http://localhost:5173';

      const checkoutSession = await stripeClient.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `${pkgKey} AnleySpace coins` },
              unit_amount: pkg.cents,
            },
            quantity: 1,
          },
        ],
        success_url: `${base}/wallet?purchase=success`,
        cancel_url: `${base}/wallet?purchase=cancel`,
        metadata: {
          user_id: userId,
          coins: String(pkgKey),
        },
      });

      if (!checkoutSession.url) {
        return res.status(500).json({ error: 'No checkout URL' });
      }

      return res.json({ url: checkoutSession.url });
    } catch (e) {
      console.error('[create-checkout-session]', e);
      return res.status(500).json({ error: 'Checkout failed' });
    }
  });

  // JSON body story (e.g. StoryEditor) — runs after body parsers via next() from multipart gate above
  app.post('/api/stories', async (req, res) => {
    console.log('[trace:story-upload] L2 POST /api/stories (JSON path)', {
      contentType: req.headers['content-type'],
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
    });
    try {
      const {
        username: jsonUsername,
        avatar: jsonAvatar,
        imageUrl,
        media_type: bodyMediaType,
        mediaType: bodyMediaTypeCamel,
      } = req.body;
      const jsonUserId =
        (typeof req.body?.user_id === 'string' && req.body.user_id.trim()) ||
        (typeof req.body?.userId === 'string' && req.body.userId.trim()) ||
        '';
      if (!jsonUserId || imageUrl == null || imageUrl === '') {
        console.log('[trace:story-upload] L2 validation fail → 400 (need user_id/userId + imageUrl)', {
          hasJsonUserId: !!jsonUserId,
          hasImageUrl: !!imageUrl,
        });
        return res.status(400).json({ ok: false, error: 'Missing required fields' });
      }
      const mediaUrl = String(imageUrl).trim();
      if (!mediaUrl) {
        return res.status(500).json({ ok: false, error: 'Missing media URL' });
      }
      const fromBodyType = bodyMediaType ?? bodyMediaTypeCamel;
      let mediaType: string;
      if (fromBodyType === 'video' || fromBodyType === 'image') {
        mediaType = fromBodyType;
      } else if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(mediaUrl)) {
        mediaType = 'video';
      } else {
        mediaType = 'image';
      }
      if (!mediaType || (mediaType !== 'image' && mediaType !== 'video')) {
        return res.status(500).json({ ok: false, error: 'Missing media type' });
      }

      console.log('FINAL STORY DATA:', { media_url: mediaUrl, media_type: mediaType });

      console.log('[trace:story-upload] L2 validation OK → DB insert (JSON story)');
      if (!supabaseAdmin) {
        return res.status(503).json({
          ok: false,
          error: 'Supabase service role required for story uploads (SUPABASE_SERVICE_ROLE_KEY)',
        });
      }
      ensureLocalUserForStory(jsonUserId, jsonUsername, jsonAvatar);
      logToFile(`SERVER: Creating story for ${jsonUsername}, image length: ${String(mediaUrl).length}`);
      const id = uuidv4();
      const { createdAtIso, expiresAtIso } = storyServerTimestamps();
      console.log('STORY TIME CHECK:', {
        created_at: createdAtIso,
        expires_at: expiresAtIso,
        now: new Date().toISOString(),
      });
      db.prepare(`
        INSERT INTO stories (id, user_id, username, avatar, image_url, media_url, media_type, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, jsonUserId, jsonUsername, jsonAvatar, mediaUrl, mediaUrl, mediaType, createdAtIso, expiresAtIso);
      const { data: jsonInsertedRow, error: jsonStoryUpsertError } = await supabaseAdmin
        .from('stories')
        .upsert({
          id,
          user_id: jsonUserId,
          username: jsonUsername,
          avatar: jsonAvatar,
          image_url: mediaUrl,
          media_url: mediaUrl,
          media_type: mediaType,
          created_at: createdAtIso,
          expires_at: expiresAtIso,
        })
        .select();
      if (jsonStoryUpsertError) {
        console.error('SUPABASE UPSERT FAILED:', jsonStoryUpsertError);
        logToFile(`SERVER: SUPABASE UPSERT FAILED: ${jsonStoryUpsertError.message}`);
        try {
          db.prepare('DELETE FROM stories WHERE id = ?').run(id);
        } catch {
          /* ignore rollback failure */
        }
        return res.status(500).json({ ok: false, error: 'Failed to save story to Supabase' });
      }
      console.log('[trace:story-upload] L2 supabase upsert result (data + error):', {
        user_id: jsonUserId,
        created_at: createdAtIso,
        expires_at: expiresAtIso,
        data: jsonInsertedRow,
        error: jsonStoryUpsertError,
      });

      const { data: jsonVerifyRowData, error: jsonVerifyRowError } = await supabaseAdmin
        .from('stories')
        .select('*')
        .eq('id', id);
      if (jsonVerifyRowError) {
        console.error('SUPABASE VERIFY SELECT ERROR:', jsonVerifyRowError);
      }
      const jsonVerifyRow = Array.isArray(jsonVerifyRowData) ? jsonVerifyRowData[0] : null;
      console.log('[trace:story-upload] L2 supabase verify result (data + error):', {
        user_id: jsonUserId,
        data: jsonVerifyRow,
        error: jsonVerifyRowError,
      });
      res.json({ ok: true, id });
    } catch (e) {
      console.error('UPLOAD ERROR:', e);
      logToFile(`SERVER: Create story error: ${e}`);
      return res.status(500).json({ ok: false, error: 'Failed to create story' });
    }
  });

  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Request logging middleware
  app.use((req, res, next) => {
    logToFile(`SERVER: ${req.method} ${req.url}`);
    if (req.method === 'POST') {
      logToFile(`SERVER: Body: ${JSON.stringify(req.body)}`);
    }
    next();
  });

  // API Endpoints
  app.get("/api/health", (req, res) => {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    res.json({ status: "ok", userCount: userCount.count });
  });

  app.get("/api/notifications", (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) {
        return res.status(400).json({ error: "Missing userId query parameter" });
      }
      const rows = db
        .prepare(
          `
          SELECT n.id, n.user_id, n.type, n.actor_id, n.story_id, n.entity_id, n.message,
                 n.read AS read_flag, n.created_at,
                 u.username AS actor_username, u.avatar AS actor_avatar
          FROM notifications n
          LEFT JOIN users u ON u.id = n.actor_id
          WHERE n.user_id = ?
          ORDER BY datetime(n.created_at) DESC
          LIMIT 100
        `
        )
        .all(userId) as {
        id: string;
        user_id: string;
        type: string;
        actor_id: string | null;
        story_id: string | null;
        entity_id: string | null;
        message: string | null;
        read_flag: number | null;
        created_at: string;
        actor_username: string | null;
        actor_avatar: string | null;
      }[];

      const mapped = rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        type: r.type,
        actor_id: r.actor_id,
        story_id: r.story_id ?? null,
        entity_id: (r.entity_id ?? r.story_id) ?? null,
        message: r.message ?? null,
        is_read: Boolean(r.read_flag),
        created_at: r.created_at,
        actor_username: r.actor_username ?? null,
        actor_avatar: r.actor_avatar ?? null,
      }));
      res.json(mapped);
    } catch (err) {
      logToFile(`SERVER: GET /api/notifications error: ${err}`);
      res.status(500).json({ error: "Failed to load notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", (req, res) => {
    try {
      const { id } = req.params;
      const userId =
        (req.body && typeof req.body.userId === "string" && req.body.userId.trim()) ||
        (typeof req.query.userId === "string" && req.query.userId.trim()) ||
        "";
      if (!id || !userId) {
        return res.status(400).json({ error: "Missing notification id or userId" });
      }
      const existing = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as
        | { id: string; user_id: string }
        | undefined;
      if (!existing) {
        return res.status(404).json({ error: "Notification not found" });
      }
      if (String(existing.user_id) !== String(userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
      const updated = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as {
        id: string;
        user_id: string;
        type: string;
        actor_id: string | null;
        story_id: string | null;
        entity_id?: string | null;
        message: string | null;
        read: number;
        created_at: string;
      };
      res.json({
        id: updated.id,
        user_id: updated.user_id,
        type: updated.type,
        actor_id: updated.actor_id,
        story_id: updated.story_id ?? null,
        entity_id: (updated.entity_id ?? updated.story_id) ?? null,
        message: updated.message ?? null,
        is_read: true,
        created_at: updated.created_at,
      });
    } catch (err) {
      logToFile(`SERVER: PATCH /api/notifications/:id/read error: ${err}`);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.get("/api/user/:id", async (req, res) => {
    logToFile(`SERVER: Fetching user ${req.params.id}`);
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    
    if (!user) {
      logToFile(`SERVER: User ${req.params.id} not found in local DB, checking Supabase`);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', req.params.id)
          .single();
        
        if (data) {
          user = {
            id: data.id,
            username: data.username,
            avatar: data.avatar_url,
            full_name: data.full_name,
            bio: data.bio,
            coins: data.coins || 0,
            followers_count: data.followers_count || 0,
            following_count: data.following_count || 0
          };
          // Sync back to local DB for cache
          db.prepare(`
            INSERT INTO users (id, username, avatar, full_name, bio, coins, followers_count, following_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              username = excluded.username,
              avatar = excluded.avatar,
              full_name = excluded.full_name,
              bio = excluded.bio,
              coins = excluded.coins,
              followers_count = excluded.followers_count,
              following_count = excluded.following_count
          `).run(user.id, user.username, user.avatar, user.full_name, user.bio, user.coins, user.followers_count, user.following_count);
        }
      } catch (e) {
        logToFile(`SERVER: Supabase user fetch error: ${e}`);
      }
    }
    
    if (!user) {
      logToFile(`SERVER: User ${req.params.id} not found anywhere`);
      return res.status(404).json({ error: 'User not found' });
    }

    // Single source of truth for relationship counts: follows table only.
    try {
      const followersRows = db.prepare(
        'SELECT DISTINCT follower_id FROM follows WHERE following_id = ?'
      ).all(req.params.id) as { follower_id: string }[];
      const followingRows = db.prepare(
        'SELECT DISTINCT following_id FROM follows WHERE follower_id = ?'
      ).all(req.params.id) as { following_id: string }[];
      const dbFollowersCount = new Set((followersRows || []).map((r) => String(r.follower_id || '').trim()).filter(Boolean)).size;
      const dbFollowingCount = new Set((followingRows || []).map((r) => String(r.following_id || '').trim()).filter(Boolean)).size;
      logToFile(`SERVER: /api/user/${req.params.id} follows-counts followers=${dbFollowersCount} following=${dbFollowingCount}`);
      user = {
        ...(user as any),
        followers_count: dbFollowersCount,
        following_count: dbFollowingCount,
      };
    } catch (countErr) {
      logToFile(`SERVER: /api/user/${req.params.id} follows-count fallback error: ${countErr}`);
    }

    res.json(user);
  });

  app.get("/api/debug/users", (req, res) => {
    const users = db.prepare('SELECT * FROM users').all();
    res.json(users);
  });

  app.post("/api/users/sync", async (req, res) => {
    const { id, username, avatar, full_name, bio } = req.body;
    logToFile(`SERVER: Sync request for ${username} (${id})`);
    if (!id || !username) return res.status(400).json({ error: 'Missing id or username' });
    
    try {
      const result = db.prepare(`
        INSERT INTO users (id, username, avatar, full_name, bio) 
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          username = excluded.username,
          avatar = excluded.avatar,
          full_name = excluded.full_name,
          bio = COALESCE(excluded.bio, users.bio)
      `).run(id, username, avatar, full_name, bio);
      logToFile(`SERVER: Sync successful for ${username}, changes: ${result.changes}`);

      // Sync to Supabase profiles
      try {
        await supabase.from('profiles').upsert({
          id,
          username,
          avatar_url: avatar,
          full_name,
          bio,
          display_name: full_name || username
        });
      } catch (e) {
        logToFile(`SERVER: Supabase profile sync error: ${e}`);
      }
      
      res.json({ success: true });
    } catch (err) {
      logToFile(`SERVER: Sync error: ${err}`);
      res.status(500).json({ error: 'Failed to sync user' });
    }
  });

  // Basic users listing/search endpoint (kept for compatibility)
  app.get("/api/users", async (req, res) => {
    const qRaw = req.query.q;
    const qStr: string =
      typeof qRaw === 'string'
        ? qRaw
        : Array.isArray(qRaw)
          ? (typeof qRaw[0] === 'string' ? qRaw[0] : '')
          : '';
    const normalized = qStr ? qStr.trim().replace(/^@/, '') : '';

    try {
      if (supabase) {
        let query = supabase
          .from('profiles')
          .select('id, username, full_name, display_name, avatar_url, followers_count, following_count')
          .limit(normalized ? 20 : 50);

        if (normalized) {
          query = query.or(`username.ilike.%${normalized}%,full_name.ilike.%${normalized}%,display_name.ilike.%${normalized}%`);
        }

        const { data, error } = await query.order('username', { ascending: true });
        if (!error && data) {
          const mapped = data.map((p: any) => ({
            id: p.id,
            username: p.username || 'User',
            full_name: p.full_name || p.display_name || p.username || 'User',
            avatar: p.avatar_url || null,
            followers_count: p.followers_count || 0,
            following_count: p.following_count || 0
          }));
          return res.json(mapped);
        }
      }

      if (!normalized) {
        const users = db.prepare(`
          SELECT id, username, full_name, avatar, followers_count, following_count
          FROM users
          ORDER BY username ASC
          LIMIT 50
        `).all();
        return res.json(users);
      }

      const users = db.prepare(`
        SELECT id, username, full_name, avatar, followers_count, following_count
        FROM users
        WHERE username LIKE ? OR full_name LIKE ?
        LIMIT 20
      `).all(`%${normalized}%`, `%${normalized}%`);
      return res.json(users);
    } catch (e) {
      logToFile(`SERVER: /api/users error: ${e}`);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.get("/api/users/search", async (req, res) => {
    const qRaw = req.query.q;
    const qStr: string =
      typeof qRaw === 'string'
        ? qRaw
        : Array.isArray(qRaw)
          ? (typeof qRaw[0] === 'string' ? qRaw[0] : '')
          : '';
    const normalized = qStr ? qStr.trim().replace(/^@/, '') : '';

    logToFile(`SERVER: Search request for "${qStr}" (normalized: "${normalized}")`);
    if (!normalized) return res.json([]);

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, display_name, avatar_url, bio, coins, followers_count, following_count')
          .or(`username.ilike.%${normalized}%,full_name.ilike.%${normalized}%,display_name.ilike.%${normalized}%`)
          .limit(20);

        if (!error && data) {
          const mapped = data.map((p: any) => ({
            id: p.id,
            username: p.username || 'User',
            full_name: p.full_name || p.display_name || p.username || 'User',
            avatar: p.avatar_url || null,
            followers_count: p.followers_count || 0,
            following_count: p.following_count || 0
          }));

          const stmt = db.prepare(`
            INSERT INTO users (id, username, avatar, full_name, bio, coins, followers_count, following_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              username = excluded.username,
              avatar = excluded.avatar,
              full_name = excluded.full_name,
              bio = COALESCE(excluded.bio, users.bio),
              coins = excluded.coins,
              followers_count = excluded.followers_count,
              following_count = excluded.following_count
          `);
          const transaction = db.transaction((items) => {
            for (const p of items) {
              stmt.run(
                p.id,
                p.username || 'User',
                p.avatar_url || null,
                p.full_name || p.display_name || p.username || 'User',
                p.bio || null,
                p.coins || 0,
                p.followers_count || 0,
                p.following_count || 0
              );
            }
          });
          transaction(data || []);

          logToFile(`SERVER: Search results count (Supabase): ${mapped.length}`);
          return res.json(mapped);
        }
      } catch (e) {
        logToFile(`SERVER: Supabase search exception: ${e}`);
      }
    }

    const users = db.prepare(`
      SELECT id, username, full_name, avatar, followers_count, following_count 
      FROM users 
      WHERE username LIKE ? OR full_name LIKE ?
      LIMIT 20
    `).all(`%${normalized}%`, `%${normalized}%`);

    logToFile(`SERVER: Search results count (SQLite): ${users.length}`);
    return res.json(users);
  });

  // Feed posts with profile usernames/avatars
  app.get("/api/posts", async (req, res) => {
    try {
      if (!supabase) return res.json([]);
      const categoryRaw = req.query.category;
      const category = typeof categoryRaw === 'string' ? categoryRaw.trim() : '';

      let query = supabase
        .from('posts')
        .select(`
          *,
          profiles (
            id,
            username,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });
      if (category) query = query.eq('category', category);

      const { data: posts, error: postsError } = await query;
      if (postsError) {
        console.error('[API /api/posts] posts query failed:', postsError);
        return res.status(500).json({ error: postsError.message });
      }
      console.log('[API /api/posts] total posts fetched:', Array.isArray(posts) ? posts.length : 0);
      if (!posts || posts.length === 0) {
        console.log('[API /api/posts] posts query returned empty result');
        return res.json([]);
      }

      const merged = posts.map((post: any) => {
        const profile = Array.isArray(post.profiles) ? (post.profiles[0] || null) : (post.profiles || null);
        return {
          ...post,
          profiles: profile,
          username: profile?.username || null,
          avatar_url: profile?.avatar_url || null
        };
      });
      return res.json(merged);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to fetch posts' });
    }
  });

  const handleFeedPostLike = async (req: Request, res: Response) => {
    try {
      console.log("USING SERVICE ROLE:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
      console.log("LIKE REQUEST:", req.body);
      const raw = req.body as Record<string, unknown>;
      const userId =
        (typeof raw?.userId === "string" ? raw.userId.trim() : "") ||
        (typeof raw?.user_id === "string" ? raw.user_id.trim() : "");
      const postId =
        (typeof raw?.postId === "string" ? raw.postId.trim() : "") ||
        (typeof raw?.post_id === "string" ? raw.post_id.trim() : "");
      if (!userId || !postId) {
        return res.status(400).json({ error: "Missing userId or postId" });
      }
      if (!supabaseAdmin) {
        return res.status(503).json({
          error: "Supabase service role not configured on server (SUPABASE_SERVICE_ROLE_KEY required for likes)",
        });
      }

      const { data: existing, error: exErr } = await supabaseAdmin
        .from("likes")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();
      if (exErr) {
        console.error("SERVER: likes lookup failed:", exErr.message, exErr);
        return res.status(500).json({ error: exErr.message || "Like lookup failed" });
      }

      if (existing) {
        const { data: delData, error: delErr } = await supabaseAdmin
          .from("likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", userId)
          .select();
        console.log("Delete result:", delData, delErr);
        if (delErr) {
          console.error("SERVER: likes delete (unlike) failed:", delErr.message, delErr);
          return res.status(500).json({ error: delErr.message || "Failed to unlike" });
        }
        res.status(200).json({ success: true });
        setTimeout(() => {
          try {
            console.log("Insert success:", { action: "unlike", postId, userId });
          } catch (err) {
            console.error(err);
          }
        }, 0);
        return;
      }

      const { data: insData, error: insErr } = await supabaseAdmin
        .from("likes")
        .insert({ post_id: postId, user_id: userId })
        .select("id, post_id, user_id")
        .maybeSingle();

      console.log("Insert result:", insData, insErr);
      if (insErr) {
        console.error("SERVER: likes insert failed (check RLS or schema):", insErr.message, insErr);
        return res.status(500).json({ error: insErr.message || "Failed to like post" });
      }

      res.status(200).json({ success: true });
      setTimeout(() => {
        void (async () => {
          try {
            console.log("Insert success:", insData);
            const authorId = (await getPostOwnerUserIdForFeedNotification(postId, raw)) || "";
            if (!authorId || authorId === userId) return;
            if (recentFeedStoryNotificationExists(authorId, userId, "like", postId)) return;
            await ensureLocalUserFromSupabaseProfile(userId);
            await ensureLocalUserFromSupabaseProfile(authorId);
            const name = await fetchUsernameForUserId(userId);
            console.log("LIKE NOTIF TRIGGERED", postId, userId);
            const inserted = insertNotificationWithRealtime({
              receiverId: authorId,
              actorId: userId,
              type: "like",
              message: `${name} liked your post`,
              storyId: postId,
              entityId: postId,
            });
            if (inserted) {
              logToFile(
                `SERVER: feed like notification ok notifId=${inserted.id} receiver=${authorId} actor=${userId} post=${postId}`
              );
            } else {
              console.warn("SERVER: feed like notification insert returned null (self or DB)");
            }
          } catch (err) {
            console.error("Notification error:", err);
          }
        })();
      }, 0);
      return;
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "post-like failed" });
    }
  };

  const handleFeedPostComment = async (req: Request, res: Response) => {
    try {
      console.log("USING SERVICE ROLE:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
      console.log("COMMENT REQUEST:", req.body);
      const raw = req.body as Record<string, unknown>;
      const userId =
        (typeof raw?.userId === "string" ? raw.userId.trim() : "") ||
        (typeof raw?.user_id === "string" ? raw.user_id.trim() : "");
      const postId =
        (typeof raw?.postId === "string" ? raw.postId.trim() : "") ||
        (typeof raw?.post_id === "string" ? raw.post_id.trim() : "");
      const content =
        (typeof raw?.content === "string" ? raw.content.trim() : "") ||
        (typeof raw?.text === "string" ? raw.text.trim() : "");
      if (!userId || !postId || !content) {
        return res.status(400).json({ error: "Missing userId, postId, or content" });
      }
      if (!supabaseAdmin) {
        return res.status(503).json({
          error: "Supabase service role not configured on server (SUPABASE_SERVICE_ROLE_KEY required for comments)",
        });
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("comments")
        .insert({ post_id: postId, user_id: userId, content })
        .select("id, post_id, user_id, content, created_at")
        .single();

      console.log("Insert result:", inserted, insErr);
      if (insErr) {
        console.error("SERVER: comments insert failed (check RLS or schema):", insErr.message, insErr);
        return res.status(500).json({ error: insErr.message || "Failed to add comment" });
      }
      if (!inserted) {
        console.error("SERVER: comments insert returned no row (RLS may hide select after insert)");
        return res.status(500).json({ error: "Failed to add comment" });
      }

      // Include `comment` so existing clients do not fall back to a second insert (frontend unchanged).
      res.status(200).json({ success: true, comment: inserted });
      setTimeout(() => {
        void (async () => {
          try {
            console.log("Insert success:", inserted);
            const authorId = (await getPostOwnerUserIdForFeedNotification(postId, raw)) || "";
            if (!authorId || authorId === userId) return;
            if (recentFeedStoryNotificationExists(authorId, userId, "comment", postId)) return;
            await ensureLocalUserFromSupabaseProfile(userId);
            await ensureLocalUserFromSupabaseProfile(authorId);
            const name = await fetchUsernameForUserId(userId);
            console.log("COMMENT NOTIF TRIGGERED", postId, userId);
            const n = insertNotificationWithRealtime({
              receiverId: authorId,
              actorId: userId,
              type: "comment",
              message: `${name} commented on your post`,
              storyId: postId,
              entityId: postId,
            });
            if (n) {
              logToFile(
                `SERVER: feed comment notification ok notifId=${n.id} receiver=${authorId} actor=${userId} post=${postId}`
              );
            } else {
              console.warn("SERVER: feed comment notification insert returned null (self or DB)");
            }
          } catch (err) {
            console.error("Notification error:", err);
          }
        })();
      }, 0);
      return;
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "post-comment failed" });
    }
  };

  app.post("/api/feed/post-like", handleFeedPostLike);
  app.post("/api/likes", handleFeedPostLike);
  app.post("/api/feed/post-comment", handleFeedPostComment);
  app.post("/api/comments", handleFeedPostComment);

  /**
   * When the client used Supabase directly for a like (feed API unavailable), still persist + realtime notify.
   */
  app.post("/api/notifications/from-feed-like", async (req, res) => {
    try {
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const postId = typeof req.body?.postId === "string" ? req.body.postId.trim() : "";
      if (!userId || !postId) {
        return res.status(400).json({ error: "Missing userId or postId" });
      }
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Supabase service role not configured on server" });
      }

      const { data: like, error: likeErr } = await supabaseAdmin
        .from("likes")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();
      if (likeErr) {
        console.error("SERVER: from-feed-like likes read failed:", likeErr.message, likeErr);
      }
      if (!like) {
        return res.status(400).json({ error: "Like not found in database" });
      }

      const authorId = (await getPostOwnerUserIdForFeedNotification(postId, req.body as Record<string, unknown>)) || "";
      if (!authorId || authorId === userId) {
        return res.json({ ok: true, skipped: true });
      }

      if (recentFeedStoryNotificationExists(authorId, userId, "like", postId)) {
        return res.json({ ok: true, deduped: true });
      }

      await ensureLocalUserFromSupabaseProfile(userId);
      await ensureLocalUserFromSupabaseProfile(authorId);
      const name = await fetchUsernameForUserId(userId);
      console.log("LIKE NOTIF TRIGGERED", postId, userId);
      insertNotificationWithRealtime({
        receiverId: authorId,
        actorId: userId,
        type: "like",
        message: `${name} liked your post`,
        storyId: postId,
        entityId: postId,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "from-feed-like failed" });
    }
  });

  /**
   * When the client used Supabase directly for a comment, still persist + realtime notify.
   */
  app.post("/api/notifications/from-feed-comment", async (req, res) => {
    try {
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
      const postId = typeof req.body?.postId === "string" ? req.body.postId.trim() : "";
      const commentId = typeof req.body?.commentId === "string" ? req.body.commentId.trim() : "";
      if (!userId || !postId || !commentId) {
        return res.status(400).json({ error: "Missing userId, postId, or commentId" });
      }
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Supabase service role not configured on server" });
      }

      const { data: row, error: rowErr } = await supabaseAdmin
        .from("comments")
        .select("id")
        .eq("id", commentId)
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();
      if (rowErr) {
        console.error("SERVER: from-feed-comment comments read failed:", rowErr.message, rowErr);
      }
      if (!row) {
        return res.status(400).json({ error: "Comment not found" });
      }

      const authorId = (await getPostOwnerUserIdForFeedNotification(postId, req.body as Record<string, unknown>)) || "";
      if (!authorId || authorId === userId) {
        return res.json({ ok: true, skipped: true });
      }

      if (recentFeedStoryNotificationExists(authorId, userId, "comment", postId)) {
        return res.json({ ok: true, deduped: true });
      }

      await ensureLocalUserFromSupabaseProfile(userId);
      await ensureLocalUserFromSupabaseProfile(authorId);
      const name = await fetchUsernameForUserId(userId);
      console.log("COMMENT NOTIF TRIGGERED", postId, userId);
      insertNotificationWithRealtime({
        receiverId: authorId,
        actorId: userId,
        type: "comment",
        message: `${name} commented on your post`,
        storyId: postId,
        entityId: postId,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "from-feed-comment failed" });
    }
  });

  /**
   * After a Supabase `messages` row is inserted, call this so the receiver gets a realtime inbox notification.
   * Verifies the row exists and matches sender/receiver (service role preferred).
   */
  app.post("/api/notifications/dm", async (req, res) => {
    try {
      const messageId = typeof req.body?.messageId === "string" ? req.body.messageId.trim() : "";
      const senderId = typeof req.body?.senderId === "string" ? req.body.senderId.trim() : "";
      const receiverId = typeof req.body?.receiverId === "string" ? req.body.receiverId.trim() : "";
      if (!messageId || !senderId || !receiverId || senderId === receiverId) {
        return res.status(400).json({ error: "Invalid payload" });
      }
      const client = supabaseAdmin || supabase;
      if (!client) {
        return res.status(503).json({ error: "Supabase not configured on server" });
      }

      const { data: row, error } = await client
        .from("messages")
        .select("id, sender_id, receiver_id, content")
        .eq("id", messageId)
        .maybeSingle();

      if (error || !row || String(row.sender_id) !== senderId || String(row.receiver_id) !== receiverId) {
        return res.status(404).json({ error: "Message not found" });
      }

      const senderName = await fetchUsernameForUserId(senderId);
      const preview = String(row.content || "").slice(0, 120);
      const isUrl = /^https?:\/\//i.test(preview);
      const msg =
        !preview || isUrl
          ? `${senderName} sent you a message`
          : `${senderName}: ${preview}`;

      insertNotificationWithRealtime({
        receiverId,
        actorId: senderId,
        type: "inbox_message",
        message: msg,
        storyId: null,
        entityId: messageId,
        dedupe: true,
      });

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "dm notification failed" });
    }
  });

  /**
   * Receiver opened chat: mark incoming messages from the other user as read, then notify the sender via Socket.IO.
   * Body: { receiverId, senderId } → UPDATE messages SET is_seen=true WHERE receiver_id=receiverId AND sender_id=senderId
   */
  app.post("/api/messages/mark-seen", async (req, res) => {
    try {
      const receiverId = typeof req.body?.receiverId === "string" ? req.body.receiverId.trim() : "";
      const senderId = typeof req.body?.senderId === "string" ? req.body.senderId.trim() : "";
      const productIdRaw = req.body?.productId;
      const productId =
        typeof productIdRaw === "string" && productIdRaw.trim() ? productIdRaw.trim() : null;
      if (!receiverId || !senderId || receiverId === senderId) {
        return res.status(400).json({ error: "Invalid payload" });
      }
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Supabase service role not configured" });
      }
      let q = supabaseAdmin
        .from("messages")
        .update({ is_seen: true })
        .eq("receiver_id", receiverId)
        .eq("sender_id", senderId);
      if (productId) {
        q = q.eq("product_id", productId);
      } else {
        q = q.is("product_id", null);
      }
      const { error } = await q;
      if (error) {
        console.error("POST /api/messages/mark-seen update error:", error);
        return res.status(500).json({ error: error.message });
      }
      try {
        const uid = String(senderId).replace(/^user_/, "").trim();
        if (uid) {
          io.to(`user_${uid}`).emit("messages_seen", { senderId, receiverId });
          logToFile(`SERVER: messages_seen emitted room=user_${uid} senderId=${senderId} receiverId=${receiverId}`);
        }
      } catch (e) {
        console.error("messages_seen emit error:", e);
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error("POST /api/messages/mark-seen:", err);
      return res.status(500).json({ error: err?.message || "mark-seen failed" });
    }
  });

  // Suggested people sourced from profiles table
  app.get("/api/users/suggestions", async (req, res) => {
    try {
      if (!supabase) return res.json([]);
      const userIdRaw = req.query.userId;
      const userId = typeof userIdRaw === 'string' ? userIdRaw : '';
      const limitRaw = req.query.limit;
      const limit = typeof limitRaw === 'string' ? Number(limitRaw) || 3 : 3;

      let query = supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .limit(limit);
      if (userId) query = query.neq('id', userId);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to fetch suggestions' });
    }
  });

  app.post("/api/users/follow", async (req, res) => {
    const { followerId, followingId } = req.body;
    logToFile(`SERVER: Follow request from ${followerId} to ${followingId}`);
    if (!followerId || !followingId) return res.status(400).json({ error: 'Missing IDs' });

    try {
      // Ensure both users exist in the local SQLite cache.
      // Without this, the `follows` INSERT fails due to foreign key constraints.
      db.prepare('INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)').run(followerId, followerId);
      db.prepare('INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)').run(followingId, followingId);

      let newFollow = false;
      const transaction = db.transaction(() => {
        const result = db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(followerId, followingId);
        logToFile(`SERVER: Follow insert result changes: ${result.changes}`);
        
        if (result.changes > 0) {
          newFollow = true;
          db.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').run(followerId);
          db.prepare('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?').run(followingId);
        }
      });
      transaction();

      // Sync to Supabase
      try {
        await supabase.from('follows').upsert({
          follower_id: followerId,
          following_id: followingId
        });
        
        // Update counts in profiles if they exist
        await supabase.rpc('increment_following_count', { user_id: followerId });
        await supabase.rpc('increment_followers_count', { user_id: followingId });
      } catch (e) {
        logToFile(`SERVER: Supabase follow sync error: ${e}`);
      }

      if (newFollow) {
        if (followerId !== followingId && !recentFollowNotificationExists(followingId, followerId)) {
          try {
            await ensureLocalUserFromSupabaseProfile(followerId);
            await ensureLocalUserFromSupabaseProfile(followingId);
            const followerName = await fetchUsernameForUserId(followerId);
            console.log("FOLLOW NOTIF TRIGGERED", followerId, followingId);
            const fn = insertNotificationWithRealtime({
              receiverId: followingId,
              actorId: followerId,
              type: "follow",
              message: `${followerName} started following you`,
              storyId: null,
              entityId: followerId,
            });
            if (fn) {
              logToFile(`SERVER: follow notification ok notifId=${fn.id} receiver=${followingId} actor=${followerId}`);
            }
          } catch (e) {
            console.error("Notification error:", e);
          }
        }
      }

      res.json({ success: true });
    } catch (err) {
      logToFile(`SERVER: Follow error: ${err}`);
      res.status(500).json({ error: 'Failed to follow' });
    }
  });

  app.post("/api/users/unfollow", async (req, res) => {
    const { followerId, followingId } = req.body;
    logToFile(`SERVER: Unfollow request from ${followerId} to ${followingId}`);
    if (!followerId || !followingId) return res.status(400).json({ error: 'Missing IDs' });

    try {
      const transaction = db.transaction(() => {
        const result = db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(followerId, followingId);
        logToFile(`SERVER: Unfollow delete result changes: ${result.changes}`);
        
        if (result.changes > 0) {
          db.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').run(followerId);
          db.prepare('UPDATE users SET followers_count = MAX(0, followers_count - 1) WHERE id = ?').run(followingId);
        }
      });
      transaction();

      // Sync to Supabase
      try {
        await supabase.from('follows')
          .delete()
          .eq('follower_id', followerId)
          .eq('following_id', followingId);
          
        await supabase.rpc('decrement_following_count', { user_id: followerId });
        await supabase.rpc('decrement_followers_count', { user_id: followingId });
      } catch (e) {
        logToFile(`SERVER: Supabase unfollow sync error: ${e}`);
      }

      res.json({ success: true });
    } catch (err) {
      logToFile(`SERVER: Unfollow error: ${err}`);
      res.status(500).json({ error: 'Failed to unfollow' });
    }
  });

  // Friends page: lists from SQLite (matches local follower/following counts when Supabase follows is empty/out of sync)
  app.get("/api/users/:id/following-list", (req, res) => {
    const id = req.params.id;
    try {
      const rows = db.prepare(`
        SELECT
          u.id,
          u.username,
          u.avatar,
          u.full_name,
          (
            SELECT COUNT(DISTINCT f2.follower_id)
            FROM follows f2
            WHERE f2.following_id = u.id
          ) AS followers_count
        FROM follows f
        JOIN users u ON u.id = f.following_id
        WHERE f.follower_id = ?
      `).all(id) as { id: string; username: string; avatar: string | null; full_name: string | null; followers_count: number }[];
      console.log(`[SERVER] following-list user=${id} count=${rows.length}`);
      const mapped = rows.map((r) => ({
        id: r.id,
        username: r.username,
        avatar_url: r.avatar,
        full_name: r.full_name,
        display_name: r.full_name,
        followers_count: r.followers_count ?? 0,
      }));
      res.json(mapped);
    } catch (err) {
      logToFile(`SERVER: following-list error: ${err}`);
      res.status(500).json({ error: "Failed to load following list" });
    }
  });

  app.get("/api/users/:id/followers-list", (req, res) => {
    const id = req.params.id;
    try {
      const rows = db.prepare(`
        SELECT
          u.id,
          u.username,
          u.avatar,
          u.full_name,
          (
            SELECT COUNT(DISTINCT f2.follower_id)
            FROM follows f2
            WHERE f2.following_id = u.id
          ) AS followers_count
        FROM follows f
        JOIN users u ON u.id = f.follower_id
        WHERE f.following_id = ?
      `).all(id) as { id: string; username: string; avatar: string | null; full_name: string | null; followers_count: number }[];
      console.log(`[SERVER] followers-list user=${id} count=${rows.length}`);
      const mapped = rows.map((r) => ({
        id: r.id,
        username: r.username,
        avatar_url: r.avatar,
        full_name: r.full_name,
        display_name: r.full_name,
        followers_count: r.followers_count ?? 0,
      }));
      res.json(mapped);
    } catch (err) {
      logToFile(`SERVER: followers-list error: ${err}`);
      res.status(500).json({ error: "Failed to load followers list" });
    }
  });

  app.get("/api/users/:id/following/:targetId", async (req, res) => {
    const { id, targetId } = req.params;
    try {
      // Try Supabase first
      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', id)
        .eq('following_id', targetId)
        .maybeSingle();
      
      if (data) {
        return res.json({ isFollowing: true });
      }
    } catch (e) {
      logToFile(`SERVER: Supabase follow check error: ${e}`);
    }
    
    // Fallback to SQLite
    const follow = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(id, targetId);
    res.json({ isFollowing: !!follow });
  });

  app.post("/api/users/sync-all", async (req, res) => {
    logToFile('SERVER: Sync-all request');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*');
      
      if (error) {
        logToFile(`SERVER: Supabase fetch error in sync-all: ${error.message}`);
        throw error;
      }
      
      if (data) {
        logToFile(`SERVER: Syncing ${data.length} users from Supabase`);
        console.log(`DEBUG: Found ${data.length} profiles in Supabase`);
        data.forEach(u => console.log(`DEBUG: Profile: ${u.username} (${u.id})`));
        
        const stmt = db.prepare(`
          INSERT INTO users (id, username, avatar, full_name, bio) 
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            username = excluded.username,
            avatar = excluded.avatar,
            full_name = excluded.full_name,
            bio = COALESCE(excluded.bio, users.bio)
        `);
        
        const transaction = db.transaction((users) => {
          for (const user of users) {
            stmt.run(user.id, user.username, user.avatar_url, user.display_name || user.full_name, user.bio);
          }
        });
        
        transaction(data);
        logToFile('SERVER: Sync-all successful');
      } else {
        logToFile('SERVER: No data returned from Supabase in sync-all');
      }
      res.json({ success: true, count: data?.length || 0 });
    } catch (err) {
      logToFile(`SERVER: Sync-all error: ${err}`);
      res.status(500).json({ error: 'Failed to sync all users' });
    }
  });

  app.post("/api/user/:id/verify", (req, res) => {
    db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/transactions/:userId", (req, res) => {
    const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC').all(req.params.userId);
    res.json(txs);
  });

  // Live Streaming Endpoints
  app.post("/api/lives/start", async (req, res) => {
    const { userId, channelName } = req.body;
    const id = uuidv4();
    
    try {
      const { data, error } = await supabase
        .from('lives')
        .insert({
          id,
          user_id: userId,
          channel_name: channelName,
          status: 'active',
          viewer_count: 0
        })
        .select()
        .single();
      
      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error('Error starting live:', err);
      res.status(500).json({ error: 'Failed to start live session' });
    }
  });

  app.post("/api/lives/:id/end", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase
        .from('lives')
        .update({ status: 'ended' })
        .eq('id', id);
      
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error('Error ending live:', err);
      res.status(500).json({ error: 'Failed to end live session' });
    }
  });

  app.post("/api/lives/:id/join", async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    try {
      // Add to live_viewers
      await supabase.from('live_viewers').insert({
        live_id: id,
        user_id: userId
      });

      // Increment viewer count
      const { data: live } = await supabase.from('lives').select('viewer_count').eq('id', id).single();
      await supabase.from('lives').update({ viewer_count: (live?.viewer_count || 0) + 1 }).eq('id', id);

      res.json({ success: true });
    } catch (err) {
      console.error('Error joining live:', err);
      res.status(500).json({ error: 'Failed to join live session' });
    }
  });

  app.post("/api/lives/:id/leave", async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    try {
      // Remove from live_viewers
      await supabase.from('live_viewers').delete().eq('live_id', id).eq('user_id', userId);

      // Decrement viewer count
      const { data: live } = await supabase.from('lives').select('viewer_count').eq('id', id).single();
      const newCount = Math.max(0, (live?.viewer_count || 1) - 1);
      await supabase.from('lives').update({ viewer_count: newCount }).eq('id', id);

      res.json({ success: true });
    } catch (err) {
      console.error('Error leaving live:', err);
      res.status(500).json({ error: 'Failed to leave live session' });
    }
  });

  app.post("/api/lives/:id/gift", async (req, res) => {
    const { id } = req.params;
    const { senderId, receiverId, coins } = req.body;
    try {
      // 1. Record gift
      await supabase.from('live_gifts').insert({
        live_id: id,
        sender_id: senderId,
        receiver_id: receiverId,
        coins
      });

      // 2. Update balances in local DB (and ideally Supabase)
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(coins, senderId);
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(coins, receiverId);

      try {
        if (receiverId && senderId && String(receiverId) !== String(senderId)) {
          const senderName = await fetchUsernameForUserId(String(senderId));
          const c = Number(coins) || 0;
          insertNotificationWithRealtime({
            receiverId: String(receiverId),
            actorId: String(senderId),
            type: "live",
            message: `${senderName} sent you a gift (${c} coins)`,
            storyId: String(id),
            entityId: String(id),
          });
        }
      } catch (e) {
        console.error("Notification error:", e);
        logToFile(`SERVER: live gift notification error: ${e}`);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Error sending gift:', err);
      res.status(500).json({ error: 'Failed to send gift' });
    }
  });

  app.post("/api/lives/:id/message", async (req, res) => {
    const { id } = req.params;
    const { userId, message } = req.body;
    try {
      const { data, error } = await supabase
        .from('live_messages')
        .insert({
          live_id: id,
          user_id: userId,
          message
        })
        .select('*, profiles(username, avatar_url)')
        .single();
      
      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error('Error sending live message:', err);
      res.status(500).json({ error: 'Failed to send live message' });
    }
  });

  app.get("/api/groups", async (req, res) => {
    try {
      const client = supabaseForGroupSync();
      if (!client) throw new Error("no supabase");
      const { data, error } = await client.from("groups").select("*");
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      logToFile(`SERVER: Supabase groups fetch error: ${err}`);
      const groups = db.prepare('SELECT * FROM groups').all();
      res.json(groups);
    }
  });

  app.get("/api/groups/joined/:userId", async (req, res) => {
    const userId = req.params.userId;
    const localJoined = () =>
      db
        .prepare(
          `
        SELECT g.* FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
      `
        )
        .all(userId);

    try {
      const client = supabaseForGroupSync();
      if (client) {
        const { data, error } = await client
          .from("groups")
          .select("*, group_members!inner(user_id)")
          .eq("group_members.user_id", userId);

        if (error) throw error;
        if (Array.isArray(data) && data.length > 0) {
          return res.json(data);
        }
      }
    } catch (err) {
      logToFile(`SERVER: Supabase joined groups fetch error: ${err}`);
    }
    res.json(localJoined());
  });

  app.get("/api/groups/:id", (req, res) => {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    const members = db.prepare(`
      SELECT gm.user_id as id, u.username, u.avatar, gm.role 
      FROM group_members gm 
      LEFT JOIN users u ON gm.user_id = u.id 
      WHERE gm.group_id = ?
    `).all(req.params.id);

    const activeCall = db.prepare("SELECT * FROM calls WHERE group_id = ? AND status = 'active'").get(req.params.id);
    let isSpeaker = false;
    if (activeCall && req.query.userId) {
      const speaker = db.prepare('SELECT * FROM call_speakers WHERE call_id = ? AND user_id = ?').get(activeCall.id, req.query.userId);
      isSpeaker = !!speaker;
    }
    
    res.json({ ...group, members, activeCall: activeCall ? { ...activeCall, isSpeaker } : null });
  });

  app.get("/api/groups/:groupId/messages", async (req, res) => {
    const { groupId } = req.params;
    try {
      await syncGroupMessages(groupId);
      const messages = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC LIMIT 100').all(groupId);
      res.json(messages);
    } catch (err) {
      console.error('Error in GET /api/groups/:groupId/messages:', err);
      const messages = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC LIMIT 100').all(groupId);
      res.json(messages);
    }
  });

  app.post("/api/groups", async (req, res) => {
    if (!supabaseAdmin) {
      console.error(
        "[POST /api/groups] refused: SUPABASE_SERVICE_ROLE_KEY not set (USING SERVICE ROLE must be true for persistence)"
      );
      return res.status(503).json({
        error:
          "SUPABASE_SERVICE_ROLE_KEY must be set on the server (same env as SUPABASE_URL). Restart after setting.",
      });
    }

    try {
      const { name, description, image, type } = req.body;

      const authHeader = req.headers.authorization;
      const token =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : null;
      const authUserResp = supabase && token ? await supabase.auth.getUser(token) : null;
      const authUser = authUserResp?.data?.user || null;
      console.log("CREATE GROUP USER:", authUser ? { id: authUser.id, email: authUser.email ?? null } : null);
      const userId = authUser?.id ? String(authUser.id).trim() : null;
      if (!userId) {
        throw new Error("Missing authenticated userId - do not proceed");
      }

      console.log("Creating group with userId:", userId);

      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      const id = uuidv4();
      const imageUrl = image || `https://picsum.photos/seed/${id}/400/200`;
      const groupType = type || "Public";
      const privacy = String(groupType || "Public").toLowerCase();

      const rollbackLocal = () => {
        try {
          db.prepare("DELETE FROM group_members WHERE group_id = ?").run(id);
          db.prepare("DELETE FROM groups WHERE id = ?").run(id);
        } catch (e) {
          console.error("[POST /api/groups] rollback local DB failed:", e);
        }
      };

      db.prepare(
        "INSERT INTO groups (id, name, description, image, type, creator_id) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, name.trim(), description ?? "", imageUrl, groupType, userId);

      if (!userId) {
        rollbackLocal();
        return res.status(401).json({ error: "User not authenticated" });
      }
      db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)").run(id, userId, "admin");

      console.log("[POST /api/groups] local SQLite OK, syncing to Supabase (service role)", {
        group_id: id,
        creator_id: userId,
        role: "admin",
      });

      const groupRes = await syncGroupRowToSupabase({
        id,
        name: name.trim(),
        description: description ?? "",
        privacy,
        creator_id: userId,
      });
      if (!groupRes.ok) {
        rollbackLocal();
        return res.status(503).json({
          error: "Failed to persist group row to Supabase",
          details: "error" in groupRes ? groupRes.error : "Unknown group sync failure",
        });
      }

      // Insert admin membership with user JWT client so RLS enforces auth.uid() = user_id.
      if (!supabaseUrl || !supabaseAnonKey || !token) {
        rollbackLocal();
        return res.status(401).json({ error: "User not authenticated" });
      }
      const supabaseMembershipClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
      const membershipPayload = {
        group_id: id,
        user_id: userId,
        role: "admin",
      };
      console.log("MEMBERSHIP USER:", authUser);
      console.log("MEMBERSHIP PAYLOAD:", membershipPayload);
      const { error: membershipInsertError } = await supabaseMembershipClient
        .from("group_members")
        .insert(membershipPayload);
      if (membershipInsertError && membershipInsertError.code !== "23505") {
        rollbackLocal();
        try {
          await supabaseAdmin.from("groups").delete().eq("id", id);
        } catch (e) {
          console.error("[POST /api/groups] cleanup Supabase groups row failed:", e);
        }
        return res.status(503).json({
          error: "Failed to persist group_members to Supabase",
          details: membershipInsertError.message,
        });
      }

      console.log("[POST /api/groups] create group response (success)", {
        id,
        name: name.trim(),
        description: description ?? "",
        membership: membershipPayload,
      });
      res.json({ id, name: name.trim(), description: description ?? "" });
    } catch (err: unknown) {
      console.log("CREATE GROUP ERROR:", err);
      console.error("Error creating group:", err);
      const message = err instanceof Error ? err.message : "";
      if (message === "Missing authenticated userId - do not proceed") {
        return res.status(401).json({ error: message });
      }
      res.status(500).json({ error: "Failed to create group" });
    }
  });

  app.post("/api/groups/:id/join", async (req, res) => {
    const groupId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!groupId) return res.status(400).json({ error: "group_id is required" });

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(503).json({ error: "Supabase is not configured on server" });
    }

    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const supabaseJoinClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: { user }, error: userError } = await supabaseJoinClient.auth.getUser();
    if (userError) {
      console.error("JOIN USER ERROR:", userError);
    }
    console.log("JOIN USER:", user);
    if (!user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const payload = {
      group_id: groupId,
      user_id: user.id,
      role: "member",
    };
    console.log("MEMBERSHIP USER:", user);
    console.log("MEMBERSHIP PAYLOAD:", payload);
    console.log("JOIN PAYLOAD:", { group_id: groupId, user_id: user?.id });

    const { data: existingMembership, error: existingError } = await supabaseJoinClient
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingError) console.log("INSERT ERROR:", existingError);
    if (existingMembership) {
      console.log("ALREADY MEMBER");
      return res.status(200).json({ message: "Already joined" });
    }

    const { error } = await supabaseJoinClient.from("group_members").insert(payload);
    console.log("INSERT RESULT:", error);

    if (error) {
      console.log("INSERT ERROR:", error);
      return res.status(500).json({ error: error.message });
    }

    // Keep local cache aligned after successful cloud insert.
    try {
      db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)").run(
        groupId,
        user.id,
        "member"
      );
    } catch (e) {
      console.warn("[POST /api/groups/:id/join] local cache sync failed:", e);
    }

    return res.status(200).json({ success: true });
  });

  app.post("/api/groups/:id/leave", async (req, res) => {
    const groupId = req.params.id;
    const userId = await getAuthUserIdFromJwtHeader(req);
    if (!userId) {
      return res.status(401).json({ error: "Missing authenticated userId - do not proceed" });
    }

    try {
      db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, userId);

      const client = groupPersistenceClient();
      if (client) {
        const { error } = await client
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", userId);

        if (error) {
          if (error.code === "42P01") {
            console.warn('Supabase table "group_members" does not exist. Skipping sync.');
          } else {
            console.error("Supabase group_members delete (leave) FAILED:", error.code, error.message);
          }
        } else {
          console.log("[POST /api/groups/leave] Supabase group_members delete OK", { groupId, userId });
        }
      } else {
        console.warn("[POST /api/groups/leave] SUPABASE_SERVICE_ROLE_KEY missing — cloud membership may be stale");
      }

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to leave group" });
    }
  });

  app.post("/api/groups/:id/invite", async (req, res) => {
    const { username, userId, avatar } = req.body;
    const groupId = req.params.id;
    const inviterId = await getAuthUserIdFromJwtHeader(req);
    if (!inviterId) {
      return res.status(401).json({ error: "Missing authenticated userId - do not proceed" });
    }
    
    const normalizedUsername = typeof username === 'string' ? username.trim().replace(/^@/, '') : '';

    let user = normalizedUsername
      ? db.prepare('SELECT id FROM users WHERE username = ?').get(normalizedUsername)
      : null;
    
    if (!user && userId) {
      try {
        db.prepare('INSERT OR IGNORE INTO users (id, username, avatar) VALUES (?, ?, ?)')
          .run(userId, normalizedUsername, avatar);
        user = { id: userId };
      } catch (e) {
        console.error('Error syncing user during invite:', e);
      }
    }

    // If the invited user hasn't logged in on this device yet, they might not exist in the local SQLite cache.
    // In that case, fetch them from Supabase by username and sync them locally.
    if (!user && normalizedUsername && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, full_name, display_name, bio')
          .ilike('username', normalizedUsername)
          .maybeSingle();

        if (error) {
          console.error('Supabase profile lookup error (invite):', error.code, error.message);
        } else if (data?.id) {
          const fullName = data.full_name || data.display_name || data.username;
          db.prepare(`
            INSERT INTO users (id, username, avatar, full_name, bio)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              username = excluded.username,
              avatar = excluded.avatar,
              full_name = excluded.full_name,
              bio = COALESCE(excluded.bio, users.bio)
          `).run(data.id, data.username, data.avatar_url, fullName, data.bio);

          user = { id: data.id };
        }
      } catch (e) {
        console.error('Supabase profile lookup exception (invite):', e);
      }
    }
    
    if (!user) return res.status(404).json({ error: 'User not found. Please check the username.' });

    if (!supabaseAdmin) {
      console.error("[POST /api/groups/invite] refused: SUPABASE_SERVICE_ROLE_KEY not set");
      return res.status(503).json({
        error:
          "SUPABASE_SERVICE_ROLE_KEY must be set on the server (same env as SUPABASE_URL). Restart after setting.",
      });
    }

    try {
      db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
        .run(groupId, user.id, 'member');

      const syncClient = groupPersistenceClient();
      if (syncClient) {
        try {
          await syncClient.from("profiles").upsert({
            id: user.id,
            username: normalizedUsername,
            avatar_url: avatar,
            display_name: normalizedUsername,
          });
        } catch {
          /* non-fatal */
        }
      }

      const memberRes = await syncGroupMembershipToSupabase({
        group_id: groupId,
        user_id: user.id,
        role: "member",
        context: `invite by ${inviterId}`,
      });
      if (!memberRes.ok) {
        db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, user.id);
        return res.status(503).json({
          error: "Failed to persist membership to Supabase",
          details: "error" in memberRes ? memberRes.error : "Unknown membership sync failure",
        });
      }

      console.log("[POST /api/groups/invite] success", { groupId, userId: user.id, membership: memberRes.row });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'User is already a member' });
    }
  });

  app.get("/api/groups/:id/posts", (req, res) => {
    try {
      const posts = db.prepare(`
        SELECT * FROM group_posts 
        WHERE group_id = ? 
        ORDER BY created_at DESC
      `).all(req.params.id);
      res.json(posts);
    } catch (err) {
      console.error('Error fetching group posts:', err);
      res.status(500).json({ error: 'Failed to fetch group posts' });
    }
  });

  app.post("/api/groups/:id/posts", async (req, res) => {
    const { username, avatar, content, imageUrl, image_url } = req.body;
    const groupId = req.params.id;
    const id = uuidv4();
    const authUserId = await getAuthUserIdFromJwtHeader(req);
    if (!authUserId) {
      return res.status(401).json({ error: "Missing authenticated userId - do not proceed" });
    }
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "content is required" });
    }

    const localUser = db
      .prepare("SELECT username, avatar FROM users WHERE id = ?")
      .get(authUserId) as { username?: string | null; avatar?: string | null } | undefined;
    const normalizedUsername =
      (typeof username === "string" && username.trim()) ||
      (typeof localUser?.username === "string" && localUser.username.trim()) ||
      "user";
    const normalizedAvatar =
      (typeof avatar === "string" && avatar.trim()) ||
      (typeof localUser?.avatar === "string" && localUser.avatar.trim()) ||
      null;
    const normalizedImageUrl =
      (typeof imageUrl === 'string' && imageUrl.trim()) ||
      (typeof image_url === 'string' && image_url.trim()) ||
      null;
    
    try {
      db.prepare(`
        INSERT INTO group_posts (id, group_id, user_id, username, avatar, content, image_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, groupId, authUserId, normalizedUsername, normalizedAvatar, content.trim(), normalizedImageUrl);

      // Keep cloud data aligned with local group feed storage.
      if (supabaseAdmin) {
        const { error: postSyncError } = await supabaseAdmin.from("group_posts").upsert(
          {
            id,
            group_id: groupId,
            user_id: authUserId,
            username: normalizedUsername,
            avatar: normalizedAvatar,
            content: content.trim(),
            image_url: normalizedImageUrl,
          },
          { onConflict: "id" }
        );
        if (postSyncError) {
          console.error("[POST /api/groups/:id/posts] Supabase group_posts upsert FAILED", {
            code: postSyncError.code,
            message: postSyncError.message,
            details: (postSyncError as any).details,
            hint: (postSyncError as any).hint,
            group_id: groupId,
            user_id: authUserId,
          });
        }
      }

      res.json({ success: true, id });
    } catch (err) {
      console.error('Error creating group post:', err);
      res.status(500).json({ error: 'Failed to create group post' });
    }
  });

  app.put("/api/groups/:id", async (req, res) => {
    const { image, cover_image, name, description } = req.body;
    const groupId = req.params.id;
    
    try {
      const updates: string[] = [];
      const params: any[] = [];
      
      if (image !== undefined) { updates.push('image = ?'); params.push(image); }
      if (cover_image !== undefined) { updates.push('cover_image = ?'); params.push(cover_image); }
      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      
      if (updates.length > 0) {
        params.push(groupId);
        db.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        
        // Sync to Supabase
        try {
          const supabaseUpdate: any = {};
          if (image !== undefined) supabaseUpdate.image = image;
          if (cover_image !== undefined) supabaseUpdate.cover_image = cover_image;
          if (name !== undefined) supabaseUpdate.name = name;
          if (description !== undefined) supabaseUpdate.description = description;
          
          await supabase.from('groups').update(supabaseUpdate).eq('id', groupId);
        } catch (e) {
          console.error('Supabase group update sync error:', e);
        }
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating group:', err);
      res.status(500).json({ error: 'Failed to update group' });
    }
  });

  app.post("/api/calls/start", async (req, res) => {
    console.log('Starting call:', req.body);
    const { hostId, type, groupId } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO calls (id, host_id, type, group_id) VALUES (?, ?, ?, ?)').run(id, hostId, type, groupId || null);
      db.prepare('INSERT INTO call_speakers (call_id, user_id) VALUES (?, ?)').run(id, hostId);
      
      // Sync to Supabase
      try {
        await supabase.from('calls').upsert({
          id,
          host_id: hostId,
          type,
          group_id: groupId || null,
          status: 'active'
        });
        await supabase.from('call_speakers').upsert({
          call_id: id,
          user_id: hostId
        });
      } catch (e) {
        logToFile(`SERVER: Supabase call start sync error: ${e}`);
      }

      console.log('Call started successfully:', id);
      res.json({ id, hostId, type, capacity: 20 });
    } catch (err) {
      console.error('Error starting call:', err);
      res.status(500).json({ error: 'Failed to start call' });
    }
  });

  app.post("/api/calls/:id/upgrade", async (req, res) => {
    const { hostId, capacity, cost } = req.body;
    const callId = req.params.id;
    
    try {
      const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(hostId);
      if (!user || user.coins < cost) {
        return res.status(400).json({ error: 'Insufficient coins' });
      }
      
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cost, hostId);
      db.prepare('UPDATE calls SET capacity = ? WHERE id = ?').run(capacity, callId);
      
      // Record transaction
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), hostId, 'withdrawal', cost, `Call upgrade to ${capacity} participants`);
      
      // Sync to Supabase
      try {
        await supabase.rpc('decrement_coins', { user_id: hostId, amount: cost });
        await supabase.from('calls').update({ capacity }).eq('id', callId);
        await supabase.from('transactions').insert({
          id: uuidv4(),
          user_id: hostId,
          type: 'withdrawal',
          amount: -cost,
          description: `Call upgrade to ${capacity} participants`
        });
      } catch (e) {
        logToFile(`SERVER: Supabase call upgrade sync error: ${e}`);
      }
        
      res.json({ success: true, newCapacity: capacity });
    } catch (err) {
      res.status(500).json({ error: 'Failed to upgrade call' });
    }
  });

  app.post("/api/calls/:id/end", async (req, res) => {
    try {
      db.prepare("UPDATE calls SET status = 'ended' WHERE id = ?").run(req.params.id);
      
      // Sync to Supabase
      try {
        await supabase.from('calls').update({ status: 'ended' }).eq('id', req.params.id);
      } catch (e) {
        logToFile(`SERVER: Supabase call end sync error: ${e}`);
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to end call' });
    }
  });

  app.get("/api/live-calls", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*, profiles!host_id(username), groups(name, image)')
        .eq('is_live', true)
        .eq('status', 'active');
      
      if (error) throw error;
      
      const liveCalls = (data || []).map(c => ({
        ...c,
        host_username: c.profiles?.username || 'Unknown',
        group_name: c.groups?.name || (c.profiles?.username + "'s Live Call"),
        group_image: c.groups?.image || `https://picsum.photos/seed/${c.host_id}/400/200`
      }));
      
      res.json(liveCalls);
    } catch (err) {
      logToFile(`SERVER: Supabase live-calls fetch error: ${err}`);
      const liveCalls = db.prepare(`
        SELECT c.*, u.username as host_username, 
               COALESCE(g.name, u.username || '''s Live Call') as group_name, 
               COALESCE(g.image, 'https://picsum.photos/seed/' || u.id || '/400/200') as group_image
        FROM calls c
        JOIN users u ON c.host_id = u.id
        LEFT JOIN groups g ON u.id = g.creator_id
        WHERE c.is_live = 1 AND c.status = 'active'
        GROUP BY c.id
      `).all();
      res.json(liveCalls);
    }
  });

  app.get("/api/streams", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('streams')
        .select('*, profiles!streamer_id(username, avatar_url)')
        .eq('status', 'live')
        .order('viewer_count', { ascending: false });
      
      if (error) throw error;
      
      const streams = (data || []).map(s => ({
        ...s,
        streamer_username: s.profiles?.username || 'Unknown',
        streamer_avatar: s.profiles?.avatar_url || null
      }));
      
      if (streams.length === 0) {
        return res.json([
          { id: 's1', viewer_count: 1200, streamer_id: 'u2', streamer_username: 'sarah_j', title: 'Morning Yoga & Meditation', category: 'fitness' },
          { id: 's2', viewer_count: 850, streamer_id: 'u3', streamer_username: 'tech_guru', title: 'Building a SaaS in 24h', category: 'tech' },
          { id: 's3', viewer_count: 3400, streamer_id: 'u4', streamer_username: 'alex_vibe', title: 'Late Night DJ Set 🎧', category: 'music' },
          { id: 's4', viewer_count: 150, streamer_id: 'u5', streamer_username: 'nature_lover', title: 'Exploring the Amazon', category: 'education' },
        ]);
      }
      res.json(streams);
    } catch (err) {
      logToFile(`SERVER: Supabase streams fetch error: ${err}`);
      const streams = db.prepare(`
        SELECT s.*, u.username as streamer_username, u.avatar as streamer_avatar
        FROM streams s
        JOIN users u ON s.streamer_id = u.id
        WHERE s.status = 'live'
        ORDER BY s.viewer_count DESC
      `).all();
      res.json(streams);
    }
  });

  app.post("/api/calls/:id/go-live", async (req, res) => {
    const callId = req.params.id;
    const streamId = uuidv4();
    
    try {
      db.prepare('UPDATE calls SET is_live = 1, stream_id = ? WHERE id = ?').run(streamId, callId);
      
      const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId);
      db.prepare("INSERT INTO streams (id, streamer_id, status) VALUES (?, ?, ?)")
        .run(streamId, call.host_id, 'live');
      
      // Sync to Supabase
      try {
        await supabase.from('calls').update({ is_live: true, stream_id: streamId }).eq('id', callId);
        await supabase.from('streams').insert({
          id: streamId,
          streamer_id: call.host_id,
          status: 'live'
        });
      } catch (e) {
        logToFile(`SERVER: Supabase go-live sync error: ${e}`);
      }
        
      res.json({ success: true, streamId });
    } catch (err) {
      res.status(500).json({ error: 'Failed to go live' });
    }
  });

  app.post("/api/calls/:id/request-join", (req, res) => {
    const { userId, amount } = req.body;
    const callId = req.params.id;
    
    const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
    if (!user || user.coins < amount) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }
    
    // Deduct coins
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(amount, userId);
    
    const requestId = uuidv4();
    db.prepare('INSERT INTO join_requests (id, call_id, user_id, amount) VALUES (?, ?, ?, ?)')
      .run(requestId, callId, userId, amount);
      
    res.json({ success: true, requestId });
  });

  app.post("/api/calls/:id/respond-join", (req, res) => {
    const { requestId, status } = req.body;
    const callId = req.params.id;
    
    const request = db.prepare('SELECT * FROM join_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    
    db.prepare('UPDATE join_requests SET status = ? WHERE id = ?').run(status, requestId);
    
    if (status === 'accepted') {
      // Add as speaker
      db.prepare('INSERT OR IGNORE INTO call_speakers (call_id, user_id) VALUES (?, ?)').run(callId, request.user_id);
      
      // Revenue split (70% host, 30% platform)
      const call = db.prepare('SELECT host_id FROM calls WHERE id = ?').get(callId);
      const hostPayout = Math.floor(request.amount * 0.7);
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(hostPayout, call.host_id);
      
      // Record transaction for host
      db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), call.host_id, hostPayout, 'support', 'Speaker join commission');
    } else if (status === 'declined') {
      // Refund user
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(request.amount, request.user_id);
    }
    
    res.json({ success: true });
  });

  app.get("/api/calls/:id/requests", (req, res) => {
    const requests = db.prepare(`
      SELECT jr.*, u.username 
      FROM join_requests jr
      JOIN users u ON jr.user_id = u.id
      WHERE jr.call_id = ? AND jr.status = 'pending'
    `).all(req.params.id);
    res.json(requests);
  });

  app.get("/api/inventory/:userId", (req, res) => {
    const products = db.prepare('SELECT * FROM products WHERE seller_id = ?').all(req.params.userId);
    res.json(products);
  });

  app.post("/api/live-selling/start", (req, res) => {
    const { streamerId, productIds } = req.body;
    const sessionId = uuidv4();
    
    db.prepare('INSERT INTO live_selling_sessions (id, streamer_id) VALUES (?, ?)').run(sessionId, streamerId);
    
    const insertProduct = db.prepare('INSERT INTO live_session_products (session_id, product_id) VALUES (?, ?)');
    for (const pid of productIds) {
      insertProduct.run(sessionId, pid);
    }
    
    res.json({ sessionId });
  });

  app.get("/api/live-selling/:sessionId/products", (req, res) => {
    const products = db.prepare(`
      SELECT p.* FROM products p
      JOIN live_session_products lsp ON p.id = lsp.product_id
      WHERE lsp.session_id = ?
    `).all(req.params.sessionId);
    res.json(products);
  });

  app.post("/api/live-selling/buy", (req, res) => {
    const { buyerId, productId, sessionId, paymentMethod } = req.body;
    
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product || product.stock <= 0) {
      return res.status(400).json({ error: 'Product out of stock' });
    }

    const buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(buyerId);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });

    // Payment validation
    if (paymentMethod === 'coins' && buyer.coins < product.price) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }
    if (paymentMethod === 'wallet' && buyer.usd_balance < product.price) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    // Process payment
    if (paymentMethod === 'coins') {
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(product.price, buyerId);
    } else if (paymentMethod === 'wallet') {
      db.prepare('UPDATE users SET usd_balance = usd_balance - ? WHERE id = ?').run(product.price, buyerId);
    }
    // Card payment simulated as success

    // Update stock
    db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(productId);

    // Commission split (10% platform, 90% seller)
    const commission = product.price * 0.1;
    const payout = product.price * 0.9;
    
    db.prepare('UPDATE users SET usd_balance = usd_balance + ? WHERE id = ?').run(payout, product.seller_id);

    // Record order
    const orderId = uuidv4();
    db.prepare(`
      INSERT INTO orders (id, buyer_id, seller_id, product_id, session_id, amount, payment_method, platform_commission, seller_payout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, buyerId, product.seller_id, productId, sessionId, product.price, paymentMethod, commission, payout);

    res.json({ success: true, orderId, newStock: product.stock - 1 });
  });

  app.get("/api/orders/:sellerId", (req, res) => {
    const orders = db.prepare(`
      SELECT o.*, p.title as product_title, u.username as buyer_username
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = ?
      ORDER BY o.created_at DESC
    `).all(req.params.sellerId);
    res.json(orders);
  });

  // Marketplace Endpoints (prefer service role so reads match production DB; avoid fragile embeds)
  app.get("/api/marketplace/products", async (req, res) => {
    try {
      const client = supabaseAdmin || supabase;
      if (!client) {
        const products = db.prepare(`
          SELECT p.*, u.username as seller_username
          FROM products p
          JOIN users u ON p.seller_id = u.id
          ORDER BY p.id DESC
        `).all();
        console.log("marketplace data:", products);
        console.log("marketplace error:", null);
        return res.json(products);
      }

      const { data, error } = await client
        .from('marketplace')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });

      console.log("marketplace data:", data);
      console.log("marketplace error:", error);

      if (error) throw error;

      const fromProducts = (data || []).map((m: Record<string, unknown>) => {
        const stockRaw = m.stock;
        const stock =
          stockRaw != null && String(stockRaw).trim() !== '' && Number.isFinite(Number(stockRaw))
            ? Number(stockRaw)
            : undefined;
        return {
          ...m,
          id: m.id,
          title: m.title,
          price: m.price,
          image: m.image_url,
          seller_id: m.user_id,
          category: String((m as { category?: string }).category ?? '').trim(),
          location: String((m as { location?: string }).location ?? '').trim(),
          description: String((m as { description?: string }).description ?? '').trim(),
          stock,
          created_at: m.created_at,
          view_count: m.view_count != null ? Number(m.view_count) : 0,
          is_featured_raw: Boolean(m.is_featured),
          is_featured: isMarketplaceEffectivelyFeatured({
            is_featured: m.is_featured,
            featured_until: m.featured_until,
          }),
          featured_until: m.featured_until ?? null,
        };
      });

      const mergedById = new Map<string, Record<string, unknown>>();
      for (const p of fromProducts) {
        if (p && (p as { id?: string }).id) mergedById.set(String((p as { id: string }).id), p as Record<string, unknown>);
      }
      const rows = [...mergedById.values()].sort((a, b) => {
        const fa = isMarketplaceEffectivelyFeatured(a as { is_featured?: unknown; featured_until?: unknown })
          ? 1
          : 0;
        const fb = isMarketplaceEffectivelyFeatured(b as { is_featured?: unknown; featured_until?: unknown })
          ? 1
          : 0;
        if (fa !== fb) return fb - fa;
        const ta = new Date((a as { created_at?: string }).created_at || 0).getTime();
        const tb = new Date((b as { created_at?: string }).created_at || 0).getTime();
        return tb - ta;
      });

      const sellerIds = [...new Set(rows.map((p: { seller_id?: string }) => p.seller_id).filter(Boolean))] as string[];
      const profileMap = new Map<string, string>();
      if (sellerIds.length > 0) {
        const { data: profs, error: pErr } = await client
          .from('profiles')
          .select('id, username')
          .in('id', sellerIds);
        console.log("marketplace profiles:", profs);
        console.log("marketplace profiles error:", pErr);
        if (!pErr && profs) {
          (profs as { id: string; username?: string }[]).forEach((p) => {
            if (p.id) profileMap.set(p.id, String(p.username ?? '').trim());
          });
        }
      }

      const products = rows.map((p: Record<string, unknown>) => ({
        ...p,
        seller_username: profileMap.get(String(p.seller_id ?? '')) || '',
      }));

      res.json(products);
    } catch (err) {
      logToFile(`SERVER: Supabase products fetch error: ${err}`);
      console.log("marketplace error:", err);
      const products = db.prepare(`
        SELECT p.*, u.username as seller_username
        FROM products p
        JOIN users u ON p.seller_id = u.id
        ORDER BY p.id DESC
      `).all();
      res.json(products);
    }
  });

  app.get("/api/marketplace/products/:id", async (req, res) => {
    try {
      const client = supabaseAdmin || supabase;
      if (!client) {
        const product = db.prepare(`
          SELECT p.*, u.username as seller_username
          FROM products p
          JOIN users u ON p.seller_id = u.id
          WHERE p.id = ?
        `).get(req.params.id);
        console.log("marketplace data:", product);
        console.log("marketplace error:", null);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        return res.json(product);
      }

      const { data, error } = await client
        .from('marketplace')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();

      console.log("marketplace data:", data);
      console.log("marketplace error:", error);

      let row: Record<string, unknown> | null = null;
      if (data && !error) {
        const m = data as Record<string, unknown>;
        const stockRaw = m.stock;
        const stock =
          stockRaw != null && String(stockRaw).trim() !== '' && Number.isFinite(Number(stockRaw))
            ? Number(stockRaw)
            : undefined;
        row = {
          ...m,
          id: m.id,
          title: m.title,
          price: m.price,
          image: m.image_url,
          seller_id: m.user_id,
          category: String((m as { category?: string }).category ?? '').trim(),
          location: String((m as { location?: string }).location ?? '').trim(),
          description: String((m as { description?: string }).description ?? '').trim(),
          stock,
          created_at: m.created_at,
          view_count: m.view_count != null ? Number(m.view_count) : 0,
          is_featured_raw: Boolean(m.is_featured),
          is_featured: isMarketplaceEffectivelyFeatured({
            is_featured: m.is_featured,
            featured_until: m.featured_until,
          }),
          featured_until: m.featured_until ?? null,
        };
      }

      if (error && !row) throw error;
      if (!row) return res.status(404).json({ error: 'Product not found' });

      let seller_username = '';
      const sid = row.seller_id as string | undefined;
      if (sid) {
        const { data: prof, error: pErr } = await client
          .from('profiles')
          .select('username')
          .eq('id', sid)
          .single();
        console.log("marketplace profiles error:", pErr);
        if (!pErr && prof?.username) seller_username = prof.username;
      }

      const product = {
        ...row,
        seller_username,
      };

      res.json(product);
    } catch (err) {
      logToFile(`SERVER: Supabase product fetch error: ${err}`);
      console.log("marketplace error:", err);
      const product = db.prepare(`
        SELECT p.*, u.username as seller_username
        FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE p.id = ?
      `).get(req.params.id);

      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(product);
    }
  });

  app.post("/api/marketplace/products", async (req, res) => {
    const { title, price, category, location, image, sellerId, description, stock } = req.body;
    const imageStr = typeof image === "string" ? image.trim() : "";
    const titleStr = typeof title === "string" ? title.trim() : "";
    const descStr = typeof description === "string" ? description.trim() : "";
    if (!imageStr) {
      return res.status(400).json({ error: "Product image is required" });
    }
    if (!titleStr) {
      return res.status(400).json({ error: "Product title is required" });
    }
    if (!descStr) {
      return res.status(400).json({ error: "Product description is required" });
    }
    logToFile(`SERVER: Creating product ${title}, image length: ${image?.length || 0}`);
    const id = uuidv4();
    
    try {
      const stockNum =
        stock != null && String(stock).trim() !== '' && Number.isFinite(Number(stock)) ? Number(stock) : null;
      db.prepare('INSERT INTO products (id, title, price, category, location, image, seller_id, description, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, titleStr, price, category, location, imageStr, sellerId, descStr, stockNum ?? 0);
      
      // Sync to Supabase (prefer service role so RLS never blocks server-side upsert)
      try {
        const syncClient = supabaseAdmin || supabase;
        if (syncClient) {
          const { error: syncError } = await syncClient.from('marketplace').upsert({
            id,
            title: titleStr,
            price,
            image_url: imageStr,
            user_id: sellerId,
            category: category ?? null,
            location: location ?? null,
            description: descStr,
            stock: stock != null && Number.isFinite(Number(stock)) ? Number(stock) : null,
          });
          if (syncError) logToFile(`SERVER: Supabase product sync error: ${syncError.message}`);
        }
      } catch (e) {
        logToFile(`SERVER: Supabase product sync exception: ${e}`);
      }
      
      res.json({ id, title: titleStr, price });
    } catch (err) {
      logToFile(`SERVER: Create product error: ${err}`);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  app.post("/api/marketplace/buy", async (req, res) => {
    const { buyerId, productId } = req.body;
    
    try {
      // Get product from Supabase if possible, otherwise SQLite
      let product;
      try {
        const { data: m } = await supabase.from('marketplace').select('*').eq('id', productId).maybeSingle();
        if (m) {
          const stockRaw = (m as { stock?: unknown }).stock;
          const stockNum =
            stockRaw != null && String(stockRaw).trim() !== '' && Number.isFinite(Number(stockRaw))
              ? Number(stockRaw)
              : 0;
          product = {
            ...m,
            seller_id: m.user_id,
            stock: stockNum,
            image: m.image_url,
          };
        }
      } catch (e) {}
      
      if (!product) {
        product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      }

      if (!product || product.stock <= 0) {
        return res.status(400).json({ error: 'Product out of stock' });
      }

      // Get buyer
      let buyer;
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', buyerId).single();
        buyer = data;
      } catch (e) {}
      
      if (!buyer) {
        buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(buyerId);
      }

      if (!buyer) return res.status(404).json({ error: 'Buyer not found' });

      // Check coins (assuming coins are in profiles or users)
      const buyerCoins = buyer.coins || 0;
      if (buyerCoins < product.price) {
        return res.status(400).json({ error: 'Insufficient coins' });
      }

      // Process payment
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(product.price, buyerId);
      db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(productId);
      
      const commission = product.price * 0.1;
      const payout = product.price * 0.9;
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(payout, product.seller_id);

      const orderId = uuidv4();
      db.prepare(`
        INSERT INTO orders (id, buyer_id, seller_id, product_id, amount, payment_method, platform_commission, seller_payout)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, buyerId, product.seller_id, productId, product.price, 'coins', commission, payout);

      // Sync to Supabase
      try {
        await supabase.rpc('decrement_coins', { user_id: buyerId, amount: product.price });
        await supabase.rpc('increment_coins', { user_id: product.seller_id, amount: payout });
        await supabase.from('orders').insert({
          id: orderId,
          buyer_id: buyerId,
          seller_id: product.seller_id,
          product_id: productId,
          amount: product.price,
          payment_method: 'coins',
          platform_commission: commission,
          seller_payout: payout
        });
      } catch (e) {
        logToFile(`SERVER: Supabase buy sync error: ${e}`);
      }

      try {
        const sellerId = String(product.seller_id || "");
        if (sellerId && sellerId !== String(buyerId)) {
          await ensureLocalUserFromSupabaseProfile(buyerId);
          await ensureLocalUserFromSupabaseProfile(sellerId);
          const buyerName = await fetchUsernameForUserId(buyerId);
          const title = typeof product.title === "string" ? product.title : "an item";
          console.log("MARKETPLACE NOTIF TRIGGERED", productId, buyerId);
          insertNotificationWithRealtime({
            receiverId: sellerId,
            actorId: buyerId,
            type: "marketplace_message",
            message: `${buyerName} purchased "${title.slice(0, 80)}"`,
            storyId: String(productId),
            entityId: orderId,
          });
        }
      } catch (notifErr) {
        console.error("Notification error:", notifErr);
        logToFile(`SERVER: marketplace buy notification error: ${notifErr}`);
      }

      res.json({ success: true, orderId, newStock: product.stock - 1 });
    } catch (err) {
      logToFile(`SERVER: Buy error: ${err}`);
      res.status(500).json({ error: 'Failed to process purchase' });
    }
  });

  // Reels Endpoints
  app.get("/api/reels", async (req, res) => {
    console.log("SERVER: [DEPLOY_DEBUG] GET /api/reels");
    const toReelsPublicUrl = (value: string | null | undefined) => {
      if (!value) return value;
      if (value.startsWith('http://') || value.startsWith('https://')) return value;
      const storagePath = value.startsWith('reels/') ? value.slice('reels/'.length) : value;
      if (!supabase) return value;
      const { data } = supabase.storage.from('posts').getPublicUrl(storagePath);
      return data?.publicUrl || value;
    };

    const reels = db.prepare(`
      SELECT 
        r.*,
        u.username,
        u.avatar,
        COALESCE(l.likes_count, 0) as likes,
        COALESCE(c.comments_count, 0) as comments,
        COALESCE(v.views_count, 0) as views
      FROM reels r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN (
        SELECT reel_id, COUNT(*) as likes_count
        FROM reel_likes
        GROUP BY reel_id
      ) l ON l.reel_id = r.id
      LEFT JOIN (
        SELECT reel_id, COUNT(*) as comments_count
        FROM reel_comments
        GROUP BY reel_id
      ) c ON c.reel_id = r.id
      LEFT JOIN (
        SELECT reel_id, COUNT(*) as views_count
        FROM reel_views
        GROUP BY reel_id
      ) v ON v.reel_id = r.id
      ORDER BY r.created_at DESC
    `).all();
    let profileMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
    if (supabase && reels.length > 0) {
      const userIds = Array.from(new Set(reels.map((r: any) => r.user_id).filter(Boolean)));
      if (userIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);
        profileMap = (data || []).reduce((acc: any, p: any) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    const normalized = reels.map((r: any) => ({
      ...r,
      username: profileMap[r.user_id]?.username || r.username || 'User',
      avatar: profileMap[r.user_id]?.avatar_url || r.avatar || null,
      url: toReelsPublicUrl(r.url),
      thumbnail: toReelsPublicUrl(r.thumbnail)
    }));
    console.log("SERVER: [DEPLOY_DEBUG] GET /api/reels rows:", normalized.length);
    res.json(normalized);
  });

  // Stories API — Supabase only (no SQLite fallback; aligns with what was inserted)
  app.get("/api/stories", async (req, res) => {
    try {
      if (!supabase) {
        console.error("FETCH STORIES ERROR: Supabase client not configured");
        return res.status(500).json({ ok: false });
      }

      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("FETCH STORIES ERROR:", error);
        return res.status(500).json({ ok: false });
      }

      console.log("[API STORIES COUNT]:", data?.length ?? 0);
      return res.json(data ?? []);
    } catch (err) {
      console.error("FETCH STORIES ERROR:", err);
      logToFile(`SERVER: GET /api/stories error: ${err}`);
      return res.status(500).json({ ok: false });
    }
  });

  app.post('/api/test-upload', (req, res) => {
    console.log('TEST ROUTE HIT');
    res.json({ ok: true });
  });

  app.post("/api/story-views", async (req, res) => {
    try {
      const { story_id } = req.body || {};
      if (!story_id || typeof story_id !== "string") {
        return res.status(400).json({ error: "Missing story_id" });
      }

      const authHeader = req.headers.authorization;
      const token =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;

      let viewerId: string | null = null;
      if (supabase && token) {
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user?.id) {
          viewerId = data.user.id;
        }
      }

      if (!viewerId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const id = uuidv4();
      const createdAt = new Date().toISOString();
      const ins = db.prepare(`
        INSERT OR IGNORE INTO story_views (id, story_id, viewer_id, created_at)
        VALUES (?, ?, ?, ?)
      `);
      const result = ins.run(id, story_id, viewerId, createdAt);
      if (result.changes === 0) {
        return res.json({ ok: true, duplicate: true });
      }
      return res.json({ ok: true, id });
    } catch (err) {
      logToFile(`SERVER: POST /api/story-views error: ${err}`);
      return res.status(500).json({ error: "Failed to record view" });
    }
  });

  app.get("/api/stories/:storyId/views", (req, res) => {
    try {
      const { storyId } = req.params;
      if (!storyId) return res.status(400).json({ error: "Missing story id" });

      const rows = db
        .prepare(
          `
        SELECT v.viewer_id AS user_id, u.username, u.avatar AS avatar_url
        FROM story_views v
        LEFT JOIN users u ON u.id = v.viewer_id
        WHERE v.story_id = ?
        ORDER BY v.created_at ASC
      `
        )
        .all(storyId) as { user_id: string; username: string | null; avatar_url: string | null }[];

      res.json(
        rows.map((r) => ({
          user_id: r.user_id,
          username: r.username ?? null,
          avatar_url: r.avatar_url ?? null,
        }))
      );
    } catch (err) {
      logToFile(`SERVER: GET /api/stories/:id/views error: ${err}`);
      res.status(500).json({ error: "Failed to load views" });
    }
  });

  app.post("/api/story-replies", async (req, res) => {
    try {
      let bodyLog = "(unavailable)";
      try {
        bodyLog =
          req.body != null && typeof req.body === "object"
            ? JSON.stringify(req.body)
            : String(req.body);
      } catch {
        bodyLog = "(could not stringify req.body)";
      }
      logToFile(
        `SERVER: POST /api/story-replies content-type=${String(req.headers["content-type"] || "")} body=${bodyLog}`
      );

      if (req.body == null || typeof req.body !== "object") {
        return res.status(400).json({ error: "Request body must be a JSON object" });
      }
      if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "Empty JSON body — send storyId, senderId, receiverId, message" });
      }

      const { storyId, senderId, receiverId: receiverIdBody, message } = req.body as Record<string, unknown>;
      const text = typeof message === "string" ? message.trim() : "";
      if (!storyId || typeof storyId !== "string" || !senderId || typeof senderId !== "string" || !text) {
        return res.status(400).json({ error: "Missing or invalid storyId, senderId, or message" });
      }

      const story = db
        .prepare("SELECT id, user_id, media_url, image_url, media_type FROM stories WHERE id = ?")
        .get(storyId) as
        | {
            id: string;
            user_id: string | null;
            media_url: string | null;
            image_url: string | null;
            media_type: string | null;
          }
        | undefined;
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      console.log("Story:", story);
      const receiverId =
        story.user_id != null && String(story.user_id).trim() !== "" ? String(story.user_id).trim() : "";
      if (!receiverId) {
        return res.status(400).json({ error: "Story has no owner user_id" });
      }
      if (
        receiverIdBody != null &&
        typeof receiverIdBody === "string" &&
        String(receiverIdBody).trim() !== "" &&
        String(receiverIdBody).trim() !== receiverId
      ) {
        return res.status(400).json({ error: "receiverId does not match story owner" });
      }

      const senderProfile = await fetchStoryReplySenderProfile(senderId);
      if (!senderProfile) {
        logToFile(`SERVER: POST /api/story-replies rejected — sender profile not found senderId=${senderId}`);
        console.error("SERVER: POST /api/story-replies — sender profile not found for senderId:", senderId);
        return res.status(400).json({ error: "Invalid sender: profile not found for senderId" });
      }

      const usernameTrim =
        typeof senderProfile.username === "string" ? senderProfile.username.trim() : "";
      if (!usernameTrim) {
        logToFile(`SERVER: POST /api/story-replies rejected — sender profile has empty username senderId=${senderId}`);
        console.error("SERVER: POST /api/story-replies — sender profile has no username senderId:", senderId);
        return res.status(400).json({ error: "Invalid sender: profile has no username" });
      }

      const actorUsername = usernameTrim;
      const actorAvatar = senderProfile.avatar_url ?? null;

      logToFile(
        `SERVER: POST /api/story-replies BEFORE inserts senderId=${senderId} receiverId=${receiverId} storyId=${storyId} actor_username=${actorUsername} actor_avatar=${actorAvatar ? "[set]" : "[empty]"}`
      );

      db.prepare(
        `
        INSERT INTO users (id, username, avatar) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar
      `
      ).run(senderId, actorUsername, actorAvatar ?? null);

      const id = uuidv4();
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO story_replies (id, story_id, from_user_id, from_username, body, receiver_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, storyId, senderId, actorUsername, text, receiverId, createdAt);

      const notifMessage = `${actorUsername} replied to your story`;

      console.log("senderId:", senderId);
      console.log("receiverId:", receiverId);
      console.log("storyId:", storyId);

      try {
        if (senderId !== receiverId) {
          const inserted = insertNotificationWithRealtime({
            receiverId,
            actorId: senderId,
            type: "story_reply",
            message: notifMessage,
            storyId,
            entityId: storyId,
          });
          if (inserted) {
            console.log(
              "POST /api/story-replies notification insert OK notifId:",
              inserted.id,
              "message:",
              notifMessage
            );
            logToFile(
              `SERVER: POST /api/story-replies notification insert OK notifId=${inserted.id} user_id=${receiverId} actor_id=${senderId} story_id=${storyId} message=${notifMessage}`
            );
          }
        }
      } catch (notifErr) {
        console.error("POST /api/story-replies notification insert FAILED:", notifErr);
        logToFile(`SERVER: POST /api/story-replies notification insert FAILED: ${notifErr}`);
        throw notifErr;
      }

      const requestOrigin = getRequestOrigin(req);
      const rawMedia =
        (story.media_url && String(story.media_url).trim()) ||
        (story.image_url && String(story.image_url).trim()) ||
        "";
      const fullMediaUrl = resolveStoryMediaFullUrl(rawMedia, requestOrigin);
      console.log("Story media:", fullMediaUrl);
      const storyMediaTypeNorm = normalizeStoryMediaType(story.media_type, fullMediaUrl);
      logToFile(
        `SERVER: POST /api/story-replies story preview story_id=${storyId} requestOrigin=${requestOrigin} rawMedia=${rawMedia || "(none)"} fullMedia=${fullMediaUrl || "(none)"} media_type=${storyMediaTypeNorm}`
      );

      const inboxResult = await insertStoryReplyIntoMessagesInbox(
        {
          senderId,
          receiverId,
          storyId,
          text,
          storyMedia: fullMediaUrl,
          storyMediaType: storyMediaTypeNorm,
        },
        logToFile
      );
      if (!inboxResult.ok) {
        logToFile(
          `SERVER: POST /api/story-replies messages insert FAILED: ${
            "error" in inboxResult ? inboxResult.error : "Unknown inbox sync failure"
          }`
        );
        return res.status(502).json({
          error: "Story reply saved locally but inbox delivery failed",
          details: "error" in inboxResult ? inboxResult.error : "Unknown inbox sync failure",
          success: false,
          id,
        });
      }

      logToFile(
        `SERVER: Story reply (API) complete id=${id} story=${storyId} sender=${senderId} receiver=${receiverId}`
      );
      return res.json({ success: true, id });
    } catch (err) {
      logToFile(`SERVER: POST /api/story-replies unexpected error: ${err}`);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Failed to save story reply" });
      }
    }
  });

  app.post("/api/stories/:storyId/reply", (req, res) => {
    const { storyId } = req.params;
    const { message, fromUserId, fromUsername } = req.body || {};
    const text = typeof message === 'string' ? message.trim() : '';
    if (!storyId || !text) {
      return res.status(400).json({ error: 'Missing story id or message' });
    }
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO story_replies (id, story_id, from_user_id, from_username, body, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, storyId, fromUserId || null, fromUsername || null, text, createdAt);
      logToFile(
        `SERVER: Story reply id=${id} story=${storyId} from=${fromUserId || 'anon'} (${fromUsername || ''})`
      );
      res.json({ success: true, id });
    } catch (err) {
      logToFile(`SERVER: Story reply error: ${err}`);
      res.status(500).json({ error: 'Failed to save reply' });
    }
  });

  app.post("/api/reels", (req, res) => {
    const { userId, url, thumbnail, caption, soundTitle, soundArtist, username, avatar } = req.body;
    const id = uuidv4();
  console.log("SERVER: [DEPLOY_DEBUG] POST /api/reels", {
    userId: userId ? String(userId).slice(0, 8) + "…" : null,
    hasUrl: !!url,
    supabaseUrlHost: supabaseUrl ? (() => { try { return new URL(supabaseUrl).host; } catch { return "(invalid)"; } })() : "(missing)",
    supabaseAnonKeyPresent: !!supabaseAnonKey,
    supabaseServiceRolePresent: !!supabaseServiceRole,
    payloadPreview: {
      hasThumbnail: !!thumbnail,
      captionLength: typeof caption === "string" ? caption.length : 0,
      hasSoundTitle: !!soundTitle,
      hasSoundArtist: !!soundArtist,
      hasUsername: !!username,
      hasAvatar: !!avatar,
      urlHost: typeof url === "string" ? (() => { try { return new URL(url).host; } catch { return "(invalid-url)"; } })() : null,
    },
  });
    try {
      const toReelsPublicUrl = (value: string | null | undefined) => {
        if (!value) return value;
        if (value.startsWith('http://') || value.startsWith('https://')) return value;
        const storagePath = value.startsWith('reels/') ? value.slice('reels/'.length) : value;
        if (!supabase) return value;
        const { data } = supabase.storage.from('posts').getPublicUrl(storagePath);
        return data?.publicUrl || value;
      };

      const finalUrl = toReelsPublicUrl(url);
      const finalThumbnail = toReelsPublicUrl(thumbnail || url);

      // Keep FK-safe: ensure uploader exists in local users cache.
      db.prepare('INSERT OR IGNORE INTO users (id, username, avatar) VALUES (?, ?, ?)')
        .run(userId, username || userId, avatar || null);

      db.prepare(`
        INSERT INTO reels (id, user_id, url, thumbnail, caption, sound_title, sound_artist)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, finalUrl, finalThumbnail, caption || '', soundTitle || null, soundArtist || null);
      
      console.log("SERVER: [DEPLOY_DEBUG] POST /api/reels saved id:", id);
      res.json({ success: true, id });
    } catch (err) {
      console.error('SERVER: [DEPLOY_DEBUG] Reel upload error:', err);
      res.status(500).json({ error: 'Failed to save reel' });
    }
  });

  app.post("/api/reels/:id/like", async (req, res) => {
    const reelId = req.params.id;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
      db.prepare('INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)').run(userId, userId);
      const existing = db.prepare('SELECT 1 FROM reel_likes WHERE reel_id = ? AND user_id = ?').get(reelId, userId);
      const reelOwner = db.prepare('SELECT user_id FROM reels WHERE id = ?').get(reelId) as { user_id: string } | undefined;

      if (existing) {
        db.prepare('DELETE FROM reel_likes WHERE reel_id = ? AND user_id = ?').run(reelId, userId);
      } else {
        db.prepare('INSERT INTO reel_likes (reel_id, user_id) VALUES (?, ?)').run(reelId, userId);
        if (reelOwner?.user_id && reelOwner.user_id !== userId) {
          await ensureLocalUserFromSupabaseProfile(userId);
          await ensureLocalUserFromSupabaseProfile(reelOwner.user_id);
          const name = await fetchUsernameForUserId(userId);
          insertNotificationWithRealtime({
            receiverId: reelOwner.user_id,
            actorId: userId,
            type: 'like',
            message: `${name} liked your reel`,
            storyId: reelId,
            entityId: reelId,
          });
        }
      }

      const row = db.prepare('SELECT COUNT(*) as count FROM reel_likes WHERE reel_id = ?').get(reelId) as any;
      res.json({ success: true, liked: !existing, likes: row?.count || 0 });
    } catch (err) {
      console.error('Reel like error:', err);
      res.status(500).json({ error: 'Failed to toggle like' });
    }
  });

  app.post("/api/reels/:id/view", (req, res) => {
    const reelId = req.params.id;
    const { userId } = req.body;

    try {
      const reelExists = !!db.prepare('SELECT 1 FROM reels WHERE id = ?').get(reelId);
      if (!reelExists) {
        return res.status(404).json({ error: 'Reel not found' });
      }

      if (userId) {
        const userExists = !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId);
        if (!userExists) {
          return res.status(404).json({ error: 'User not found' });
        }
        db.prepare('INSERT OR IGNORE INTO reel_views (reel_id, user_id) VALUES (?, ?)').run(reelId, userId);
      }
      const row = db.prepare('SELECT COUNT(*) as count FROM reel_views WHERE reel_id = ?').get(reelId) as any;
      res.json({ success: true, views: row?.count || 0 });
    } catch (err) {
      console.error('Reel view error:', err);
      res.status(500).json({ error: 'Failed to record view' });
    }
  });

  app.get("/api/reels/:id/comments", async (req, res) => {
    const reelId = req.params.id;
    try {
      const reelExists = !!db.prepare('SELECT 1 FROM reels WHERE id = ?').get(reelId);
      if (!reelExists) {
        return res.status(404).json({ error: 'Reel not found' });
      }

      const comments = db.prepare(`
        SELECT rc.id, rc.reel_id, rc.user_id, rc.text, rc.created_at, u.username, u.avatar
        FROM reel_comments rc
        LEFT JOIN users u ON u.id = rc.user_id
        WHERE rc.reel_id = ?
        ORDER BY rc.created_at DESC
      `).all(reelId);
      let profileMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
      if (supabase && comments.length > 0) {
        const userIds = Array.from(new Set(comments.map((c: any) => c.user_id).filter(Boolean)));
        if (userIds.length > 0) {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', userIds);
          profileMap = (data || []).reduce((acc: any, p: any) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }
      }
      res.json(comments.map((c: any) => ({
        ...c,
        username: profileMap[c.user_id]?.username || c.username || 'User',
        avatar: profileMap[c.user_id]?.avatar_url || c.avatar || null
      })));
    } catch (err) {
      console.error('Reel comments fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  });

  app.post("/api/reels/:id/comments", async (req, res) => {
    const reelId = req.params.id;
    const userId = req.body.userId || req.body.user_id;
    const content = req.body.content || req.body.text;
    const { username, avatar } = req.body;
    const bodyReelId = req.body.reel_id;
    if (!userId || !content?.trim()) return res.status(400).json({ error: 'Missing user_id or content' });
    if (bodyReelId && bodyReelId !== reelId) return res.status(400).json({ error: 'reel_id mismatch' });

    const id = uuidv4();
    try {
      const reelExists = !!db.prepare('SELECT 1 FROM reels WHERE id = ?').get(reelId);
      if (!reelExists) {
        return res.status(404).json({ error: 'Reel not found' });
      }

      const userExists = !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId);
      if (!userExists) {
        let profileUsername: string | null = null;
        let profileAvatar: string | null = null;
        if (supabase) {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', userId)
            .maybeSingle();
          profileUsername = data?.username || null;
          profileAvatar = data?.avatar_url || null;
        }
        db.prepare('INSERT OR IGNORE INTO users (id, username, avatar) VALUES (?, ?, ?)')
          .run(userId, profileUsername || username || 'User', profileAvatar || avatar || null);
      }

      db.prepare('UPDATE users SET username = COALESCE(?, username), avatar = COALESCE(?, avatar) WHERE id = ?')
        .run(username || null, avatar || null, userId);

      db.prepare('INSERT INTO reel_comments (id, reel_id, user_id, text) VALUES (?, ?, ?, ?)')
        .run(id, reelId, userId, content.trim());

      const reelOwnerRow = db.prepare('SELECT user_id FROM reels WHERE id = ?').get(reelId) as { user_id: string } | undefined;
      if (reelOwnerRow?.user_id && reelOwnerRow.user_id !== userId) {
        await ensureLocalUserFromSupabaseProfile(userId);
        await ensureLocalUserFromSupabaseProfile(reelOwnerRow.user_id);
        const name = await fetchUsernameForUserId(userId);
        insertNotificationWithRealtime({
          receiverId: reelOwnerRow.user_id,
          actorId: userId,
          type: 'comment',
          message: `${name} commented on your reel`,
          storyId: reelId,
          entityId: reelId,
        });
      }

      const created = db.prepare(`
        SELECT rc.id, rc.reel_id, rc.user_id, rc.text, rc.created_at, u.username, u.avatar
        FROM reel_comments rc
        LEFT JOIN users u ON u.id = rc.user_id
        WHERE rc.id = ?
      `).get(id);

      let createdWithProfile = created as any;
      if (supabase && created?.user_id) {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', created.user_id)
          .maybeSingle();
        if (data) {
          createdWithProfile = {
            ...created,
            username: data.username || created.username || 'User',
            avatar: data.avatar_url || created.avatar || null
          };
        }
      }

      const updatedCommentsRaw = db.prepare(`
        SELECT rc.id, rc.reel_id, rc.user_id, rc.text, rc.created_at, u.username, u.avatar
        FROM reel_comments rc
        LEFT JOIN users u ON u.id = rc.user_id
        WHERE rc.reel_id = ?
        ORDER BY rc.created_at DESC
      `).all(reelId);

      let profileMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
      if (supabase && updatedCommentsRaw.length > 0) {
        const userIds = Array.from(new Set(updatedCommentsRaw.map((c: any) => c.user_id).filter(Boolean)));
        if (userIds.length > 0) {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', userIds);
          profileMap = (data || []).reduce((acc: any, p: any) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }
      }

      const updatedComments = updatedCommentsRaw.map((c: any) => ({
        ...c,
        username: profileMap[c.user_id]?.username || c.username || 'User',
        avatar: profileMap[c.user_id]?.avatar_url || c.avatar || null
      }));

      res.json({
        success: true,
        comment: createdWithProfile,
        comments: updatedComments.length,
        commentsList: updatedComments
      });
    } catch (err) {
      console.error('Reel comment create error:', err);
      res.status(500).json({ error: 'Failed to save comment' });
    }
  });

  // Game Sessions State
  const activeGames = new Map<string, any>();
  const socketToRoom = new Map<string, string>();
  /** userId -> socket.id for presence (user_online / user_offline). */
  const onlineUsers = new Map<string, string>();
  const hostSockets = new Set<string>();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join_live", (streamId) => {
      socket.join(streamId);
      socketToRoom.set(socket.id, streamId);
      db.prepare('UPDATE streams SET viewer_count = viewer_count + 1 WHERE id = ?').run(streamId);
      console.log(`Socket ${socket.id} joined live stream ${streamId}`);
    });

    socket.on("join_group", (groupId) => {
      socket.join(`group_${groupId}`);
      console.log(`Socket ${socket.id} joined group ${groupId}`);
      
      // Sync messages from Supabase to SQLite before sending history
      syncGroupMessages(groupId).then(() => {
        const history = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC LIMIT 100').all(groupId);
        socket.emit("group_history", history);
      }).catch(err => {
        console.error('Error syncing group messages on join:', err);
        // Still send what we have in local DB
        const history = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC LIMIT 100').all(groupId);
        socket.emit("group_history", history);
      });
    });

    socket.on("typing", ({ groupId, userId, username }: { groupId?: string; userId?: string; username?: string }) => {
      if (!groupId || !userId) return;
      socket.to(`group_${groupId}`).emit("user_typing", {
        userId,
        username: username || "Someone",
      });
    });

    socket.on("stop_typing", ({ groupId, userId }: { groupId?: string; userId?: string }) => {
      if (!groupId || !userId) return;
      socket.to(`group_${groupId}`).emit("user_stop_typing", {
        userId,
      });
    });

    socket.on(
      "message_seen",
      ({ messageId, userId, groupId }: { messageId?: string; userId?: string; groupId?: string }) => {
        if (!messageId || !groupId) return;
        socket.to(`group_${groupId}`).emit("message_seen_update", {
          messageId,
          userId,
        });
      }
    );

    socket.on("send_group_message", async (data) => {
      const groupId = data?.groupId ?? data?.group_id;
      const userId = data?.userId ?? data?.user_id;
      const username = data?.username;
      const text = data?.text;
      const type = data?.type;
      const audioUrl = data?.audioUrl ?? data?.audio_url;
      const imageUrl = data?.imageUrl ?? data?.image_url;

      if (!groupId || !userId) {
        console.warn('send_group_message missing groupId/userId:', data);
        return;
      }
      
      // Check membership
      const membership = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
      if (!membership) {
        console.warn(`User ${userId} attempted to send message to group ${groupId} without being a member.`);
        return;
      }

      const messageId = uuidv4();
      /** Prefer Supabase `messages.id` from the client when present (group chat uses `messages`, not only SQLite history). */
      const clientMessageId =
        data?.id != null && String(data.id).trim() !== "" ? String(data.id) : messageId;
      const timestamp = new Date().toISOString();

      // Save to local DB
      try {
        db.prepare('INSERT INTO group_messages (id, group_id, user_id, username, text, timestamp, type, audio_url, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(messageId, groupId, userId, username, text, timestamp, type || 'text', audioUrl || null, imageUrl || null);
        
        // Sync to Supabase
        supabase.from('group_messages').upsert({
          id: messageId,
          group_id: groupId,
          user_id: userId,
          username,
          text,
          timestamp,
          type: type || 'text',
          audio_url: audioUrl || null,
          image_url: imageUrl || null
        }).then(({ error }) => {
          if (error) {
            if (error.code === '42P01') {
              console.warn('Supabase table "group_messages" does not exist. Skipping sync.');
            } else {
              console.error('Supabase group_messages sync error:', error.code, error.message);
            }
          }
        });

        // Broadcast to group
        io.to(`group_${groupId}`).emit("group_message", {
          id: messageId,
          group_id: groupId,
          user_id: userId,
          username,
          text,
          timestamp,
          type: type || 'text',
          audio_url: audioUrl || null,
          image_url: imageUrl || null
        });

        // Group message notifications (Supabase + socket ping for clients in the room)
        socket.to(`group_${groupId}`).emit("new_notification", {
          groupId,
          messageId: clientMessageId,
          senderId: userId,
        });

        if (supabaseAdmin) {
          const members = db
            .prepare(
              "SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?"
            )
            .all(groupId, userId) as { user_id: string }[];
          if (members.length > 0) {
            const rows = members.map((m) => ({
              user_id: m.user_id,
              type: "group_message",
              message_id: clientMessageId,
              group_id: groupId,
              is_read: false,
            }));
            void supabaseAdmin.from("notifications").insert(rows).then(({ error }: { error: { code?: string; message?: string } | null }) => {
              if (error) {
                if (error.code === "42P01") {
                  console.warn('Supabase table "notifications" does not exist. Skipping group notification inserts.');
                } else {
                  console.warn("Supabase group notifications insert:", error.message);
                }
              }
            });
          }
        }
      } catch (err) {
        console.error('Error saving group message:', err);
      }
    });

    socket.on("start_stream", (data) => {
      const { streamId, streamerId, title, category } = data;
      socketToRoom.set(socket.id, streamId);
      hostSockets.add(socket.id);
      db.prepare("INSERT OR REPLACE INTO streams (id, streamer_id, title, category, status, started_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
        .run(streamId, streamerId, title || 'Live Stream', category || 'General', 'live');
      console.log(`Stream ${streamId} started by ${streamerId} in category ${category}`);
    });

    socket.on("end_stream", (data) => {
      const { streamId } = data;
      db.prepare("UPDATE streams SET status = ?, ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
        .run('ended', streamId);
      
      const summary = db.prepare('SELECT * FROM streams WHERE id = ?').get(streamId);
      io.to(streamId).emit("stream_ended", { streamId, summary });
      hostSockets.delete(socket.id);
      console.log(`Stream ${streamId} ended`);
    });

    socket.on("live_selling:purchase", (data) => {
      const { streamId, productId, buyerName, productTitle } = data;
      // Broadcast to everyone in the stream
      io.to(streamId).emit("live_selling:alert", { buyerName, productTitle });
      io.to(streamId).emit("live_selling:stock_update", { productId });
    });

    socket.on("send_comment", (data) => {
      const { streamId, user, text } = data;
      io.to(streamId).emit("call:new_message", { username: user, text });
    });

    socket.on("send_gift", (data) => {
      const { streamId, user, giftName, icon, animation } = data;
      io.to(streamId).emit("call:new_gift", { id: Date.now(), username: user, giftName, icon, animation });
    });

    socket.on("send_reaction", (data) => {
      const { streamId } = data;
      io.to(streamId).emit("call:new_reaction", { streamId });
    });

    // 1) Coin Rain War
    socket.on("start_coin_rain", (data) => {
      const { streamerId, streamId } = data;
      const cost = 50;

      const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(streamerId);
      if (user && user.coins >= cost) {
        db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cost, streamerId);
        db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
          .run(uuidv4(), streamerId, -cost, 'game_start', 'Started Coin Rain War');

        const gameId = uuidv4();
        const game = {
          id: gameId,
          type: 'coin_rain',
          streamerId,
          scores: new Map(),
          endTime: Date.now() + 30000
        };
        activeGames.set(gameId, game);

        io.to(streamId).emit("game_started", { 
          gameType: 'coin_rain', 
          gameId, 
          duration: 30,
          streamerName: 'Streamer' 
        });

        setTimeout(() => {
          // End game and find winner
          const scores = Array.from(game.scores.entries()).sort((a, b) => b[1] - a[1]);
          const winner = scores[0];
          if (winner) {
            const [winnerId, score] = winner;
            const reward = 100;
            db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(reward, winnerId);
            db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
              .run(uuidv4(), winnerId, reward, 'game_win', 'Won Coin Rain War');

            const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerId);
            io.to(streamId).emit("game_ended", { 
              gameType: 'coin_rain', 
              winner: winnerUser?.username || 'Unknown', 
              reward 
            });
          }
          activeGames.delete(gameId);
        }, 30000);
      } else {
        socket.emit("error", "Insufficient coins to start game");
      }
    });

    socket.on("catch_coin", (data) => {
      const { gameId, userId, streamId } = data;
      const game = activeGames.get(gameId);
      if (game && Date.now() < game.endTime) {
        const currentScore = game.scores.get(userId) || 0;
        game.scores.set(userId, currentScore + 1);
        
        // Broadcast real-time leaderboard
        const leaderboard = Array.from(game.scores.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([uid, score]) => {
            const u = db.prepare('SELECT username FROM users WHERE id = ?').get(uid);
            return { username: u?.username || 'Anonymous', score };
          });
        
        io.to(streamId).emit("leaderboard_update", { gameId, leaderboard });
      }
    });

    // 2) Secret Gift Bomb
    socket.on("start_gift_bomb", (data) => {
      const { streamerId, streamId } = data;
      const gameId = uuidv4();
      const game = {
        id: gameId,
        type: 'gift_bomb',
        streamerId,
        contributions: new Map(),
        target: 500, // Total coins needed to unlock
        current: 0
      };
      activeGames.set(gameId, game);
      io.to(streamId).emit("game_started", { gameType: 'gift_bomb', gameId, target: 500 });
    });

    socket.on("contribute_gift_bomb", (data) => {
      const { gameId, userId, amount, streamId } = data;
      const game = activeGames.get(gameId);
      if (game) {
        const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
        if (user && user.coins >= amount) {
          db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(amount, userId);
          db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
            .run(uuidv4(), userId, -amount, 'gift', 'Contributed to Gift Bomb');

          game.current += amount;
          const userContrib = game.contributions.get(userId) || 0;
          game.contributions.set(userId, userContrib + amount);

          io.to(streamId).emit("gift_bomb_update", { gameId, current: game.current, target: game.target });

          if (game.current >= game.target) {
            const topContributor = Array.from(game.contributions.entries()).sort((a, b) => (b[1] as number) - (a[1] as number))[0] as any;
            if (topContributor) {
              const [winnerId] = topContributor;
              const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerId);
              
              // Prize logic
              const reward = 200;
              db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(reward, winnerId);
              
              io.to(streamId).emit("game_ended", { 
                gameType: 'gift_bomb', 
                winner: winnerUser?.username || 'Unknown', 
                prize: '200 Coins & VIP Badge' 
              });
              activeGames.delete(gameId);
            }
          }
        }
      }
    });

    // 3) Power Duel
    socket.on("start_power_duel", (data) => {
      const { streamerId, streamId, opponentId } = data;
      const gameId = uuidv4();
      const game = {
        id: gameId,
        type: 'power_duel',
        streamerId,
        opponentId,
        streamerScore: 0,
        opponentScore: 0,
        endTime: Date.now() + 15000
      };
      activeGames.set(gameId, game);
      io.to(streamId).emit("game_started", { gameType: 'power_duel', gameId, streamerId, opponentId });

      setTimeout(() => {
        const winnerId = game.streamerScore > game.opponentScore ? game.streamerId : game.opponentId;
        const loserId = winnerId === game.streamerId ? game.opponentId : game.streamerId;
        
        const cost = 30;
        db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cost, loserId);
        db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(cost, winnerId);
        
        const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerId);
        io.to(streamId).emit("game_ended", { gameType: 'power_duel', winner: winnerUser?.username || 'Unknown' });
        activeGames.delete(gameId);
      }, 15000);
    });

    socket.on("duel_tap", (data) => {
      const { gameId, userId, streamId } = data;
      const game = activeGames.get(gameId);
      if (game && Date.now() < game.endTime) {
        if (userId === game.streamerId) game.streamerScore++;
        else if (userId === game.opponentId) game.opponentScore++;
        io.to(streamId).emit("duel_update", { 
          gameId, 
          streamerScore: game.streamerScore, 
          opponentScore: game.opponentScore 
        });
      }
    });

    // 4) Live Kingdom
    const kingdoms = new Map(); // streamId -> { kingdomA: 0, kingdomB: 0 }
    socket.on("start_live_kingdom", (data) => {
      const { streamId } = data;
      kingdoms.set(streamId, { kingdomA: 0, kingdomB: 0 });
      io.to(streamId).emit("game_started", { gameType: 'live_kingdom', gameId: uuidv4() });
    });

    socket.on("kingdom_support", (data) => {
      const { streamId, kingdom, amount, userId } = data;
      const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
      if (user && user.coins >= amount) {
        db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(amount, userId);
        
        const streamKingdoms = kingdoms.get(streamId) || { kingdomA: 0, kingdomB: 0 };
        streamKingdoms[kingdom] += amount;
        kingdoms.set(streamId, streamKingdoms);

        let dominant = '';
        if (streamKingdoms.kingdomA > streamKingdoms.kingdomB) dominant = 'kingdomA';
        else if (streamKingdoms.kingdomB > streamKingdoms.kingdomA) dominant = 'kingdomB';
        
        io.to(streamId).emit("kingdom_update", { 
          kingdomA: streamKingdoms.kingdomA, 
          kingdomB: streamKingdoms.kingdomB,
          dominant
        });
      }
    });

    // Group Chat Events (Consolidated above)


    socket.on("join_direct_chat", (data) => {
      const { userId, targetId } = data;
      const roomId = [userId, targetId].sort().join('_');
      socket.join(`direct_${roomId}`);
      
      // Send message history
      const history = db.prepare('SELECT * FROM direct_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY timestamp ASC LIMIT 50')
        .all(userId, targetId, targetId, userId);
      socket.emit("direct_history", history);
    });

    socket.on("send_direct_message", (data) => {
      const { senderId, receiverId, text, type, audioUrl, imageUrl } = data;
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      const roomId = [senderId, receiverId].sort().join('_');

      // Save to DB
      db.prepare('INSERT INTO direct_messages (id, sender_id, receiver_id, text, timestamp, type, audio_url, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(messageId, senderId, receiverId, text, timestamp, type || 'text', audioUrl || null, imageUrl || null);

      // Broadcast to room
      io.to(`direct_${roomId}`).emit("direct_message", {
        id: messageId,
        sender_id: senderId,
        receiver_id: receiverId,
        text,
        timestamp,
        type: type || 'text',
        audio_url: audioUrl || null,
        image_url: imageUrl || null
      });
    });

    // Call Signaling
    socket.on('call:join', (data) => {
      const { callId, userId, username } = data;
      socket.join(`call:${callId}`);
      socket.to(`call:${callId}`).emit('call:user_joined', { userId, username, socketId: socket.id });
    });

    socket.on('call:started', (data) => {
      const { groupId, callId, hostId, type } = data;
      io.to(`group_${groupId}`).emit('call:started', { callId, hostId, type });
    });

    socket.on('call:ended', (data) => {
      const { groupId, callId } = data;
      io.to(`group_${groupId}`).emit('call:ended', { callId });
    });

    socket.on('call:signal', (data) => {
      const { to, signal, from } = data;
      io.to(to).emit('call:signal', { signal, from });
    });

    socket.on('call:leave', (data) => {
      const { callId, userId } = data;
      socket.leave(`call:${callId}`);
      
      // Remove from speakers
      db.prepare('DELETE FROM call_speakers WHERE call_id = ? AND user_id = ?').run(callId, userId);
      
      const call = db.prepare('SELECT host_id FROM calls WHERE id = ?').get(callId);
      if (call && call.host_id === userId) {
        // End call if host leaves
        db.prepare("UPDATE calls SET status = 'ended' WHERE id = ?").run(callId);
        io.to(`call:${callId}`).emit('call:ended', { callId });
      } else {
        socket.to(`call:${callId}`).emit('call:user_left', { userId });
      }
    });

    socket.on('call:go_live', (data) => {
      const { callId, streamId } = data;
      io.to(`call:${callId}`).emit('call:is_live', { streamId });
    });

    socket.on('register_user', (payload: string | { userId?: string } | undefined) => {
      const userId =
        typeof payload === 'string' ? payload : payload && typeof payload === 'object' ? payload.userId : undefined;
      if (!userId) return;
      socket.join(`user_${userId}`);
      onlineUsers.set(userId, socket.id);
      io.emit('user_online', { userId });
      console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    socket.on('call:initiate', (data) => {
      const { targetId, callerId, callerName, callerAvatar, type, callId } = data;
      io.to(`user_${targetId}`).emit('call:incoming', {
        callerId,
        callerName,
        callerAvatar,
        type,
        callId
      });
    });

    socket.on('call:respond', (data) => {
      const { callerId, response, callId } = data;
      io.to(`user_${callerId}`).emit('call:response', {
        response,
        callId
      });
    });

    socket.on('call:end', (data) => {
      const { targetId, callId } = data;
      io.to(`user_${targetId}`).emit('call:ended', { callId });
    });

    socket.on('call:request_join', (data) => {
      const { callId, requestId, userId, username, amount } = data;
      const call = db.prepare('SELECT host_id FROM calls WHERE id = ?').get(callId);
      // Send to host only (or broadcast to call room if host is there)
      io.to(`call:${callId}`).emit('call:new_request', { requestId, userId, username, amount });
    });

    socket.on('call:respond_join', (data) => {
      const { callId, requestId, userId, status } = data;
      
      if (status === 'accepted') {
        db.prepare('INSERT OR IGNORE INTO call_speakers (call_id, user_id) VALUES (?, ?)').run(callId, userId);
      }
      
      db.prepare('UPDATE join_requests SET status = ? WHERE id = ?').run(status, requestId);
      io.to(`call:${callId}`).emit('call:request_resolved', { requestId, userId, status });
    });

    // 5) Mystery Spin Storm
    socket.on("start_spin_storm", (data) => {
      const { streamId } = data;
      const gameId = uuidv4();
      io.to(streamId).emit("game_started", { gameType: 'spin_storm', gameId, duration: 10 });
      
      setTimeout(() => {
        // In a real app, we'd track participants. For now, pick a random viewer or just end.
        io.to(streamId).emit("game_ended", { 
          gameType: 'spin_storm', 
          winner: 'Everyone!',
          prize: 'Mystery Box' 
        });
      }, 10000);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          io.emit("user_offline", { userId });
          break;
        }
      }
      const streamId = socketToRoom.get(socket.id);
      if (streamId) {
        if (hostSockets.has(socket.id)) {
          // End stream if host disconnects
          db.prepare("UPDATE streams SET status = ?, ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
            .run('ended', streamId);
          const summary = db.prepare('SELECT * FROM streams WHERE id = ?').get(streamId);
          io.to(streamId).emit("stream_ended", { streamId, summary });
          hostSockets.delete(socket.id);
        } else {
          // Decrement viewer count if viewer disconnects
          db.prepare('UPDATE streams SET viewer_count = MAX(0, viewer_count - 1) WHERE id = ?').run(streamId);
        }
        socketToRoom.delete(socket.id);
      }
    });
  });

// Delete group post
app.delete('/api/groups/:groupId/posts/:postId', (req, res) => {
  const { groupId, postId } = req.params;
  try {
    db.prepare('DELETE FROM group_posts WHERE id = ? AND group_id = ?').run(postId, groupId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting group post:', err);
    res.status(500).json({ error: 'Failed to delete group post' });
  }
});

// Update group post
app.put('/api/groups/:groupId/posts/:postId', (req, res) => {
  const { groupId, postId } = req.params;
  const { content, imageUrl } = req.body;
  try {
    db.prepare('UPDATE group_posts SET content = ?, image_url = ? WHERE id = ? AND group_id = ?')
      .run(content, imageUrl, postId, groupId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating group post:', err);
    res.status(500).json({ error: 'Failed to update group post' });
  }
});

// Group post actions: like/comment/share counters
app.post('/api/groups/:groupId/posts/:postId/like', (req, res) => {
  const { groupId, postId } = req.params;
  const rawDelta = Number((req.body as any)?.delta);
  const delta = rawDelta === -1 ? -1 : 1;
  try {
    db.prepare(`
      UPDATE group_posts
      SET likes = MAX(0, COALESCE(likes, 0) + ?)
      WHERE id = ? AND group_id = ?
    `).run(delta, postId, groupId);
    const row = db.prepare(`
      SELECT id, likes, comments, COALESCE(shares, 0) AS shares
      FROM group_posts
      WHERE id = ? AND group_id = ?
    `).get(postId, groupId);
    res.json({ ok: true, post: row });
  } catch (err) {
    console.error('Error updating group post likes:', err);
    res.status(500).json({ ok: false, error: 'Failed to update likes' });
  }
});

app.post('/api/groups/:groupId/posts/:postId/comment', async (req, res) => {
  const { postId } = req.params;
  const text = typeof (req.body as any)?.text === 'string' ? (req.body as any).text.trim() : '';
  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);
  };
  try {
    if (!postId) {
      return res.status(400).json({ ok: false, error: 'post_id is required' });
    }
    if (!text) {
      return res.status(400).json({ ok: false, error: 'Comment text is required' });
    }
    if (!supabase) {
      console.error('[GROUP COMMENT] Supabase client not configured');
      return res.status(500).json({ ok: false, error: 'Supabase is not configured' });
    }

    const authUserId = await getAuthUserIdFromJwtHeader(req);
    console.log('[GROUP COMMENT] USER:', authUserId);
    console.log('[GROUP COMMENT] PAYLOAD:', { post_id: postId, content: text });
    if (!authUserId) {
      return res.status(401).json({ ok: false, error: 'User not authenticated' });
    }

    // Group posts are stored in posts; comments must reference posts.id.
    const { data: existingPost, error: postCheckError } = await withTimeout(
      supabase
        .from('posts')
        .select('id')
        .eq('id', postId)
        .maybeSingle(),
      12000,
      'post check'
    );
    if (postCheckError) {
      console.error('[GROUP COMMENT] POST CHECK ERROR:', postCheckError);
      return res.status(500).json({ ok: false, error: 'Failed to validate post' });
    }
    if (!existingPost) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const { data: insertedComment, error: insertError } = await withTimeout(
      supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: authUserId,
          content: text,
        })
        .select('id, post_id, user_id, content, created_at')
        .single(),
      12000,
      'comment insert'
    );

    console.log('[GROUP COMMENT] INSERT RESULT:', { data: insertedComment, error: insertError });
    if (insertError) {
      return res.status(500).json({ ok: false, error: insertError.message || 'Failed to insert comment' });
    }

    const { count, error: countError } = await withTimeout(
      supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId),
      12000,
      'comment count'
    );
    if (countError) {
      console.error('[GROUP COMMENT] COUNT ERROR:', countError);
      return res.status(500).json({ ok: false, error: 'Failed to count comments' });
    }

    return res.json({
      ok: true,
      post: {
        id: postId,
        comments: Number(count || 0),
      },
      comment: insertedComment,
    });
  } catch (err) {
    console.error('Error creating group post comment:', err);
    const message = err instanceof Error ? err.message : 'Failed to update comments';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.post('/api/groups/:groupId/posts/:postId/share', (req, res) => {
  const { groupId, postId } = req.params;
  try {
    db.prepare(`
      UPDATE group_posts
      SET shares = COALESCE(shares, 0) + 1
      WHERE id = ? AND group_id = ?
    `).run(postId, groupId);
    const row = db.prepare(`
      SELECT id, likes, comments, COALESCE(shares, 0) AS shares
      FROM group_posts
      WHERE id = ? AND group_id = ?
    `).get(postId, groupId);
    res.json({ ok: true, post: row });
  } catch (err) {
    console.error('Error updating group post shares:', err);
    res.status(500).json({ ok: false, error: 'Failed to update shares' });
  }
});

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("SERVER: Fatal error during startup:", err);
  process.exit(1);
});
