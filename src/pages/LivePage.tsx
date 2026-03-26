import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Users, 
  Heart, 
  MessageCircle, 
  Share2, 
  Gift, 
  Coins, 
  Plus,
  Send,
  Zap,
  MoreVertical,
  Home,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Settings,
  Radio,
  ShoppingBag,
  Package,
  CreditCard,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { cn } from '../lib/utils';
import { MOCK_USER } from '../constants';
import CameraFilters, { CAMERA_FILTERS, Filter } from '../components/CameraFilters';
import FaceFilterEngine from '../components/FaceFilterEngine';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../lib/apiOrigin';

// Game Types
type GameType = 'coin_rain' | 'gift_bomb' | 'power_duel' | 'live_kingdom' | 'spin_storm';

interface LiveProduct {
  id: string;
  title: string;
  price: number;
  image: string;
  stock: number;
  category: string;
}

interface PurchaseAlert {
  id: string;
  buyerName: string;
  productTitle: string;
}

// Live Categories
const LIVE_CATEGORIES = [
  { id: 'gaming', name: 'Gaming', icon: '🎮' },
  { id: 'music', name: 'Music', icon: '🎵' },
  { id: 'chatting', name: 'Just Chatting', icon: '💬' },
  { id: 'education', name: 'Education', icon: '📚' },
  { id: 'fashion', name: 'Fashion & Beauty', icon: '💄' },
  { id: 'food', name: 'Food & Drink', icon: '🍳' },
  { id: 'tech', name: 'Tech & Science', icon: '🔬' },
  { id: 'fitness', name: 'Fitness & Health', icon: '💪' },
  { id: 'art', name: 'Art & Creative', icon: '🎨' },
];

// Stream Quality Options
const QUALITY_OPTIONS = [
  { id: '480p', name: '480p', desc: 'SD', width: 854, height: 480 },
  { id: '720p', name: '720p', desc: 'HD', width: 1280, height: 720 },
  { id: '1080p', name: '1080p', desc: 'FHD', width: 1920, height: 1080 },
];

export default function LivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const streamId = searchParams.get('id') || 'default_stream';
  const isHost = searchParams.get('host') === 'true';
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<any>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  const [comments, setComments] = useState([
    { id: 1, user: 'sarah_j', text: 'Wow, amazing performance! 🔥', avatar: 'https://picsum.photos/seed/sarah/100/100' },
    { id: 2, user: 'tech_guru', text: 'Love the energy here!', avatar: 'https://picsum.photos/seed/tech/100/100' },
    { id: 3, user: 'alex_vibe', text: 'Sent a Rose! 🌹', avatar: 'https://picsum.photos/seed/alex/100/100', isGift: true },
  ]);
  const [newComment, setNewComment] = useState('');
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [isSupportPanelOpen, setIsSupportPanelOpen] = useState(false);
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [streamSummary, setStreamSummary] = useState<any>(null);
  const [activeGifts, setActiveGifts] = useState<any[]>([]);
  const [floatingHearts, setFloatingHearts] = useState<any[]>([]);
  const [likes, setLikes] = useState(1200);
  const [isLiked, setIsLiked] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [liveStreams, setLiveStreams] = useState<any[]>([]);
  const [liveCalls, setLiveCalls] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<any[]>([]);
  const [isLiveCall, setIsLiveCall] = useState(false);
  const [isLiveStarted, setIsLiveStarted] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [streamDescription, setStreamDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('chatting');
  const [selectedQuality, setSelectedQuality] = useState('720p');
  const [selectedPrivacy, setSelectedPrivacy] = useState('public');
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [selectedFilterId, setSelectedFilterId] = useState('none');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Live Selling States
  const [isLiveSelling, setIsLiveSelling] = useState(false);
  const [liveProducts, setLiveProducts] = useState<LiveProduct[]>([]);
  const [isProductSelectionOpen, setIsProductSelectionOpen] = useState(false);
  const [inventory, setInventory] = useState<LiveProduct[]>([]);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>([]);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [productToBuy, setProductToBuy] = useState<LiveProduct | null>(null);
  const [purchaseAlerts, setPurchaseAlerts] = useState<PurchaseAlert[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'coins' | 'wallet' | 'card'>('coins');
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  const [activeGame, setActiveGame] = useState<{ type: GameType; id: string; data?: any } | null>(null);
  const [gameLeaderboard, setGameLeaderboard] = useState<any[]>([]);
  const [gameTimer, setGameTimer] = useState(0);
  const [duelScores, setDuelScores] = useState({ streamer: 0, opponent: 0 });
  const [kingdomStats, setKingdomStats] = useState({ kingdomA: 0, kingdomB: 0, dominant: '' });
  const [selectedKingdom, setSelectedKingdom] = useState<'kingdomA' | 'kingdomB' | null>(null);

  useEffect(() => {
    const fetchStreams = async () => {
      try {
        const [streamsRes, callsRes] = await Promise.all([
          fetch(apiUrl('/api/streams')),
          fetch(apiUrl('/api/live-calls'))
        ]);
        const streamsData = await streamsRes.json();
        const callsData = await callsRes.json();
        setLiveStreams(streamsData);
        setLiveCalls(callsData);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to fetch streams:', err);
        setIsLoading(false);
      }
    };

    if (!searchParams.get('id')) {
      fetchStreams();
    } else {
      // Check if this is a live call
      const checkCall = async () => {
        try {
          const res = await fetch(apiUrl('/api/live-calls'));
          const calls = await res.json();
          const call = calls.find((c: any) => c.stream_id === streamId);
          if (call) {
            setIsLiveCall(true);
            // In a real app, we'd fetch participants/speakers
            setActiveSpeakers([{ userId: call.host_id, username: call.host_username }]);
          }
        } catch (err) {
          console.error('Error checking call status:', err);
        }
      };
      checkCall();
    }

    // Initialize Socket
    socketRef.current = io(window.location.origin);
    const socket = socketRef.current;

    const joinRoom = () => {
      socket.emit('join_live', streamId);
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on('connect', joinRoom);

    socket.on('game_started', (data) => {
      setActiveGame({ type: data.gameType, id: data.gameId, data });
      if (data.duration) setGameTimer(data.duration);
    });

    socket.on('game_ended', (data) => {
      alert(`Game Over! Winner: ${data.winner}${data.prize ? ` - Prize: ${data.prize}` : ''}`);
      setActiveGame(null);
      setGameLeaderboard([]);
      setGameTimer(0);
    });

    socket.on('leaderboard_update', (data) => {
      setGameLeaderboard(data.leaderboard);
    });

    socket.on('duel_update', (data) => {
      setDuelScores({ streamer: data.streamerScore, opponent: data.opponentScore });
    });

    socket.on('kingdom_update', (data) => {
      setKingdomStats(data);
    });

    socket.on('gift_bomb_update', (data) => {
      setActiveGame(prev => prev ? { ...prev, data: { ...prev.data, current: data.current } } : null);
    });

    socket.on('live_selling:alert', (data) => {
      const alert: PurchaseAlert = {
        id: Date.now().toString(),
        buyerName: data.buyerName,
        productTitle: data.productTitle
      };
      setPurchaseAlerts(prev => [...prev, alert]);
      setTimeout(() => {
        setPurchaseAlerts(prev => prev.filter(a => a.id !== alert.id));
      }, 5000);
    });

    socket.on('live_selling:stock_update', (data) => {
      setLiveProducts(prev => prev.map(p => 
        p.id === data.productId ? { ...p, stock: Math.max(0, p.stock - 1) } : p
      ));
    });

    socket.on('call:new_request', (data: any) => {
      if (isHost) setJoinRequests(prev => [...prev, data]);
    });

    socket.on('call:request_resolved', (data: any) => {
      if (isHost) setJoinRequests(prev => prev.filter(r => r.requestId !== data.requestId));
      if (data.status === 'accepted' && user && data.userId === user.id) {
        alert('Your request to join as speaker was accepted!');
        // Logic to join as speaker (WebRTC)
      }
    });

    socket.on('stream_ended', (data) => {
      setStreamSummary(data.summary);
      setIsLiveStarted(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setStream(null);
    });

    return () => {
      socket.disconnect();
    };
  }, [streamId]);

  useEffect(() => {
    if (gameTimer > 0) {
      const timer = setInterval(() => setGameTimer(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [gameTimer]);

  const GIFTS = [
    { id: 'rose', name: 'Rose', price: 1, icon: '🌹', animation: 'small' },
    { id: 'heart', name: 'Heart', price: 10, icon: '💖', animation: 'small' },
    { id: 'diamond', name: 'Diamond', price: 100, icon: '💎', animation: 'medium' },
    { id: 'rocket', name: 'Rocket', price: 500, icon: '🚀', animation: 'large' },
    { id: 'lion', name: 'Lion', price: 1000, icon: '🦁', animation: 'extra-large' },
  ];

  const handleSendGift = (gift: any) => {
    if (!user) return;
    const giftAnim = {
      id: Date.now(),
      user: user.username,
      giftName: gift.name,
      icon: gift.icon,
      animation: gift.animation
    };
    setActiveGifts(prev => [...prev, giftAnim]);
    setComments(prev => [...prev, { 
      id: Date.now(), 
      user: user.username, 
      text: `Sent a ${gift.name}! ${gift.icon}`, 
      avatar: user.avatar_url || MOCK_USER.avatar, 
      isGift: true 
    }]);
    setIsGiftModalOpen(false);
    
    // Remove animation after 4 seconds
    setTimeout(() => {
      setActiveGifts(prev => prev.filter(g => g.id !== giftAnim.id));
    }, 4000);
  };

  const handleEndStream = () => {
    if (isHost) {
      if (window.confirm("Are you sure you want to end your live stream?")) {
        // Emit to server
        socketRef.current?.emit("end_stream", { streamId });
        
        // Local cleanup
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        setStream(null);
        setIsLiveStarted(false);
        
        // If socket is disconnected, we won't get the stream_ended event
        // so we set a fallback summary or redirect
        if (!socketRef.current?.connected) {
          setStreamSummary({
            viewer_count: 0,
            started_at: new Date().toISOString(),
            ended_at: new Date().toISOString()
          });
        }
      }
    } else {
      // Viewer leaving
      navigate('/');
    }
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikes(prev => isLiked ? prev - 1 : prev + 1);
    
    // Add floating hearts
    const newHearts = Array.from({ length: 5 }).map((_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100 - 50, // Random horizontal offset
    }));
    setFloatingHearts(prev => [...prev, ...newHearts]);
    
    // Remove hearts after animation
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
    }, 2000);
  };

  const handleSendSupport = (amount: number) => {
    if (!user) return;
    setComments(prev => [...prev, { 
      id: Date.now(), 
      user: user.username, 
      text: `Supported the creator with ${amount} Coins! 💰`, 
      avatar: user.avatar_url || MOCK_USER.avatar, 
      isGift: true 
    }]);
    setIsSupportPanelOpen(false);
    alert(`Thank you for supporting with ${amount} Coins!`);
  };

  useEffect(() => {
    if (isHost && !isLiveStarted) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(s => {
          setPreviewStream(s);
        })
        .catch(err => {
          console.error("Error accessing preview camera:", err);
        });
    }
    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isHost, isLiveStarted]);

  const startStream = async () => {
    setPermissionError(null);
    setIsConnecting(true);
    try {
      // Stop preview stream first to avoid conflicts
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
        setPreviewStream(null);
      }

      const quality = QUALITY_OPTIONS.find(q => q.id === selectedQuality) || QUALITY_OPTIONS[1];
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: quality.width },
          height: { ideal: quality.height }
        },
        audio: true
      });
      setStream(mediaStream);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      if (!user) return;
      socketRef.current?.emit("start_stream", { 
        streamId, 
        streamerId: user.id,
        title: streamTitle || `${user.username}'s Live`,
        description: streamDescription,
        category: selectedCategory,
        quality: selectedQuality,
        privacy: selectedPrivacy
      });
      
      setIsLiveStarted(true);
      setIsConnecting(false);
    } catch (err: any) {
      console.error("Error accessing media devices:", err);
      let errorMsg = "Permission denied";
      if (err.name === 'NotAllowedError' || err.message?.includes('denied')) {
        errorMsg = "Camera/Microphone permission was denied. Please enable it in your browser settings.";
      } else if (err.name === 'NotFoundError') {
        errorMsg = "No camera or microphone found on this device.";
      } else if (err.message?.includes('dismissed')) {
        errorMsg = "Permission prompt was dismissed. Please click 'Start Stream' again and allow access.";
      }
      setPermissionError(errorMsg);
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    // Only auto-start if it's NOT a host (viewer) or if we've already started
    if (isHost && isLiveStarted) {
      startStream();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isHost, isLiveStarted]);

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && !selectedImage) return;
    if (!user) return;
    
    const comment = { 
      id: Date.now(), 
      user: user.username, 
      text: newComment.trim() || 'Shared an image', 
      avatar: user.avatar_url || MOCK_USER.avatar,
      imageUrl: selectedImage 
    };
    
    setComments([...comments, comment]);
    setNewComment('');
    setSelectedImage(null);
    
    // Emit to socket if needed
    socketRef.current?.emit('send_live_comment', {
      streamId,
      ...comment
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      setSelectedImage(imageUrl);
    };
    reader.readAsDataURL(file);
  };

  const fetchInventory = async () => {
    if (!user) return;
    try {
      const res = await fetch(apiUrl(`/api/inventory/${user.id}`));
      const data = await res.json();
      setInventory(data);
    } catch (err) {
      console.error("Error fetching inventory:", err);
    }
  };

  const startLiveSelling = async () => {
    if (!user) return;
    try {
      const res = await fetch(apiUrl('/api/live-selling/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamerId: user.id,
          productIds: selectedInventoryIds
        })
      });
      const data = await res.json();
      setIsLiveSelling(true);
      setIsProductSelectionOpen(false);
      
      // Fetch products for the session
      const prodRes = await fetch(apiUrl(`/api/live-selling/${data.sessionId}/products`));
      const prodData = await prodRes.json();
      setLiveProducts(prodData);
    } catch (err) {
      console.error("Error starting live selling:", err);
    }
  };

  const handlePurchase = async () => {
    // ... existing purchase logic ...
  };

  const handleRequestJoin = async () => {
    if (!user) return;
    const amount = 50; // Paid request
    if (user.coins < amount) {
      alert('Insufficient coins to request join');
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/calls/${streamId}/request-join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amount })
      });
      const data = await res.json();
      if (data.success) {
        alert('Request sent to host!');
        socketRef.current.emit('call:request_join', { 
          callId: streamId, 
          requestId: data.requestId, 
          userId: user.id, 
          username: user.username,
          amount 
        });
      }
    } catch (err) {
      console.error('Failed to request join:', err);
    }
  };

  if (!searchParams.get('id') && !isHost) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black p-4 lg:p-8 pb-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-black italic uppercase tracking-tighter flex items-center gap-3">
              <Radio className="text-red-500 animate-pulse" size={32} />
              Live Discovery
            </h1>
            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-1 rounded-full border border-gray-200 dark:border-gray-800">
              <button className="px-6 py-2 rounded-full bg-indigo-600 text-white font-bold text-sm">All</button>
              <button className="px-6 py-2 rounded-full text-gray-500 font-bold text-sm">Gaming</button>
              <button className="px-6 py-2 rounded-full text-gray-500 font-bold text-sm">Music</button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-[9/16] bg-gray-200 dark:bg-gray-800 rounded-3xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {/* Live Calls */}
              {liveCalls.map((call) => (
                <div 
                  key={call.id}
                  onClick={() => navigate(`/live?id=${call.stream_id}`)}
                  className="aspect-[9/16] bg-gray-900 rounded-3xl overflow-hidden relative group cursor-pointer border-2 border-transparent hover:border-indigo-500 transition-all shadow-xl"
                >
                  <img src={call.group_image} alt="" className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
                  
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider animate-pulse">LIVE CALL</span>
                    <span className="bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                      <Users size={10} />
                      {Math.floor(Math.random() * 1000)}
                    </span>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-white font-bold text-lg mb-1 line-clamp-1">{call.group_name}</h3>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                        {call.host_username[0].toUpperCase()}
                      </div>
                      <span className="text-white/60 text-xs">@{call.host_username}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Regular Streams */}
              {liveStreams.map((s) => (
                <div 
                  key={s.id}
                  onClick={() => navigate(`/live?id=${s.id}`)}
                  className="aspect-[9/16] bg-gray-900 rounded-3xl overflow-hidden relative group cursor-pointer border-2 border-transparent hover:border-indigo-500 transition-all shadow-xl"
                >
                  <img src={`https://picsum.photos/seed/${s.id}/400/700`} alt="" className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
                  
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider">LIVE</span>
                    {s.category && (
                      <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                        {s.category}
                      </span>
                    )}
                    <span className="bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                      <Users size={10} />
                      {s.viewer_count}
                    </span>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-white font-bold text-lg mb-1 line-clamp-1">{s.title || 'Amazing Live Stream'}</h3>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white">
                        {s.streamer_avatar ? (
                          <img src={s.streamer_avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          s.streamer_username?.[0]?.toUpperCase() || 'S'
                        )}
                      </div>
                      <span className="text-white/60 text-xs">@{s.streamer_username || 'streamer'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col md:flex-row overflow-hidden">
      {/* Video Area */}
      <div className="relative w-full h-full md:flex-1 bg-gray-900 overflow-hidden flex items-center justify-center">
        {isLiveCall ? (
          <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-2 bg-black">
            {activeSpeakers.map((speaker, i) => (
              <div key={i} className="relative bg-gray-800 rounded-2xl overflow-hidden aspect-video">
                <img src={`https://picsum.photos/seed/${speaker.userId}/400/300`} alt="" className="w-full h-full object-cover opacity-60" />
                <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white font-bold">
                  {speaker.username}
                </div>
              </div>
            ))}
            {/* Fill remaining slots with placeholders if needed */}
            {[...Array(Math.max(0, 6 - activeSpeakers.length))].map((_, i) => (
              <div key={`empty-${i}`} className="bg-gray-900/50 rounded-2xl border border-white/5 flex items-center justify-center aspect-video">
                <Users size={24} className="text-white/10" />
              </div>
            ))}
          </div>
        ) : isHost ? (
          <div className="relative h-full w-full flex items-center justify-center bg-black overflow-y-auto custom-scrollbar">
            {!isLiveStarted ? (
              <div className="w-full max-w-4xl p-6 md:p-12">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col lg:flex-row"
                >
                  {/* Camera Preview Section */}
                  <div className="lg:w-1/2 relative bg-black aspect-video lg:aspect-auto flex items-center justify-center overflow-hidden">
                      <div className={cn(
                        "w-full h-full transition-all duration-500",
                        CAMERA_FILTERS.find(f => f.id === selectedFilterId)?.type === 'css' 
                          ? CAMERA_FILTERS.find(f => f.id === selectedFilterId)?.class 
                          : ''
                      )}>
                        <FaceFilterEngine 
                          stream={previewStream}
                          selectedFilter={CAMERA_FILTERS.find(f => f.id === selectedFilterId)}
                          onCanvasReady={(canvas) => {
                            // We don't need to record the preview canvas usually, 
                            // but we might need it for the actual stream later
                          }}
                          isRecording={false}
                        />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
                      
                      {/* Filter Selection Overlay in Preview */}
                      <div className="absolute bottom-4 left-0 right-0 z-20">
                        <CameraFilters 
                          selectedFilterId={selectedFilterId}
                          onFilterSelect={setSelectedFilterId}
                        />
                      </div>

                      <div className="absolute top-8 left-8">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Camera Preview</span>
                      </div>
                      <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter line-clamp-1">
                        {streamTitle || "Your Live Stream"}
                      </h2>
                    </div>
                  </div>

                  {/* Setup Form Section */}
                  <div className="lg:w-1/2 p-8 md:p-10 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20">
                        <Radio size={24} className="text-white animate-pulse" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Live Setup</h2>
                        <p className="text-gray-400 text-[10px] uppercase tracking-wider">Configure your broadcast</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Stream Title</label>
                            <span className={cn(
                              "text-[8px] font-bold",
                              streamTitle.length >= 100 ? "text-red-500" : "text-gray-500"
                            )}>
                              {streamTitle.length}/100
                            </span>
                          </div>
                          <input 
                            type="text" 
                            maxLength={100}
                            value={streamTitle}
                            onChange={(e) => setStreamTitle(e.target.value)}
                            placeholder="e.g. Live DJ Set: Sunset Vibes 🎧" 
                            className={cn(
                              "w-full bg-white/5 border rounded-xl py-3 px-4 text-white placeholder-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm",
                              streamTitle.length > 0 && !streamTitle.trim() ? "border-red-500/50" : "border-white/10"
                            )}
                          />
                          {streamTitle.length > 0 && !streamTitle.trim() && (
                            <p className="text-[8px] text-red-500 font-bold uppercase tracking-wider">Title cannot be just whitespace</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Privacy</label>
                          <select 
                            value={selectedPrivacy}
                            onChange={(e) => setSelectedPrivacy(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm appearance-none"
                          >
                            <option value="public" className="bg-gray-900">Public</option>
                            <option value="private" className="bg-gray-900">Private</option>
                            <option value="followers" className="bg-gray-900">Followers Only</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Description</label>
                          <span className={cn(
                            "text-[8px] font-bold",
                            streamDescription.length >= 500 ? "text-red-500" : "text-gray-500"
                          )}>
                            {streamDescription.length}/500
                          </span>
                        </div>
                        <textarea 
                          maxLength={500}
                          value={streamDescription}
                          onChange={(e) => setStreamDescription(e.target.value)}
                          placeholder="Tell your viewers what's happening in your stream! (e.g. Playing some chill lo-fi beats and chatting with the community...)" 
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm min-h-[100px] resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Category</label>
                        <div className="grid grid-cols-3 gap-2">
                          {LIVE_CATEGORIES.slice(0, 6).map((cat) => (
                            <button 
                              key={cat.id}
                              onClick={() => setSelectedCategory(cat.id)}
                              className={cn(
                                "flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group",
                                selectedCategory === cat.id 
                                  ? "bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-500/20" 
                                  : "bg-white/5 border-white/10 hover:bg-white/10"
                              )}
                            >
                              <span className="text-lg group-hover:scale-110 transition-transform">{cat.icon}</span>
                              <span className={cn(
                                "text-[8px] font-bold uppercase tracking-wider",
                                selectedCategory === cat.id ? "text-white" : "text-gray-500"
                              )}>{cat.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Stream Quality</label>
                        <div className="flex gap-2">
                          {QUALITY_OPTIONS.map((q) => (
                            <button 
                              key={q.id}
                              onClick={() => setSelectedQuality(q.id)}
                              className={cn(
                                "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border transition-all",
                                selectedQuality === q.id 
                                  ? "bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-500/20" 
                                  : "bg-white/5 border-white/10 hover:bg-white/10"
                              )}
                            >
                              <span className={cn(
                                "text-xs font-bold",
                                selectedQuality === q.id ? "text-white" : "text-gray-300"
                              )}>{q.name}</span>
                              <span className="text-[7px] text-gray-500 uppercase font-black tracking-widest">{q.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button 
                          onClick={() => navigate('/')}
                          className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white transition-colors border border-white/10 text-sm"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={startStream}
                          disabled={isConnecting}
                          className="flex-[2] bg-indigo-600 disabled:bg-gray-800/50 disabled:text-gray-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm relative overflow-hidden"
                        >
                          {isConnecting ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Connecting...</span>
                            </>
                          ) : (
                            <>
                              <Zap size={18} />
                              <span>Start Broadcast</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            ) : permissionError ? (
              <div className="flex flex-col items-center gap-6 p-8 text-center max-w-md">
                <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                  <VideoOff size={40} className="text-red-500" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-xl mb-2">Permission Required</h3>
                  <p className="text-gray-400 text-sm">
                    We need access to your camera and microphone to start the stream. 
                    Please ensure you've granted permissions in your browser settings.
                  </p>
                  {permissionError && (
                    <p className="text-red-500/60 text-[10px] mt-4 font-mono">
                      Error: {permissionError}
                    </p>
                  )}
                </div>
                <div className="flex gap-4 w-full">
                  <button 
                    onClick={() => navigate('/')}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white transition-colors border border-white/10"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={startStream}
                    className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={cn(
                  "h-full w-full transition-all duration-500",
                  isCameraOff && "hidden",
                  CAMERA_FILTERS.find(f => f.id === selectedFilterId)?.type === 'css' 
                    ? CAMERA_FILTERS.find(f => f.id === selectedFilterId)?.class 
                    : ''
                )}>
                  <FaceFilterEngine 
                    stream={stream}
                    selectedFilter={CAMERA_FILTERS.find(f => f.id === selectedFilterId)}
                    onCanvasReady={(canvas) => {
                      // We can capture the stream from here if needed
                    }}
                    isRecording={isLiveStarted}
                  />
                </div>
                
                {/* Real-time Filter Controls during Live */}
                <div className="absolute bottom-32 left-0 right-0 z-20 pointer-events-none">
                  <AnimatePresence>
                    {isFiltersOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="pointer-events-auto"
                      >
                        <CameraFilters 
                          selectedFilterId={selectedFilterId}
                          onFilterSelect={setSelectedFilterId}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Filter Toggle Button */}
                <div className="absolute bottom-24 right-4 z-30">
                  <button 
                    onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all",
                      isFiltersOpen ? "bg-indigo-600 text-white" : "bg-black/40 text-white hover:bg-black/60"
                    )}
                  >
                    <Sparkles size={24} />
                  </button>
                </div>

                {isCameraOff && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center">
                      <VideoOff size={40} className="text-gray-600" />
                    </div>
                    <p className="text-gray-500 font-bold">Camera is Off</p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <video 
            autoPlay 
            muted 
            loop 
            playsInline
            className="h-full w-full object-cover"
            src="https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

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
                      <span className="text-indigo-400">{gift.user}</span> sent a <span className="text-yellow-400">{gift.giftName}</span>
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

        {/* Dominant Kingdom Banner */}
        <AnimatePresence>
          {kingdomStats.dominant && (
            <motion.div 
              initial={{ y: -100 }}
              animate={{ y: 0 }}
              exit={{ y: -100 }}
              className={cn(
                "absolute top-0 left-0 right-0 h-1 z-[60] transition-colors duration-500",
                kingdomStats.dominant === 'kingdomA' ? "bg-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.8)]" : "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)]"
              )}
            >
              <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-1 rounded-b-xl border-x border-b border-white/10 flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  kingdomStats.dominant === 'kingdomA' ? "bg-indigo-500" : "bg-red-500"
                )} />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">
                  {kingdomStats.dominant === 'kingdomA' ? 'Kingdom A Dominating' : 'Kingdom B Dominating'}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Purchase Alerts Overlay */}
        <div className="absolute top-24 left-4 z-[110] pointer-events-none space-y-2">
          <AnimatePresence>
            {purchaseAlerts.map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -50, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.8 }}
                className="bg-indigo-600/90 backdrop-blur-md text-white px-4 py-2 rounded-2xl border border-white/20 shadow-xl flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <ShoppingBag size={16} />
                </div>
                <div className="text-xs">
                  <p className="font-bold"><span className="text-yellow-400">{alert.buyerName}</span> just bought</p>
                  <p className="opacity-80 truncate max-w-[150px]">{alert.productTitle}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Top Header Overlay */}
        <div className="absolute top-4 md:top-6 left-4 md:left-6 right-4 md:right-6 flex items-start justify-between z-10 pointer-events-none">
          <div className="flex items-start gap-2 md:gap-4 pointer-events-auto">
            <div className="flex flex-col gap-2 md:gap-4">
              <button 
                onClick={() => navigate('/')}
                className="flex items-center gap-2 bg-black/40 md:bg-white/10 backdrop-blur-md hover:bg-white/20 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-white/10 transition-all font-bold text-[10px] md:text-sm shadow-lg"
              >
                <Home size={14} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">Home</span>
              </button>
              
              <div className="flex items-center gap-1.5 md:gap-2">
                <div className="bg-red-500 text-white px-1.5 md:px-2 py-0.5 rounded text-[8px] md:text-[10px] font-bold animate-pulse">LIVE</div>
                <div className="bg-black/40 backdrop-blur-md text-white px-1.5 md:px-2 py-0.5 rounded text-[8px] md:text-[10px] font-bold">00:00:00</div>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3 bg-black/40 backdrop-blur-md p-1 md:p-1.5 pr-3 md:pr-4 rounded-full border border-white/10 h-fit">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border-2 border-red-500">
                <img src={isHost ? MOCK_USER.avatar : "https://picsum.photos/seed/host/100/100"} alt="Host" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h4 className="text-white font-bold text-[10px] md:text-sm leading-none">{isHost ? "You" : "Live Host"}</h4>
                <span className="text-white/60 text-[8px] md:text-[10px]">{isHost ? "0" : "1.2K"} viewers</span>
              </div>
              {!isHost && <button className="bg-red-500 text-white px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[8px] md:text-xs font-bold ml-1 md:ml-2">Follow</button>}
            </div>
          </div>

          {isHost && (
            <div className="flex items-center gap-1.5 md:gap-2 pointer-events-auto">
              <button 
                onClick={handleEndStream}
                className="bg-red-600 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg shadow-red-600/20 flex items-center gap-1"
              >
                <X size={12} />
                End
              </button>
              <button 
                onClick={toggleMute}
                className={cn(
                  "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors",
                  isMuted ? "bg-red-500 text-white" : "bg-black/40 backdrop-blur-md text-white border border-white/10"
                )}
              >
                {isMuted ? <MicOff size={16} className="md:w-5 md:h-5" /> : <Mic size={16} className="md:w-5 md:h-5" />}
              </button>
              <button 
                onClick={toggleCamera}
                className={cn(
                  "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors",
                  isCameraOff ? "bg-red-500 text-white" : "bg-black/40 backdrop-blur-md text-white border border-white/10"
                )}
              >
                {isCameraOff ? <VideoOff size={16} className="md:w-5 md:h-5" /> : <Video size={16} className="md:w-5 md:h-5" />}
              </button>
              <button className="w-8 h-8 md:w-10 md:h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10">
                <Settings size={16} className="md:w-5 md:h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Chat Overlay (TikTok Style) */}
        <div className="md:hidden absolute bottom-20 left-4 right-16 max-h-[30vh] overflow-y-auto no-scrollbar flex flex-col gap-2 z-20 pointer-events-none">
          <AnimatePresence>
            {isChatVisible && comments.map((comment) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                key={comment.id} 
                className="flex items-start gap-2 p-1.5 rounded-xl bg-black/30 backdrop-blur-sm border border-white/5 max-w-fit pointer-events-auto"
              >
                <img src={comment.avatar} alt="" className="w-6 h-6 rounded-full border border-white/10" />
                <div className="flex flex-col">
                  <span className="text-white/60 text-[10px] font-bold leading-none mb-0.5">{comment.user}</span>
                  <p className={cn(
                    "text-[11px] leading-tight", 
                    comment.isGift ? "text-yellow-400 font-bold" : "text-white"
                  )}>
                    {comment.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Mobile Action Bar (Right Side) */}
        <div className="md:hidden absolute bottom-24 right-4 flex flex-col gap-4 z-20">
          <button 
            onClick={handleLike}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all",
              isLiked ? "bg-red-500 text-white scale-110" : "bg-black/40 backdrop-blur-md text-white border border-white/10"
            )}
          >
            <Heart size={20} fill={isLiked ? "white" : "none"} />
          </button>
          <button 
            onClick={() => setIsGiftModalOpen(true)}
            className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10"
          >
            <Gift size={20} className="text-pink-400" />
          </button>
          <button 
            onClick={() => setIsSupportPanelOpen(true)}
            className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10"
          >
            <Coins size={20} className="text-yellow-500" />
          </button>
          <button 
            onClick={() => setIsChatVisible(!isChatVisible)}
            className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10"
          >
            <MessageCircle size={20} className={isChatVisible ? "text-indigo-400" : "text-white"} />
          </button>
          {isLiveCall && !isHost && (
            <button 
              onClick={handleRequestJoin}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full font-bold text-xs shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all"
            >
              <Plus size={14} />
              Join (50 🪙)
            </button>
          )}
        </div>

        {/* Mobile Bottom Input */}
        <div className="md:hidden absolute bottom-6 left-4 right-4 z-20">
          {selectedImage && (
            <div className="relative inline-block mb-2">
              <img 
                src={selectedImage} 
                alt="Preview" 
                className="w-20 h-20 object-cover rounded-xl border-2 border-indigo-600 shadow-lg"
              />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          )}
          <form onSubmit={handleSendComment} className="flex items-center gap-2">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10"
            >
              <ImageIcon size={20} />
            </button>
            <input 
              type="text" 
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Say something..." 
              className="flex-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-full py-2.5 px-5 text-white placeholder-white/40 outline-none text-xs"
            />
            {isHost && (
              <button 
                type="button"
                onClick={() => {
                  fetchInventory();
                  setIsProductSelectionOpen(true);
                }}
                className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-indigo-500/20"
              >
                <ShoppingBag size={20} />
              </button>
            )}
            <button 
              type="button"
              onClick={() => setIsGameMenuOpen(true)}
              className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10"
            >
              <Zap size={20} className="text-yellow-400" />
            </button>
          </form>
        </div>

        {/* Live Selling Carousel (Bottom Overlay) */}
        <AnimatePresence>
          {isLiveSelling && liveProducts.length > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="absolute bottom-20 left-0 right-0 z-[100] px-4 md:hidden"
            >
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {liveProducts.map((product) => (
                  <motion.div 
                    key={product.id}
                    whileTap={{ scale: 0.95 }}
                    className="flex-shrink-0 w-64 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden flex"
                  >
                    <div className="w-24 h-24 relative">
                      <img src={product.image} alt="" className="w-full h-full object-cover" />
                      {product.stock <= 0 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white uppercase">Sold Out</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div>
                        <h4 className="text-white font-bold text-xs line-clamp-1">{product.title}</h4>
                        <div className="flex items-center gap-1 text-indigo-400 font-bold text-xs mt-1">
                          <Coins size={12} />
                          <span>{product.price.toLocaleString()}</span>
                        </div>
                      </div>
                      <button 
                        disabled={product.stock <= 0}
                        onClick={() => {
                          setProductToBuy(product);
                          setIsPurchaseModalOpen(true);
                        }}
                        className={cn(
                          "w-full py-1.5 rounded-lg text-[10px] font-bold transition-all",
                          product.stock > 0 
                            ? "bg-indigo-600 text-white hover:bg-indigo-700" 
                            : "bg-white/10 text-white/40 cursor-not-allowed"
                        )}
                      >
                        {product.stock > 0 ? 'Buy Now' : 'Out of Stock'}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Overlays */}
        <GameOverlay 
          activeGame={activeGame} 
          gameTimer={gameTimer}
          leaderboard={gameLeaderboard}
          duelScores={duelScores}
          kingdomStats={kingdomStats}
          selectedKingdom={selectedKingdom}
          setSelectedKingdom={setSelectedKingdom}
          onAction={(action, data) => socketRef.current?.emit(action, { ...data, streamId, userId: MOCK_USER.id })}
          onClose={() => setActiveGame(null)}
        />
      </div>

      {/* Desktop Chat Panel */}
      <div className="hidden md:flex w-[30%] bg-[#151619] border-l border-white/10 flex-col relative z-20">
        {/* Chat Header */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {[...Array(3)].map((_, i) => (
                <img key={i} src={`https://picsum.photos/seed/viewer${i}/100/100`} className="w-8 h-8 rounded-full border-2 border-[#151619]" alt="" />
              ))}
              <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#151619] flex items-center justify-center text-white text-[10px] font-bold">
                + 999
              </div>
            </div>
          </div>
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 mb-4">
          <h2 className="text-white font-bold text-xl">Chat</h2>
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4 no-scrollbar">
          {comments.map((comment: any) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={comment.id} 
              className="flex items-start gap-3"
            >
              <img src={comment.avatar} alt="" className="w-9 h-9 rounded-full border border-white/10 object-cover" />
              <div className="flex flex-col">
                <span className="text-white/60 text-xs font-bold">{comment.user}</span>
                {comment.imageUrl && (
                  <img 
                    src={comment.imageUrl} 
                    alt="Shared image" 
                    className="w-full max-w-[200px] rounded-xl mt-1 mb-1 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(comment.imageUrl, '_blank')}
                  />
                )}
                <p className={cn(
                  "text-sm leading-relaxed", 
                  comment.isGift ? "text-yellow-400 font-bold" : "text-white"
                )}>
                  {comment.text}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Chat Input & Actions */}
        <div className="p-6 space-y-4 bg-gradient-to-t from-[#151619] to-transparent">
          {selectedImage && (
            <div className="relative inline-block">
              <img 
                src={selectedImage} 
                alt="Preview" 
                className="w-24 h-24 object-cover rounded-xl border-2 border-indigo-600 shadow-lg"
              />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <form onSubmit={handleSendComment} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ImageIcon size={24} />
            </button>
            <input 
              type="text" 
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Say something..." 
              className="w-full bg-white/5 border border-white/10 rounded-full py-3 px-6 text-white placeholder-white/40 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </form>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsGameMenuOpen(true)}
                className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
              >
                <Zap size={24} className="text-yellow-400" />
              </button>
              <button 
                onClick={() => setIsGiftModalOpen(true)}
                className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
              >
                <Gift size={24} className="text-pink-400" />
              </button>
              <button 
                onClick={() => setIsSupportPanelOpen(true)}
                className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
              >
                <Coins size={24} className="text-yellow-500" />
              </button>
            </div>
            
            <button 
              onClick={handleLike}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg",
                isLiked ? "bg-red-500 text-white shadow-red-500/40 scale-110" : "bg-white/5 text-white"
              )}
            >
              <Heart size={24} fill={isLiked ? "white" : "none"} />
            </button>
          </div>

          {isHost && (
            <button 
              onClick={handleEndStream}
              className="w-full bg-red-600 text-white py-3 rounded-2xl font-bold shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 mt-2"
            >
              <Radio size={20} className="animate-pulse" />
              <span>End Stream</span>
            </button>
          )}
        </div>
      </div>


      {/* Product Selection Modal (Host Only) */}
      <AnimatePresence>
        {isProductSelectionOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-gray-900 w-full max-w-lg h-[80vh] md:h-auto md:max-h-[80vh] rounded-t-[2.5rem] md:rounded-[2.5rem] flex flex-col overflow-hidden border-t md:border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Select Products</h3>
                  <p className="text-gray-400 text-xs mt-1">Choose items to sell during your live stream</p>
                </div>
                <button onClick={() => setIsProductSelectionOpen(false)} className="p-2 text-gray-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {inventory.length > 0 ? (
                  inventory.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => {
                        setSelectedInventoryIds(prev => 
                          prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                        );
                      }}
                      className={cn(
                        "flex items-center gap-4 p-3 rounded-2xl border transition-all cursor-pointer",
                        selectedInventoryIds.includes(item.id)
                          ? "bg-indigo-600/20 border-indigo-500"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      )}
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden">
                        <img src={item.image} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-white font-bold text-sm">{item.title}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1 text-indigo-400 font-bold text-xs">
                            <Coins size={12} />
                            <span>{item.price.toLocaleString()}</span>
                          </div>
                          <div className="text-gray-500 text-[10px] uppercase font-bold">
                            Stock: {item.stock}
                          </div>
                        </div>
                      </div>
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                        selectedInventoryIds.includes(item.id)
                          ? "bg-indigo-500 border-indigo-500"
                          : "border-white/20"
                      )}>
                        {selectedInventoryIds.includes(item.id) && <CheckCircle2 size={14} className="text-white" />}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Package size={48} className="text-gray-600 mb-4" />
                    <p className="text-gray-400">Your marketplace inventory is empty.</p>
                    <button 
                      onClick={() => navigate('/marketplace')}
                      className="text-indigo-400 font-bold mt-2"
                    >
                      Go to Marketplace
                    </button>
                  </div>
                )}
              </div>

              <div className="p-6 bg-black/40 border-t border-white/10">
                <button 
                  disabled={selectedInventoryIds.length === 0}
                  onClick={startLiveSelling}
                  className="w-full bg-indigo-600 disabled:bg-gray-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                >
                  Start Live Selling ({selectedInventoryIds.length})
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Purchase Modal (Viewer Only) */}
      <AnimatePresence>
        {isPurchaseModalOpen && productToBuy && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-gray-900 w-full max-w-md rounded-t-[2.5rem] md:rounded-[2.5rem] overflow-hidden border-t md:border border-white/10"
            >
              {purchaseStatus === 'idle' && (
                <div className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-bold text-white">Checkout</h3>
                    <button onClick={() => setIsPurchaseModalOpen(false)} className="p-2 text-gray-400 hover:text-white">
                      <X size={24} />
                    </button>
                  </div>

                  <div className="flex items-center gap-6 mb-8">
                    <div className="w-24 h-24 rounded-3xl overflow-hidden border border-white/10">
                      <img src={productToBuy.image} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-lg">{productToBuy.title}</h4>
                      <div className="flex items-center gap-1 text-indigo-400 font-bold text-xl mt-1">
                        <Coins size={20} />
                        <span>{productToBuy.price.toLocaleString()}</span>
                      </div>
                      <p className="text-gray-500 text-xs mt-1 uppercase font-bold tracking-wider">Available: {productToBuy.stock}</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-8">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Payment Method</p>
                    {[
                      { id: 'coins', name: 'In-app Coins', icon: <Coins size={18} />, balance: MOCK_USER.coins },
                      { id: 'wallet', name: 'USD Wallet', icon: <Wallet size={18} />, balance: `$${150.50}` },
                      { id: 'card', name: 'Credit/Debit Card', icon: <CreditCard size={18} /> }
                    ].map((method) => (
                      <button 
                        key={method.id}
                        onClick={() => setPaymentMethod(method.id as any)}
                        className={cn(
                          "w-full flex items-center justify-between p-4 rounded-2xl border transition-all",
                          paymentMethod === method.id 
                            ? "bg-indigo-600/20 border-indigo-500" 
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            paymentMethod === method.id ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-400"
                          )}>
                            {method.icon}
                          </div>
                          <div className="text-left">
                            <p className="text-white font-bold text-sm">{method.name}</p>
                            {method.balance !== undefined && (
                              <p className="text-gray-500 text-[10px]">Balance: {method.balance}</p>
                            )}
                          </div>
                        </div>
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                          paymentMethod === method.id ? "border-indigo-500 bg-indigo-500" : "border-white/20"
                        )}>
                          {paymentMethod === method.id && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      </button>
                    ))}
                  </div>

                  <button 
                    onClick={handlePurchase}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                  >
                    Confirm Purchase
                  </button>
                </div>
              )}

              {purchaseStatus === 'processing' && (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                  <h3 className="text-2xl font-bold text-white mb-2">Processing...</h3>
                  <p className="text-gray-400">Securing your item from the live stream</p>
                </div>
              )}

              {purchaseStatus === 'success' && (
                <div className="p-12 text-center">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="text-green-500" size={40} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Purchase Successful!</h3>
                  <p className="text-gray-400 mb-8">The item is now yours. Check your inventory.</p>
                  <button 
                    onClick={() => setIsPurchaseModalOpen(false)}
                    className="w-full bg-white/10 text-white py-4 rounded-2xl font-bold"
                  >
                    Back to Stream
                  </button>
                </div>
              )}

              {purchaseStatus === 'error' && (
                <div className="p-12 text-center">
                  <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="text-red-500" size={40} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Purchase Failed</h3>
                  <p className="text-gray-400 mb-8">Something went wrong. Please check your balance and try again.</p>
                  <button 
                    onClick={() => setPurchaseStatus('idle')}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gift Modal */}
      <AnimatePresence>
        {isGiftModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-gray-900 w-full max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden border-t md:border border-white/10"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-white font-bold">Send a Gift</h3>
                <button onClick={() => setIsGiftModalOpen(false)} className="p-2 text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 grid grid-cols-3 gap-4">
                {GIFTS.map((gift) => (
                  <button 
                    key={gift.id}
                    onClick={() => handleSendGift(gift)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-indigo-500/50 transition-all group"
                  >
                    <span className="text-4xl group-hover:scale-125 transition-transform">{gift.icon}</span>
                    <span className="text-white text-xs font-bold">{gift.name}</span>
                    <div className="flex items-center gap-1 text-yellow-500 text-[10px] font-black">
                      <Coins size={10} />
                      {gift.price}
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-4 bg-black/40 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="text-yellow-500" size={16} />
                  <span className="text-white font-bold text-sm">{MOCK_USER.coins} Coins</span>
                </div>
                <button className="text-indigo-400 font-bold text-sm">Recharge</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Support Panel */}
      <AnimatePresence>
        {streamSummary && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[500] bg-black flex items-center justify-center p-6"
          >
            <div className="w-full max-w-md bg-gray-900 rounded-[2.5rem] p-8 text-center border border-white/10">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Radio size={40} className="text-red-500" />
              </div>
              <h2 className="text-3xl font-black text-white mb-2 uppercase italic">Stream Ended</h2>
              <p className="text-white/60 mb-8">Thank you for watching!</p>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider block mb-1">Duration</span>
                  <p className="text-xl font-bold text-white">
                    {streamSummary.ended_at && streamSummary.started_at ? 
                      `${Math.floor((new Date(streamSummary.ended_at).getTime() - new Date(streamSummary.started_at).getTime()) / 60000)}m` : 
                      '0m'}
                  </p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider block mb-1">Viewers</span>
                  <p className="text-xl font-bold text-white">{streamSummary.viewer_count}</p>
                </div>
              </div>

              <button 
                onClick={() => navigate('/')}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20"
              >
                Back to Home
              </button>
            </div>
          </motion.div>
        )}
        {isSupportPanelOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-gray-900 w-full max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden border-t md:border border-white/10"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap size={32} className="text-yellow-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Support Creator</h3>
                <p className="text-gray-400 text-sm mb-8">Choose an amount to support the host's stream.</p>
                
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[10, 50, 100, 500, 1000, 5000].map((amount) => (
                    <button 
                      key={amount}
                      onClick={() => handleSendSupport(amount)}
                      className="bg-white/5 hover:bg-indigo-600 text-white py-3 rounded-xl font-bold border border-white/5 transition-all"
                    >
                      {amount}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={() => setIsSupportPanelOpen(false)}
                  className="w-full text-gray-500 font-bold text-sm py-2"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Menu */}
      <AnimatePresence>
        {isGameMenuOpen && (
          <GameMenu 
            isHost={isHost}
            onClose={() => setIsGameMenuOpen(false)}
            onStartLiveSelling={() => {
              fetchInventory();
              setIsProductSelectionOpen(true);
            }}
            onStartGame={(type, data) => {
              socketRef.current?.emit(`start_${type}`, { ...data, streamId, streamerId: MOCK_USER.id });
              setIsGameMenuOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>

  );
}

function GameMenu({ 
  isHost, 
  onClose, 
  onStartGame,
  onStartLiveSelling
}: { 
  isHost: boolean; 
  onClose: () => void; 
  onStartGame: (type: GameType, data?: any) => void;
  onStartLiveSelling: () => void;
}) {
  const games = [
    { id: 'coin_rain', name: 'Coin Rain War', icon: '💰', cost: 50, desc: 'Streamer pays 50, viewers catch coins for 30s. Winner gets 100!' },
    { id: 'gift_bomb', name: 'Secret Gift Bomb', icon: '💣', cost: 0, desc: 'Mystery gift! Viewers contribute to unlock. Top contributor wins prize.' },
    { id: 'power_duel', name: 'Power Duel', icon: '⚔️', cost: 0, desc: 'Challenge a viewer! Loser pays 30 coins. Winner gets badge & coins.' },
    { id: 'live_kingdom', name: 'Live Kingdom', icon: '🏰', cost: 0, desc: 'Join kingdoms! Sending coins strengthens your side. Dominant kingdom wins.' },
    { id: 'spin_storm', name: 'Mystery Spin Storm', icon: '🎡', cost: 0, desc: 'Multiple gifts trigger a spin wheel for random rewards!' },
    { id: 'live_selling', name: 'Live Selling', icon: '🛍️', cost: 0, desc: 'Sell products from your marketplace inventory in real-time!' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end justify-center p-0"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-gray-900 w-full max-w-md rounded-t-3xl overflow-hidden border-t border-white/10"
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Zap size={20} className="text-yellow-400" />
            Mini Games
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar">
              {games.map((game) => (
                <button 
                  key={game.id}
                  onClick={() => {
                    if (game.id === 'live_selling') {
                      onStartLiveSelling();
                      onClose();
                    } else if (game.id === 'power_duel') {
                      onStartGame(game.id as GameType, { opponentId: 'u2' }); // Mock opponent
                    } else {
                      onStartGame(game.id as GameType);
                    }
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-indigo-500/50 transition-all text-left group"
                >
              <span className="text-4xl group-hover:scale-110 transition-transform">{game.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-white font-bold">{game.name}</h4>
                  {game.cost > 0 && (
                    <span className="text-yellow-500 text-[10px] font-black flex items-center gap-1">
                      <Coins size={10} />
                      {game.cost}
                    </span>
                  )}
                </div>
                <p className="text-white/40 text-xs leading-relaxed">{game.desc}</p>
              </div>
              <ChevronRight size={16} className="text-white/20" />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function GameOverlay({ 
  activeGame, 
  gameTimer, 
  leaderboard, 
  duelScores, 
  kingdomStats, 
  selectedKingdom, 
  setSelectedKingdom, 
  onAction, 
  onClose 
}: any) {
  if (!activeGame) return null;

  return (
    <div className="absolute inset-0 z-[150] pointer-events-none">
      {/* Close Button */}
      <div className="absolute top-24 right-6 z-[200] pointer-events-auto">
        <button 
          onClick={onClose}
          className="w-10 h-10 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 hover:bg-red-500 transition-colors shadow-lg"
        >
          <X size={20} />
        </button>
      </div>

      {/* Coin Rain War */}
      {activeGame.type === 'coin_rain' && (
        <div className="absolute inset-0 pointer-events-auto">
          <div className="absolute top-32 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-yellow-500/50 text-white font-black flex items-center gap-3">
            <Coins className="text-yellow-500 animate-bounce" size={20} />
            <span>COIN RAIN! {gameTimer}s</span>
          </div>
          
          {/* Leaderboard */}
          <div className="absolute top-48 right-6 bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 w-48">
            <h4 className="text-white font-bold text-xs mb-3 uppercase tracking-wider">Top Catchers</h4>
            <div className="space-y-2">
              {leaderboard.map((entry: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[10px]">
                  <span className="text-white/60">@{entry.username}</span>
                  <span className="text-yellow-500 font-bold">{entry.score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Falling Coins */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(15)].map((_, i) => (
              <motion.button
                key={i}
                initial={{ y: -100, x: Math.random() * window.innerWidth }}
                animate={{ y: window.innerHeight + 100 }}
                transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
                onClick={() => onAction('catch_coin', { gameId: activeGame.id })}
                className="absolute text-3xl filter drop-shadow-lg pointer-events-auto"
              >
                🪙
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Secret Gift Bomb */}
      {activeGame.type === 'gift_bomb' && (
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-auto bg-black/20"
          onClick={onClose}
        >
          <div 
            className="bg-black/60 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/20 text-center max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-7xl mb-6"
            >
              💣
            </motion.div>
            <h3 className="text-white font-black text-xl mb-2 uppercase italic">Secret Gift Bomb</h3>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden mb-4">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(activeGame.data.current / activeGame.data.target) * 100}%` }}
                className="h-full bg-gradient-to-r from-orange-500 to-red-500"
              />
            </div>
            <p className="text-white/60 text-xs mb-6">
              {activeGame.data.current} / {activeGame.data.target} Coins to unlock!
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[10, 50].map(amount => (
                <button 
                  key={amount}
                  onClick={() => onAction('contribute_gift_bomb', { gameId: activeGame.id, amount })}
                  className="bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20"
                >
                  +{amount} 🪙
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Power Duel */}
      {activeGame.type === 'power_duel' && (
        <div className="absolute inset-0 pointer-events-auto">
          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 flex items-center justify-between px-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full border-4 border-indigo-500 overflow-hidden shadow-[0_0_30px_rgba(79,70,229,0.5)]">
                <img src={MOCK_USER.avatar} alt="" />
              </div>
              <div className="bg-indigo-600 px-6 py-2 rounded-full text-white font-black text-2xl">{duelScores.streamer}</div>
            </div>
            
            <div className="flex flex-col items-center">
              <span className="text-white font-black text-6xl italic animate-pulse">VS</span>
              <span className="text-white/60 font-bold mt-4">{gameTimer}s</span>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full border-4 border-red-500 overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.5)]">
                <img src="https://picsum.photos/seed/opponent/100/100" alt="" />
              </div>
              <div className="bg-red-600 px-6 py-2 rounded-full text-white font-black text-2xl">{duelScores.opponent}</div>
            </div>
          </div>
          
          <button 
            onClick={() => onAction('duel_tap', { gameId: activeGame.id })}
            className="absolute bottom-48 left-1/2 -translate-x-1/2 w-32 h-32 bg-white/10 backdrop-blur-xl rounded-full border-4 border-white/20 flex items-center justify-center text-white font-black text-xl active:scale-90 transition-transform"
          >
            TAP!
          </button>
        </div>
      )}

      {/* Live Kingdom */}
      {activeGame.type === 'live_kingdom' && (
        <div className="absolute inset-0 pointer-events-auto">
          <div className="absolute top-32 left-6 right-6 flex items-center gap-4">
            <div className={cn(
              "flex-1 p-2 rounded-xl transition-all",
              kingdomStats.dominant === 'kingdomA' ? "bg-indigo-600/20 border border-indigo-500/50" : ""
            )}>
              <div className="flex justify-between text-[10px] font-bold text-white mb-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  KINGDOM A
                </span>
                <span>{kingdomStats.kingdomA}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  animate={{ width: `${(kingdomStats.kingdomA / (kingdomStats.kingdomA + kingdomStats.kingdomB || 1)) * 100}%` }}
                  className="h-full bg-indigo-500"
                />
              </div>
            </div>
            <div className={cn(
              "flex-1 p-2 rounded-xl transition-all",
              kingdomStats.dominant === 'kingdomB' ? "bg-red-600/20 border border-red-500/50" : ""
            )}>
              <div className="flex justify-between text-[10px] font-bold text-white mb-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  KINGDOM B
                </span>
                <span>{kingdomStats.kingdomB}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  animate={{ width: `${(kingdomStats.kingdomB / (kingdomStats.kingdomA + kingdomStats.kingdomB || 1)) * 100}%` }}
                  className="h-full bg-red-500"
                />
              </div>
            </div>
          </div>
          
          <div className="absolute bottom-48 left-6 right-6 flex flex-col items-center gap-4">
            {!selectedKingdom ? (
              <div className="bg-black/60 backdrop-blur-xl p-6 rounded-3xl border border-white/10 w-full max-w-xs text-center">
                <h4 className="text-white font-bold mb-4">Choose Your Side</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setSelectedKingdom('kingdomA')}
                    className="bg-indigo-600 text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-indigo-500/20"
                  >
                    Kingdom A
                  </button>
                  <button 
                    onClick={() => setSelectedKingdom('kingdomB')}
                    className="bg-red-600 text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-red-500/20"
                  >
                    Kingdom B
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  "px-4 py-2 rounded-full text-white font-bold text-xs flex items-center gap-2",
                  selectedKingdom === 'kingdomA' ? "bg-indigo-600" : "bg-red-600"
                )}>
                  <span>Joined {selectedKingdom === 'kingdomA' ? 'Kingdom A' : 'Kingdom B'}</span>
                  <button onClick={() => setSelectedKingdom(null)} className="opacity-50 hover:opacity-100">
                    <X size={12} />
                  </button>
                </div>
                <div className="flex gap-2">
                  {[10, 50, 100].map(amount => (
                    <button 
                      key={amount}
                      onClick={() => onAction('kingdom_support', { kingdom: selectedKingdom, amount })}
                      className={cn(
                        "text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-lg transition-all active:scale-95",
                        selectedKingdom === 'kingdomA' ? "bg-indigo-600 shadow-indigo-500/20" : "bg-red-600 shadow-red-500/20"
                      )}
                    >
                      +{amount} 🪙
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mystery Spin Storm */}
      {activeGame.type === 'spin_storm' && (
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-auto bg-black/20"
          onClick={onClose}
        >
          <div 
            className="bg-black/60 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/20 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="text-8xl mb-6"
            >
              🎡
            </motion.div>
            <h3 className="text-white font-black text-xl mb-2 uppercase italic">Spin Storm!</h3>
            <p className="text-white/60 text-xs mb-4">Random reward draw in {gameTimer}s</p>
            <div className="flex -space-x-2 justify-center">
              {[...Array(5)].map((_, i) => (
                <img key={i} src={`https://picsum.photos/seed/spin${i}/100/100`} className="w-8 h-8 rounded-full border-2 border-black" alt="" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronRight({ size, className }: { size: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
