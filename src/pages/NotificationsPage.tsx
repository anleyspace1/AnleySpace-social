import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Bell, UserPlus, Radio, Heart, MessageCircle, MoreHorizontal, Trash2, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface Notification {
  id: string;
  type: 'follower' | 'live' | 'like' | 'comment';
  user: {
    name: string;
    username: string;
    avatar: string;
  };
  content?: string;
  timestamp: string;
  isRead: boolean;
  streamTitle?: string;
  targetId?: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'live',
    user: {
      name: 'Sarah Jenkins',
      username: 'sarah_j',
      avatar: 'https://picsum.photos/seed/sarah/100/100'
    },
    streamTitle: 'Morning Yoga & Meditation',
    timestamp: '2 minutes ago',
    isRead: false,
    targetId: '/live'
  },
  {
    id: '2',
    type: 'follower',
    user: {
      name: 'Alex Rivera',
      username: 'alex_vibe',
      avatar: 'https://picsum.photos/seed/alex/100/100'
    },
    timestamp: '1 hour ago',
    isRead: false,
    targetId: 'alex_vibe'
  },
  {
    id: '3',
    type: 'like',
    user: {
      name: 'Tech Guru',
      username: 'tech_guru',
      avatar: 'https://picsum.photos/seed/tech/100/100'
    },
    content: 'liked your post "Building a SaaS in 24h"',
    timestamp: '3 hours ago',
    isRead: true,
    targetId: 'p1'
  },
  {
    id: '4',
    type: 'comment',
    user: {
      name: 'Emma Wilson',
      username: 'emma_w',
      avatar: 'https://picsum.photos/seed/emma/100/100'
    },
    content: 'commented: "This is exactly what I needed today!"',
    timestamp: '5 hours ago',
    isRead: true,
    targetId: 'p2'
  }
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const navigate = useNavigate();

  const filteredNotifications = notifications.filter(n => 
    filter === 'all' ? true : !n.isRead
  );

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, isRead: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    switch (notification.type) {
      case 'live':
        navigate('/live');
        break;
      case 'follower':
        navigate(`/profile/${notification.targetId}`);
        break;
      case 'like':
      case 'comment':
        navigate(`/profile?post=${notification.targetId}`);
        break;
    }
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
              >
                <CheckCircle2 size={20} />
              </button>
              <button 
                onClick={clearAll}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                title="Clear all"
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
            onClick={() => setFilter('all')}
            className={cn(
              "flex-1 py-4 text-sm font-bold transition-all border-b-2",
              filter === 'all' ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            All Notifications
          </button>
          <button 
            onClick={() => setFilter('unread')}
            className={cn(
              "flex-1 py-4 text-sm font-bold transition-all border-b-2",
              filter === 'unread' ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Unread
            {notifications.filter(n => !n.isRead).length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-indigo-600 text-white text-[10px] rounded-full">
                {notifications.filter(n => !n.isRead).length}
              </span>
            )}
          </button>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification) => (
              <NotificationItem 
                key={notification.id} 
                notification={notification} 
                onDelete={() => deleteNotification(notification.id)}
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
                When you get notifications, they'll show up here.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onDelete: () => void;
  onClick: () => void;
  key?: React.Key;
}

function NotificationItem({ notification, onDelete, onClick }: NotificationItemProps) {
  const getIcon = () => {
    switch (notification.type) {
      case 'follower': return <UserPlus size={16} className="text-blue-500" />;
      case 'live': return <Radio size={16} className="text-red-500" />;
      case 'like': return <Heart size={16} className="text-pink-500" />;
      case 'comment': return <MessageCircle size={16} className="text-indigo-500" />;
    }
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group cursor-pointer",
        !notification.isRead && "bg-indigo-50/30 dark:bg-indigo-900/5"
      )}
    >
      <div className="relative">
        <img 
          src={notification.user.avatar} 
          alt={notification.user.name} 
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
            <span className="font-bold text-gray-900 dark:text-white">{notification.user.name}</span>
            <span className="text-gray-500 ml-1">
              {notification.type === 'follower' && 'started following you'}
              {notification.type === 'live' && 'is live now:'}
              {notification.type === 'like' && notification.content}
              {notification.type === 'comment' && notification.content}
            </span>
          </p>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
        
        {notification.type === 'live' && notification.streamTitle && (
          <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20">
            <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
              <Radio size={12} /> LIVE NOW
            </p>
            <p className="text-sm font-bold truncate">{notification.streamTitle}</p>
          </div>
        )}

        <p className="text-[10px] text-gray-400 mt-1 font-medium uppercase tracking-wider">
          {notification.timestamp}
        </p>
      </div>

      {!notification.isRead && (
        <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2" />
      )}
    </div>
  );
}
