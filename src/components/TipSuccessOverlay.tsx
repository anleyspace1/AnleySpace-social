import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export type TipSuccessFlash = { text: string; id: number };

type Props = {
  flash: TipSuccessFlash | null;
  /** `bottom` keeps controls reachable; `center` for modal-style surfaces */
  position?: 'bottom' | 'center';
  className?: string;
};

export function TipSuccessOverlay({ flash, position = 'bottom', className }: Props) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-[15] flex justify-center',
        position === 'bottom' ? 'items-end pb-[14%] md:pb-[16%]' : 'items-center pb-0',
        className
      )}
      aria-hidden={!flash}
    >
      <AnimatePresence mode="wait">
        {flash && (
          <motion.div
            key={flash.id}
            role="status"
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[90%] rounded-full border border-white/20 bg-black/60 px-4 py-2.5 text-center text-sm font-bold text-white shadow-lg backdrop-blur-md"
          >
            {flash.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
