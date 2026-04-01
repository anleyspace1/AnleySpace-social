import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { apiUrl, fetchFeedApiSafe } from '../lib/apiOrigin';
import { createSocketIoClient } from '../lib/socketIoClient';
import { playNotificationSound } from '../lib/notificationSound';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  actor_id: string | null;
  story_id?: string | null;
  entity_id?: string | null;
  message?: string | null;
  is_read: boolean;
  created_at: string;
  actor_username?: string | null;
  actor_avatar?: string | null;
};

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  /** Remove from local list only (no server delete). */
  removeNotification: (id: string) => void;
  /** Clear all from local list (no server delete). */
  clearAllNotifications: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

/** Map Supabase `public.notifications` row → AppNotification (supports group + future columns). */
function mapSupabaseNotificationRow(row: Record<string, unknown>): AppNotification {
  const type = String(row.type ?? 'unknown');
  const groupId = row.group_id != null ? String(row.group_id) : null;
  const messageId = row.message_id != null ? String(row.message_id) : null;
  const entityFromRow = row.entity_id != null ? String(row.entity_id) : null;
  const storyFromRow = row.story_id != null ? String(row.story_id) : null;
  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    type,
    actor_id: row.actor_id != null && String(row.actor_id).trim() !== '' ? String(row.actor_id) : null,
    story_id: storyFromRow,
    entity_id: entityFromRow ?? storyFromRow ?? groupId ?? messageId,
    message:
      row.message != null && String(row.message).trim() !== ''
        ? String(row.message)
        : type === 'group_message'
          ? 'New message in your group'
          : null,
    is_read: Boolean(row.is_read),
    created_at:
      typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    actor_username:
      row.actor_username != null ? String(row.actor_username) : null,
    actor_avatar: row.actor_avatar != null ? String(row.actor_avatar) : null,
  };
}

function normalizeSocketNotification(raw: Record<string, unknown>, userId: string): AppNotification {
  const storyId = raw.story_id != null ? String(raw.story_id) : null;
  const entityFromRaw = raw.entity_id != null ? String(raw.entity_id) : null;
  return {
    id: String(raw.id ?? ""),
    user_id: userId,
    type: String(raw.type ?? "unknown"),
    actor_id:
      raw.actor_id === null || raw.actor_id === undefined
        ? null
        : String(raw.actor_id),
    story_id: storyId,
    entity_id: entityFromRaw ?? storyId,
    message: raw.message != null ? String(raw.message) : null,
    is_read: false,
    created_at:
      typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
  };
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ title: string; description: string } | null>(null);

  const showNotificationToast = useCallback((notif: { message?: string | null }) => {
    setToast({
      title: "New Notification",
      description: notif.message || "You have a new notification",
    });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      console.log('NOTIFICATIONS AUTH USER:', authUser);

      const url = apiUrl(`/api/notifications?userId=${encodeURIComponent(user.id)}`);
      const response = await fetchFeedApiSafe(url);
      console.log('API RESPONSE:', {
        ok: response?.ok,
        status: response?.status,
        url,
      });

      if (response && response.ok) {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        const list = Array.isArray(data) ? (data as AppNotification[]) : [];
        console.log('NOTIFICATIONS DATA:', list);
        setNotifications(list);
        return;
      }

      if (!isSupabaseConfigured) {
        console.log('NOTIFICATIONS ERROR:', 'Supabase not configured; cannot load notifications without API');
        setNotifications([]);
        return;
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      console.log('NOTIFICATIONS DATA:', data);
      console.log('NOTIFICATIONS ERROR:', error);

      if (error) {
        setNotifications([]);
        return;
      }

      const mapped = (Array.isArray(data) ? data : []).map((row) =>
        mapSupabaseNotificationRow(row as Record<string, unknown>)
      );
      setNotifications(mapped.filter((n) => n.id));
    } catch (e) {
      console.log('NOTIFICATIONS ERROR:', e);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Real-time notifications (Socket.IO room `user_${userId}`). */
  useEffect(() => {
    if (!user?.id) return;

    const socket: Socket = createSocketIoClient();

    const register = () => socket.emit("register_user", user.id);
    socket.on("connect", register);
    register();

    const onNew = (raw: Record<string, unknown>) => {
      console.log("🔔 New notification:", raw);
      const mapped = normalizeSocketNotification(raw, user.id);
      setNotifications((prev) => {
        if (prev.some((n) => n.id === mapped.id)) return prev;
        return [mapped, ...prev];
      });
      playNotificationSound();
      showNotificationToast(mapped);
    };

    socket.on("new_notification", onNew);

    return () => {
      socket.off("connect", register);
      socket.off("new_notification", onNew);
      socket.disconnect();
    };
  }, [user?.id, showNotificationToast]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      if (!user?.id) return;
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      try {
        const res = await fetchFeedApiSafe(apiUrl(`/api/notifications/${encodeURIComponent(id)}/read`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        });
        if (res && res.ok) return;
        if (isSupabaseConfigured) {
          const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", id)
            .eq("user_id", user.id);
          if (error) console.warn("[Notifications] mark read Supabase:", error.message);
        } else {
          await refresh();
        }
      } catch {
        if (isSupabaseConfigured) {
          const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", id)
            .eq("user_id", user.id);
          if (error) await refresh();
        } else {
          await refresh();
        }
      }
    },
    [user?.id, refresh]
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    let idsToMark: string[] = [];
    setNotifications((prev) => {
      idsToMark = prev.filter((n) => !n.is_read).map((n) => n.id);
      return prev.map((n) => ({ ...n, is_read: true }));
    });
    try {
      const results = await Promise.all(
        idsToMark.map((id) =>
          fetchFeedApiSafe(apiUrl(`/api/notifications/${encodeURIComponent(id)}/read`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          })
        )
      );
      const anyFailed = results.some((r) => !r || !r.ok);
      if (anyFailed && isSupabaseConfigured && idsToMark.length > 0) {
        const { error } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .in("id", idsToMark);
        if (error) console.warn("[Notifications] mark all read Supabase:", error.message);
      } else if (anyFailed) {
        await refresh();
      }
    } catch {
      await refresh();
    }
  }, [user?.id, refresh]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      refresh,
      markAsRead,
      markAllAsRead,
      removeNotification,
      clearAllNotifications,
    }),
    [notifications, unreadCount, loading, refresh, markAsRead, markAllAsRead, removeNotification, clearAllNotifications]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-[300] w-[min(100%-2rem,24rem)] -translate-x-1/2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        >
          <p className="text-sm font-bold text-gray-900 dark:text-white">{toast.title}</p>
          <p className="mt-1 line-clamp-4 text-xs text-gray-600 dark:text-gray-300">{toast.description}</p>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}

/** Safe for optional Header without provider (fallback). */
export function useNotificationsOptional(): NotificationContextValue | null {
  return useContext(NotificationContext);
}
