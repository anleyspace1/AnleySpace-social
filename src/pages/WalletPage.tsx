import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Send, 
  RefreshCw, 
  Plus, 
  History,
  TrendingUp,
  ChevronRight,
  Coins,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  CreditCard,
  Banknote,
  Smartphone
} from 'lucide-react';
import { MOCK_USER } from '../constants';
import { cn } from '../lib/utils';
import { Transaction } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function WalletPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(MOCK_USER.coins);
  const [usdBalance, setUsdBalance] = useState(50.00);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const [userRes, txRes] = await Promise.all([
          fetch(`/api/user/${user.id}`),
          fetch(`/api/transactions/${user.id}`)
        ]);
        const userData = await userRes.json();
        const txData = await txRes.json();
        
        if (userData.coins !== undefined) setBalance(userData.coins);
        setTransactions(txData.map((tx: any) => ({
          id: tx.id,
          type: tx.type === 'game_win' || tx.type === 'earn' ? 'earn' : 'send',
          amount: Math.abs(tx.amount),
          description: tx.description,
          timestamp: new Date(tx.timestamp).toLocaleString(),
          status: 'completed'
        })));
      } catch (err) {
        console.error("Error fetching wallet data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

  const handleAddCoins = (amount: number) => {
    setBalance(prev => prev + amount);
    const newTx: Transaction = {
      id: `t${Date.now()}`,
      type: 'earn',
      amount,
      description: 'Added Coins',
      timestamp: 'Just now',
      status: 'completed'
    };
    setTransactions([newTx, ...transactions]);
    setIsAddModalOpen(false);
  };

  const handleSendCoins = (recipient: string, amount: number) => {
    if (amount > balance) return;
    setBalance(prev => prev - amount);
    const newTx: Transaction = {
      id: `t${Date.now()}`,
      type: 'send',
      amount,
      description: `Sent to @${recipient}`,
      timestamp: 'Just now',
      status: 'completed'
    };
    setTransactions([newTx, ...transactions]);
    setIsSendModalOpen(false);
    alert(`Successfully sent ${amount} coins to @${recipient}`);
  };

  const handleExchange = (coins: number, currency: number) => {
    if (coins > balance) return;
    setBalance(prev => prev - coins);
    setUsdBalance(prev => prev + currency);
    const newTx: Transaction = {
      id: `t${Date.now()}`,
      type: 'exchange',
      amount: coins,
      description: `Exchanged ${coins} Coins for $${currency.toFixed(2)} USD`,
      timestamp: 'Just now',
      status: 'completed'
    };
    setTransactions([newTx, ...transactions]);
    setIsExchangeModalOpen(false);
    alert(`Successfully exchanged ${coins} coins for $${currency.toFixed(2)}`);
  };

  const handleWithdraw = (amount: number, method: string) => {
    if (amount > usdBalance) return;
    setUsdBalance(prev => prev - amount);
    const newTx: Transaction = {
      id: `t${Date.now()}`,
      type: 'withdraw',
      amount: amount,
      description: `USD Withdrawal to ${method === 'bank' ? 'Bank Account' : 'PayPal'}`,
      timestamp: 'Just now',
      status: 'pending'
    };
    setTransactions([newTx, ...transactions]);
    setIsWithdrawModalOpen(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="lg:max-w-4xl lg:mx-auto p-0 lg:p-8 pb-12"
    >
      {/* Coins Wallet Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-none lg:rounded-[2.5rem] p-8 text-white shadow-2xl shadow-indigo-500/20 mb-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                <Wallet size={24} />
              </div>
              <span className="font-bold opacity-80">My Coins Wallet</span>
            </div>
            <button className="bg-white/20 backdrop-blur-md p-2 rounded-xl hover:bg-white/30 transition-colors">
              <History size={20} />
            </button>
          </div>

          <div className="mb-8">
            <span className="text-sm opacity-80 mb-1 block">Total Balance</span>
            <div className="flex items-end gap-3">
              <h1 className="text-5xl font-bold">{balance.toLocaleString()}</h1>
              <span className="text-xl font-bold mb-1 opacity-80">Coins</span>
            </div>
          </div>

          <div className="flex gap-3">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddModalOpen(true)}
              className="flex-1 bg-white text-indigo-600 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <Plus size={20} />
              Add Coins
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsExchangeModalOpen(true)}
              className="flex-1 bg-white/20 backdrop-blur-md text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/30 transition-colors"
            >
              <RefreshCw size={20} />
              Exchange
            </motion.button>
          </div>
        </div>
      </div>

      {/* USD Wallet Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 rounded-none lg:rounded-[2.5rem] p-8 text-white shadow-2xl shadow-emerald-500/20 mb-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                <Banknote size={24} />
              </div>
              <span className="font-bold opacity-80">My USD Wallet</span>
            </div>
            <button className="bg-white/20 backdrop-blur-md p-2 rounded-xl hover:bg-white/30 transition-colors">
              <History size={20} />
            </button>
          </div>

          <div className="mb-8">
            <span className="text-sm opacity-80 mb-1 block">Total Balance</span>
            <div className="flex items-end gap-3">
              <h1 className="text-5xl font-bold">${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h1>
              <span className="text-xl font-bold mb-1 opacity-80">USD</span>
            </div>
          </div>

          <div className="flex gap-3">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsWithdrawModalOpen(true)}
              className="flex-1 bg-white text-emerald-600 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <ArrowUpRight size={20} />
              Withdraw
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 bg-white/20 backdrop-blur-md text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/30 transition-colors"
            >
              <History size={20} />
              Transaction History
            </motion.button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <motion.div 
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1
            }
          }
        }}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12 px-4 lg:px-0"
      >
        <QuickAction 
          icon={<Send size={24} />} 
          label="Send" 
          onClick={() => setIsSendModalOpen(true)}
        />
        <QuickAction 
          icon={<ArrowDownLeft size={24} />} 
          label="Receive" 
          onClick={() => setIsReceiveModalOpen(true)}
        />
        <QuickAction 
          icon={<RefreshCw size={24} />} 
          label="Exchange" 
          onClick={() => setIsExchangeModalOpen(true)}
        />
        <QuickAction 
          icon={<TrendingUp size={24} />} 
          label="Stats" 
          onClick={() => setIsStatsModalOpen(true)}
        />
      </motion.div>

      {/* Earning Summary */}
      <section className="mb-12 px-4 lg:px-0">
        <h2 className="text-xl font-bold mb-6">Earning Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard label="Today" amount={276} color="text-green-500" />
          <SummaryCard label="This Week" amount={1450} color="text-indigo-500" />
          <SummaryCard label="This Month" amount={4980} color="text-purple-500" />
        </div>
      </section>

      {/* Recent Transactions */}
      <section className="px-4 lg:px-0">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Recent Transactions</h2>
          <button className="text-indigo-600 font-bold text-sm">View All</button>
        </div>
        <div className="space-y-0 lg:space-y-4">
          {transactions.map((tx) => (
            <div key={tx.id} className="bg-white dark:bg-gray-900 p-4 rounded-none lg:rounded-2xl flex items-center justify-between border-b lg:border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  tx.type === 'earn' || tx.type === 'receive' ? "bg-green-100 text-green-600 dark:bg-green-900/30" : "bg-red-100 text-red-600 dark:bg-red-900/30"
                )}>
                  {tx.type === 'earn' || tx.type === 'receive' ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
                </div>
                <div>
                  <h4 className="font-bold">{tx.description}</h4>
                  <p className="text-xs text-gray-500">{tx.timestamp}</p>
                </div>
              </div>
              <div className="text-right">
                <div className={cn(
                  "font-bold text-lg",
                  tx.type === 'earn' || tx.type === 'receive' ? "text-green-600" : "text-red-600"
                )}>
                  {tx.type === 'earn' || tx.type === 'receive' ? '+' : '-'}{tx.amount}
                </div>
                <div className="flex items-center justify-end gap-1 text-[10px] text-gray-500">
                  {tx.status === 'completed' ? <CheckCircle2 size={10} className="text-green-500" /> : <Clock size={10} className="text-yellow-500" />}
                  {tx.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modals */}
      <AnimatePresence>
        {isAddModalOpen && (
          <AddCoinsModal 
            onClose={() => setIsAddModalOpen(false)} 
            onConfirm={handleAddCoins} 
          />
        )}
        {isWithdrawModalOpen && (
          <WithdrawModal 
            usdBalance={usdBalance}
            onClose={() => setIsWithdrawModalOpen(false)} 
            onConfirm={handleWithdraw} 
          />
        )}
        {isSendModalOpen && (
          <SendModal 
            balance={balance}
            onClose={() => setIsSendModalOpen(false)} 
            onConfirm={handleSendCoins} 
          />
        )}
        {isReceiveModalOpen && (
          <ReceiveModal 
            onClose={() => setIsReceiveModalOpen(false)} 
          />
        )}
        {isExchangeModalOpen && (
          <ExchangeModal 
            balance={balance}
            onClose={() => setIsExchangeModalOpen(false)} 
            onConfirm={handleExchange} 
          />
        )}
        {isStatsModalOpen && (
          <StatsModal 
            transactions={transactions}
            onClose={() => setIsStatsModalOpen(false)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AddCoinsModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (amount: number) => void }) {
  const [amount, setAmount] = useState<string>('');
  const presets = [100, 500, 1000, 5000];

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
          <h3 className="text-xl font-bold">Add Coins</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Select Amount</label>
            <div className="grid grid-cols-2 gap-3">
              {presets.map(p => (
                <button 
                  key={p}
                  onClick={() => setAmount(p.toString())}
                  className={cn(
                    "py-3 rounded-2xl font-bold border transition-all",
                    amount === p.toString() 
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                      : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-500"
                  )}
                >
                  {p} Coins
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Custom Amount</label>
            <div className="relative">
              <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500" size={20} />
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Payment Method</label>
            <div className="space-y-2">
              <PaymentMethod icon={<CreditCard size={18} />} label="Credit Card" />
              <PaymentMethod icon={<Smartphone size={18} />} label="Apple Pay" />
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!amount || parseInt(amount) <= 0}
            onClick={() => onConfirm(parseInt(amount))}
            className="w-full bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
          >
            Confirm Purchase
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function WithdrawModal({ usdBalance, onClose, onConfirm }: { usdBalance: number; onClose: () => void; onConfirm: (amount: number, method: string) => void }) {
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<'bank' | 'paypal'>('bank');

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
          <h3 className="text-xl font-bold">Withdraw Balance</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
            <div className="flex items-center justify-between">
              <span className="text-sm text-indigo-600 dark:text-indigo-400 font-bold">Available Balance</span>
              <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Withdraw Amount (USD)</label>
            <div className="relative">
              <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500" size={20} />
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
              />
              <button 
                onClick={() => setAmount(usdBalance.toFixed(2))}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-600 hover:underline"
              >
                Max
              </button>
            </div>
            {parseFloat(amount) > usdBalance && (
              <p className="text-red-500 text-[10px] mt-1 font-bold flex items-center gap-1">
                <AlertCircle size={10} />
                Insufficient balance
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Withdraw To</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setMethod('bank')}
                className={cn(
                  "p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all",
                  method === 'bank' ? "bg-indigo-50 border-indigo-500 text-indigo-600" : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700"
                )}
              >
                <Banknote size={24} />
                <span className="text-xs font-bold">Bank Account</span>
              </button>
              <button 
                onClick={() => setMethod('paypal')}
                className={cn(
                  "p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all",
                  method === 'paypal' ? "bg-indigo-50 border-indigo-500 text-indigo-600" : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700"
                )}
              >
                <Smartphone size={24} />
                <span className="text-xs font-bold">PayPal</span>
              </button>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > usdBalance}
            onClick={() => onConfirm(parseFloat(amount), method)}
            className="w-full bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
          >
            Withdraw Now
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function PaymentMethod({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <motion.button 
      whileHover={{ scale: 1.02, backgroundColor: "rgba(79, 70, 229, 0.05)" }}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center justify-between p-4 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-indigo-500 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="text-gray-400 group-hover:text-indigo-600 transition-colors">
          {icon}
        </div>
        <span className="text-sm font-bold text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <div className="w-4 h-4 rounded-full border-2 border-gray-200 dark:border-gray-700 group-hover:border-indigo-500 transition-colors"></div>
    </motion.button>
  );
}

function SendModal({ balance, onClose, onConfirm }: { balance: number; onClose: () => void; onConfirm: (recipient: string, amount: number) => void }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

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
          <h3 className="text-xl font-bold">Send Coins</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {!showConfirm ? (
          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Recipient Username</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">@</span>
                <input 
                  type="text" 
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="username"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Amount</label>
              <div className="relative">
                <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500" size={20} />
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1 font-bold">Available: {balance.toLocaleString()} Coins</p>
            </div>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!recipient || !amount || parseInt(amount) <= 0 || parseInt(amount) > balance}
              onClick={() => setShowConfirm(true)}
              className="w-full bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
            >
              Continue
            </motion.button>
          </div>
        ) : (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Send size={32} className="text-indigo-600" />
            </div>
            <h4 className="text-lg font-bold">Confirm Transaction</h4>
            <p className="text-gray-500 text-sm">You are about to send <span className="text-indigo-600 font-bold">{amount} Coins</span> to <span className="text-indigo-600 font-bold">@{recipient}</span>.</p>
            
            <div className="flex gap-3">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
              >
                Back
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onConfirm(recipient, parseInt(amount))}
                className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
              >
                Confirm Send
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ReceiveModal({ onClose }: { onClose: () => void }) {
  const walletId = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";

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
        className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 text-center"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Receive Coins</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl inline-block shadow-inner border border-gray-100 mx-auto">
            {/* Mock QR Code */}
            <div className="w-48 h-48 bg-gray-900 rounded-xl flex items-center justify-center relative overflow-hidden">
              <div className="grid grid-cols-4 gap-2 opacity-20">
                {[...Array(16)].map((_, i) => <div key={i} className="w-8 h-8 bg-white rounded-sm" />)}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                  <Wallet size={24} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Your Wallet ID</label>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2 overflow-hidden">
              <span className="text-[10px] font-mono text-gray-600 dark:text-gray-400 truncate">{walletId}</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(walletId);
                  alert('Wallet ID copied to clipboard!');
                }}
                className="text-indigo-600 font-bold text-xs whitespace-nowrap"
              >
                Copy
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500">Share this QR code or Wallet ID with others to receive coins directly to your wallet.</p>
        </div>
      </motion.div>
    </div>
  );
}

function ExchangeModal({ balance, onClose, onConfirm }: { balance: number; onClose: () => void; onConfirm: (coins: number, currency: number) => void }) {
  const [amount, setAmount] = useState('');
  const rate = 0.01; // 1 coin = $0.01

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
          <h3 className="text-xl font-bold">Exchange Coins</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Current Rate</span>
            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">1 Coin = $0.01 USD</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">You Pay</label>
              <div className="relative">
                <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500" size={20} />
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                />
              </div>
            </div>

            <div className="flex justify-center">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-400">
                <RefreshCw size={20} />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">You Receive</label>
              <div className="relative">
                <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500" size={20} />
                <input 
                  type="text" 
                  value={amount ? `$${(parseInt(amount) * rate).toFixed(2)}` : '$0.00'}
                  readOnly
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-4 font-bold text-gray-500"
                />
              </div>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!amount || parseInt(amount) <= 0 || parseInt(amount) > balance}
            onClick={() => onConfirm(parseInt(amount), parseInt(amount) * rate)}
            className="w-full bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
          >
            Exchange Now
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function StatsModal({ transactions, onClose }: { transactions: Transaction[]; onClose: () => void }) {
  const totalSent = transactions.filter(t => t.type === 'send' || t.type === 'withdraw').reduce((acc, t) => acc + t.amount, 0);
  const totalReceived = transactions.filter(t => t.type === 'earn' || t.type === 'receive').reduce((acc, t) => acc + t.amount, 0);

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
        className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 max-h-[90vh] overflow-y-auto no-scrollbar"
      >
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-white dark:bg-gray-900 z-10 py-2">
          <h3 className="text-xl font-bold">Wallet Statistics</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800/50">
              <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider block mb-1">Total Received</span>
              <p className="text-xl font-black text-green-600 dark:text-green-400">+{totalReceived.toLocaleString()}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-800/50">
              <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block mb-1">Total Sent</span>
              <p className="text-xl font-black text-red-600 dark:text-red-400">-{totalSent.toLocaleString()}</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-indigo-600" />
              Activity Overview
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Earnings</span>
                <span className="font-bold text-green-600">75%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 w-[75%]"></div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Gifts</span>
                <span className="font-bold text-indigo-600">15%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 w-[15%]"></div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Withdrawals</span>
                <span className="font-bold text-red-600">10%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 w-[10%]"></div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
              <History size={18} className="text-indigo-600" />
              Recent Activity
            </h4>
            <div className="space-y-4">
              {transactions.slice(0, 5).map(tx => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      tx.type === 'earn' || tx.type === 'receive' ? "bg-green-50 text-green-600" : "bg-red-50"
                    )}>
                      {tx.type === 'earn' || tx.type === 'receive' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div>
                      <p className="text-xs font-bold">{tx.description}</p>
                      <p className="text-[10px] text-gray-500">{tx.timestamp}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-xs font-black",
                    tx.type === 'earn' || tx.type === 'receive' ? "text-green-600" : "text-red-600"
                  )}>
                    {tx.type === 'earn' || tx.type === 'receive' ? '+' : '-'}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <motion.button 
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
      }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick} 
      className="flex flex-col items-center gap-2 group"
    >
      <div className="w-14 h-14 bg-gray-100 dark:bg-gray-900 rounded-2xl flex items-center justify-center text-gray-600 dark:text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm">
        <motion.div
          initial={false}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
        >
          {icon}
        </motion.div>
      </div>
      <span className="text-xs font-bold text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{label}</span>
    </motion.button>
  );
}

function SummaryCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <motion.div 
      whileHover={{ y: -4, shadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)" }}
      className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-shadow cursor-pointer"
    >
      <span className="text-sm text-gray-500 mb-2 block">{label}</span>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins size={20} className="text-yellow-500" />
          <span className={cn("text-2xl font-bold", color)}>{amount.toLocaleString()}</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
          <ChevronRight size={16} className="text-gray-400" />
        </div>
      </div>
    </motion.div>
  );
}
