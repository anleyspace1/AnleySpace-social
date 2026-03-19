import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Share2, 
  Copy, 
  Users, 
  Coins, 
  Gift, 
  ChevronRight, 
  CheckCircle2,
  MessageCircle,
  Facebook,
  Send as Telegram,
  MoreHorizontal,
  QrCode
} from 'lucide-react';
import { MOCK_USER } from '../constants';

export default function InviteEarnPage() {
  const [copied, setCopied] = useState(false);
  const referralCode = "ANL8F92K";
  const referralLink = `anleyspace.com/join/${referralCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const recentInvites = [
    { id: 'i1', name: 'Jean Louis', time: 'Today, 10:25 AM', amount: 50, avatar: 'https://picsum.photos/seed/jean/100/100' },
    { id: 'i2', name: 'Marie Paul', time: 'Yesterday, 8:10 PM', amount: 50, avatar: 'https://picsum.photos/seed/marie/100/100' },
    { id: 'i3', name: 'Robens Jean', time: 'Apr 22, 3:45 PM', amount: 50, avatar: 'https://picsum.photos/seed/robens/100/100' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-4 md:p-8 pb-24"
    >
      <div className="text-center mb-12">
        <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 mx-auto mb-4">
          <Gift size={40} />
        </div>
        <h1 className="text-3xl font-bold mb-2">Invite & Earn 🏆</h1>
        <p className="text-gray-500">Share your link and earn coins for every friend who joins!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Referral Section */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm">
            <h3 className="font-bold mb-4">Your Referral Link</h3>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-black p-3 rounded-xl border border-gray-200 dark:border-gray-800">
              <span className="text-sm text-gray-500 truncate flex-1">{referralLink}</span>
              <button 
                onClick={copyToClipboard}
                className="bg-white dark:bg-gray-800 p-2 rounded-lg text-indigo-600 hover:bg-gray-50 transition-colors"
              >
                {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">Your Code</h3>
              <QrCode size={20} className="text-gray-400" />
            </div>
            <div className="text-center py-4 bg-gray-100 dark:bg-black rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800">
              <span className="text-3xl font-black tracking-widest text-indigo-600">{referralCode}</span>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white flex flex-col justify-between shadow-2xl shadow-indigo-500/20">
          <div>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                <Users size={24} />
              </div>
              <div>
                <span className="text-sm opacity-80">Total Invited</span>
                <h2 className="text-2xl font-bold">12 Friends</h2>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                <Coins size={24} className="text-yellow-400" />
              </div>
              <div>
                <span className="text-sm opacity-80">Total Coins Earned</span>
                <h2 className="text-2xl font-bold">600 Coins</h2>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Bonus Progress</span>
              <span className="text-sm font-bold">75%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400 w-3/4"></div>
            </div>
            <p className="text-xs mt-3 opacity-80">Invite 5 more friends to unlock 200 bonus coins!</p>
          </div>
        </div>
      </div>

      {/* Share Section */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-6 text-center">Share Now</h2>
        <div className="flex justify-center gap-6">
          <ShareButton icon={<MessageCircle size={28} />} label="WhatsApp" color="bg-green-500" />
          <ShareButton icon={<Facebook size={28} />} label="Facebook" color="bg-blue-600" />
          <ShareButton icon={<Telegram size={28} />} label="Telegram" color="bg-sky-500" />
          <ShareButton icon={<MoreHorizontal size={28} />} label="More" color="bg-gray-600" />
        </div>
      </section>

      {/* Recent Invites */}
      <section>
        <h2 className="text-xl font-bold mb-6">Recent Invites</h2>
        <div className="space-y-4">
          {recentInvites.map((invite) => (
            <div key={invite.id} className="bg-white dark:bg-gray-900 p-4 rounded-2xl flex items-center justify-between border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-4">
                <img src={invite.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                <div>
                  <h4 className="font-bold">{invite.name}</h4>
                  <p className="text-xs text-gray-500">{invite.time}</p>
                </div>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-4 py-1.5 rounded-full font-bold text-sm flex items-center gap-1">
                <CheckCircle2 size={14} />
                +{invite.amount} Coins
              </div>
            </div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}

function ShareButton({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <button className="flex flex-col items-center gap-2 group">
      <div className={`w-16 h-16 ${color} text-white rounded-[1.5rem] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <span className="text-xs font-bold text-gray-500">{label}</span>
    </button>
  );
}
