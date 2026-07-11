import type { Variants, Transition } from 'framer-motion';

/** Shared spring + variant presets so motion feels like one system across the app. */

export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 30 };
export const easeOutExpo: Transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: easeOutExpo },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: springSoft },
};

export const staggerChildren: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
