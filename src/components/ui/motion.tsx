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

// ─── Route / Layout Level ──────────────────────────────────

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

/** Slide-up for modals and dropdowns */
export const SlideUp: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 10 }}
    transition={SPRING.bouncy}
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
    transition={SPRING.smooth}
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

// ─── Micro-interactions ────────────────────────────────────

/** 可交互元素的 hover + press 微动效 */
export const InteractiveScale: React.FC<{
  children: React.ReactNode;
  className?: string;
  hoverScale?: number;
  pressScale?: number;
}> = ({ children, className, hoverScale = 1.02, pressScale = 0.97 }) => (
  <motion.div
    whileHover={{ scale: hoverScale }}
    whileTap={{ scale: pressScale }}
    transition={SPRING.snappy}
    className={className}
  >
    {children}
  </motion.div>
);

/** 状态切换动效 — 按钮/开关/标签的 toggled 状态 */
export const ToggleAnim: React.FC<{
  children: React.ReactNode;
  active: boolean;
  className?: string;
}> = ({ children, active, className }) => (
  <motion.div
    animate={{
      scale: active ? 1.03 : 1,
      opacity: active ? 1 : 0.7,
    }}
    transition={SPRING.snappy}
    className={className}
  >
    {children}
  </motion.div>
);

/** 列表项重排动效 — 包裹 Reorder.Item 或 drag 列表中的单个条目 */
export const ReorderItem: React.FC<{
  children: React.ReactNode;
  value: string;
  className?: string;
}> = ({ children, value, className }) => (
  <motion.div
    layout
    layoutId={value}
    transition={SPRING.smooth}
    className={className}
  >
    {children}
  </motion.div>
);

/** 数字变化动效 — 计数器、进度百分比等 */
export const CountUp: React.FC<{
  value: number;
  className?: string;
  formatter?: (v: number) => string;
}> = ({ value, className, formatter = (v) => String(v) }) => {
  const [display, setDisplay] = React.useState(value);
  React.useEffect(() => {
    const diff = value - display;
    if (Math.abs(diff) < 1) { setDisplay(value); return; }
    const steps = 12;
    const step = diff / steps;
    let current = display;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      current += step;
      if (i >= steps) { setDisplay(value); clearInterval(timer); }
      else setDisplay(Math.round(current * 10) / 10);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <span className={className}>{formatter(display)}</span>;
};

/** 操作成功脉冲反馈 — 一闪而过的缩放+透明度 */
export const Pulse: React.FC<{
  children: React.ReactNode;
  trigger: number; // 改变时触发脉冲
  className?: string;
}> = ({ children, trigger, className }) => (
  <motion.div
    key={trigger}
    initial={{ scale: 1 }}
    animate={{ scale: [1, 1.08, 1] }}
    transition={{ duration: 0.3, ease: 'easeInOut' }}
    className={className}
  >
    {children}
  </motion.div>
);

/** 淡入 — 简单的出场动效 */
export const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
}> = ({ children, delay = 0, className }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.25, delay, ease: 'easeOut' }}
    className={className}
  >
    {children}
  </motion.div>
);

