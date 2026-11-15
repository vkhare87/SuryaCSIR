import { Children, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fadeUp, staggerChildren } from '../../utils/motion';

/** Page-entry motion: each direct child rises in, one after the other.
 *  A child that renders nothing leaves an empty wrapper, which hides itself
 *  so it takes no gap. */
export function Stagger({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div className={className} variants={staggerChildren} initial="hidden" animate="show">
      {Children.map(children, child =>
        child == null || child === false ? null : (
          <motion.div variants={fadeUp} className="empty:hidden">{child}</motion.div>
        ),
      )}
    </motion.div>
  );
}
