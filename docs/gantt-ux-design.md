---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'fa0ae436-0580-4e3a-806d-2541019196b6'
  PropagateID: 'fa0ae436-0580-4e3a-806d-2541019196b6'
  ReservedCode1: '5ab9e412-f19a-4c2d-bb31-cbbb4724d3f1'
  ReservedCode2: '5ab9e412-f19a-4c2d-bb31-cbbb4724d3f1'
---

# 甘特图进化 — 交互设计方案

> 体验目标：让"被逼着当PM的人"一眼看出哪些任务拖不得、谁卡住了谁，而不是面对一堆颜色相同的条发呆。

---

## 1. 关键路径（CPM）交互设计

### 1.1 算法概述

```
输入：tasks[]（含 blockedBy 依赖关系 + startDate/dueDate）
1. 正向遍历：按拓扑序计算 ES（最早开始）、EF（最早完成）
2. 反向遍历：按逆拓扑序计算 LS（最迟开始）、LF（最迟完成）
3. 浮动时间 Float = LS - ES
4. Float === 0 的任务 → 关键路径
输出：{ criticalTaskIds: Set<string>, floatMap: Map<taskId, number> }
```

### 1.2 视觉分层

| 层级 | 关键路径任务 | 非关键路径任务 | CSS 实现 |
|------|-------------|---------------|----------|
| **任务条填充** | 保持原状态色，叠加3px左侧橙色竖条 | 保持原状态色 | 关键：`border-l-[3px] border-l-orange-500` |
| **任务条描边** | `ring-2 ring-orange-400/60` | 无描边 | 关键条自动获得光环感 |
| **透明度** | `opacity-100` | `opacity-50` | 非关键条整体降级，关键条自然突出 |
| **行背景** | 左侧标签列关键任务行背景 `bg-orange-50/40` | 默认 | 标签列也呼应，不只在时间轴上高亮 |
| **里程碑** | 旋转菱形加 `ring-2 ring-orange-400` | 无 ring | 与任务条一致的高亮逻辑 |

**为什么用左侧竖条而不是改整体色？**
- 改整体色会破坏"状态=颜色"的心智模型（蓝=进行中、绿=完成），导致信息丢失
- 左侧竖条是增量信息，不覆盖原有语义
- 与飞书项目甘特图的关键路径标记一致，学习成本为零

### 1.3 浮动时间展示

**设计：tooltip 展示，不在条内标注**

理由：
- 条内标注增加认知负荷（用户需要理解"2d"是什么意思）
- 大部分中小团队用户不理解浮动时间概念，默认不该看到
- 只在用户主动探索时提供

实现：
```tsx
// 任务条 title 属性增强
title={`关键路径 | 浮动时间: ${float}天 | ${task.title} (${STATUS_LABELS[task.status]})`}
// 非关键路径
title={`浮动时间: ${float}天 | ${task.title} (${STATUS_LABELS[task.status]})`}
```

悬浮时通过自定义 tooltip 组件（复用 shadcn/ui Tooltip）展示更丰富信息：
```
┌──────────────────────────┐
│ 📌 关键路径               │
│ 浮动时间: 0天（不可延迟）   │
│ 前置: UI设计稿确认         │
│ 后续: 前端开发、接口联调    │
└──────────────────────────┘
```

### 1.4 关键路径变更过渡动画

当任务日期/依赖变化导致关键路径重新计算时：

```css
/* tailwind.config.js 新增 keyframe */
"cpm-pulse": {
  "0%, 100%": { boxShadow: "0 0 0 0 rgba(251, 146, 60, 0)" },
  "50%": { boxShadow: "0 0 0 3px rgba(251, 146, 60, 0.3)" },
}
```

- 新加入关键路径的任务：`animate-cpm-pulse` 播放一次（1次，0.6s），然后稳定为静态 `ring-2 ring-orange-400/60`
- 从关键路径移除的任务：`ring` 和 `border-l` 通过 CSS transition 淡出（`transition-all duration-300`）
- 不关键 → 关键的任务 `opacity` 从 0.5 过渡到 1.0（`transition-opacity duration-300`）

**不需要全路径线条动画**——中小团队不需要"路径高亮飞线"那种花哨效果，只需要条本身的状态变化足够醒目。

### 1.5 三个组件的一致性

| | ProjectGanttChart | GanttModal | GlobalGanttView |
|--|---|---|---|
| CPM 计算 | ✓ 支持 | ✓ 支持 | ✓ 支持（只读） |
| 关键路径高亮 | ✓ 左竖条+ring | ✓ 左竖条+ring | ✓ SVG 中用更饱和填充色 |
| 非关键降级 | ✓ opacity-50 | ✓ opacity-50 | ✓ SVG opacity=0.4 |
| 浮动时间 | ✓ tooltip | ✓ tooltip | ✗ 只读不展示 |
| 脉冲动画 | ✓ | ✓ | ✗ 静态渲染 |

GlobalGanttView 的 SVG 实现差异：
```tsx
// 关键路径任务条
<rect ... fill={color} opacity={1.0} stroke="#fb923c" strokeWidth={2} />
// 非关键路径任务条
<rect ... fill={color} opacity={0.4} />
```

---

## 2. 依赖线交互设计

### 2.1 箭头样式

```
大小：8×6px 三角形
颜色：#94a3b8（slate-400），hover 时 #3b82f6（blue-500）
填充：实心
方向：指向目标任务左端
```

SVG marker 定义（全局一份，三组件复用）：
```tsx
<defs>
  <marker id="dep-arrow" viewBox="0 0 8 6" refX="8" refY="3"
    markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8" />
  </marker>
  <marker id="dep-arrow-hover" viewBox="0 0 8 6" refX="8" refY="3"
    markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <path d="M0,0 L8,3 L0,6 Z" fill="#3b82f6" />
  </marker>
</defs>
```

### 2.2 贝塞尔曲线路径算法

**核心原则**：从源任务条右端中点 → 目标任务条左端中点，绕过中间任务行。

```
算法（四段式贝塞尔）：

输入：
  sourceBar: { right: number, centerY: number }  // 源任务条右端中点
  targetBar: { left: number, centerY: number }    // 目标任务条左端中点

情况1：目标在源的右下方（最常见，依赖线向右向下）
  controlPoint1 = (sourceBar.right + horizontalGap, sourceBar.centerY)
  controlPoint2 = (targetBar.left - horizontalGap, targetBar.centerY)
  path = `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tx} ${ty}`

情况2：目标在源的左方（回溯依赖，源晚于目标开始）
  先向右拐出 → 垂直下/上行 → 再水平向左 → 到达目标
  path = `M ${sx} ${sy} 
          C ${sx+gap} ${sy}, ${sx+gap} ${sy+dy1}, ${sx+gap} ${sy+dy1}
          L ${tx-gap} ${ty-dy2}
          C ${tx-gap} ${ty-dy2}, ${tx-gap} ${ty}, ${tx} ${ty}`

其中：
  horizontalGap = 20px（拐出距离）
  gap 根据缩放级别调整：week=20px, month=12px
```

**关键约束**：
- 曲线不穿过任何任务条区域——通过检测中间行的任务条位置，自动增加拐点
- 对于简单场景（大多数依赖线），一条三阶贝塞尔就够了
- 性能：200条以内依赖线全部 SVG 路径预计算，不做 DOM 动态计算

### 2.3 多条依赖线重叠处理

**规则：偏移 + 颜色区分**

```
当两条依赖线的 y 坐标差 < 8px 时：
  - 按依赖来源的索引排序，依次水平偏移 +4px
  - 最多偏移 3 层（12px），超出则合并为一条粗线 + 数字标注

颜色区分（按源任务状态）：
  todo 依赖线 → #94a3b8（灰色）
  in_progress 依赖线 → #60a5fa（蓝色）
  blocked 依赖线 → #fbbf24（琥珀色）
  done 依赖线 → #86efac（浅绿色，更淡 = 不再是阻碍）
```

这样颜色含义直觉一致：完成的前置依赖线变浅，进行中/阻塞的更醒目。

### 2.4 Hover 高亮效果

```css
/* 依赖线默认态 */
.dep-line {
  stroke: #94a3b8;
  stroke-width: 1.5;
  fill: none;
  transition: stroke 0.15s, stroke-width 0.15s;
  cursor: pointer;
}

/* Hover 态 */
.dep-line:hover {
  stroke: #3b82f6;
  stroke-width: 2.5;
  filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.3));
}
```

Hover 时联动效果：
- 依赖线加粗 + 变蓝 + 微发光
- 源任务条添加 `ring-2 ring-blue-400/40`
- 目标任务条添加 `ring-2 ring-blue-400/40`
- 出现 tooltip：`「UI设计」→「前端开发」点击删除依赖`

### 2.5 删除依赖的交互

**方式：点击依赖线 → 弹出确认气泡**

```
交互流程：
1. 点击依赖线
2. 依赖线变红 + 出现小气泡
   ┌──────────────────────┐
   │ 删除依赖？            │
   │ 「UI设计」→「前端开发」 │
   │ [取消]  [删除]         │
   └──────────────────────┘
3. 点击"删除"→ 从目标任务的 blockedBy 数组移除源ID
4. 依赖线淡出动画（opacity 1→0, 200ms）
```

**气泡定位**：在依赖线中点位置偏上 8px

实现要点：
- 依赖线必须设 `pointer-events: stroke`（SVG 默认 fill-only）
- 增大点击热区：用一条透明的粗线（stroke-width: 12, opacity: 0）叠在实际线下方作为点击目标
- 全局预览 GlobalGanttView **不提供删除功能**（只读），但 hover 高亮保留

### 2.6 建立依赖的交互

**保留现有编辑面板中的 blockedBy 管理（下拉选择+标签删除）**，不在甘特图上新增拖拽建连线的入口。

理由（减法审计）：
1. 拖拽建连线增加内在认知负荷——用户需要知道"从哪拖到哪"、"拖到条上还是拖到点"，专业PM工具才需要
2. 现有编辑面板的 blockedBy 管理已经闭环，甘特图上的依赖线是**读的增强**而非**写的新入口**
3. 如果砍掉拖拽建连线，几乎没用户会真正受损——他们已经在编辑面板里管理依赖了

**唯一增强**：在 GanttModal 的编辑 popover 中，blockedBy 管理区增加"在甘特图上高亮"反馈——选中某个前置依赖时，对应的依赖线闪烁一下。

---

## 3. 组件统一后的一致性体验

### 3.1 现状分析

| | ProjectGanttChart | GanttModal | GlobalGanttView |
|--|---|---|---|
| 代码行数 | 365 | 580 | 135 |
| 渲染方式 | HTML div | HTML div | SVG |
| 依赖线 | ❌ 无 | 直线虚线 | 直线虚线 |
| 基线对比 | ❌ 无 | ✓ | ❌ 无 |
| AI 排程 | ❌ 无 | ✓ | ❌ 无 |
| 资源热力图 | ❌ 无 | ✓ | ❌ 无 |
| 拖拽编辑 | ✓ | ✓ | ❌ 只读 |
| 在线创建任务 | ❌ 无 | ✓（点击空白区） | ❌ |
| 状态点切换 | ❌ 无 | ✓ | ❌ |
| 逾期标记 | ❌ 无 | ✓ | ❌ |
| 里程碑 | ✓ | ✓ | ❌ 无 |

### 3.2 三个入口的定位

```
┌─────────────────────────────────────────────────────────┐
│  ProjectGanttChart     项目级甘特（嵌入项目详情页）        │
│  定位：项目成员的日常协作视图                               │
│  特性：可编辑、有依赖线/CPM、无基线/AI/热力图              │
│  场景：项目内开会排期、日常更新进度                          │
├─────────────────────────────────────────────────────────┤
│  GanttModal           全局弹窗（Ctrl+G / 仪表盘按钮）     │
│  定位：项目经理的全量操控台                                 │
│  特性：全功能（编辑/基线/CPM/依赖/AI排程/热力图/筛选）      │
│  场景：跨项目排期、周会进度汇报、AI辅助排程                  │
├─────────────────────────────────────────────────────────┤
│  GlobalGanttView       全局预览（仪表盘内嵌卡片）          │
│  定位：一眼看全局的只读预览                                 │
│  特性：只读、有CPM高亮+依赖线、无交互操作                   │
│  场景：晨会扫一眼、快速判断哪些项目卡住了                    │
└─────────────────────────────────────────────────────────┘
```

### 3.3 GlobalGanttView 是否升级为可交互？

**保持只读，但升级视觉**。

减法审计：
1. 增加交互 = 增加外在认知负荷（用户需要理解"这个预览能编辑？那我到底用哪个？"）
2. 仪表盘的定位是**概览**，不是**操作台**；编辑入口已有一个按钮"打开甘特图"
3. 如果砍掉 GlobalGanttView 的编辑能力，0个用户受损——他们本来就用 GanttModal

但要升级的视觉：
- ✓ 关键路径橙色左侧竖条（SVG stroke）
- ✓ 贝塞尔曲线依赖线 + 箭头（SVG path）
- ✓ 非关键路径降级（opacity=0.4）
- ✗ 不加 hover tooltip（保持轻量）
- ✗ 不加删除依赖功能

### 3.4 统一的设计变量

三个组件必须共享以下常量和逻辑，提取到 `src/lib/gantt/constants.ts` 和 `src/lib/gantt/cpm.ts`：

```ts
// src/lib/gantt/constants.ts
export const GANTT_DAY_MS = 86400000;
export const GANTT_ROW_HEIGHT = 36;
export const GANTT_HEADER_HEIGHT = 48;
export const GANTT_LABEL_WIDTH = 220;
export const GANTT_DAY_WIDTH: Record<ZoomLevel, number> = { week: 40, month: 16 };
export const GANTT_BAR_HEIGHT = 20;
export const GANTT_MILESTONE_SIZE = 12;

export const STATUS_COLORS: Record<TaskStatus, string> = { /* 统一 */ };
export const STATUS_BAR_COLORS: Record<TaskStatus, string> = { /* 统一 */ };
export const STATUS_LABELS: Record<TaskStatus, string> = { /* 统一 */ };

export const DEP_LINE_COLOR_DEFAULT = '#94a3b8';
export const DEP_LINE_COLOR_HOVER = '#3b82f6';
export const DEP_LINE_COLOR_DELETE = '#ef4444';
export const DEP_ARROW_SIZE = { width: 8, height: 6 };
export const DEP_BEZIER_GAP_WEEK = 20;
export const DEP_BEZIER_GAP_MONTH = 12;

export const CPM_BORDER_CLASS = 'border-l-[3px] border-l-orange-500';
export const CPM_RING_CLASS = 'ring-2 ring-orange-400/60';
export const CPM_NON_CRITICAL_OPACITY = 'opacity-50';
```

```ts
// src/lib/gantt/cpm.ts
export interface CPMResult {
  criticalTaskIds: Set<string>;
  floatMap: Map<string, number>; // taskId → float days
}

export function computeCriticalPath(
  tasks: Array<{ id: string; blockedBy: string[]; startDate: string | null; dueDate: string | null }>
): CPMResult { /* 正向+反向遍历算法 */ }
```

```ts
// src/lib/gantt/depLines.ts
export interface DepLine {
  id: string;           // `${sourceId}-${targetId}`
  sourceId: string;
  targetId: string;
  path: string;         // SVG path d 属性
  color: string;        // 基于源任务状态
  isCritical: boolean;  // 两端都在关键路径上
}

export function computeDepLines(
  tasks: Array<{ id: string; blockedBy: string[]; startDate: string | null; dueDate: string | null }>,
  layout: { getBarRect: (taskId: string) => { left: number; right: number; centerY: number } },
  zoom: ZoomLevel
): DepLine[] { /* 贝塞尔曲线路径计算 */ }
```

### 3.5 提取共享 Hook

```ts
// src/lib/gantt/useGanttEngine.ts
export function useGanttEngine(options: {
  tasks: Task[];
  zoom: ZoomLevel;
  labelWidth?: number;
  dayWidth?: number;
}) {
  // 返回三个组件都需要共享的计算逻辑
  return {
    timeRange,         // 自动计算时间范围
    headerDates,       // 表头日期
    cpmResult,         // 关键路径计算结果
    depLines,          // 依赖线路径
    dayWidth,          // 缩放后的天宽
    totalDays,         // 总天数
    todayOffset,       // 今天线位置
    timelineWidth,     // 时间轴总宽
  };
}
```

---

## 4. 组件结构建议

### 4.1 目录结构

```
src/lib/gantt/
  ├── constants.ts      # 共享常量、颜色映射
  ├── cpm.ts           # CPM 算法（纯函数）
  ├── depLines.ts      # 依赖线路径计算（纯函数）
  ├── dateUtils.ts     # parseDate/formatDate/addDays/getMonday
  └── useGanttEngine.ts # 共享状态 hook

src/components/gantt/
  ├── GanttBar.tsx          # 单个任务条（含CPM高亮、resize手柄、状态点）
  ├── GanttDependencyLines.tsx  # SVG 依赖线层（含 hover/click 删除）
  ├── GanttDayHeaders.tsx   # 日期表头（月+日两行）
  ├── GanttTaskLabels.tsx   # 左侧任务名列表
  ├── GanttTaskRow.tsx      # 单行（bar + 依赖线）
  ├── GanttTodayLine.tsx    # 今天竖线
  └── GanttLegend.tsx       # 底部图例（含CPM图例新增）
```

### 4.2 GanttBar 组件 Props

```tsx
interface GanttBarProps {
  task: Task;
  isCritical: boolean;
  floatDays: number;
  isMilestone: boolean;
  leftPx: number;
  widthPx: number;
  canEdit: boolean;
  onDragStart: (e: React.MouseEvent, type: 'move' | 'resize-start' | 'resize-end') => void;
  onStatusCycle: () => void;
  onDoubleClick: () => void;
}
```

### 4.3 GanttDependencyLines 组件 Props

```tsx
interface GanttDependencyLinesProps {
  depLines: DepLine[];
  zoom: ZoomLevel;
  canDelete: boolean;         // 只读模式下 false
  onDeleteDep: (sourceId: string, targetId: string) => void;
  hoveredDepId: string | null;
  onHoverDep: (id: string | null) => void;
  criticalTaskIds: Set<string>;
}
```

---

## 5. 尺寸与间距规范

| 元素 | 尺寸 | 说明 |
|------|------|------|
| 任务条高度 | 20px | 沿用现有 |
| 任务条圆角 | 4px | 沿用 `rounded` |
| 关键路径左竖条 | 3px 宽 | `border-l-[3px]` |
| 关键路径光环 | 2px ring | `ring-2 ring-orange-400/60` |
| 依赖线粗细 | 1.5px（默认）/ 2.5px（hover） | |
| 箭头 | 8×6px | |
| 依赖线点击热区 | stroke-width: 12px 透明层 | |
| 贝塞尔拐出距离 | 20px(week) / 12px(month) | |
| 依赖线间偏移 | 4px/条 | 重叠时 |

---

## 6. 底部图例新增项

在现有图例末尾追加：

```tsx
{/* 关键路径图例 */}
<span className="h-3 w-px bg-border mx-1" />
<span className="flex items-center gap-1">
  <span className="w-5 h-3 rounded border-l-[3px] border-l-orange-500 ring-2 ring-orange-400/60 bg-blue-100 border border-blue-400" />
  关键路径
</span>
<span className="flex items-center gap-1">
  <span className="w-4 h-2 rounded bg-blue-100 border border-blue-400 opacity-40" />
  非关键
</span>
<span className="flex items-center gap-1">
  <svg width="20" height="10"><path d="M0,5 C5,5 10,5 15,5" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#legend-arrow)"/></svg>
  依赖
</span>
```

---

## 7. 动效规范

| 场景 | 动效 | 时长 | 缓动 |
|------|------|------|------|
| 关键路径新加入 | `cpm-pulse` 一次 | 600ms | ease-in-out |
| 关键路径移除 | ring/border-l 淡出 | 300ms | ease-out |
| 非关键→关键 opacity | 0.5→1.0 | 300ms | ease-out |
| 依赖线 hover | 加粗+变色 | 150ms | ease-out |
| 依赖线删除 | 淡出 | 200ms | ease-out |
| 依赖线删除确认 | 线变红 | 150ms | ease-out |
| 任务拖拽 | 直接 DOM 操作（沿袭现有） | 即时 | — |

**不做全路径飞线动画**——飞线动画看起来酷但对"被逼着当PM的人"毫无价值，而且增加渲染成本。

---

## 8. 无障碍

- 依赖线添加 `aria-label`：`"从「UI设计」到「前端开发」的依赖关系"`
- 关键路径任务条在 `title` 中标注"关键路径"
- 依赖线点击热区需 `role="button"` + `tabindex={0}` + `onKeyDown` 处理 Enter/Space
- 颜色不是唯一区分手段：关键路径有左侧竖条（形状）+ ring（尺寸）双重标记

> AI生成