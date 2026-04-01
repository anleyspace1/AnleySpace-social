import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCachedSession, supabase } from '../lib/supabase';
import { Lock, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      console.log('RESET PAGE LOADED:', window.location.href);
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const hasAccessTokenInUrl =
        /access_token=/.test(hash) ||
        /access_token=/.test(search) ||
        /type=recovery/.test(hash) ||
        /type=recovery/.test(search);
      console.log('RESET URL DEBUG:', {
        origin: window.location.origin,
        pathname: window.location.pathname,
        hashPreview: hash ? `${hash.slice(0, 80)}${hash.length > 80 ? '…' : ''}` : '(empty)',
        search,
        hasAccessTokenInUrl,
      });
      if (!hasAccessTokenInUrl) {
        console.warn(
          'RESET DEBUG: Missing access_token / type=recovery in URL (link may be wrong domain, expired, or already consumed)'
        );
      }

      const { data } = await supabase.auth.getSession();
      console.log('RESET SESSION:', data);

      if (!data.session) {
        console.warn('RESET DEBUG: session is null after getSession() on reset page load');
      }

      // Check if we have a session (the user should be logged in via the reset link)
      const session = await getCachedSession();
      if (!session) {
        console.warn('RESET DEBUG: getCachedSession() returned null');
        setError('Invalid or expired reset link. Please request a new one.');
      } else {
        console.log('RESET DEBUG: recovery session present (user id):', session.user?.id);
      }
    };
    void run();

    const t = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      console.log('RESET SESSION (delayed 750ms):', data);
      if (!data.session) {
        console.warn('RESET DEBUG: session still null after delay — token may not have been parsed');
      }
    }, 750);
    return () => window.clearTimeout(t);
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const pre = await supabase.auth.getSession();
      console.log('UPDATE PASSWORD ATTEMPT (session before updateUser):', pre.data);

      console.log('UPDATE PASSWORD ATTEMPT');
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });
      console.log('UPDATE PASSWORD RESULT:', { data, error });
      if (error) {
        console.log('UPDATE PASSWORD ERROR.message:', error.message);
        console.log('UPDATE PASSWORD ERROR.status:', (error as { status?: number }).status);
      }
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-black">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-gray-800"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
            <span className="text-white font-black text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Set New Password</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Enter your new password below</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl border border-red-100 dark:border-red-800">
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-bold mb-2">Password Updated!</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Your password has been successfully reset. Redirecting to login...
            </p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 ml-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 ml-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="password" 
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (
                <>
                  Update Password <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
