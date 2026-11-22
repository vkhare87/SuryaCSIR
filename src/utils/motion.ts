import type { Variants, Transition } from 'framer-motion';

/** Shared spring + variant presets so motion feels like one system across the app. */

export const easeOutExpo: Transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] };

/** Snappy shared-element spring for sidebar active pill and sliding tab indicators. */
export const navSpring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };

/** Instant, non-blocking page entrance (replaces 400ms AnimatePresence mode="wait"). */
export const pageEnter = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.14, ease: [0.16, 1, 0.3, 1] as const },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: easeOutExpo },
};

export const staggerChildren: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
