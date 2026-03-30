import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, X, Video, ImageIcon, ShoppingBag, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { BOOST_TIERS, purchaseMonetizationBoost, tierPriceCoins, type BoostTierId } from '../lib/monetization';
import { emitMonetizationRefresh, emitPostMonetizationRefresh } from '../lib/monetizationRealtime';
import { useAuth } from '../contexts/AuthContext';

export type BoostPickItem = {
  id: string;
  label: string;
  thumb?: string;
};

type Step = 'menu' | 'video' | 'post' | 'tiers';

type Props = {
  videoItems: BoostPickItem[];
  postItems: BoostPickItem[];
  onBoostComplete?: () => void;
  className?: string;
};

/**
 * Profile-only monetization CTA + multi-step boost hub (video / post / product).
 * Does not boost until user picks content type, then a post, then a tier.
 */
export function ProfileMonetizationCard({ videoItems, postItems, onBoostComplete, className }: Props) {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [hubOpen, setHubOpen] = useState(false);
  const [step, setStep] = useState<Step>('menu');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<BoostTierId | null>(null);
  const [busyTier, setBusyTier] = useState<BoostTierId | null>(null);

  const openHub = () => {
    setStep('menu');
    setSelectedPostId(null);
    setSelectedTierId(null);
    setHubOpen(true);
  };

  const closeHub = () => {
    setHubOpen(false);
    setStep('menu');
    setSelectedPostId(null);
    setSelectedTierId(null);
    setBusyTier(null);
  };

  const goTiers = (postId: string) => {
    const id = String(postId ?? '').trim();
    if (!id) {
      console.warn('[ProfileBoost] missing post id');
      return;
    }
    setSelectedPostId(id);
    setSelectedTierId(null);
    setStep('tiers');
  };

  const runBoost = async (tier: BoostTierId) => {
    const pid = selectedPostId ? String(selectedPostId).trim() : '';
    if (!pid) {
      alert('No post selected. Go back and pick a post or video.');
      return;
    }
    const need = tierPriceCoins(tier);
    const bal = Number(profile?.coins) || 0;
    if (bal < need) {
      alert(`You need at least ${need} coins for this tier.`);
      return;
    }
    setBusyTier(tier);
    try {
      const res = await purchaseMonetizationBoost(pid, tier);
      if (res.ok) {
        emitPostMonetizationRefresh(pid);
        emitMonetizationRefresh();
        await refreshProfile();
        onBoostComplete?.();
        closeHub();
      } else {
        alert(res.error || 'Boost failed');
      }
    } catch (e) {
      console.error('[ProfileBoost]', e);
      alert(e instanceof Error ? e.message : 'Boost failed. Please try again.');
    } finally {
      setBusyTier(null);
    }
  };

  const handleProductBoost = () => {
    closeHub();
    navigate('/marketplace');
  };

  return (
    <>
      <div
        className={cn(
          'relative rounded-2xl p-[1px] bg-gradient-to-r from-amber-400 via-fuchsia-500 to-violet-600 shadow-lg shadow-fuchsia-950/20',
          className
        )}
      >
        <div className="relative flex flex-col gap-4 rounded-2xl bg-[#0c0c18] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-amber-500/10 to-transparent"
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 text-lg" aria-hidden>
              🔒
            </span>
            <div className="min-w-0">
              <p className="text-base font-black tracking-tight text-white">Monetization locked</p>
              <p className="mt-0.5 text-sm text-white/55">Boost to enable gifts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openHub}
            className={cn(
              'relative z-10 inline-flex shrink-0 items-center justify-center gap-2 self-end sm:self-center',
              'rounded-full bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-600 px-5 py-2.5',
              'text-sm font-black text-white shadow-md shadow-fuchsia-900/40',
              'cursor-pointer transition hover:brightness-110 active:scale-[0.98]'
            )}
          >
            <Zap className="h-4 w-4 text-amber-300" strokeWidth={2.5} />
            Boost now
          </button>
        </div>
      </div>

      <AnimatePresence>
        {hubOpen && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 px-4 py-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeHub}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="boost-hub-title"
              className="relative z-10 w-full max-w-md max-h-[85vh] overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl flex flex-col"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <h2 id="boost-hub-title" className="text-lg font-black text-white">
                  {step === 'menu' && 'Boost content'}
                  {step === 'video' && 'Choose a video'}
                  {step === 'post' && 'Choose a post'}
                  {step === 'tiers' && 'Choose boost tier'}
                </h2>
                <button
                  type="button"
                  className="rounded-full p-2 text-white/70 hover:bg-white/10 cursor-pointer"
                  onClick={closeHub}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto p-4">
                {step === 'menu' && (
                  <div className="space-y-2">
                    <p className="text-sm text-white/55 mb-3">Pick what you want to promote. Each option opens its own flow.</p>
                    <MenuRow
                      icon={<Video className="text-sky-400" size={22} />}
                      title="Boost Video"
                      subtitle="Increase views & engagement on a reel"
                      onClick={() => setStep('video')}
                    />
                    <MenuRow
                      icon={<ImageIcon className="text-emerald-400" size={22} />}
                      title="Boost Post"
                      subtitle="Promote a photo or text post"
                      onClick={() => setStep('post')}
                    />
                    <MenuRow
                      icon={<ShoppingBag className="text-amber-400" size={22} />}
                      title="Boost Product"
                      subtitle="Promote marketplace listings"
                      onClick={handleProductBoost}
                    />
                  </div>
                )}

                {step === 'video' && (
                  <PickList
                    empty="No videos yet. Create a reel first."
                    items={videoItems}
                    onPick={(id) => goTiers(id)}
                    onBack={() => setStep('menu')}
                  />
                )}

                {step === 'post' && (
                  <PickList
                    empty="No image posts yet."
                    items={postItems}
                    onPick={(id) => goTiers(id)}
                    onBack={() => setStep('menu')}
                  />
                )}

                {step === 'tiers' && (
                  <div className="space-y-2">
                    {(() => {
                      const sid = selectedPostId ? String(selectedPostId).trim() : '';
                      const fromVideo = videoItems.some((v) => String(v.id) === sid);
                      const label =
                        [...videoItems, ...postItems].find((x) => String(x.id) === sid)?.label || 'Selected content';

                      if (!sid) {
                        return (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            <p className="font-semibold">Nothing selected</p>
                            <p className="mt-1 text-xs text-amber-200/90">Pick a post or video again.</p>
                            <button
                              type="button"
                              className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 cursor-pointer"
                              onClick={() => setStep('menu')}
                            >
                              Back to menu
                            </button>
                          </div>
                        );
                      }

                      const bal = Number(profile?.coins) || 0;
                      const selectedMeta = selectedTierId
                        ? BOOST_TIERS.find((x) => x.id === selectedTierId)
                        : null;
                      const selectedNeed = selectedTierId ? tierPriceCoins(selectedTierId) : 0;
                      const canAffordSelected = selectedTierId != null && bal >= selectedNeed;

                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTierId(null);
                              setStep(fromVideo ? 'video' : 'post');
                            }}
                            className="text-xs font-bold text-violet-400 hover:text-violet-300 mb-2 cursor-pointer"
                          >
                            ← Back
                          </button>
                          <p className="text-xs text-white/70 mb-2 truncate" title={label}>
                            Boosting: <span className="font-semibold text-white">{label}</span>
                          </p>
                          <p className="text-xs text-white/50 mb-2">30 days · capped boost earnings · organic unlimited</p>
                          <p className="text-[11px] text-white/45 mb-3">
                            Tap a tier to select it, then confirm below.
                          </p>
                          {BOOST_TIERS.map((t) => {
                            const need = tierPriceCoins(t.id);
                            const isSelected = selectedTierId === t.id;
                            const isProcessing = busyTier === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (busyTier !== null) return;
                                  setSelectedTierId(t.id);
                                }}
                                aria-pressed={isSelected}
                                className={cn(
                                  'w-full rounded-xl border px-4 py-3 text-left transition-all',
                                  'pointer-events-auto cursor-pointer select-none',
                                  'hover:bg-white/12 hover:border-white/25 hover:shadow-md hover:shadow-black/20',
                                  'active:scale-[0.99] active:bg-white/15',
                                  isSelected
                                    ? 'border-fuchsia-400/80 bg-violet-600/25 ring-2 ring-fuchsia-400/70 shadow-lg shadow-fuchsia-950/30'
                                    : 'border-white/10 bg-white/5',
                                  busyTier !== null && !isProcessing && 'opacity-60'
                                )}
                              >
                                <span className="font-bold text-white">
                                  {t.label} — {need} coins
                                </span>
                                <span className="block text-[11px] text-white/60">
                                  Max ${t.maxEarningsUsd.toFixed(2)} · {t.days} days
                                </span>
                                {isProcessing && (
                                  <span className="mt-1 block text-xs text-violet-300">Processing…</span>
                                )}
                              </button>
                            );
                          })}

                          {selectedTierId && selectedMeta && (
                            <div className="mt-4 rounded-xl border border-white/15 bg-black/30 p-4 pointer-events-auto">
                              <p className="text-xs font-bold text-white">
                                {selectedMeta.label} — {selectedNeed} coins
                              </p>
                              <p className="mt-1 text-[11px] text-white/55">
                                Max ${selectedMeta.maxEarningsUsd.toFixed(2)} · {selectedMeta.days} days
                              </p>
                              <p className="mt-2 text-[11px] text-white/50">
                                Your balance: <span className="font-semibold text-white">{bal}</span> coins
                                {!canAffordSelected && (
                                  <span className="text-amber-300"> · Need {selectedNeed - bal} more</span>
                                )}
                              </p>
                              {canAffordSelected ? (
                                <button
                                  type="button"
                                  disabled={busyTier !== null}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void runBoost(selectedTierId);
                                  }}
                                  className={cn(
                                    'mt-3 w-full rounded-xl py-3 text-sm font-black text-white',
                                    'bg-gradient-to-r from-violet-600 to-fuchsia-600',
                                    'hover:brightness-110 active:scale-[0.99] cursor-pointer',
                                    'disabled:opacity-50 disabled:cursor-wait'
                                  )}
                                >
                                  {busyTier !== null ? 'Processing…' : 'Confirm boost'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeHub();
                                    navigate('/wallet');
                                  }}
                                  className="mt-3 w-full rounded-xl border border-amber-400/40 bg-amber-500/15 py-3 text-sm font-bold text-amber-100 hover:bg-amber-500/25 cursor-pointer active:scale-[0.99]"
                                >
                                  Add coins to continue
                                </button>
                              )}
                            </div>
                          )}

                          <p className="text-center text-[10px] text-white/40 pt-2">Balance: {bal} coins</p>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 cursor-pointer"
    >
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-white">{title}</p>
        <p className="text-xs text-white/50">{subtitle}</p>
      </div>
      <ChevronRight className="shrink-0 text-white/40" size={18} />
    </button>
  );
}

function PickList({
  items,
  empty,
  onPick,
  onBack,
}: {
  items: BoostPickItem[];
  empty: string;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  if (items.length === 0) {
    return (
      <div>
        <button type="button" onClick={onBack} className="text-xs font-bold text-violet-400 mb-3 cursor-pointer">
          ← Back
        </button>
        <p className="text-sm text-white/50">{empty}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={onBack} className="text-xs font-bold text-violet-400 mb-2 cursor-pointer">
        ← Back
      </button>
      {items.map((it) => (
        <button
          key={String(it.id)}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = String(it.id ?? '').trim();
            if (id) onPick(id);
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10 cursor-pointer"
        >
          {it.thumb ? (
            <img src={it.thumb} alt="" className="h-12 w-12 rounded-lg object-cover bg-black/40" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
              <ImageIcon size={20} className="text-white/50" />
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{it.label}</span>
          <ChevronRight className="shrink-0 text-white/40" size={18} />
        </button>
      ))}
    </div>
  );
}
