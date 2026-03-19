import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Video, X, PhoneOff, Check } from 'lucide-react';
import io from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function CallManager() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!user) return;

    const socket = io(window.location.origin);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('register_user', user.id);
    });

    socket.on('call:incoming', (data) => {
      console.log('Incoming call:', data);
      setIncomingCall(data);
      // Play ringtone
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
      audio.loop = true;
      audio.play().catch(e => console.log('Audio play failed:', e));
      (window as any).ringtone = audio;
    });

    socket.on('call:response', (data) => {
      if (data.response === 'rejected') {
        // Handle rejection if we were the caller
      }
    });

    return () => {
      socket.disconnect();
      if ((window as any).ringtone) {
        (window as any).ringtone.pause();
      }
    };
  }, [user]);

  const handleAccept = () => {
    if (incomingCall) {
      if ((window as any).ringtone) (window as any).ringtone.pause();
      
      socketRef.current?.emit('call:respond', {
        callerId: incomingCall.callerId,
        response: 'accepted',
        callId: incomingCall.callId
      });

      // Navigate to messages and open the call
      navigate('/messages', { 
        state: { 
          openCall: incomingCall.callId, 
          callType: incomingCall.type,
          callerId: incomingCall.callerId
        } 
      });
      setIncomingCall(null);
    }
  };

  const handleReject = () => {
    if (incomingCall) {
      if ((window as any).ringtone) (window as any).ringtone.pause();

      socketRef.current?.emit('call:respond', {
        callerId: incomingCall.callerId,
        response: 'rejected',
        callId: incomingCall.callId
      });
      setIncomingCall(null);
    }
  };

  if (!incomingCall) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[32px] p-8 shadow-2xl border border-white/10 text-center"
        >
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full mx-auto overflow-hidden border-4 border-indigo-500 animate-pulse">
              <img 
                src={incomingCall.callerAvatar || `https://picsum.photos/seed/${incomingCall.callerId}/200/200`} 
                alt="" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-indigo-600 text-white p-2 rounded-full border-4 border-white dark:border-gray-900">
              {incomingCall.type === 'video' ? <Video size={20} /> : <Phone size={20} />}
            </div>
          </div>

          <h3 className="text-2xl font-black mb-1">{incomingCall.callerName}</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">
            Incoming {incomingCall.type} call...
          </p>

          <div className="flex items-center justify-center gap-6">
            <button
              onClick={handleReject}
              className="w-16 h-16 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/40 hover:bg-red-600 transition-all active:scale-95"
            >
              <PhoneOff size={28} />
            </button>
            <button
              onClick={handleAccept}
              className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40 hover:bg-emerald-600 transition-all animate-bounce active:scale-95"
            >
              <Check size={28} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
