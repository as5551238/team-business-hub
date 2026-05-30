---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '6d2fcc3d-6e50-46b1-82bc-5bc44923da9b'
  PropagateID: '6d2fcc3d-6e50-46b1-82bc-5bc44923da9b'
  ReservedCode1: '22059dc4-862e-466a-a2fc-be88905a5884'
  ReservedCode2: '22059dc4-862e-466a-a2fc-be88905a5884'
---

# CODE_MAP.md — TBH项目语义索引

> 仿Claude Code大型代码库分层策略(P432)：帮助Agent快速定位，避免遍历搜索浪费Token。
> 参考：CodeGraph(P430)预索引思想，100%本地，无需上传。

## 架构概览

```
src/
├── App.tsx              # 路由定义 (React.lazy懒加载)
├── main.tsx             # 入口
├── index.css            # 全局样式
├── pages/               # 路由页面 (8+子目录)
├── components/          # 可复用UI (20+5ui+1layout+1gantt+1cmd)
├── hooks/               # 自定义Hooks (2)
├── lib/                 # 业务逻辑 (17+22ai+1gantt)
├── store/               # Zustand状态 (9)
├── supabase/            # 后端集成 (5)
├── types/               # 全局类型 (1)
├── data/                # 模拟数据 (1)
└── assets/              # 静态资源 (1)
```

## 页面→文件映射

| 修改目标 | 文件路径 | 说明 |
|----------|----------|------|
| 仪表盘 | `pages/Dashboard.tsx` + `pages/dashboard/*.tsx` | 6个Tab: Business/Plans/Gantt/RiskAI/Other/AIWidgets |
| 任务管理 | `pages/Tasks.tsx` | 任务CRUD+视图切换 |
| 目标(OKR) | `pages/Goals.tsx` + `pages/goals/views.tsx` | 目标+KR，4象限/列表视图 |
| 项目管理 | `pages/Projects.tsx` + `pages/projects/views.tsx` | 项目CRUD+视图 |
| 知识库 | `pages/Knowledge.tsx` + `pages/knowledge/NotesView.tsx` | 笔记管理 |
| 管理后台 | `pages/Admin.tsx` + `pages/admin/*.tsx` (21个Tab) | 最重模块：Team/Settings/AI/Flow/Deploy... |
| AI分析 | `pages/AIAnalysis.tsx` | AI分析面板 |
| 洞察 | `pages/Insight.tsx` | 洞察页面 |

## 详情面板组件链

```
ItemDetailPanel.tsx (入口)
  ├── DetailKRs.tsx         # 关键结果
  ├── DetailRelationships.tsx # 关联关系
  ├── DetailComments.tsx     # 评论
  ├── DetailPeople.tsx       # 人员
  ├── DetailLinks.tsx        # 链接
  ├── DetailChildItems.tsx   # 子项
  └── DetailProjectSections.tsx # 项目分区
```

## AI引擎模块 (lib/ai/)

| 模块 | 文件 | 功能 |
|------|------|------|
| LLM调用 | `llmService.ts` | 统一LLM API调用 |
| 排期 | `aiAutoScheduler.ts` | AI自动排期 |
| 分解 | `aiDecomposition.ts` | AI任务分解 |
| 风险 | `aiRiskPredictor.ts` | AI风险预测 |
| 摘要 | `aiSummaryGenerator.ts` | AI摘要生成 |
| 评审 | `aiReviewGenerator.ts` | AI评审生成 |
| 匹配 | `aiMatcher.ts` | 人-任务智能匹配 |
| 优化 | `aiGlobalOptimizer.ts` | 全局优化器 |
| 约束 | `aiConstraintSolver.ts` | 约束求解 |
| 资源 | `aiResourceReallocator.ts` | 资源重分配 |
| 能力 | `aiCapabilityGap.ts` + `aiTeamCapability.ts` | 能力评估 |
| 协作 | `aiCollaborationHealth.ts` | 协作健康度 |
| 上下文 | `aiContextEngine.ts` | 上下文引擎 |
| 方法论 | `aiMethodology.ts` + `aiMethodologyEvolution.ts` | 方法论推荐+演进 |
| 战略 | `aiVisionStrategy.ts` | 愿景战略 |
| 搜索 | `aiSmartSearch.ts` | 智能搜索 |
| 底层 | `analysisEngine.ts` + `dataCollector.ts` | 分析引擎+数据采集 |

## 状态管理 (store/)

| Slice | 文件 | 实体 |
|-------|------|------|
| 任务 | `taskSlice.ts` | tasks/subtasks |
| 目标 | `goalSlice.ts` | goals/keyResults |
| 项目 | `projectSlice.ts` | projects |
| 同步 | `supabase.ts` | MERGE_STATE+2s防抖 |
| 合并 | `useStore.tsx` | 主Store入口 |

## 关键业务逻辑 (lib/)

| 领域 | 文件 | 核心逻辑 |
|------|------|----------|
| 延期预测 | `predictionEngine.ts` + `delayPrediction.ts` | 延期风险预测 |
| 资源瓶颈 | `resourceBottleneck.ts` | 资源负载检测 |
| KPI计算 | `kpiScoring.ts` | KPI评分算法 |
| 推送通知 | `pushEventEngine.ts` + `pushConnector.ts` | 企微+浏览器推送 |
| 按时调度 | `ganttCommandCenter.ts` | 甘特图操作 |
| Agent协作 | `agentCollaboration.ts` + `agentGateway.ts` | AI Agent编排 |
| MCP工具 | `mcpServer.ts` | MCP协议集成 |
| 部署 | `deployKit.ts` | 部署工具包 |
| 备份 | `excelBackup.ts` | Excel导入导出 |

## 后端集成 (supabase/)

| 文件 | 功能 |
|------|------|
| `client.ts` | Supabase客户端初始化 |
| `email.ts` | Resend API + pg_net异步邮件 |
| `storage.ts` | 文件存储操作 |
| `wechat.ts` | 企业微信群机器人 |
| `schema.sql` | 数据库DDL |

## 常见修改快速定位

| 需求 | 改哪里 |
|------|--------|
| 新增页面路由 | `App.tsx` (React.lazy) + `pages/NewPage.tsx` |
| 新增管理Tab | `pages/Admin.tsx` + `pages/admin/NewTab.tsx` |
| 修改详情面板 | `components/ItemDetailPanel.tsx` + 对应Detail子组件 |
| 添加AI能力 | `lib/ai/新模块.ts` + `lib/ai/index.ts`导出 |
| 修改数据模型 | `types/index.ts` + 对应store Slice + `supabase/schema.sql` |
| 新增推送渠道 | `lib/pushConnector.ts` |
| 修改权限 | `lib/utils.ts`(hasPermission) + `CONTEXT.md`权限表 |
| 构建部署 | `vite.config.ts` + `.temp/deploy-fast.cjs` |

> AI生成