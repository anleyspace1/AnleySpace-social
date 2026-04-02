import { X, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { MONETIZATION_TIP_AMOUNTS } from '../lib/monetizationTipUi';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called when user confirms an amount; parent should call `sendMonetizationGift` and close is handled via onPick returning */
  onPick: (amount: number) => void;
  /** When set, options above balance are disabled (optional UX hint). */
  balanceCoins?: number;
};

export function MonetizationTipPicker({ open, onClose, onPick, balanceCoins }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close tip picker"
            className="fixed inset-0 z-[200] bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="monetization-tip-picker-title"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'fixed left-1/2 top-1/2 z-[201] w-[min(92vw,340px)] -translate-x-1/2 -translate-y-1/2',
              'rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl',
              'dark:border-gray-800 dark:bg-gray-950'
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="monetization-tip-picker-title" className="text-sm font-black text-gray-900 dark:text-white">
                Send tip
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">Choose an amount in coins.</p>
            <div className="grid grid-cols-2 gap-2">
              {MONETIZATION_TIP_AMOUNTS.map((amt) => {
                const short = balanceCoins != null && balanceCoins < amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    disabled={short}
                    onClick={() => onPick(amt)}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-3 text-sm font-black text-gray-900 transition-colors',
                      'hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/40',
                      short && 'cursor-not-allowed opacity-40 hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-900'
                    )}
                  >
                    <Coins size={16} className="shrink-0 text-amber-500" />
                    {amt}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
