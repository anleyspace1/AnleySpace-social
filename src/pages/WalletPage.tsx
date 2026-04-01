import React, { useState, useEffect, useMemo } from 'react';
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
  Coins,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Banknote,
  Smartphone
} from 'lucide-react';
import { MOCK_USER } from '../constants';
import { cn } from '../lib/utils';
import { Transaction } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../lib/apiOrigin';
import { BuyCoinsMenu } from '../components/BuyCoinsMenu';
import { useBuyCoins } from '../hooks/useBuyCoins';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { deductCoins } from '../lib/coinsWallet';

const MIN_WITHDRAW = 1000;
const COIN_TO_USD_RATE = 0.01;

const TX_CREDIT_TYPES = new Set([
  'credit',
  'earn',
  'receive',
  'game_win',
  'gift',
  'support',
  'deposit',
  'refund',
]);
const TX_DEBIT_TYPES = new Set([
  'debit',
  'send',
  'withdraw',
  'game_loss',
  'game_start',
  'purchase',
  'fee',
  'spend',
]);

function aggregateWalletTransactions(rows: unknown[]): { earned: number; spent: number; purchased: number } {
  let earned = 0;
  let spent = 0;
  let purchased = 0;
  for (const item of rows) {
    const tx = item as Record<string, unknown>;
    const type = String(tx?.type ?? '').toLowerCase().trim();
    const rawAmt = Number(tx?.amount);
    const amt = Number.isFinite(rawAmt) ? Math.abs(rawAmt) : 0;
    if (type === 'deposit') {
      purchased += amt;
      continue;
    }
    if (TX_CREDIT_TYPES.has(type)) {
      earned += amt;
    } else if (TX_DEBIT_TYPES.has(type)) {
      spent += amt;
    } else if (rawAmt > 0) {
      earned += amt;
    } else if (rawAmt < 0) {
      spent += Math.abs(rawAmt);
    }
  }
  return { earned, spent, purchased };
}

function transactionTypeLabel(tx: Transaction): string {
  switch (tx.type) {
    case 'earn':
      return 'Earned';
    case 'receive':
      return 'Received';
    case 'send':
      return 'Sent';
    case 'withdraw':
      return 'Withdrawal';
    case 'exchange':
      return 'Exchange';
    case 'spend':
      return 'Platform spend';
    default:
      return 'Activity';
  }
}

function groupTransactionsByDay(
  items: { tx: Transaction; sortKey: number }[]
): { label: string; sortKey: number; items: { tx: Transaction; sortKey: number }[] }[] {
  const map = new Map<string, { label: string; sortKey: number; items: typeof items }>();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);

  for (const row of items) {
    const d = new Date(row.sortKey);
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const key = dayStart.toISOString().slice(0, 10);
    let label: string;
    if (dayStart.getTime() === startOfToday.getTime()) {
      label = 'Today';
    } else if (dayStart.getTime() === startOfYesterday.getTime()) {
      label = 'Yesterday';
    } else {
      label = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    if (!map.has(key)) {
      map.set(key, { label, sortKey: dayStart.getTime(), items: [] });
    }
    map.get(key)!.items.push(row);
  }
  return Array.from(map.values()).sort((a, b) => b.sortKey - a.sortKey);
}

export default function WalletPage() {
  const { user, profile } = useAuth();
  const [balance, setBalance] = useState(MOCK_USER.coins);
  const [usdBalance, setUsdBalance] = useState(50.00);
  const [txList, setTxList] = useState<Array<{ tx: Transaction; sortKey: number }>>([]);
  const [breakdown, setBreakdown] = useState({
    earnedFromViews: 0,
    earnedFromReferrals: 0,
    purchasedCoins: 0,
    spentCoins: 0,
  });
  const [withdrawHistory, setWithdrawHistory] = useState<
    { id: string; coins: number; status: string; created_at: string }[]
  >([]);
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const [userRes, txRes] = await Promise.all([
          fetch(apiUrl(`/api/user/${user.id}`)),
          fetch(apiUrl(`/api/transactions/${user.id}`))
        ]);
        const userData = await userRes.json();
        const txData = await txRes.json();
        const rawRows = Array.isArray(txData) ? txData : [];
        const { spent, purchased } = aggregateWalletTransactions(rawRows);

        if (typeof userData?.coins === 'number' && Number.isFinite(userData.coins)) {
          setBalance(userData.coins);
        } else if (profile?.coins != null) {
          setBalance(Number(profile.coins));
        }
        setTxList(
          rawRows.map((tx: { id?: string; type?: string; amount?: number; description?: string; timestamp?: string }) => {
            const ts = tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now();
            const rawType = String(tx.type ?? '').toLowerCase();
            let mappedType: Transaction['type'] = 'send';
            if (rawType === 'game_win' || rawType === 'earn' || rawType === 'gift') {
              mappedType = 'earn';
            } else if (
              rawType === 'deposit' ||
              rawType === 'refund' ||
              rawType === 'credit' ||
              rawType === 'receive'
            ) {
              mappedType = 'receive';
            } else if (rawType === 'withdraw') {
              mappedType = 'withdraw';
            } else if (rawType === 'exchange') {
              mappedType = 'exchange';
            } else if (rawType === 'spend') {
              mappedType = 'spend';
            }
            const mapped: Transaction = {
              id: String(tx.id ?? ''),
              type: mappedType,
              amount: Math.abs(Number(tx.amount) || 0),
              description: String(tx.description ?? ''),
              timestamp: tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '',
              status: 'completed',
            };
            return { tx: mapped, sortKey: ts };
          })
        );
        setBreakdown((prev) => ({
          ...prev,
          purchasedCoins: purchased,
          spentCoins: spent,
        }));
      } catch (err) {
        console.error("Error fetching wallet data:", err);
      }
    };

    fetchData();
  }, [user?.id, profile?.coins]);

  useEffect(() => {
    const loadBreakdown = async () => {
      if (!user?.id || !isSupabaseConfigured) return;
      try {
        const [refRes, viewRes] = await Promise.all([
          supabase.from('referral_rewards').select('coins').eq('inviter_id', user.id),
          supabase.from('creator_daily_view_earnings').select('coins').eq('user_id', user.id),
        ]);
        const refSum = (refRes.data || []).reduce(
          (s, r: { coins?: number | null }) => s + Number(r?.coins || 0),
          0
        );
        const viewSum = (viewRes.data || []).reduce(
          (s, r: { coins?: number | null }) => s + Number(r?.coins || 0),
          0
        );
        setBreakdown((prev) => ({
          ...prev,
          earnedFromReferrals: refSum,
          earnedFromViews: viewSum,
        }));
      } catch {
        /* keep defaults */
      }
    };
    void loadBreakdown();
  }, [user?.id]);

  useEffect(() => {
    const fetchWithdrawHistory = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('withdraw_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      console.log('WITHDRAW HISTORY:', data, error);
      if (error) return;
      setWithdrawHistory(
        (Array.isArray(data) ? data : []).map((row: any) => ({
          id: String(row.id),
          coins: Number(row.coins) || 0,
          status: String(row.status || 'pending'),
          created_at: String(row.created_at || ''),
        }))
      );
    };
    void fetchWithdrawHistory();
  }, [user?.id]);

  const { buyCoinsMenuOpen, toggleBuyCoinsMenu, closeBuyCoinsMenu } = useBuyCoins();
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

  /** Total coin balance (synced from API / profile on load; matches `profiles.coins` when fresh). */
  const totalCoins = balance;
  const coinsUsdApprox = totalCoins / 100;

  const groupedTxSections = useMemo(
    () => groupTransactionsByDay(txList),
    [txList]
  );

  const handleSendCoins = (recipient: string, amount: number) => {
    if (amount > balance) return;
    setBalance(prev => prev - amount);
    const now = Date.now();
    const newTx: Transaction = {
      id: `t${now}`,
      type: 'send',
      amount,
      description: `Sent to @${recipient}`,
      timestamp: 'Just now',
      status: 'completed'
    };
    setTxList((prev) => [{ tx: newTx, sortKey: now }, ...prev]);
    setIsSendModalOpen(false);
    alert(`Successfully sent ${amount} coins to @${recipient}`);
  };

  const handleExchange = (coins: number, currency: number) => {
    if (coins > balance) return;
    setBalance(prev => prev - coins);
    setUsdBalance(prev => prev + currency);
    const now = Date.now();
    const newTx: Transaction = {
      id: `t${now}`,
      type: 'exchange',
      amount: coins,
      description: `Exchanged ${coins} Coins for $${currency.toFixed(2)} USD`,
      timestamp: 'Just now',
      status: 'completed'
    };
    setTxList((prev) => [{ tx: newTx, sortKey: now }, ...prev]);
    setIsExchangeModalOpen(false);
    alert(`Successfully exchanged ${coins} coins for $${currency.toFixed(2)}`);
  };

  const handleWithdraw = async (amount: number, method: string, paymentDetails: string) => {
    if (!user) {
      alert('Please sign in to withdraw.');
      return;
    }

    const coins = Math.floor(amount);
    const minUsd = (MIN_WITHDRAW * COIN_TO_USD_RATE).toFixed(0);

    if (coins < MIN_WITHDRAW) {
      alert(`Minimum withdraw is ${MIN_WITHDRAW} coins ($${minUsd})`);
      return;
    }

    if (coins <= 0 || !Number.isFinite(coins)) {
      alert('Enter a valid withdraw amount.');
      return;
    }

    if (coins > balance) {
      alert('Insufficient coin balance.');
      return;
    }

    if (!paymentDetails.trim()) {
      alert('Payment details are required.');
      return;
    }

    if (!isSupabaseConfigured) {
      alert('Supabase is not configured.');
      return;
    }

    const paymentMethod = method;
    const { error } = await supabase.rpc('process_withdraw', {
      p_user_id: user.id,
      p_coins: coins,
      p_method: paymentMethod,
      p_details: paymentDetails
    });

    if (!error) {
      alert('Withdraw request submitted');
      window.location.reload();
      return;
    }

    console.error('RPC FAILED:', error);

    // Only fallback if RPC truly fails
    try {
      const { data, error: insertError } = await supabase
        .from('withdraw_requests')
        .insert({
          user_id: user.id,
          coins,
          payment_method: paymentMethod,
          payment_details: paymentDetails
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await deductCoins(user.id, coins);

      alert('Withdraw request submitted');
      window.location.reload();
    } catch (err) {
      console.error('FALLBACK FAILED:', err);
      alert('Withdraw failed, please try again');
    }
  };

  return (
    <div className="lg:max-w-4xl lg:mx-auto p-0 lg:p-8 pb-12 overflow-visible">
      {/* Coins Wallet Card — gradient layer clips orbs; content overflow visible for buy menu */}
      <div className="relative rounded-none lg:rounded-[2.5rem] mb-6 text-white shadow-2xl shadow-indigo-500/20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-none lg:rounded-[2.5rem]">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        </div>
        <div className="relative z-10 overflow-visible p-8">
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
            <span className="text-sm opacity-80 mb-1 block">Total Coins</span>
            <div className="flex items-end gap-3 flex-wrap">
              <h1 className="text-5xl font-bold">{totalCoins.toLocaleString()}</h1>
              <span className="text-xl font-bold mb-1 opacity-80">coins</span>
            </div>
            <p className="text-sm font-semibold opacity-90 mt-2">
              ≈ ${coinsUsdApprox.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="relative flex gap-3 overflow-visible">
            <button
              type="button"
              onClick={toggleBuyCoinsMenu}
              className="flex-1 bg-white text-indigo-600 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <Plus size={20} />
              Add Coins
            </button>
            <button
              type="button"
              onClick={() => setIsExchangeModalOpen(true)}
              className="flex-1 bg-white/20 backdrop-blur-md text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/30 transition-colors"
            >
              <RefreshCw size={20} />
              Exchange
            </button>
            <BuyCoinsMenu
              open={buyCoinsMenuOpen}
              onClose={closeBuyCoinsMenu}
              panelClassName="left-0 right-0 top-full mt-2 mx-auto w-80 max-w-[min(20rem,calc(100vw-1.5rem))]"
            />
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
            <button
              type="button"
              onClick={() => setIsWithdrawModalOpen(true)}
              className="flex-1 bg-white text-emerald-600 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <ArrowUpRight size={20} />
              Withdraw
            </button>
            <button
              type="button"
              className="flex-1 bg-white/20 backdrop-blur-md text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/30 transition-colors"
            >
              <History size={20} />
              Transaction History
            </button>
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

      {/* Balance breakdown */}
      <section className="mb-12 px-4 lg:px-0">
        <h2 className="text-xl font-bold mb-4">Balance breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BreakdownRow label="Earned from views" value={breakdown.earnedFromViews} tone="emerald" />
          <BreakdownRow label="Earned from referrals" value={breakdown.earnedFromReferrals} tone="violet" />
          <BreakdownRow label="Purchased coins" value={breakdown.purchasedCoins} tone="indigo" />
          <BreakdownRow label="Spent coins" value={breakdown.spentCoins} tone="rose" />
        </div>
      </section>

      {/* Recent Transactions */}
      <section className="px-4 lg:px-0">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Transaction history</h2>
          <button type="button" className="text-indigo-600 font-bold text-sm">View All</button>
        </div>
        <div className="space-y-6">
          {groupedTxSections.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 p-4 rounded-none lg:rounded-2xl border border-gray-100 dark:border-gray-800 text-sm text-gray-500">
              No transactions yet
            </div>
          ) : (
            groupedTxSections.map((section) => (
              <div key={section.label}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 px-1">{section.label}</h3>
                <div className="space-y-0 lg:space-y-2">
                  {section.items.map(({ tx }, idx) => (
                    <div
                      key={`${section.label}-${tx.id}-${idx}`}
                      className="bg-white dark:bg-gray-900 p-4 rounded-none lg:rounded-2xl flex items-center justify-between border-b lg:border border-gray-100 dark:border-gray-800"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div
                          className={cn(
                            'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                            tx.type === 'earn' || tx.type === 'receive'
                              ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
                              : 'bg-red-100 text-red-600 dark:bg-red-900/30'
                          )}
                        >
                          {tx.type === 'earn' || tx.type === 'receive' ? (
                            <ArrowDownLeft size={24} />
                          ) : (
                            <ArrowUpRight size={24} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">
                            {transactionTypeLabel(tx)}
                          </p>
                          <h4 className="font-bold truncate">{tx.description || transactionTypeLabel(tx)}</h4>
                          <p className="text-xs text-gray-500">{tx.timestamp}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={cn(
                            'font-bold text-lg',
                            tx.type === 'earn' || tx.type === 'receive' ? 'text-green-600' : 'text-red-600'
                          )}
                        >
                          {tx.type === 'earn' || tx.type === 'receive' ? '+' : '-'}
                          {tx.amount}
                        </div>
                        <div className="flex items-center justify-end gap-1 text-[10px] text-gray-500">
                          {tx.status === 'completed' ? (
                            <CheckCircle2 size={10} className="text-green-500" />
                          ) : (
                            <Clock size={10} className="text-yellow-500" />
                          )}
                          {tx.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Withdraw History */}
      <section className="px-4 lg:px-0 mt-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Withdraw History</h2>
        </div>
        <div className="space-y-0 lg:space-y-4">
          {withdrawHistory.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 p-4 rounded-none lg:rounded-2xl border-b lg:border border-gray-100 dark:border-gray-800 text-sm text-gray-500">
              No withdraw history found
            </div>
          ) : (
            withdrawHistory.map((w) => {
              const status = String(w.status || '').toLowerCase();
              const statusClass =
                status === 'approved'
                  ? 'text-green-600 dark:text-green-400'
                  : status === 'rejected'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-yellow-600 dark:text-yellow-400';
              return (
                <div key={w.id} className="bg-white dark:bg-gray-900 p-4 rounded-none lg:rounded-2xl flex items-center justify-between border-b lg:border border-gray-100 dark:border-gray-800">
                  <div>
                    <h4 className="font-bold">{w.coins} coins</h4>
                    <p className="text-xs text-gray-500">
                      {w.created_at ? new Date(w.created_at).toLocaleString() : ''}
                    </p>
                  </div>
                  <div className={`text-sm font-bold uppercase ${statusClass}`}>{w.status}</div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Modals */}
      <AnimatePresence>
        {isWithdrawModalOpen && (
          <WithdrawModal 
            coinsBalance={balance}
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
            transactions={txList.map((x) => x.tx)}
            onClose={() => setIsStatsModalOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function WithdrawModal({
  coinsBalance,
  onClose,
  onConfirm,
}: {
  coinsBalance: number;
  onClose: () => void;
  onConfirm: (amount: number, method: string, paymentDetails: string) => void;
}) {
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<'bank' | 'paypal'>('bank');
  const [paymentDetails, setPaymentDetails] = useState<string>('');

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
              <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{coinsBalance.toLocaleString()} coins</span>
            </div>
            <p className="text-[10px] mt-2 font-bold text-indigo-600 dark:text-indigo-400">
              Minimum withdraw: {MIN_WITHDRAW} coins ($10)
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Withdraw Amount (Coins)</label>
            <div className="relative">
              <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500" size={20} />
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step={1}
                placeholder="0"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
              />
              <button 
                onClick={() => setAmount(Math.floor(coinsBalance).toString())}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-600 hover:underline"
              >
                Max
              </button>
            </div>
            {Number(amount) > coinsBalance && (
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

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
              Payment Details
            </label>
            <input
              type="text"
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder={method === 'bank' ? 'Bank account / routing number' : 'PayPal email / username'}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 px-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
            />
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={
              !amount ||
              Number(amount) < MIN_WITHDRAW ||
              Number(amount) > coinsBalance ||
              !paymentDetails.trim()
            }
            onClick={() => onConfirm(parseInt(amount, 10), method, paymentDetails)}
            className="w-full bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
          >
            Withdraw Now
          </motion.button>
        </div>
      </motion.div>
    </div>
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

function BreakdownRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'violet' | 'indigo' | 'rose';
}) {
  const border =
    tone === 'emerald'
      ? 'border-emerald-100 dark:border-emerald-900/40'
      : tone === 'violet'
        ? 'border-violet-100 dark:border-violet-900/40'
        : tone === 'indigo'
          ? 'border-indigo-100 dark:border-indigo-900/40'
          : 'border-rose-100 dark:border-rose-900/40';
  const accent =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'violet'
        ? 'text-violet-600 dark:text-violet-400'
        : tone === 'indigo'
          ? 'text-indigo-600 dark:text-indigo-400'
          : 'text-rose-600 dark:text-rose-400';

  return (
    <div className={cn('bg-white dark:bg-gray-900 p-4 rounded-2xl border', border)}>
      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <Coins size={18} className="text-yellow-500 shrink-0" />
        <span className={cn('text-xl font-bold tabular-nums', accent)}>{value.toLocaleString()}</span>
        <span className="text-sm text-gray-500">coins</span>
      </div>
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

