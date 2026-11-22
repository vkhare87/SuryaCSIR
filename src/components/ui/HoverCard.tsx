import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface HoverCardProps {
  /** inline trigger (e.g. an entity name/link) */
  children: ReactNode;
  /** floating peek content, lazily rendered while open */
  content: ReactNode;
  openDelay?: number;
}

/** Floating peek card. Anchored via fixed coords from the trigger rect so it
 *  escapes overflow-hidden table/scroll containers. Pointer devices only. */
export function HoverCard({ children, content, openDelay = 250 }: HoverCardProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>(0);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);

  const open = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const above = r.bottom + 220 > window.innerHeight;
      setPos({ x: r.left, y: above ? r.top : r.bottom, above });
    }, openDelay);
  };
  const close = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };

  return (
    <span ref={ref} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close} className="inline-block">
      {children}
      <AnimatePresence>
        {pos && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: pos.above ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              left: Math.min(pos.x, window.innerWidth - 300),
              top: pos.y,
              transform: pos.above ? 'translateY(-100%)' : 'none',
              zIndex: 60,
            }}
            className="mt-1 w-72 rounded-xl border border-border bg-surface-raised shadow-[var(--shadow-e4)] p-4"
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
