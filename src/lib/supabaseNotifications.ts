import { supabase } from './supabase';

/**
 * Insert a notification for another user while authenticated as the actor.
 * Requires RLS policy "Users can insert notifications as actor" (auth.uid() = actor_id).
 */
export async function insertNotificationAsActor(opts: {
  recipientUserId: string;
  type: string;
  message: string;
  storyId?: string | null;
  entityId?: string | null;
}) {
  const recipient = String(opts.recipientUserId || '').trim();
  if (!recipient) return { data: null as { id: string } | null, error: null, skipped: true as const };

  let {
    data: { user },
  } = await supabase.auth.getUser();
  console.log('NOTIFICATION AUTH USER (getUser):', user);

  if (!user) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
    console.log('NOTIFICATION AUTH USER (getSession fallback):', user);
  }

  if (!user) {
    return { data: null, error: new Error('Not authenticated'), skipped: false as const };
  }
  if (recipient === user.id) {
    return { data: null, error: null, skipped: true as const };
  }

  const payload = {
    user_id: recipient,
    actor_id: user.id,
    type: opts.type,
    message: String(opts.message || '').slice(0, 500),
    is_read: false,
    story_id: opts.storyId ?? null,
    entity_id: opts.entityId ?? opts.storyId ?? null,
  };

  console.log('NOTIFICATION INSERT PAYLOAD:', payload);

  const { data, error } = await supabase.from('notifications').insert(payload).select('id').single();
  console.log('NOTIFICATION INSERT RESULT:', data, error);
  return { data, error, skipped: false as const };
}

/** Best-effort: never throws. */
export function notifyLikeCommentFollowDm(
  opts: Parameters<typeof insertNotificationAsActor>[0]
): void {
  void insertNotificationAsActor(opts).then(({ error, skipped }) => {
    if (skipped) return;
    if (error) console.warn('[supabaseNotifications] notifyLikeCommentFollowDm:', error.message);
  });
}

/** DM / inbox: message preview optional (fetched if omitted). */
export async function insertDmNotificationFallback(opts: {
  messageId: string;
  receiverId: string;
  senderDisplayName: string;
  contentPreview?: string;
}) {
  let preview = opts.contentPreview ?? '';
  if (!preview) {
    const { data: row } = await supabase.from('messages').select('content').eq('id', opts.messageId).maybeSingle();
    preview = String((row as { content?: string } | null)?.content ?? '').slice(0, 120);
  }
  const isUrl = /^https?:\/\//i.test(preview);
  const msg =
    !preview || isUrl
      ? `${opts.senderDisplayName} sent you a message`
      : `${opts.senderDisplayName}: ${preview}`;

  return insertNotificationAsActor({
    recipientUserId: opts.receiverId,
    type: 'inbox_message',
    message: msg,
    storyId: null,
    entityId: opts.messageId,
  });
}
