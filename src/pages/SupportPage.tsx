import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function SupportPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string>('');

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setFeedback('Please type a message first.');
      return;
    }
    setSending(true);
    setFeedback('');
    try {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      console.log('AUTH USER:', authUser);
      if (!authUser) {
        alert('User not authenticated');
        setFeedback('User not authenticated.');
        return;
      }

      const payload = {
        user_id: authUser.id,
        message: message,
      };
      console.log('INSERT PAYLOAD:', payload);
      const { data: inserted, error } = await supabase
        .from('support_messages')
        .insert(payload);
      console.log('SUPPORT SEND:', inserted, error);
      if (error) throw error;

      setMessage('');
      setFeedback('Support message sent successfully.');
    } catch (err: any) {
      setFeedback(err?.message || 'Failed to send support message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      <h1 className="text-2xl font-black mb-4">Support</h1>
      <p className="text-sm text-gray-400 mb-4">Tell us what you need help with.</p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={user ? 'Write your support message...' : 'Please log in to send support messages'}
        disabled={!user || sending}
        rows={6}
        className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={!user || sending || !message.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
        {feedback && <span className="text-sm text-gray-300">{feedback}</span>}
      </div>
    </div>
  );
}
