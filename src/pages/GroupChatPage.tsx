import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Send, 
  Users, 
  MoreVertical, 
  Shield, 
  Info, 
  UserPlus, 
  X, 
  Phone, 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  Monitor, 
  PhoneOff, 
  Settings, 
  UserPlus as UserPlusIcon,
  Maximize2,
  User,
  Ban,
  Flag,
  Radio,
  Check,
  X as XIcon,
  MessageCircle,
  Plus,
  Play,
  Square,
  Trash2,
  Image as ImageIcon,
  Camera,
  Search,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import AgoraCall from '../components/AgoraCall';
import LiveChat from '../components/LiveChat';
import { v4 as uuidv4 } from 'uuid';
import io from 'socket.io-client';

interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  username: string;
  text: string;
  timestamp: string;
  type: string;
  audio_url?: string;
  image_url?: string;
}

interface GroupMember {
  id: string;
  username: string;
  role: string;
}

interface GroupInfo {
  id: string;
  name: string;
  description: string;
  image: string;
  members: GroupMember[];
}

export default function GroupChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [callError, setCallError] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<{ 
    id: string, 
    type: 'audio' | 'video', 
    status: 'calling' | 'active' | 'ended', 
    hostId: string,
    isLive?: boolean,
    streamId?: string
  } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callParticipants, setCallParticipants] = useState<any[]>([]);
  const [callCapacity, setCallCapacity] = useState(20);
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [userCoins, setUserCoins] = useState(0);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    if (profile) {
      setUserCoins(profile.coins || 0);
    }
  }, [profile]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<any>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchGroupInfo = async () => {
    try {
      const res = await fetch(`/api/groups/${id}?userId=${user?.id}`);
      const data = await res.json();
      setGroupInfo(data);
      if (data.activeCall) {
        setActiveCall({
          id: data.activeCall.id,
          type: data.activeCall.type,
          status: data.activeCall.status,
          hostId: data.activeCall.host_id,
          isLive: data.activeCall.is_live === 1,
          streamId: data.activeCall.stream_id,
          isSpeaker: data.activeCall.isSpeaker
        });
      }
      if (user && data.members) {
        setIsMember(data.members.some((m: any) => m.id === user.id));
      }
    } catch (err) {
      console.error("Error fetching group info:", err);
    }
  };

  const fetchMessages = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/groups/${id}/messages`);
      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      console.error("Error fetching group messages:", err);
    }
  };

  useEffect(() => {
    if (socketRef.current && id) {
      socketRef.current.emit('join_group', id);
      fetchMessages();
    }
  }, [id]);

  useEffect(() => {
    // Initialize Socket.IO
    const socket = io();
    socketRef.current = socket;

    socket.on('group_message', (message: GroupMessage) => {
      console.log('DEBUG: Received group message:', message);
      setMessages(prev => {
        if (prev.find(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    socket.on('group_history', (history: GroupMessage[]) => {
      console.log('DEBUG: Received group history:', history?.length, 'messages');
      setMessages(history || []);
    });

    socket.on('call:started', (data: any) => {
      // If I'm not in a call, show the incoming call notification or just join
      // For now, let's just set activeCall if not already in one
      setActiveCall(prev => prev ? prev : { 
        id: data.callId, 
        type: data.type, 
        status: 'active', 
        hostId: data.hostId 
      });
    });

    socket.on('call:ended', (data: any) => {
      setActiveCall(prev => {
        if (prev?.id === data.callId) return null;
        return prev;
      });
    });
    socket.on('call:user_joined', (data: any) => {
      setCallParticipants(prev => {
        if (prev.find(p => p.userId === data.userId)) return prev;
        return [...prev, data];
      });
    });

    socket.on('call:user_left', (data: any) => {
      setCallParticipants(prev => prev.filter(p => p.userId !== data.userId));
    });

    socket.on('call:is_live', (data: any) => {
      setActiveCall(prev => prev ? { ...prev, isLive: true, streamId: data.streamId } : null);
    });

    socket.on('call:new_request', (data: any) => {
      setJoinRequests(prev => [...prev, data]);
    });

    socket.on('call:request_resolved', (data: any) => {
      setJoinRequests(prev => prev.filter(r => r.requestId !== data.requestId));
      if (data.status === 'accepted' && data.userId === user?.id) {
        setActiveCall(prev => prev ? { ...prev, isSpeaker: true } : null);
      }
    });

    socket.on('call:viewer_count', (count: number) => {
      setViewerCount(count);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    fetchGroupInfo();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedFile) || !user || !id) return;

    if (!isMember) {
      alert("You must be a member of this group to send messages.");
      return;
    }

    let imageUrl = null;
    try {
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `chat/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath);
        
        imageUrl = publicUrl;
      }

      const messageData = {
        group_id: id,
        user_id: user.id,
        username: profile?.username || user.email?.split('@')[0],
        text: inputText.trim(),
        type: imageUrl ? 'image' : 'text',
        image_url: imageUrl,
        timestamp: new Date().toISOString()
      };

      socketRef.current.emit('send_group_message', messageData);

      setInputText('');
      setSelectedImage(null);
      setSelectedFile(null);
      
      // Fallback: fetch messages to ensure UI is in sync
      setTimeout(() => {
        fetchMessages();
      }, 500);
    } catch (err) {
      console.error("Error sending group message:", err);
      alert("Failed to send message");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      setSelectedImage(imageUrl);
    };
    reader.readAsDataURL(file);
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
    if (!user || !id) return;
    
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      
      const fileName = `${Date.now()}.webm`;
      const filePath = `voice-messages/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, blob);
        
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('posts')
        .getPublicUrl(filePath);

      const messageData = {
        group_id: id,
        user_id: user.id,
        username: profile?.username || user.email?.split('@')[0],
        text: 'Voice message',
        type: 'audio',
        audio_url: publicUrl,
        timestamp: new Date().toISOString()
      };

      socketRef.current.emit('send_group_message', messageData);
    } catch (err) {
      console.error("Error sending voice message:", err);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!user) return;
    setCallError(null);
    try {
      const res = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: user.id, type, groupId: id })
      });
      const data = await res.json();
      
      setActiveCall({ id: data.id, type, status: 'active', hostId: user.id });
      setCallCapacity(data.capacity);
      
      socketRef.current.emit('call:started', { 
        groupId: id,
        callId: data.id, 
        hostId: user.id,
        type 
      });

      socketRef.current.emit('call:join', { 
        callId: data.id, 
        userId: user.id, 
        username: profile?.username || user.email?.split('@')[0] 
      });
    } catch (err: any) {
      console.error('Failed to start call:', err);
      alert("Could not start call.");
    }
  };

  const handleEndCall = async () => {
    if (activeCall && user) {
      socketRef.current.emit('call:leave', { callId: activeCall.id, userId: user.id });
      if (activeCall.hostId === user.id) {
        socketRef.current.emit('call:ended', { groupId: id, callId: activeCall.id });
        await fetch(`/api/calls/${activeCall.id}/end`, { method: 'POST' });
      }
      setActiveCall(null);
      setCallParticipants([]);
      setJoinRequests([]);
      if (activeCall.isLive) {
        fetch(`/api/lives/${activeCall.id}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id })
        });
      }
    }
  };

  const handleGoLive = async () => {
    if (!activeCall || activeCall.hostId !== user?.id) return;

    try {
      const channelName = `live_${activeCall.id}`;
      const res = await fetch(`/api/lives/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, channelName })
      });
      const data = await res.json();
      
      setActiveCall(prev => prev ? { ...prev, isLive: true, streamId: data.id } : null);
      socketRef.current.emit('call:go_live', { callId: activeCall.id, streamId: data.id });
    } catch (err) {
      console.error('Failed to go live:', err);
    }
  };

  const handleGoLiveDirect = async () => {
    if (!user) return;
    try {
      // 1. Start a call first
      const resCall = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: user.id, type: 'video', groupId: id })
      });
      const callData = await resCall.json();
      
      // 2. Start a live session
      const channelName = `live_${callData.id}`;
      const resLive = await fetch(`/api/lives/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, channelName })
      });
      const liveData = await resLive.json();
      
      setActiveCall({ 
        id: callData.id, 
        type: 'video', 
        status: 'active', 
        hostId: user.id,
        isLive: true,
        streamId: liveData.id
      });
      
      socketRef.current.emit('call:join', { 
        callId: callData.id, 
        userId: user.id, 
        username: profile?.username || user.email?.split('@')[0] 
      });
      socketRef.current.emit('call:go_live', { callId: callData.id, streamId: liveData.id });
    } catch (err) {
      console.error('Failed to go live directly:', err);
      alert("Could not start live stream.");
    }
  };

  const handleRespondJoin = async (requestId: string, userId: string, status: 'accepted' | 'declined') => {
    if (!user) return;
    try {
      const res = await fetch(`/api/calls/${activeCall?.id}/respond-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, status, hostId: user.id })
      });
      if (res.ok) {
        setJoinRequests(prev => prev.filter(r => r.requestId !== requestId));
        socketRef.current.emit('call:respond_join', { callId: activeCall?.id, requestId, userId, status });
        if (status === 'accepted') {
          const request = joinRequests.find(r => r.requestId === requestId);
          if (request) {
            setCallParticipants(prev => [...prev, { userId: request.userId, username: request.username }]);
          }
        }
      }
    } catch (err) {
      console.error('Failed to respond to join request:', err);
    }
  };

  const handleUpgrade = async (capacity: number, cost: number) => {
    if (userCoins < cost) {
      alert('Insufficient Coins!');
      return;
    }

    try {
      const res = await fetch(`/api/calls/${activeCall?.id}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: user?.id, capacity, cost })
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

  const handleInvite = async (username: string, userId?: string, avatar?: string) => {
    try {
      const res = await fetch(`/api/groups/${id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, userId, avatar })
      });
      if (res.ok) {
        setIsInviteModalOpen(false);
        fetchGroupInfo();
        alert(`Successfully invited @${username}`);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to invite user');
      }
    } catch (err) {
      console.error("Error inviting user:", err);
    }
  };

  if (!groupInfo) return null;

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-black overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setIsMembersModalOpen(true)}>
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-200">
              <img src={groupInfo.image} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-bold text-sm">{groupInfo.name}</h1>
              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                <Users size={10} />
                <span>{groupInfo.members?.length || 0} members</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleStartCall('audio')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-400"
          >
            <Phone size={20} />
          </button>
          <button 
            onClick={() => handleStartCall('video')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-400"
          >
            <Video size={20} />
          </button>
          <button 
            onClick={handleGoLiveDirect}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-red-500"
            title="Go Live"
          >
            <Radio size={20} />
          </button>
          <button 
            onClick={() => setIsInfoOpen(!isInfoOpen)}
            className={cn(
              "p-2 rounded-full transition-colors",
              isInfoOpen ? "bg-indigo-100 text-indigo-600" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            )}
          >
            <Info size={20} />
          </button>
          <button 
            onClick={() => setIsInviteModalOpen(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <UserPlus size={20} className="text-indigo-600" />
          </button>
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <MoreVertical size={20} className="text-gray-400" />
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center mb-4">
              <Info size={32} className="text-indigo-600" />
            </div>
            <h3 className="font-bold text-sm mb-1">Welcome to {groupInfo.name}</h3>
            <p className="text-xs text-gray-500 max-w-[200px]">{groupInfo.description || 'This is the beginning of the group chat.'}</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isMe = msg.user_id === user?.id;
            const isImage = msg.type === 'image' || (msg.image_url && msg.image_url.startsWith('http'));
            const isVoice = msg.type === 'audio' || (msg.audio_url && msg.audio_url.startsWith('http'));
            const username = msg.username || 'User';
            const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn(
                  "flex items-end gap-2 max-w-[85%]",
                  isMe ? "ml-auto flex-row-reverse" : "mr-auto flex-row"
                )}
              >
                {!isMe && (
                  <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                )}
                <div className={cn(
                  "flex flex-col",
                  isMe ? "items-end" : "items-start"
                )}>
                  {!isMe && (
                    <span className="text-[10px] font-bold text-gray-500 mb-1 ml-1">@{username}</span>
                  )}
                  <div className={cn(
                    "px-4 py-2 rounded-2xl text-sm shadow-sm",
                    isMe 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : "bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-800 rounded-tl-none"
                  )}>
                    {isVoice ? (
                      <div className="flex items-center gap-3 min-w-[160px] py-1">
                        <button 
                          onClick={() => {
                            const audio = new Audio(msg.audio_url);
                            audio.play();
                          }}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                            isMe 
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
                    ) : isImage ? (
                      <div className="py-1">
                        <img 
                          src={msg.image_url} 
                          alt="Shared image" 
                          className="max-w-[250px] max-h-[250px] rounded-[12px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(msg.image_url, '_blank')}
                        />
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                  <span className="text-[8px] text-gray-400 mt-1 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 pb-12 lg:pb-4">
        {selectedImage && (
          <div className="relative inline-block mb-4">
            <img 
              src={selectedImage} 
              alt="Preview" 
              className="w-32 h-32 object-cover rounded-2xl border-2 border-indigo-600 shadow-lg"
            />
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
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
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
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-12 h-12 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-2xl flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              title="Take Photo"
            >
              <Camera size={20} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-2xl flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              title="Upload Image"
            >
              <ImageIcon size={20} />
            </button>
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message..."
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={startRecording}
              className="w-12 h-12 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-2xl flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              <Mic size={20} />
            </button>
            <button
              type="submit"
              disabled={!inputText.trim() && !selectedFile}
              className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none transition-all hover:bg-indigo-700"
            >
              <Send size={20} />
            </button>
          </form>
        )}
      </div>

      <AnimatePresence>
        {isInviteModalOpen && (
          <InviteModal 
            onClose={() => setIsInviteModalOpen(false)}
            onConfirm={handleInvite}
          />
        )}
        {isMembersModalOpen && (
          <MembersModal 
            members={groupInfo.members}
            onClose={() => setIsMembersModalOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Info Panel */}
      <AnimatePresence>
        {isInfoOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 z-20 shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold">Group Info</h3>
              <button onClick={() => setIsInfoOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center">
              <img src={groupInfo.image} alt="" className="w-24 h-24 rounded-2xl object-cover mb-4 border-4 border-indigo-500/20" />
              <h4 className="text-xl font-bold mb-1">{groupInfo.name}</h4>
              <p className="text-sm text-gray-500 mb-6">{groupInfo.members?.length || 0} members</p>
              
              <div className="w-full bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl mb-6 text-left">
                <span className="text-xs font-bold text-gray-400 uppercase mb-2 block">Description</span>
                <p className="text-sm">{groupInfo.description || 'No description yet.'}</p>
              </div>

              <div className="w-full space-y-3">
                <button 
                  onClick={() => { setIsInfoOpen(false); setIsMembersModalOpen(true); }}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
                >
                  <Users size={18} />
                  View Members
                </button>
                <button className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Ban size={18} />
                  Leave Group
                </button>
                <button className="w-full py-3 text-gray-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Flag size={18} />
                  Report Group
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Overlay */}
      <AnimatePresence>
        {activeCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            {/* Call Header */}
            <div className="p-4 flex items-center justify-between text-white bg-gradient-to-b from-black/50 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                  {activeCall.type === 'audio' ? <Phone size={20} /> : <Video size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{groupInfo.name}</h3>
                    {activeCall.isLive && (
                      <span className="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold animate-pulse">LIVE</span>
                    )}
                  </div>
                  <p className="text-xs opacity-80">
                    {activeCall.status === 'calling' ? 'Calling...' : `${callParticipants.length + 1} participants • ${activeCall.type === 'audio' ? 'Audio' : 'Video'} Call`}
                    {activeCall.isLive && ` • ${viewerCount} Viewers`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {activeCall.hostId === user?.id && !activeCall.isLive && (
                  <button 
                    onClick={handleGoLive}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-600/20"
                  >
                    <Radio size={16} />
                    Go Live
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (callParticipants.length + 1 >= callCapacity) {
                      setShowUpgradePopup(true);
                      return;
                    }
                    const mockId = Math.random().toString(36).substr(2, 9);
                    setCallParticipants(prev => [...prev, { userId: mockId, username: `user_${mockId}` }]);
                  }} 
                  className="p-2 hover:bg-white/10 rounded-full flex items-center gap-2"
                >
                  <UserPlusIcon size={20} />
                  <span className="text-xs font-bold">Add</span>
                </button>
                <button className="p-2 hover:bg-white/10 rounded-full"><Settings size={20} /></button>
              </div>
            </div>

            {/* Call Content */}
            <div className="flex-1 relative overflow-y-auto flex flex-col md:flex-row">
              <AgoraCall 
                appId={import.meta.env.VITE_AGORA_APP_ID || ""}
                channelName={activeCall.isLive ? `live_${activeCall.id}` : `call_${activeCall.id}`}
                uid={user?.id || ""}
                role={(activeCall.hostId === user?.id || activeCall.isSpeaker) ? "host" : "audience"}
                type={activeCall.type as 'audio' | 'video'}
                onLeave={handleEndCall}
              />

              {/* Sidebar for Live Mode (Requests & Chat) */}
              {activeCall.isLive && (
                <div className="w-full md:w-80 flex flex-col gap-4 p-4 bg-black/40 backdrop-blur-xl border-l border-white/10">
                  {/* Join Requests */}
                  {activeCall.hostId === user?.id && (
                    <div className="bg-white/5 backdrop-blur-md rounded-3xl p-4 border border-white/10">
                      <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                        <UserPlusIcon size={16} className="text-indigo-400" />
                        Join Requests ({joinRequests.length})
                      </h4>
                      <div className="space-y-3 max-h-48 overflow-y-auto no-scrollbar">
                        {joinRequests.length === 0 ? (
                          <p className="text-white/40 text-xs text-center py-4">No pending requests</p>
                        ) : (
                          joinRequests.map((req) => (
                            <div key={req.requestId} className="bg-white/5 rounded-2xl p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
                                  {req.username[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-white text-xs font-bold">@{req.username}</p>
                                  <p className="text-yellow-400 text-[10px] font-bold">{req.amount} Coins</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => handleRespondJoin(req.requestId, req.userId, 'accepted')}
                                  className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                >
                                  <Check size={14} />
                                </button>
                                <button 
                                  onClick={() => handleRespondJoin(req.requestId, req.userId, 'declined')}
                                  className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                >
                                  <XIcon size={14} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Live Chat */}
                  <div className="flex-1 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-white/10 flex items-center gap-2">
                      <MessageCircle size={16} className="text-indigo-400" />
                      <h4 className="text-white font-bold text-sm">Live Chat</h4>
                    </div>
                    <LiveChat liveId={activeCall.streamId || activeCall.id} />
                  </div>
                </div>
              )}
            </div>

            {/* Call Controls */}
            <div className="p-8 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center transition-all",
                  isMuted ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              
              {activeCall.type === 'video' && (
                <>
                  <button 
                    onClick={() => setIsCameraOff(!isCameraOff)}
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center transition-all",
                      isCameraOff ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    {isCameraOff ? <VideoOff size={24} /> : <Video size={24} />}
                  </button>
                  <button 
                    onClick={() => setIsScreenSharing(!isScreenSharing)}
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center transition-all",
                      isScreenSharing ? "bg-green-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    <Monitor size={24} />
                  </button>
                </>
              )}

              <button 
                onClick={handleEndCall}
                className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-red-600/40 hover:bg-red-700 transition-all hover:scale-110"
              >
                <PhoneOff size={32} />
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

function InviteModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (username: string, userId?: string, avatar?: string) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length > 2) {
      const timer = setTimeout(() => {
        searchUsers();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
    }
  }, [searchQuery]);

  const searchUsers = async () => {
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      
      // Map local user fields to what the component expects
      const formattedResults = data.map((u: any) => ({
        id: u.id,
        username: u.username,
        display_name: u.full_name || u.username,
        avatar_url: u.avatar
      }));
      
      setResults(formattedResults || []);
    } catch (err) {
      console.error('Error searching users for invite:', err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Invite Member</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Search User</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username or name..."
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
            {searching ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin text-indigo-600" /></div>
            ) : results.length > 0 ? (
              results.map(user => (
                <div 
                  key={user.id} 
                  onClick={() => onConfirm(user.username, user.id, user.avatar_url)}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors border border-transparent hover:border-indigo-500/20"
                >
                  <img src={user.avatar_url || `https://picsum.photos/seed/${user.id}/100/100`} className="w-10 h-10 rounded-full object-cover" alt="" />
                  <div>
                    <p className="font-bold text-sm">@{user.username}</p>
                    <p className="text-[10px] text-gray-500">{user.display_name}</p>
                  </div>
                </div>
              ))
            ) : searchQuery.length > 2 ? (
              <p className="text-center py-4 text-sm text-gray-500">No users found</p>
            ) : null}
          </div>

          {!searchQuery && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
              <p className="text-xs text-indigo-600 dark:text-indigo-400 text-center font-medium">
                Search for users to invite them to the group.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function MembersModal({ members, onClose }: { members: GroupMember[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Group Members</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-4 no-scrollbar">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <span className="text-indigo-600 font-bold">{member.username[0].toUpperCase()}</span>
                </div>
                <div>
                  <p className="font-bold text-sm">@{member.username}</p>
                  <p className="text-[10px] text-gray-500 capitalize">{member.role}</p>
                </div>
              </div>
              {member.role === 'creator' && (
                <Shield size={16} className="text-yellow-500" />
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
