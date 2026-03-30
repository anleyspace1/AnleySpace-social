import React from 'react';
import { buyCoins, COIN_PURCHASE_PACKAGES, type CoinsPackage } from '../lib/buyCoins';
import { cn } from '../lib/utils';

export type BuyCoinsMenuProps = {
  open: boolean;
  onClose: () => void;
  /** Positioning + width for the package list (parent should be `relative`). */
  panelClassName: string;
  /** Optional z-index for the full-screen dismiss layer (panel stays above via z-[100]). */
  backdropZClass?: string;
};

/**
 * Package list + backdrop; calls existing `buyCoins` (Stripe checkout) — same behavior as navbar.
 */
export function BuyCoinsMenu({
  open,
  onClose,
  panelClassName,
  backdropZClass = 'z-[90]',
}: BuyCoinsMenuProps) {
  if (!open) return null;

  const handlePick = (coins: CoinsPackage) => {
    void buyCoins(coins).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not start checkout';
      window.alert(msg);
    });
    onClose();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close buy coins menu"
        className={cn('fixed inset-0 cursor-default bg-transparent', backdropZClass)}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute z-[100] transform-none rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-2xl',
          panelClassName
        )}
      >
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Buy coins
        </p>
        <div className="flex flex-col gap-1">
          {COIN_PURCHASE_PACKAGES.map(({ coins, label, priceUsd }) => (
            <button
              key={coins}
              type="button"
              className="w-full flex justify-between items-center py-2 px-3 rounded-lg text-sm text-gray-900 dark:text-gray-100 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => handlePick(coins)}
            >
              <span className="font-semibold">{label}</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0">{priceUsd}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
