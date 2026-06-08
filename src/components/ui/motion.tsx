import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';

// ─── Spring Presets ─────────────────────────────────────────
/** 统一弹性参数，保证全应用动效一致性 */
export const SPRING = {
  /** 弹性 - 轻跳感 (按钮/切换) */
  bouncy: { type: 'spring' as const, stiffness: 500, damping: 28, mass: 0.6 },
  /** 平滑 - 柔和过渡 (面板/弹窗) */
  smooth: { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.8 },
  /** 紧凑 - 快速响应 (hover/press) */
  snappy: { type: 'spring' as const, stiffness: 600, damping: 35, mass: 0.5 },
  /** 惰性 - 沉稳大气 (页面/全屏) */
  heavy: { type: 'spring' as const, stiffness: 300, damping: 32, mass: 1.0 },
};

/** Page transition wrapper — fade+slide for route-level content */
export const PageTransition: React.FC<{ children: React.ReactNode; keyProp: string }> = ({ children, keyProp }) => (
  <AnimatePresence mode="wait">
    <motion.div
      key={keyProp}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={SPRING.smooth}
      style={{ height: '100%' }}
    >
      {children}
    </motion.div>
  </AnimatePresence>
);
