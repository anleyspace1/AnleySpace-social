import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Bell, UserPlus, Radio, Heart, MessageCircle, MoreHorizontal, Trash2, CheckCircle2, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useNotifications, type AppNotification } from '../contexts/NotificationContext';

function formatTimeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const {
    notifications,
    loading,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAllNotifications,
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredNotifications = notifications.filter((n) => (filter === 'all' ? true : !n.is_read));

  const handleNotificationClick = async (notification: AppNotification) => {
    console.log('Notification clicked:', notification.id);
    await markAsRead(notification.id);

    const type = String(notification.type || '').toLowerCase();
    const actorId = notification.actor_id;

    if (type === 'inbox_message') {
      if (actorId) navigate(`/messages?userId=${encodeURIComponent(actorId)}`);
      return;
    }
    if (type === 'story_reply' || type === 'marketplace_message') {
      if (actorId) navigate(`/messages?userId=${encodeURIComponent(actorId)}`);
      return;
    }
    if (type === 'follow' || type === 'follower') {
      if (actorId) navigate(`/profile/${encodeURIComponent(actorId)}`);
      return;
    }
    if (type === 'like') {
      const entityId = notification.entity_id || notification.story_id;
      if (entityId) navigate(`/post/${encodeURIComponent(entityId)}`);
      else if (actorId) navigate(`/profile/${encodeURIComponent(actorId)}`);
      return;
    }
    if (type === 'live') {
      navigate('/live');
      return;
    }
    if (type === 'comment') {
      const postId = notification.entity_id || notification.story_id;
      if (postId) navigate(`/post/${encodeURIComponent(postId)}`);
      else if (actorId) navigate(`/profile/${encodeURIComponent(actorId)}`);
    }
  };

  const clearAll = () => {
    clearAllNotifications();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto pb-12"
    >
      <div className="flex items-center justify-between mb-6 px-4 lg:px-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Notifications</h1>
          <p className="text-sm text-gray-500">Stay updated with your community</p>
        </div>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <>
              <button
                onClick={markAllAsRead}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
                title="Mark all as read"
                type="button"
              >
                <CheckCircle2 size={20} />
              </button>
              <button
                onClick={clearAll}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                title="Clear all"
                type="button"
              >
                <Trash2 size={20} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'flex-1 py-4 text-sm font-bold transition-all border-b-2',
              filter === 'all'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            All Notifications
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={cn(
              'flex-1 py-4 text-sm font-bold transition-all border-b-2',
              filter === 'unread'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            Unread
            {notifications.filter((n) => !n.is_read).length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-indigo-600 text-white text-[10px] rounded-full">
                {notifications.filter((n) => !n.is_read).length}
              </span>
            )}
          </button>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {loading && notifications.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">Loading…</div>
          ) : filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onDelete={() => removeNotification(notification.id)}
                onClick={() => handleNotificationClick(notification)}
              />
            ))
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center px-6">
              <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Bell size={40} className="text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-bold mb-1">No notifications yet</h3>
              <p className="text-sm text-gray-500 max-w-[240px]">
                When you get notifications, they&apos;ll show up here.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface NotificationItemProps {
  notification: AppNotification;
  onDelete: () => void;
  onClick: () => void;
}

function NotificationItem({ notification, onDelete, onClick }: NotificationItemProps) {
  const type = String(notification.type || '').toLowerCase();
  const name = notification.actor_username || 'Someone';
  const avatar =
    notification.actor_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

  const getIcon = () => {
    switch (type) {
      case 'follow':
      case 'follower':
        return <UserPlus size={16} className="text-blue-500" />;
      case 'live':
        return <Radio size={16} className="text-red-500" />;
      case 'like':
        return <Heart size={16} className="text-pink-500" />;
      case 'comment':
        return <MessageCircle size={16} className="text-indigo-500" />;
      case 'story_reply':
        return <MessageCircle size={16} className="text-purple-500" />;
      case 'marketplace_message':
        return <ShoppingBag size={16} className="text-amber-500" />;
      default:
        return <MoreHorizontal size={16} className="text-gray-500" />;
    }
  };

  const summary = () => {
    if (type === 'story_reply') return 'replied to your story';
    if (type === 'marketplace_message') return 'sent a marketplace message';
    if (type === 'follow' || type === 'follower') return 'started following you';
    if (type === 'live') return 'is live now:';
    if (type === 'like') return notification.message || 'liked your post';
    if (type === 'comment') return notification.message || 'commented on your post';
    return notification.message || 'New notification';
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onClick={onClick}
      className={cn(
        'p-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group cursor-pointer',
        !notification.is_read && 'bg-indigo-50/30 dark:bg-indigo-900/5'
      )}
    >
      <div className="relative">
        <img
          src={avatar}
          alt=""
          className="w-12 h-12 rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-900 rounded-full flex items-center justify-center shadow-sm border border-gray-100 dark:border-gray-800">
          {getIcon()}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-bold text-gray-900 dark:text-white">{name}</span>
            <span className="text-gray-500 ml-1">{summary()}</span>
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <p className="text-[10px] text-gray-400 mt-1 font-medium uppercase tracking-wider">
          {formatTimeAgo(notification.created_at)}
        </p>
      </div>

      {!notification.is_read && <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2" />}
    </div>
  );
}
