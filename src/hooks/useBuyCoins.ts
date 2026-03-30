import { useState, useCallback } from 'react';

/**
 * Shared open/close state for the Stripe coin packages menu (navbar, wallet, etc.).
 */
export function useBuyCoins() {
  const [open, setOpen] = useState(false);

  const openBuyCoinsMenu = useCallback(() => setOpen(true), []);
  const closeBuyCoinsMenu = useCallback(() => setOpen(false), []);
  const toggleBuyCoinsMenu = useCallback(() => setOpen((o) => !o), []);

  return {
    buyCoinsMenuOpen: open,
    openBuyCoinsMenu,
    closeBuyCoinsMenu,
    toggleBuyCoinsMenu,
  };
}
