import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Phone, 
  Video, 
  Info, 
  Image as ImageIcon, 
  Mic, 
  Send,
  MoreVertical,
  Circle,
  MessageCircle,
  ChevronLeft,
  X,
  User as UserIcon,
  Users,
  Ban,
  Flag,
  VideoOff,
  MicOff,
  Monitor,
  UserPlus,
  Settings,
  Maximize2,
  Minimize2,
  PhoneOff,
  Radio,
  CheckCircle2,
  Gift,
  Heart,
  Play,
  Square,
  Trash2,
  Camera
} from 'lucide-react';
import { MOCK_CHATS, MOCK_USER } from '../constants';
import { Message } from '../types';
import { cn } from '../lib/utils';
import { API_ORIGIN } from '../lib/apiOrigin';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';
import Peer from 'simple-peer';

function isStoryMediaVideo(url: string, mediaType?: string | null) {
  if (mediaType && String(mediaType).toLowerCase().includes('video')) return true;
  const u = url.toLowerCase();
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || u.includes('/video');
}

/** Triggers SQLite + socket notification for the receiver (server verifies the Supabase row). */
async function notifyInboxMessageRealtime(messageId: string, senderId: string, receiverId: string) {
  try {
    const res = await fetch(`${API_ORIGIN}/api/notifications/dm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, senderId, receiverId }),
    });
    if (!res.ok) {
      console.warn('notifyInboxMessageRealtime:', res.status);
    }
  } catch (e) {
    console.warn('notifyInboxMessageRealtime failed', e);
  }
}

/** Map Supabase `messages` row → UI Message (keeps normal messages unchanged). */
function formatMessageFromDb(m: any): Message {
  const content = m.content || m.text || '';
  const rawType = m.type != null ? String(m.type).trim().toLowerCase() : '';
  const isStoryReply =
    rawType === 'story_reply' ||
    Boolean(m.story_id) ||
    Boolean(m.story_media);
  if (isStoryReply) {
    console.log('[Messages] story_reply row', { story_id: m.story_id, story_media: m.story_media });
    return {
      id: m.id,
      senderId: m.sender_id,
      receiverId: m.receiver_id,
      message_type: m.message_type != null ? String(m.message_type) : (m.type != null ? String(m.type) : undefined),
      content,
      timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'story_reply',
      storyId: m.story_id ?? undefined,
      storyMedia: m.story_media ?? undefined,
      storyMediaType: m.story_media_type ?? null,
      isSeen: m.is_seen === true,
    };
  }
  // Voice files use the same `posts` bucket as images (`/posts/...`), so URL heuristics must detect voice BEFORE image.
  const isVoiceUrl = content.startsWith('http') && content.includes('/voice-messages/');
  const isImageUrl = content.startsWith('http') && !isVoiceUrl && (content.includes('/chat/') || content.includes('/posts/'));

  let resolvedType: Message['type'];
  if (rawType === 'audio' || rawType === 'voice') {
    resolvedType = rawType === 'audio' ? 'audio' : 'voice';
  } else if (isVoiceUrl) {
    resolvedType = 'audio';
  } else if (rawType === 'image') {
    resolvedType = 'image';
  } else if (isImageUrl) {
    resolvedType = 'image';
  } else if (rawType === 'text' || rawType === 'video') {
    resolvedType = rawType as Message['type'];
  } else {
    resolvedType = 'text';
  }

  const isAudioLike = resolvedType === 'audio' || resolvedType === 'voice' || isVoiceUrl;

  return {
    id: m.id,
    senderId: m.sender_id,
    receiverId: m.receiver_id,
    message_type: m.message_type != null ? String(m.message_type) : (m.type != null ? String(m.type) : undefined),
    content: (isImageUrl || isVoiceUrl) ? '' : content,
    timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    type: resolvedType,
    audioUrl: m.audio_url || (isAudioLike ? content : undefined),
    imageUrl: m.image_url || (!isAudioLike && resolvedType === 'image' && isImageUrl ? content : undefined),
    isSeen: m.is_seen === true,
  };
}

export default function MessagesPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const targetUser = searchParams.get('user');
  const targetUserId = searchParams.get('userId');
  
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchChats();

    // Subscribe to real-time messages to update chat list
    const channel = supabase
      .channel('public:messages_list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.new.sender_id === user?.id || payload.new.receiver_id === user?.id) {
          fetchChats();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, targetUser, targetUserId]);

  useEffect(() => {
    if (location.state?.openCall && user) {
      const { openCall, callType, callerId } = location.state;
      
      // Find the chat with the caller
      const chat = chats.find(c => c.user.id === callerId);
      if (chat) {
        setSelectedChat(chat);
        setActiveCall({ 
          id: openCall, 
          type: callType, 
          status: 'active', 
          hostId: callerId 
        });
        
        // Join the call room
        socketRef.current.emit('call:join', { 
          callId: openCall, 
          userId: user.id, 
          username: profile?.username || user.email 
        });
      }
    }
  }, [location.state, chats, user]);

  const fetchChats = async () => {
    try {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        setLoading(false);
        return;
      }

      // Load conversations using the requested query
      const { data: allMessages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${authUser.id},receiver_id.eq.${authUser.id}`)
        .order('created_at', { ascending: false });
      
      if (msgError) throw msgError;

      const contactIds = new Set<string>();
      const lastMessagesMap = new Map<string, { content: string, created_at: string }>();
      const injectedProfiles = new Map<string, { id: string; username: string; full_name: string | null; avatar_url: string | null; bio?: string | null }>();

      allMessages?.forEach(m => {
        const contactId = m.sender_id === authUser.id ? m.receiver_id : m.sender_id;
        if (contactId) {
          contactIds.add(contactId);
          if (!lastMessagesMap.has(contactId)) {
            lastMessagesMap.set(contactId, { content: m.content || m.text || '', created_at: m.created_at });
          }
        }
      });

      // If there's a targetUser (username) or targetUserId in URL, ensure they are in the list
      const ensureContact = async (targetProfile: { id: string; username: string; full_name: string | null; avatar_url: string | null } | null) => {
        if (!targetProfile || targetProfile.id === authUser.id) return;
        contactIds.add(targetProfile.id);
        if (!injectedProfiles.has(targetProfile.id)) {
          injectedProfiles.set(targetProfile.id, targetProfile);
        }
        try {
          await fetch('/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: targetProfile.id,
              username: targetProfile.username,
              full_name: targetProfile.full_name,
              avatar: targetProfile.avatar_url
            })
          });
        } catch (e) {
          console.error('Error syncing target user:', e);
        }
      };

      if (targetUser) {
        const { data: targetProfile, error: targetError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('username', targetUser)
          .maybeSingle();
        if (!targetError && targetProfile) await ensureContact(targetProfile);
      }

      if (targetUserId) {
        const { data: targetProfileById, error: targetErr2 } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('id', targetUserId.trim())
          .maybeSingle();
        if (!targetErr2 && targetProfileById) {
          await ensureContact(targetProfileById);
        } else {
          // Safe fallback for newly created users not fully synced in profiles yet.
          try {
            const res = await fetch(`/api/user/${encodeURIComponent(targetUserId.trim())}`);
            if (res.ok) {
              const localUser = await res.json();
              const fallbackProfile = {
                id: targetUserId.trim(),
                username: localUser?.username || targetUserId.trim(),
                full_name: localUser?.full_name || null,
                avatar_url: localUser?.avatar || null,
                bio: localUser?.bio || null,
              };
              await ensureContact(fallbackProfile);
            } else {
              await ensureContact({
                id: targetUserId.trim(),
                username: targetUserId.trim(),
                full_name: null,
                avatar_url: null,
              });
            }
          } catch (fallbackErr) {
            console.error('Error resolving target user fallback:', fallbackErr);
            await ensureContact({
              id: targetUserId.trim(),
              username: targetUserId.trim(),
              full_name: null,
              avatar_url: null,
            });
          }
        }
      }

      if (contactIds.size === 0) {
        setChats([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(contactIds));
      
      if (profilesError) throw profilesError;

      const profileList = [...(profiles || [])];
      injectedProfiles.forEach((p) => {
        if (!profileList.find((row: any) => row.id === p.id)) {
          profileList.push({
            id: p.id,
            username: p.username,
            full_name: p.full_name,
            avatar_url: p.avatar_url,
            bio: p.bio || null,
          });
        }
      });

      const formattedChats = profileList.map((p: any) => {
        const lastMsg = lastMessagesMap.get(p.id);
        return {
          id: p.id,
          user: {
            id: p.id,
            username: p.username || `user_${String(p.id).slice(0, 6)}`,
            displayName: p.full_name || p.username || 'User',
            avatar: p.avatar_url || `https://picsum.photos/seed/${p.id}/100/100`,
            bio: p.bio,
            online: true 
          },
          lastMessage: lastMsg ? (
            (() => {
              const lm = lastMsg as { content?: string; type?: string | null };
              const lmType = lm.type != null ? String(lm.type).trim().toLowerCase() : '';
              if (lmType === 'audio' || lmType === 'voice') return '🎤 Voice message';
              if (
                lm.content &&
                lm.content.startsWith('http') &&
                lm.content.includes('/voice-messages/')
              ) {
                return '🎤 Voice message';
              }
              if (
                lm.content &&
                lm.content.startsWith('http') &&
                (lm.content.includes('/chat/') || lm.content.includes('/posts/'))
              ) {
                return '📷 Photo';
              }
              return lm.content || '';
            })()
          ) : 'Start a conversation',
          timestamp: lastMsg ? new Date(lastMsg.created_at).toLocaleDateString() === new Date().toLocaleDateString()
            ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date(lastMsg.created_at).toLocaleDateString()
            : '',
          rawDate: lastMsg ? new Date(lastMsg.created_at) : new Date(0),
          unreadCount: 0
        };
      });

      // Sort by latest message
      formattedChats.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

      setChats(formattedChats);
    } catch (err) {
      console.error('Error fetching chats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (targetUserId && chats.length > 0) {
      const byId = chats.find(c => c.user.id === targetUserId.trim());
      if (byId) {
        setSelectedChat(byId);
        return;
      }
    }
    if (targetUser && chats.length > 0) {
      const existingChat = chats.find(c => c.user.username === targetUser);
      if (existingChat) {
        setSelectedChat(existingChat);
      }
    } else if (!selectedChat && chats.length > 0) {
      setSelectedChat(chats[0]);
    }
  }, [targetUser, targetUserId, chats]);

  const fetchMessages = async () => {
    if (!selectedChat || !user) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.user.id}),and(sender_id.eq.${selectedChat.user.id},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      
      if (error) throw error;

      const formattedMessages: Message[] = (data || []).map(formatMessageFromDb);
      setMessages(formattedMessages);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  /** Mark messages from the other user to me as read; server emits `messages_seen` so sender UI updates instantly. */
  const markConversationAsSeen = async () => {
    if (!selectedChat || !user) return;
    try {
      const res = await fetch(`${API_ORIGIN}/api/messages/mark-seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: user.id,
          senderId: selectedChat.user.id,
        }),
      });
      if (!res.ok) {
        const { error } = await supabase
          .from("messages")
          .update({ is_seen: true })
          .eq("receiver_id", user.id)
          .eq("sender_id", selectedChat.user.id);
        if (error) console.error("markConversationAsSeen fallback:", error);
      }
    } catch (e) {
      console.error("markConversationAsSeen:", e);
      try {
        const { error } = await supabase
          .from("messages")
          .update({ is_seen: true })
          .eq("receiver_id", user.id)
          .eq("sender_id", selectedChat.user.id);
        if (error) console.error("markConversationAsSeen fallback:", error);
      } catch (e2) {
        console.error("markConversationAsSeen fallback:", e2);
      }
    }
  };

  useEffect(() => {
    if (!selectedChat || !user) return;

    void (async () => {
      await fetchMessages();
      await markConversationAsSeen();
    })();

    // Subscribe to real-time messages for this conversation
    const channel = supabase
      .channel(`chat:${selectedChat.user.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages'
      }, (payload) => {
        const newMessage = payload.new;
        const isRelevant = (newMessage.sender_id === user.id && newMessage.receiver_id === selectedChat.user.id) ||
                           (newMessage.sender_id === selectedChat.user.id && newMessage.receiver_id === user.id);
        
        if (isRelevant) {
          // Check if message already exists (to avoid duplicates from optimistic updates)
          setMessages(prev => {
            if (prev.find(m => m.id === newMessage.id)) return prev;
            return [...prev, formatMessageFromDb(newMessage)];
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const isRelevant =
          (row.sender_id === user.id && row.receiver_id === selectedChat.user.id) ||
          (row.sender_id === selectedChat.user.id && row.receiver_id === user.id);
        if (isRelevant) {
          setMessages(prev =>
            prev.map(m => (m.id === row.id ? formatMessageFromDb(row) : m))
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat, user]);


  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<{ id: string, type: 'audio' | 'video', status: 'calling' | 'active' | 'ended', hostId: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [liveMessages, setLiveMessages] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [activeGifts, setActiveGifts] = useState<any[]>([]);
  const [floatingHearts, setFloatingHearts] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [callCapacity, setCallCapacity] = useState(20);
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [userCoins, setUserCoins] = useState(profile?.coins || 0);
  
  const [callError, setCallError] = useState<string | null>(null);
  
  const socketRef = useRef<any>(null);
  const peersRef = useRef<any[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  /** Partner in open chat — used so `messages_seen` only updates the active thread. */
  const selectedChatPartnerIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedChatPartnerIdRef.current = selectedChat?.user?.id ?? null;
  }, [selectedChat?.user?.id]);

  useEffect(() => {
    socketRef.current = io();

    if (user) {
      socketRef.current.emit('register_user', user.id);
    }

    socketRef.current.on('call:user_joined', (data: any) => {
      console.log('User joined call:', data);
      // In a real SFU/Mesh, we would initiate peer connection here
      setParticipants(prev => [...prev, data]);
    });

    socketRef.current.on('call:user_left', (data: any) => {
      setParticipants(prev => prev.filter(p => p.userId !== data.userId));
    });

    socketRef.current.on('call:is_live', (data: any) => {
      setIsLive(true);
      socketRef.current.emit('join_live', data.streamId);
    });

    socketRef.current.on('call:viewer_count', (data: any) => {
      setViewerCount(data.count);
    });

    socketRef.current.on('call:new_message', (data: any) => {
      setLiveMessages(prev => [...prev, data]);
    });

    socketRef.current.on('call:new_request', (data: any) => {
      setJoinRequests(prev => [...prev, data]);
    });

    socketRef.current.on('call:request_resolved', (data: any) => {
      setJoinRequests(prev => prev.filter(r => r.requestId !== data.requestId));
      if (data.status === 'accepted') {
        setParticipants(prev => [...prev, { userId: data.userId, username: data.username }]);
      }
    });

    socketRef.current.on('call:new_gift', (data: any) => {
      setActiveGifts(prev => [...prev, data]);
      setTimeout(() => {
        setActiveGifts(prev => prev.filter(g => g.id !== data.id));
      }, 4000);
    });

    socketRef.current.on('call:new_reaction', (data: any) => {
      const newHearts = Array.from({ length: 3 }).map((_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100 - 50,
      }));
      setFloatingHearts(prev => [...prev, ...newHearts]);
      setTimeout(() => {
        setFloatingHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
      }, 2000);
    });

    socketRef.current.on('call:response', (data: any) => {
      console.log('Call response received:', data);
      if (data.response === 'accepted') {
        setActiveCall(prev => prev ? { ...prev, status: 'active' } : null);
      } else {
        setActiveCall(null);
        setCallError('Call was rejected');
        setTimeout(() => setCallError(null), 3000);
      }
    });

    socketRef.current.on('call:ended', (data: any) => {
      console.log('Call ended by remote user');
      setActiveCall(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !user?.id) return;
    const onMessagesSeen = (payload: { senderId: string; receiverId: string }) => {
      try {
        const { senderId, receiverId } = payload;
        if (user.id !== senderId) return;
        const activeChatUserId = selectedChatPartnerIdRef.current;
        if (!activeChatUserId || activeChatUserId !== receiverId) return;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.senderId === user.id &&
            msg.receiverId === activeChatUserId
              ? { ...msg, isSeen: true }
              : msg
          )
        );
      } catch (e) {
        console.error("messages_seen handler:", e);
      }
    };
    socket.on("messages_seen", onMessagesSeen);
    return () => {
      socket.off("messages_seen", onMessagesSeen);
    };
  }, [user?.id]);

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!user) return;
    setCallError(null);
    try {
      // Request media FIRST to ensure permissions are granted before starting call on server
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });
      streamRef.current = stream;

      const res = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: user.id, type })
      });
      const data = await res.json();
      
      setActiveCall({ id: data.id, type, status: 'calling', hostId: user.id });
      setCallCapacity(data.capacity);
      
      socketRef.current.emit('call:join', { 
        callId: data.id, 
        userId: user.id, 
        username: profile?.username || user.email 
      });

      // Notify the target user
      socketRef.current.emit('call:initiate', {
        targetId: selectedChat.user.id,
        callerId: user.id,
        callerName: profile?.full_name || profile?.username || user.email,
        callerAvatar: profile?.avatar_url,
        type,
        callId: data.id
      });

      setTimeout(() => {
        setActiveCall(prev => prev ? { ...prev, status: 'active' } : null);
      }, 2000);
    } catch (err: any) {
      console.error('Failed to start call:', err);
      let errorMsg = "Could not start call.";
      if (err.name === 'NotAllowedError' || err.message?.includes('denied')) {
        errorMsg = "Permission denied. Please enable camera/microphone access.";
      } else if (err.message?.includes('dismissed')) {
        errorMsg = "Permission prompt was dismissed. Please try again.";
      }
      setCallError(errorMsg);
      alert(errorMsg);
    }
  };

  const handleAddParticipant = () => {
    if (participants.length + 1 >= callCapacity) {
      setShowUpgradePopup(true);
      return;
    }
    // Simulate adding someone
    const mockId = Math.random().toString(36).substr(2, 9);
    const mockUser = { userId: mockId, username: `user_${mockId}` };
    setParticipants(prev => [...prev, mockUser]);
  };

  const handleUpgrade = async (capacity: number, cost: number) => {
    if (!user) return;
    if (userCoins < cost) {
      alert('Insufficient Coins!');
      return;
    }

    try {
      const res = await fetch(`/api/calls/${activeCall?.id}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: user.id, capacity, cost })
      });
      
      if (res.ok) {
        setCallCapacity(capacity);
        setUserCoins(prev => prev - cost);
        setShowUpgradePopup(false);
        alert(`Upgraded to ${capacity} participants!`);
      } else {
        const data = await res.json();
        alert(data.error || 'Upgrade failed');
      }
    } catch (err) {
      console.error('Upgrade error:', err);
    }
  };

  const handleEndCall = () => {
    if (activeCall && user) {
      if (selectedChat) {
        socketRef.current.emit('call:end', { 
          targetId: selectedChat.user.id, 
          callId: activeCall.id 
        });
      }
      socketRef.current.emit('call:leave', { callId: activeCall.id, userId: user.id });
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setActiveCall(null);
      setParticipants([]);
      setIsLive(false);
    }
  };

  const handleGoLive = async () => {
    if (!activeCall) return;
    
    try {
      const res = await fetch(`/api/calls/${activeCall.id}/go-live`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (data.success) {
        setIsLive(true);
        socketRef.current.emit('join_live', data.streamId);
        socketRef.current.emit('call:go_live', { 
          callId: activeCall.id, 
          streamId: data.streamId 
        });
        alert('You are now LIVE! Your call is being broadcasted to the Live Feed.');
      }
    } catch (err) {
      console.error('Failed to go live:', err);
    }
  };

  const handleRespondJoin = async (requestId: string, userId: string, username: string, status: 'accepted' | 'declined') => {
    try {
      const res = await fetch(`/api/calls/${activeCall?.id}/respond-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, status })
      });
      if (res.ok) {
        setJoinRequests(prev => prev.filter(r => r.requestId !== requestId));
        socketRef.current.emit('call:respond_join', { 
          callId: activeCall?.id, 
          requestId, 
          userId, 
          username,
          status 
        });
      }
    } catch (err) {
      console.error('Failed to respond to join request:', err);
    }
  };

  const handleSendMessage = async () => {
    if ((!message.trim() && !selectedImage) || !selectedChat || !user) return;
    
    let imageUrl = null;

    try {
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `chat/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, selectedFile);

        if (uploadError) {
          if (uploadError.message.includes('Bucket not found')) {
            throw new Error('Storage bucket "posts" not found. Please create a public bucket named "posts" in your Supabase dashboard.');
          }
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath);
        
        imageUrl = publicUrl;
      }

      // Use only columns confirmed by the user: id, sender_id, receiver_id, content, created_at
      const messageData: Record<string, string | boolean> = {
        sender_id: user.id,
        receiver_id: selectedChat.user.id,
        content: imageUrl || message.trim(),
        is_seen: false,
      };

      const { data, error } = await supabase
        .from('messages')
        .insert([messageData])
        .select();
      
      if (error) {
        console.error('Supabase insert error:', error);
        alert(`Failed to send message: ${error.message}`);
        return;
      }

      if (data && data.length > 0) {
        const savedMsg = data[0];
        const newMessage: Message = {
          id: savedMsg.id,
          senderId: savedMsg.sender_id,
          receiverId: savedMsg.receiver_id,
          content: imageUrl ? '' : savedMsg.content,
          timestamp: new Date(savedMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: imageUrl ? 'image' : 'text',
          imageUrl: imageUrl || undefined,
          isSeen: savedMsg.is_seen === true,
        };
        setMessages(prev => [...prev, newMessage]);
        setSelectedImage(null);
        setSelectedFile(null);
        setMessage('');
        void notifyInboxMessageRealtime(savedMsg.id, user.id, selectedChat.user.id);
      }
    } catch (err: any) {
      console.error('Error in handleSendMessage:', err);
      if (err.message) {
        alert(err.message);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    setSelectedFile(file);

    const input = e.target as HTMLInputElement;

    // Request camera permission explicitly if it's a camera capture
    if (input.hasAttribute('capture')) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately after permission check
      } catch (err) {
        console.error("Camera permission denied", err);
      }
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      setSelectedImage(imageUrl);
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        sendVoiceMessage(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      audioChunksRef.current = [];
    }
  };

  const sendVoiceMessage = async (audioUrl: string) => {
    if (!selectedChat || !user) return;
    
    try {
      // 1. Fetch the blob from the local URL
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      
      // 2. Upload to Supabase Storage
      const fileName = `${Date.now()}.webm`;
      const filePath = `voice-messages/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, blob);
        
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('posts')
        .getPublicUrl(filePath);

      // 3. Insert message using confirmed columns
      const { data, error } = await supabase
        .from('messages')
        .insert([{
          sender_id: user.id,
          receiver_id: selectedChat.user.id,
          content: publicUrl,
          is_seen: false,
          type: 'audio',
        }])
        .select();
      
      if (error) {
        console.error('Supabase voice insert error:', error);
        alert(`Failed to send voice message: ${error.message}`);
        return;
      }

      if (data && data.length > 0) {
        const savedMsg = data[0];
        const newMessage: Message = {
          id: savedMsg.id,
          senderId: savedMsg.sender_id,
          receiverId: savedMsg.receiver_id,
          message_type: savedMsg.type != null ? String(savedMsg.type) : 'audio',
          content: '',
          timestamp: new Date(savedMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'audio',
          audioUrl: savedMsg.content,
          isSeen: savedMsg.is_seen === true,
        };
        setMessages(prev => [...prev, newMessage]);
        void notifyInboxMessageRealtime(savedMsg.id, user.id, selectedChat.user.id);
      }
    } catch (err: any) {
      console.error('Error sending voice message:', err);
      if (err.message) {
        alert(err.message);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleViewProfileFromInfo = () => {
    const targetUserId = selectedChat?.user?.id;
    if (!targetUserId) return;
    navigate(`/profile/${targetUserId}`);
  };

  const handleBlockUserFromInfo = async () => {
    if (!user?.id || !selectedChat?.user?.id) return;
    const blockerId = user.id;
    const blockedId = selectedChat.user.id;
    try {
      const { error } = await supabase
        .from('blocked_users')
        .insert([{ blocker_id: blockerId, blocked_id: blockedId }]);
      if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
        throw error;
      }

      // Remove this conversation locally and close info/chat view.
      setChats(prev => prev.filter((chat) => chat.user?.id !== blockedId));
      setSelectedChat(null);
      setMessages([]);
      setIsInfoOpen(false);
      console.log('User blocked successfully:', blockedId);
    } catch (err) {
      console.error('Error blocking user:', err);
      alert('Failed to block user. Please try again.');
    }
  };

  const handleReportUserFromInfo = async () => {
    if (!user?.id || !selectedChat?.user?.id) return;
    const reporterId = user.id;
    const reportedId = selectedChat.user.id;
    try {
      const { error } = await supabase
        .from('reports')
        .insert([{ reporter_id: reporterId, reported_id: reportedId, reason: 'chat report' }]);
      if (error) throw error;
      console.log('User reported successfully:', reportedId);
      alert('User reported.');
    } catch (err) {
      console.error('Error reporting user:', err);
      alert('Failed to report user. Please try again.');
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px-72px)] sm:h-[calc(100vh-64px)] bg-gray-50 dark:bg-black relative overflow-hidden">
      {/* Chat List */}
      <div className={cn(
        "w-full md:w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-black",
        selectedChat && "hidden md:flex"
      )}>
        <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Messages</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search chats..." 
              className="w-full bg-gray-100 dark:bg-gray-900 border-none rounded-xl py-1.5 sm:py-2 pl-9 sm:pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={cn(
                "w-full p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors border-b border-gray-50 dark:border-gray-900",
                selectedChat?.id === chat.id && "bg-gray-100 dark:bg-gray-900"
              )}
            >
              <div className="relative">
                <img 
                  src={chat.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.user.displayName)}&background=random`} 
                  alt={chat.user.displayName} 
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover" 
                />
                {chat.online && (
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                  <span className="font-bold text-sm sm:text-base">{chat.user.displayName}</span>
                  <span className="text-[10px] sm:text-xs text-gray-500">{chat.timestamp}</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 truncate">{chat.lastMessage}</p>
              </div>
              {chat.unreadCount > 0 && (
                <div className="w-4 h-4 sm:w-5 sm:h-5 bg-indigo-600 text-white text-[8px] sm:text-[10px] font-bold rounded-full flex items-center justify-center">
                  {chat.unreadCount}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className={cn(
        "flex-1 flex flex-col bg-white dark:bg-black",
        !selectedChat && "hidden md:flex items-center justify-center text-gray-500"
      )}>
        {selectedChat ? (
          <>
            <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <button onClick={() => setSelectedChat(null as any)} className="md:hidden p-2 -ml-2">
                  <ChevronLeft size={20} />
                </button>
                <div className="relative">
                  <img 
                    src={selectedChat.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedChat.user.displayName)}&background=random`} 
                    alt="" 
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover" 
                  />
                  {selectedChat.online && <div className="absolute bottom-0 right-0 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>}
                </div>
                <div>
                  <h3 className="font-bold leading-none text-sm sm:text-base">{selectedChat.user.displayName}</h3>
                  <span className="text-[10px] sm:text-xs text-gray-500">{selectedChat.online ? 'Online' : 'Offline'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <button 
                  onClick={() => handleStartCall('audio')}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-full text-gray-600 dark:text-gray-400"
                >
                  <Phone size={18} />
                </button>
                <button 
                  onClick={() => handleStartCall('video')}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-full text-gray-600 dark:text-gray-400"
                >
                  <Video size={18} />
                </button>
                {activeCall?.type === 'video' && activeCall.hostId === user?.id && !isLive && (
                  <button 
                    onClick={handleGoLive}
                    className="bg-red-600 hover:bg-red-700 text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold flex items-center gap-1 sm:gap-2 transition-all shadow-lg shadow-red-600/20"
                  >
                    <Radio size={12} />
                    <span className="hidden xs:inline">Go Live</span>
                    <span className="xs:hidden">Live</span>
                  </button>
                )}
                <button 
                  onClick={() => setIsInfoOpen(!isInfoOpen)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    isInfoOpen ? "bg-indigo-100 text-indigo-600" : "hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400"
                  )}
                >
                  <Info size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-gray-50 dark:bg-black/20">
              <div className="flex justify-center">
                <span className="text-xs bg-gray-200 dark:bg-gray-800 text-gray-500 px-3 py-1 rounded-full">Today</span>
              </div>
              
              {messages.map((msg) => {
                console.log("Rendering message type:", msg.type);
                return (
                <div 
                  key={msg.id} 
                  className={cn(
                    "flex items-end gap-2",
                    msg.senderId === user?.id ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.senderId !== user?.id && (
                    <img 
                      src={selectedChat.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedChat.user.displayName)}&background=random`} 
                      alt="" 
                      className="w-8 h-8 rounded-full object-cover" 
                    />
                  )}
                  <div className={cn(
                    "p-3 rounded-2xl shadow-sm max-w-[70%] min-w-[60px]",
                    msg.senderId === user?.id 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : "bg-gray-100 dark:bg-gray-800 text-black dark:text-white rounded-tl-none"
                  )}>
                    {msg.type === 'voice' || msg.type === 'audio' ? (
                      <div className="flex items-center gap-3 min-w-[160px] py-1">
                        <button 
                          onClick={() => {
                            const audio = new Audio(msg.audioUrl || '');
                            audio.play();
                          }}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                            msg.senderId === user?.id 
                              ? "bg-white/20 hover:bg-white/30 text-white" 
                              : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 hover:bg-indigo-200"
                          )}
                        >
                          <Play size={16} fill="currentColor" />
                        </button>
                        <div className="flex-1 h-1.5 bg-current opacity-20 rounded-full overflow-hidden">
                          <div className="h-full bg-current w-1/3"></div>
                        </div>
                        <span className="text-[10px] font-bold opacity-70">Voice</span>
                      </div>
                    ) : msg.type === 'story_reply' ? (
                      <div className="space-y-2 min-w-0">
                        <p
                          className={cn(
                            "text-xs mb-1.5",
                            msg.senderId === user?.id
                              ? "text-indigo-100/90"
                              : "text-gray-500 dark:text-gray-400"
                          )}
                        >
                          Replied to your story
                        </p>
                        {msg.storyMedia ? (
                          <button
                            type="button"
                            className="group block p-0 m-0 border-0 bg-transparent cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
                            disabled={!msg.storyId}
                            onClick={() => {
                              if (msg.storyId) navigate(`/story/${msg.storyId}`);
                            }}
                            aria-label="Open story"
                          >
                            {isStoryMediaVideo(msg.storyMedia, msg.storyMediaType) ? (
                              <video
                                src={msg.storyMedia}
                                className="pointer-events-none block h-24 w-[200px] max-w-[200px] rounded-lg object-cover bg-black/20"
                                playsInline
                                muted
                              />
                            ) : (
                              <img
                                src={msg.storyMedia}
                                alt=""
                                className="block h-24 w-[200px] max-w-[200px] rounded-lg object-cover cursor-pointer transition-all duration-200 group-hover:opacity-[0.85]"
                              />
                            )}
                          </button>
                        ) : null}
                        {msg.content ? (
                          <p className="text-sm break-words">{msg.content}</p>
                        ) : null}
                      </div>
                    ) : msg.type === 'image' || (msg.imageUrl && msg.type !== 'story_reply' && msg.type !== 'voice' && msg.type !== 'audio') ? (
                      <div className="py-1">
                        <img 
                          src={msg.imageUrl || msg.content} 
                          alt="Shared image" 
                          className="max-w-[250px] max-h-[250px] rounded-[12px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(msg.imageUrl || msg.content, '_blank')}
                        />
                      </div>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                    {msg.senderId === user?.id ? (
                      <div
                        className="message-footer mt-1 flex items-center justify-end gap-1.5 text-[11px] sm:text-[12px] opacity-80"
                        title={msg.isSeen ? 'Seen' : 'Delivered'}
                      >
                        <span className="time shrink-0 text-indigo-100/90">{msg.timestamp}</span>
                        <span
                          className={cn(
                            'status shrink-0 select-none leading-none tracking-tight',
                            msg.isSeen ? 'text-sky-300' : 'text-indigo-200/75'
                          )}
                          aria-hidden
                        >
                          {msg.isSeen ? '✓✓' : '✓'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] sm:text-[11px] mt-1 block text-gray-400">
                        {msg.timestamp}
                      </span>
                    )}
                  </div>
                </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-2 sm:p-4 border-t border-gray-200 dark:border-gray-800">
              {selectedImage && (
                <div className="mb-3 relative inline-block">
                  <img src={selectedImage} alt="Preview" className="w-32 h-32 object-cover rounded-xl border-2 border-indigo-500" />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {isRecording ? (
                <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-2xl p-2 px-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                    <span className="text-red-600 dark:text-red-400 font-bold text-sm">{formatTime(recordingTime)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={cancelRecording}
                      className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                    <button 
                      onClick={stopRecording}
                      className="w-10 h-10 bg-red-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20"
                    >
                      <Square size={18} fill="currentColor" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 sm:gap-2 bg-gray-100 dark:bg-gray-900 rounded-2xl p-1.5 sm:p-2">
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                    ref={cameraInputRef}
                    onChange={handleImageUpload}
                  />
                  <button 
                    onClick={() => cameraInputRef.current?.click()}
                    className="p-1.5 sm:p-2 text-gray-500 hover:text-indigo-600"
                    title="Take Photo"
                  >
                    <Camera size={20} />
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 sm:p-2 text-gray-500 hover:text-indigo-600"
                    title="Upload Image"
                  >
                    <ImageIcon size={20} />
                  </button>
                  <button 
                    onClick={startRecording}
                    className="p-1.5 sm:p-2 text-gray-500 hover:text-indigo-600"
                    title="Voice Message"
                  >
                    <Mic size={20} />
                  </button>
                  <input 
                    type="text" 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Message..." 
                    className="flex-1 bg-transparent border-none focus:ring-0 py-1.5 sm:py-2 text-sm"
                  />
                  <button 
                    onClick={handleSendMessage}
                    className={cn(
                      "p-1.5 sm:p-2 rounded-xl transition-all",
                      message ? "bg-indigo-600 text-white shadow-lg" : "text-gray-400"
                    )}
                  >
                    <Send size={20} />
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 mx-auto mb-4">
              <MessageCircle size={40} />
            </div>
            <h2 className="text-xl font-bold mb-2">Your Messages</h2>
            <p className="text-gray-500">Select a chat to start messaging</p>
          </div>
        )}
      </div>

      {/* Info Panel */}
      <AnimatePresence>
        {isInfoOpen && selectedChat && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 z-20 shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold">Contact Info</h3>
              <button onClick={() => setIsInfoOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center">
              <img src={selectedChat.user.avatar} alt="" className="w-24 h-24 rounded-full object-cover mb-4 border-4 border-indigo-500/20" />
              <h4 className="text-xl font-bold mb-1">{selectedChat.user.displayName}</h4>
              <p className="text-sm text-gray-500 mb-6">@{selectedChat.user.username}</p>
              
              <div className="w-full bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl mb-6 text-left">
                <span className="text-xs font-bold text-gray-400 uppercase mb-2 block">Bio</span>
                <p className="text-sm">{selectedChat.user.bio || 'No bio yet.'}</p>
              </div>

              <div className="w-full space-y-3">
                <button onClick={handleViewProfileFromInfo} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors">
                  <UserIcon size={18} />
                  View Profile
                </button>
                <button onClick={handleBlockUserFromInfo} className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Ban size={18} />
                  Block User
                </button>
                <button onClick={handleReportUserFromInfo} className="w-full py-3 text-gray-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Flag size={18} />
                  Report
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Overlay */}
      <AnimatePresence>
        {activeCall && selectedChat && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 bottom-[72px] lg:bottom-0 z-[110] bg-black flex flex-col"
          >
            {/* Call Header */}
            <div className="p-4 flex items-center justify-between text-white bg-gradient-to-b from-black/50 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                  {activeCall.type === 'audio' ? <Phone size={20} /> : <Video size={20} />}
                </div>
                <div>
                  <h3 className="font-bold">{selectedChat.user.displayName}</h3>
                  <p className="text-xs opacity-80">
                    {activeCall.status === 'calling' ? 'Calling...' : `${participants.length + 1} participants • ${activeCall.type === 'audio' ? 'Audio' : 'Video'} Call`}
                    {isLive && ` • ${viewerCount} Viewers`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {isLive && activeCall.hostId === user?.id && (
                  <button 
                    onClick={() => setShowRequests(!showRequests)}
                    className="relative p-2 hover:bg-white/10 rounded-full text-white"
                  >
                    <Users size={20} />
                    {joinRequests.length > 0 && (
                      <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-[10px] font-bold rounded-full flex items-center justify-center">
                        {joinRequests.length}
                      </span>
                    )}
                  </button>
                )}
                <button onClick={handleAddParticipant} className="p-2 hover:bg-white/10 rounded-full flex items-center gap-2">
                  <UserPlus size={20} />
                  <span className="text-xs font-bold">Add</span>
                </button>
                <button className="p-2 hover:bg-white/10 rounded-full"><Settings size={20} /></button>
              </div>
            </div>

            {/* Call Content */}
            <div className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
              {/* Gift Animations Overlay */}
              <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden">
                <AnimatePresence>
                  {activeGifts.map((gift) => (
                    <motion.div
                      key={gift.id}
                      initial={{ opacity: 0, scale: 0.5, y: 100 }}
                      animate={{ 
                        opacity: [0, 1, 1, 0], 
                        scale: [0.5, 1.2, 1, 0.8], 
                        y: [100, 0, -20, -100] 
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 4, times: [0, 0.1, 0.8, 1] }}
                      className="absolute inset-0 flex flex-col items-center justify-center"
                    >
                      <div className={cn(
                        "flex flex-col items-center gap-4 p-8 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.2)]",
                        gift.animation === 'extra-large' ? "scale-[2]" : 
                        gift.animation === 'large' ? "scale-[1.5]" : "scale-100"
                      )}>
                        <span className="text-8xl filter drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">{gift.icon}</span>
                        <div className="bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/20">
                          <p className="text-white font-black text-xl whitespace-nowrap">
                            <span className="text-indigo-400">{gift.username}</span> sent a <span className="text-yellow-400">{gift.giftName}</span>
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Floating Hearts Overlay */}
              <div className="absolute bottom-32 right-12 pointer-events-none z-[90]">
                <AnimatePresence>
                  {floatingHearts.map((heart) => (
                    <motion.div
                      key={heart.id}
                      initial={{ opacity: 0, y: 0, x: heart.x, scale: 0.5 }}
                      animate={{ 
                        opacity: [0, 1, 0], 
                        y: -300, 
                        x: heart.x + (Math.random() * 40 - 20),
                        scale: [0.5, 1.5, 1]
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2, ease: "easeOut" }}
                      className="absolute"
                    >
                      <Heart size={24} className="text-red-500 fill-red-500" />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="flex-1 relative overflow-y-auto p-2 sm:p-4">
                {activeCall.type === 'video' ? (
                  <div className={cn(
                    "grid gap-2 sm:gap-4 h-full",
                    "grid-cols-2",
                    participants.length > 3 && "md:grid-cols-3"
                  )}>
                  {/* Main User (You) */}
                  <div className="relative bg-gray-800 rounded-xl sm:rounded-3xl overflow-hidden border border-white/10 aspect-[4/3] sm:aspect-video md:aspect-auto">
                    {!isCameraOff ? (
                      <img src={profile?.avatar_url || MOCK_USER.avatar} alt="" className="w-full h-full object-cover opacity-50" />
                    ) : (
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <VideoOff size={24} className="sm:size-[48px] text-gray-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <img src={profile?.avatar_url || MOCK_USER.avatar} alt="" className="w-10 h-10 sm:w-24 sm:h-24 rounded-full border-2 border-white/20" />
                    </div>
                    <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 bg-black/50 backdrop-blur-md px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-white text-[9px] sm:text-xs font-bold">
                      You
                    </div>
                  </div>

                  {/* Selected Chat User (Always present in 1-on-1, or first in group) */}
                  <div className="relative bg-gray-900 rounded-xl sm:rounded-3xl overflow-hidden border-2 border-indigo-500 shadow-2xl shadow-indigo-500/20 aspect-[4/3] sm:aspect-video md:aspect-auto">
                    <img src={selectedChat.user.avatar} alt="" className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <img src={selectedChat.user.avatar} alt="" className="w-10 h-10 sm:w-24 sm:h-24 rounded-full border-2 sm:border-4 border-indigo-500 mx-auto mb-1 sm:mb-2" />
                        <h4 className="text-white font-bold text-[10px] sm:text-base">{selectedChat.user.displayName}</h4>
                      </div>
                    </div>
                    <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 bg-black/50 backdrop-blur-md px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-white text-[9px] sm:text-xs font-bold flex items-center gap-1 sm:gap-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full"></div>
                      {selectedChat.user.displayName}
                    </div>
                  </div>

                  {/* Other Participants */}
                  {participants.map((p, i) => (
                    <div key={i} className="relative bg-gray-800 rounded-xl sm:rounded-3xl overflow-hidden border border-white/10 aspect-[4/3] sm:aspect-video md:aspect-auto">
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-8 h-8 sm:w-20 sm:h-20 rounded-full bg-indigo-600/20 flex items-center justify-center mx-auto mb-1 sm:mb-2">
                            <UserIcon size={16} className="sm:size-[32px] text-indigo-400" />
                          </div>
                          <h4 className="text-white font-bold text-[9px] sm:text-sm">{p.username}</h4>
                        </div>
                      </div>
                      <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 bg-black/50 backdrop-blur-md px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-white text-[9px] sm:text-xs font-bold">
                        {p.username}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-48 h-48 rounded-full bg-indigo-600/20 flex items-center justify-center mb-8 relative"
                  >
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-500 animate-ping opacity-20"></div>
                    <img src={selectedChat.user.avatar} alt="" className="w-40 h-40 rounded-full border-4 border-indigo-500 object-cover" />
                  </motion.div>
                  <h2 className="text-3xl font-bold text-white mb-2">{selectedChat.user.displayName}</h2>
                  <p className="text-indigo-400 font-bold tracking-widest uppercase text-sm">
                    {activeCall.status === 'calling' ? 'Calling...' : 'Active Call'}
                  </p>
                  
                  {/* Participant List for Audio Call */}
                  <div className="mt-12 flex flex-wrap justify-center gap-4 max-w-2xl">
                    {participants.map((p, i) => (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center border border-white/10">
                          <UserIcon size={24} className="text-gray-400" />
                        </div>
                        <span className="text-xs text-gray-400">{p.username}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>

              {/* Live Sidebar */}
              {isLive && (
                <div className="w-full md:w-80 bg-black/40 backdrop-blur-xl border-l border-white/10 flex flex-col">
                  <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h4 className="text-white font-bold text-sm">Live Chat</h4>
                    <button onClick={() => setIsChatOpen(!isChatOpen)} className="text-white/60 hover:text-white">
                      <MessageCircle size={18} />
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {liveMessages.map((msg, i) => (
                      <div key={i} className="flex flex-col">
                        <span className="text-indigo-400 text-[10px] font-bold">{msg.username}</span>
                        <p className="text-white text-xs">{msg.content || msg.text}</p>
                      </div>
                    ))}
                    {liveMessages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                        <MessageCircle size={32} className="mb-2" />
                        <p className="text-xs">No messages yet</p>
                      </div>
                    )}
                  </div>

                  {/* Join Requests Panel */}
                  <AnimatePresence>
                    {showRequests && activeCall.hostId === user?.id && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="bg-indigo-900/40 border-t border-white/10 overflow-hidden"
                      >
                        <div className="p-4 space-y-3">
                          <h5 className="text-white font-bold text-xs uppercase tracking-wider">Speaker Requests</h5>
                          {joinRequests.map((req) => (
                            <div key={req.requestId} className="bg-white/5 p-3 rounded-xl flex items-center justify-between">
                              <div>
                                <p className="text-white text-xs font-bold">{req.username}</p>
                                <p className="text-yellow-400 text-[10px] font-bold">{req.amount} Coins</p>
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handleRespondJoin(req.requestId, req.userId, req.username, 'declined')}
                                  className="p-1.5 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors"
                                >
                                  <X size={14} />
                                </button>
                                <button 
                                  onClick={() => handleRespondJoin(req.requestId, req.userId, req.username, 'accepted')}
                                  className="p-1.5 bg-green-500/20 text-green-500 rounded-lg hover:bg-green-500/30 transition-colors"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {joinRequests.length === 0 && (
                            <p className="text-white/40 text-[10px] text-center py-4">No pending requests</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Call Controls */}
            <div className="p-3 sm:p-8 flex items-center justify-center gap-3 sm:gap-6 bg-gradient-to-t from-black/80 to-transparent">
              {activeCall.hostId === user?.id && !isLive && (
                <button 
                  onClick={handleGoLive}
                  className="bg-red-600 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-full font-bold flex items-center gap-1 sm:gap-2 shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all hover:scale-105 text-[9px] sm:text-base"
                >
                  <Radio size={14} className="animate-pulse sm:size-[20px]" />
                  Go Live
                </button>
              )}
              
              {isLive && (
                <div className="bg-red-600 text-white px-2 sm:px-4 py-1 sm:py-2 rounded-full font-black text-[7px] sm:text-[10px] uppercase tracking-wider animate-pulse flex items-center gap-1 sm:gap-2">
                  <div className="w-1 h-1 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                  Live
                </div>
              )}

              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={cn(
                  "w-9 h-9 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all",
                  isMuted ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {isMuted ? <MicOff size={16} className="sm:size-[24px]" /> : <Mic size={16} className="sm:size-[24px]" />}
              </button>
              
              {activeCall.type === 'video' && (
                <>
                  <button 
                    onClick={() => setIsCameraOff(!isCameraOff)}
                    className={cn(
                      "w-9 h-9 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all",
                      isCameraOff ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    {isCameraOff ? <VideoOff size={16} className="sm:size-[24px]" /> : <Video size={16} className="sm:size-[24px]" />}
                  </button>
                  <button 
                    onClick={() => setIsScreenSharing(!isScreenSharing)}
                    className={cn(
                      "w-9 h-9 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all",
                      isScreenSharing ? "bg-green-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    <Monitor size={16} className="sm:size-[24px]" />
                  </button>
                </>
              )}

              <button 
                onClick={handleEndCall}
                className="w-11 h-11 sm:w-16 sm:h-16 bg-red-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-red-600/40 hover:bg-red-700 transition-all hover:scale-110"
              >
                <PhoneOff size={20} className="sm:size-[32px]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade Popup */}
      <AnimatePresence>
        {showUpgradePopup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center text-yellow-600 mx-auto mb-6">
                <Maximize2 size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-2">Upgrade Required</h3>
              <p className="text-gray-500 mb-8">To add more than 20 participants, please upgrade using Coins. Your current balance: <span className="font-bold text-indigo-600">{userCoins} Coins</span></p>
              
              <div className="space-y-3 mb-8">
                <button 
                  onClick={() => handleUpgrade(50, 500)}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-between hover:border-indigo-500 border-2 border-transparent transition-all group"
                >
                  <div className="text-left">
                    <span className="font-bold block">50 Participants</span>
                    <span className="text-xs text-gray-400">Perfect for small groups</span>
                  </div>
                  <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">500 Coins</span>
                </button>
                <button 
                  onClick={() => handleUpgrade(100, 1000)}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-between hover:border-indigo-500 border-2 border-transparent transition-all group"
                >
                  <div className="text-left">
                    <span className="font-bold block">100 Participants</span>
                    <span className="text-xs text-gray-400">For larger communities</span>
                  </div>
                  <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">1000 Coins</span>
                </button>
                <button 
                  onClick={() => handleUpgrade(200, 2000)}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-between hover:border-indigo-500 border-2 border-transparent transition-all group"
                >
                  <div className="text-left">
                    <span className="font-bold block">200 Participants</span>
                    <span className="text-xs text-gray-400">Maximum capacity</span>
                  </div>
                  <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">2000 Coins</span>
                </button>
              </div>

              <button 
                onClick={() => setShowUpgradePopup(false)}
                className="text-gray-400 font-bold hover:text-gray-600 transition-colors"
              >
                Maybe Later
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
