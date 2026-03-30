import type { SupabaseClient } from '@supabase/supabase-js';

export type CommentForDisplay = {
  id: string;
  userId: string;
  user: string;
  text: string;
  avatar: string;
  time: string;
};

/** Display name for feed/profile UIs (matches existing Home/Reels behavior). */
export function resolveProfileUsername(username?: string | null) {
  const value = (username || '').trim();
  if (!value) return 'User';
  return value;
}

function formatCommentTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

type ProfileRow = { id?: string; username?: string | null; avatar_url?: string | null };

function mapRowToDisplay(
  row: {
    id: unknown;
    user_id: unknown;
    content: unknown;
    created_at?: unknown;
  },
  profile: ProfileRow | null | undefined
): CommentForDisplay {
  const uid = String(row.user_id ?? '');
  return {
    id: String(row.id),
    userId: uid,
    user: resolveProfileUsername(profile?.username),
    text: String(row.content ?? ''),
    avatar: (profile?.avatar_url && String(profile.avatar_url).trim()) || '',
    time: row.created_at ? formatCommentTime(String(row.created_at)) : '',
  };
}

/**
 * Loads comments for a post with the correct profile (username + avatar) per author.
 * Uses an embedded `profiles` select when PostgREST exposes the FK; otherwise falls back
 * to a second query with string-normalized user ids so keys always match.
 */
export async function fetchCommentsWithProfiles(
  supabase: SupabaseClient,
  postId: string
): Promise<CommentForDisplay[]> {
  const pid = String(postId).trim();
  if (!pid) return [];

  const embedded = await supabase
    .from('comments')
    .select(
      `
      id,
      post_id,
      user_id,
      content,
      created_at,
      profiles (
        id,
        username,
        avatar_url
      )
    `
    )
    .eq('post_id', pid)
    .order('created_at', { ascending: true });

  if (!embedded.error && Array.isArray(embedded.data)) {
    return embedded.data.map((row: any) => {
      const profRaw = row?.profiles;
      const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
      return mapRowToDisplay(row, prof ?? null);
    });
  }

  if (embedded.error) {
    console.warn('[fetchCommentsWithProfiles] embedded profiles join unavailable, using fallback:', embedded.error.message);
  }

  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, user_id, content, created_at')
    .eq('post_id', pid)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const userIds = Array.from(
    new Set((data || []).map((c: { user_id?: unknown }) => String(c.user_id ?? '')).filter(Boolean))
  );

  let profilesMap: Record<string, ProfileRow> = {};
  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);

    if (profilesError) {
      console.error('[fetchCommentsWithProfiles] profiles:', profilesError);
    } else {
      profilesMap = Object.fromEntries(
        (profilesData || []).map((p: ProfileRow & { id: string }) => [String(p.id), p])
      );
    }
  }

  return (data || []).map((c: any) => {
    const uid = String(c.user_id ?? '');
    const p = uid ? profilesMap[uid] : undefined;
    return mapRowToDisplay(c, p);
  });
}
