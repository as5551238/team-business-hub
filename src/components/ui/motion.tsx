import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';

/** Page transition wrapper — fade+slide for route-level content */
export const PageTransition: React.FC<{ children: React.ReactNode; keyProp: string }> = ({ children, keyProp }) => (
  <AnimatePresence mode="wait">
    <motion.div
      key={keyProp}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      style={{ height: '100%' }}
    >
      {children}
    </motion.div>
  </AnimatePresence>
);

/** Slide-up for modals and dropdowns */
export const SlideUp: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 10 }}
    transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.6 }}
    className={className}
  >
    {children}
  </motion.div>
);

/** Slide-in from right for detail panels */
export const SlideInRight: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, x: 24 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 24 }}
    transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
    className={className}
  >
    {children}
  </motion.div>
);

/** Expand/collapse animation for tree nodes */
export const ExpandCollapse: React.FC<{ children: React.ReactNode; expanded: boolean }> = ({ children, expanded }) => (
  <AnimatePresence initial={false}>
    {expanded && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        style={{ overflow: 'hidden' }}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

/** Staggered list item entrance */
export const StaggerItem: React.FC<{ children: React.ReactNode; index: number }> = ({ children, index }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.3), ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);
