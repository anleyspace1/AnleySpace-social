import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Send, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LiveMessage {
  id: string;
  live_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profiles?: {
    username: string;
    avatar_url: string;
  };
}

interface LiveChatProps {
  liveId: string;
}

export default function LiveChat({ liveId }: LiveChatProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('live_messages')
        .select('*, profiles(username, avatar_url)')
        .eq('live_id', liveId)
        .order('created_at', { ascending: true });
      
      if (data) setMessages(data);
    };

    fetchMessages();

    const channel = supabase
      .channel(`live_chat:${liveId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'live_messages',
        filter: `live_id=eq.${liveId}`
      }, async (payload) => {
        const newMessage = payload.new as any;
        const { data: profileData } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', newMessage.user_id)
          .single();
        
        setMessages(prev => [...prev, { ...newMessage, profiles: profileData }]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user) return;

    try {
      await fetch(`/api/lives/${liveId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, message: inputText.trim() })
      });
      setInputText('');
    } catch (err) {
      console.error("Error sending live message:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        <div className="text-[10px] text-indigo-400 font-bold bg-indigo-400/10 p-2 rounded-lg mb-4">
          Welcome to the live broadcast!
        </div>
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-600/20 flex items-center justify-center text-[10px] font-bold text-indigo-400">
                {msg.profiles?.username?.[0].toUpperCase() || '?'}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-white/60">@{msg.profiles?.username || 'user'}</p>
                <p className="text-xs text-white">{msg.message}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 relative">
        <input 
          type="text" 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send a message..."
          className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 pr-10 text-xs text-white placeholder-white/40 focus:ring-1 focus:ring-indigo-500 outline-none"
        />
        <button 
          type="submit"
          className="absolute right-6 top-1/2 -translate-y-1/2 text-indigo-500 hover:text-indigo-400"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
