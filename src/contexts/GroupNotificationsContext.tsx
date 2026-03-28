import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

export type GroupNotificationRow = {
  id: string;
  user_id: string;
  type: string;
  message_id: string | null;
  group_id: string | null;
  is_read: boolean;
  created_at: string;
};

type GroupNotificationsContextValue = {
  notifications: GroupNotificationRow[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markGroupNotificationsRead: (groupId: string) => Promise<void>;
};

const GroupNotificationsContext = createContext<GroupNotificationsContextValue | null>(null);

export function GroupNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<GroupNotificationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, type, message_id, group_id, is_read, created_at")
        .eq("user_id", user.id)
        .eq("is_read", false)
        .eq("type", "group_message");

      if (error) {
        console.warn("[GroupNotifications] fetch:", error.message);
        setNotifications([]);
        return;
      }
      setNotifications(Array.isArray(data) ? (data as GroupNotificationRow[]) : []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`group-notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refresh]);

  const markGroupNotificationsRead = useCallback(
    async (groupId: string) => {
      if (!user?.id || !groupId.trim()) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("group_id", groupId)
        .eq("user_id", user.id);
      if (error) {
        console.warn("[GroupNotifications] mark read:", error.message);
        return;
      }
      setNotifications((prev) => prev.filter((n) => String(n.group_id) !== String(groupId)));
    },
    [user?.id]
  );

  const unreadCount = useMemo(() => notifications.length, [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      refresh,
      markGroupNotificationsRead,
    }),
    [notifications, unreadCount, loading, refresh, markGroupNotificationsRead]
  );

  return (
    <GroupNotificationsContext.Provider value={value}>{children}</GroupNotificationsContext.Provider>
  );
}

export function useGroupNotifications(): GroupNotificationsContextValue {
  const ctx = useContext(GroupNotificationsContext);
  if (!ctx) {
    throw new Error("useGroupNotifications must be used within GroupNotificationsProvider");
  }
  return ctx;
}

export function useGroupNotificationsOptional(): GroupNotificationsContextValue | null {
  return useContext(GroupNotificationsContext);
}
