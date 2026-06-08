/**
 * resolveToken — 将 CSS 自定义属性解析为可用颜色字符串
 * S2-7: 解决 SVG/Canvas 无法使用 Tailwind class 的问题
 *
 * 用法：
 *   fill={resolveToken('primary')}       // → '#3B82F6'
 *   fill={resolveToken('chart-purple')}  // → '#7C3AED'
 *   stroke={resolveToken('muted-foreground', 0.5)} // → 'rgba(107,114,128,0.5)'
 */

type TokenName =
  | 'primary' | 'primary-foreground'
  | 'secondary' | 'secondary-foreground'
  | 'muted' | 'muted-foreground'
  | 'accent' | 'accent-foreground'
  | 'destructive' | 'destructive-foreground'
  | 'success' | 'success-foreground'
  | 'warning' | 'warning-foreground'
  | 'info' | 'info-foreground'
  | 'background' | 'foreground'
  | 'card' | 'card-foreground'
  | 'border' | 'ring' | 'input'
  | 'sidebar' | 'sidebar-foreground' | 'sidebar-accent'
  | 'chart-purple' | 'chart-pink' | 'chart-cyan' | 'chart-indigo'
  | 'chart-green' | 'chart-amber' | 'chart-blue';

/** CSS var name → HSL channels cache */
const cache = new Map<string, { h: number; s: number; l: number }>();

/** 读取 CSS 自定义属性的 HSL 通道值 */
function readHSLL(channels: string): { h: number; s: number; l: number } {
  const parts = channels.trim().split(/\s+/);
  return {
    h: parseFloat(parts[0]),
    s: parseFloat(parts[1]),
    l: parseFloat(parts[2]),
  };
}

/** HSL → Hex 转换 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** HSL → RGB 转换 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * Math.max(0, Math.min(1, l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))));
  };
  return [f(0), f(8), f(4)];
}

/**
 * 解析 Design Token 为可用的颜色字符串
 * @param token 语义 token 名称 (如 'primary', 'chart-purple', 'muted-foreground')
 * @param opacity 可选透明度 0-1，传入则返回 rgba 格式
 * @returns hex 或 rgba 字符串
 */
export function resolveToken(token: TokenName, opacity?: number): string {
  const cssVar = `--${token}`;
  const cached = cache.get(cssVar);
  let hsl: { h: number; s: number; l: number };

  if (cached) {
    hsl = cached;
  } else {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar);
    if (!raw) {
      // Fallback: 主题切换时可能读不到，返回灰色
      return opacity !== undefined ? `rgba(107,114,128,${opacity})` : '#6B7280';
    }
    hsl = readHSLL(raw);
    cache.set(cssVar, hsl);
  }

  if (opacity !== undefined) {
    const [r, g, b] = hslToRgb(hsl.h, hsl.s, hsl.l);
    return `rgba(${r},${g},${b},${opacity})`;
  }
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

/** 状态色映射 — 替代散落的硬编码 #94a3b8 / #3b82f6 / #22c55e 等
 * 返回 hex 色值，自动响应深色模式
 */
function statusColor(status: string, opacity?: number): string {
  const map: Record<string, TokenName> = {
    todo: 'muted-foreground',
    in_progress: 'primary',
    done: 'success',
    blocked: 'warning',
    cancelled: 'destructive',
  };
  return resolveToken(map[status] || 'muted-foreground', opacity);
}

/**
 * 清除缓存 — 主题切换时调用
 */
export function invalidateTokenCache(): void {
  cache.clear();
}
