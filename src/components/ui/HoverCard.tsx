import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface HoverCardProps {
  /** inline trigger (e.g. an entity name/link) */
  children: ReactNode;
  /** floating peek content, lazily rendered while open */
  content: ReactNode;
  openDelay?: number;
  /** Where the card opens from the trigger. `right` suits a narrow rail. */
  side?: 'bottom' | 'right';
  /** Wrapper around the trigger (default: inline-block). */
  className?: string;
  /** Size and padding of the card (default: a 288px peek). */
  panelClassName?: string;
}

/** Floating peek card. Anchored via fixed coords from the trigger rect so it
 *  escapes overflow-hidden table/scroll containers. Pointer devices only. */
export function HoverCard({
  children, content, openDelay = 250, side = 'bottom', className = 'inline-block', panelClassName = 'mt-1 w-72 p-4',
}: HoverCardProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>(0);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);

  const open = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (side === 'right') { setPos({ x: r.right + 8, y: r.top + 4, above: false }); return; }
      const above = r.bottom + 220 > window.innerHeight;
      setPos({ x: r.left, y: above ? r.top : r.bottom, above });
    }, openDelay);
  };
  const close = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };

  return (
    <span ref={ref} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close} className={className}>
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
            className={`rounded-xl border border-border bg-surface-raised/90 backdrop-blur-md shadow-[var(--shadow-e4)] ${panelClassName}`}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
