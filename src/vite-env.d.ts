/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Client-only Stripe publishable key (Vercel-style name). */
  readonly NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  /** Legacy Vite-style alias; still loaded if set. */
  readonly VITE_STRIPE_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
