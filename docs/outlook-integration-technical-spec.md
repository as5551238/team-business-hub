---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'f71ad355-dc84-40a2-95a9-76c1d69d54ab'
  PropagateID: 'f71ad355-dc84-40a2-95a9-76c1d69d54ab'
  ReservedCode1: 'd607dc31-bb2b-4ef4-8669-62504655c977'
  ReservedCode2: 'd607dc31-bb2b-4ef4-8669-62504655c977'
---

# Outlook 邮箱与日程集成技术方案

> 团队业务中台 TBH — Microsoft Graph API 集成设计文档
> 版本: v1.0 | 日期: 2026-06-05

---

## 一、现状分析

### 1.1 现有认证体系

| 项目 | 现状 | 差距 |
|------|------|------|
| 用户登录 | 本地 Member 查找，无服务端验证 | 无 OAuth2 基础设施 |
| 外部集成 | IntegrationsTab 有飞书/钉钉/企微 OAuth Shell | 仅 UI 壳，无实际 Token 流程 |
| Token 存储 | 仅 localStorage | 无服务端 Token 安全存储 |
| 日历功能 | ScheduleTab 内部日历 | 无外部日历同步 |
| Supabase | 支持 anon key 连接 | 未启用 Supabase Auth Provider |

### 1.2 关键约束

- **无服务端**：中台是纯 SPA + Supabase（无自建后端），OAuth token 交换需通过 Supabase Edge Function 或微软直接授权码流程
- **每人独立账号**：每个团队成员独立授权自己的 Outlook，非管理员代理
- **数据安全**：邮件/日程属敏感数据，仅存元数据不存正文

---

## 二、架构设计

### 2.1 总体架构

```
┌─────────────────────────────────────────────────┐
│                   TBH 前端 SPA                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  日历Tab  │  │  邮件Tab  │  │ 集成设置Tab   │  │
│  └─────┬────┘  └─────┬────┘  └───────┬───────┘  │
│        │             │               │           │
│  ┌─────┴─────────────┴───────────────┴───────┐  │
│  │         Outlook Integration Layer          │  │
│  │  - Token Manager (刷新/存储)               │  │
│  │  - Graph API Client (日历/邮件)            │  │
│  │  - Sync Engine (双向同步)                   │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                            │
└─────────────────────┼────────────────────────────┘
                      │
        ┌─────────────┼──────────────┐
        │             │              │
   ┌────▼────┐  ┌─────▼─────┐  ┌────▼────┐
   │Supabase │  │  Supabase │  │Microsoft│
   │   DB    │  │Edge Func  │  │ Graph   │
   │(tokens) │  │(token交换) │  │   API   │
   └─────────┘  └───────────┘  └─────────┘
```

### 2.2 认证流程

**方案 A：Supabase Auth + Microsoft Provider（推荐）**

```
用户点击"连接Outlook"
  → Supabase Auth.signInWithOAuth({ provider: 'microsoft' })
  → 重定向到 Microsoft 登录页
  → 用户授权 Calendars.ReadWrite + Mail.Read
  → 微软回调 Supabase Auth
  → Supabase 存储 provider_token + refresh_token
  → 重定向回 TBH，前端从 URL hash 获取 session
  → TBH 将 OAuth token 关联到当前 Member
```

**方案 B：纯前端 Authorization Code Flow + PKCE（无需 Supabase Auth）**

```
用户点击"连接Outlook"
  → 前端生成 PKCE code_verifier + code_challenge
  → 打开微软授权页（带 code_challenge）
  → 用户授权
  → 微软回调 TBH 带 authorization_code
  → 前端通过 Supabase Edge Function 交换 token（避免暴露 client_secret）
  → Edge Function 返回 access_token + refresh_token
  → 前端存入 Supabase oauth_tokens 表
```

**推荐方案 A**：Supabase Auth 原生支持 Microsoft Provider，Token 自动管理，无需自建 Edge Function。

### 2.3 数据模型

#### 2.3.1 新增数据库表

**oauth_tokens** — 每人每 provider 的 OAuth 凭证

```sql
CREATE TABLE oauth_tokens (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  member_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  provider    text NOT NULL,  -- 'microsoft', 'google', etc.
  provider_account_id text,  -- 微侧的用户 OID
  access_token  text NOT NULL,
  refresh_token text,
  token_type    text DEFAULT 'Bearer',
  expires_at    timestamptz NOT NULL,
  scope         text,        -- 'Calendars.ReadWrite Mail.Read'
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(member_id, provider)
);

-- RLS: 用户只能读写自己的 token
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own tokens" ON oauth_tokens
  FOR SELECT USING (member_id = current_setting('app.current_user_id')::text);
CREATE POLICY "Users insert own tokens" ON oauth_tokens
  FOR INSERT WITH CHECK (member_id = current_setting('app.current_user_id')::text);
CREATE POLICY "Users update own tokens" ON oauth_tokens
  FOR UPDATE USING (member_id = current_setting('app.current_user_id')::text);
```

**outlook_calendar_events** — Outlook 日历事件缓存

```sql
CREATE TABLE outlook_calendar_events (
  id                text PRIMARY KEY,  -- 微软 Graph event ID
  member_id         text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  subject           text NOT NULL,
  body_preview      text,
  start_time        timestamptz NOT NULL,
  end_time          timestamptz NOT NULL,
  is_all_day        boolean DEFAULT false,
  location          text,
  is_recurring      boolean DEFAULT false,
  series_master_id  text,
  sensitivity       text DEFAULT 'normal',  -- normal/personal/private/confidential
  outlook_link      text,         -- 在 Outlook 中打开的 URL
  linked_item_id    text,         -- 关联的 TBH 任务/目标/项目 ID
  linked_item_type  text,         -- 'task' | 'goal' | 'project'
  etag              text,         -- 用于增量同步
  last_synced_at    timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_outlook_events_member ON outlook_calendar_events(member_id);
CREATE INDEX idx_outlook_events_time ON outlook_calendar_events(member_id, start_time);

ALTER TABLE outlook_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own events" ON outlook_calendar_events
  FOR SELECT USING (member_id = current_setting('app.current_user_id')::text);
```

**outlook_mail_summary** — 邮件摘要缓存（仅存元数据，不存正文）

```sql
CREATE TABLE outlook_mail_summary (
  id              text PRIMARY KEY,  -- 微软 Graph message ID
  member_id       text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  sender_name     text,
  sender_email    text,
  received_at     timestamptz NOT NULL,
  is_read         boolean DEFAULT false,
  importance      text DEFAULT 'normal',  -- low/normal/high
  has_attachments boolean DEFAULT false,
  outlook_link    text,
  linked_item_id  text,
  linked_item_type text,
  etag            text,
  last_synced_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_outlook_mail_member ON outlook_mail_summary(member_id, received_at DESC);

ALTER TABLE outlook_mail_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own mail" ON outlook_mail_summary
  FOR SELECT USING (member_id = current_setting('app.current_user_id')::text);
```

### 2.4 Graph API 接口设计

| 功能 | Graph API Endpoint | 权限 | 同步策略 |
|------|-------------------|------|---------|
| 获取日程 | `GET /me/calendarView?startDateTime=&endDateTime=` | `Calendars.Read` | 增量(delta query) |
| 创建日程 | `POST /me/events` | `Calendars.ReadWrite` | 中台→Outlook |
| 更新日程 | `PATCH /me/events/{id}` | `Calendars.ReadWrite` | 双向 |
| 获取邮件 | `GET /me/messages?$top=50&$orderby=receivedDateTime desc` | `Mail.Read` | 增量(delta query) |
| 获取未读数 | `GET /me/mailFolders/inbox?$select=unreadItemCount` | `Mail.Read` | 轮询(5min) |

**增量同步策略**：
- 首次全量拉取最近 30 天
- 后续使用 Graph API delta query 增量同步
- Token 过期自动刷新（Graph refresh_token 有效期 90 天，可续期）

### 2.5 前端模块设计

```
src/
├── lib/
│   ├── outlook/
│   │   ├── graphClient.ts        # Graph API 请求封装（自动刷新 token）
│   │   ├── calendarSync.ts       # 日历双向同步逻辑
│   │   ├── mailSync.ts           # 邮件拉取+缓存逻辑
│   │   └── tokenManager.ts       # Token 存储+刷新+过期检测
│   └── oauthIntegration.ts       # 扩展: 添加 Microsoft provider
├── pages/
│   ├── admin/
│   │   └── IntegrationsTab.tsx   # 扩展: Outlook 连接/断开 UI
│   └── dashboard/
│       ├── OutlookCalendarView.tsx  # Outlook 日程展示组件
│       └── OutlookMailPanel.tsx     # 邮件摘要面板
└── store/
    └── outlookSlice.ts           # Outlook 数据 reducer
```

### 2.6 UI 交互设计

#### 连接流程（集成设置 Tab）

```
未连接状态:
┌──────────────────────────┐
│ 📧 Microsoft Outlook     │
│                          │
│ [连接我的 Outlook 账号]   │
│                          │
│ 同步范围:                │
│ ☑ 日程管理               │
│ ☑ 邮件摘要               │
│ ☐ 联系人                 │
└──────────────────────────┘

已连接状态:
┌──────────────────────────┐
│ 📧 Microsoft Outlook     │
│ 已连接: zhangsan@corp.com │
│ 上次同步: 3分钟前         │
│                          │
│ [断开连接] [立即同步]     │
└──────────────────────────┘
```

#### 日程展示（工作站 Dashboard）

- 在现有 ScheduleTab 旁新增「Outlook 日程」Tab
- Outlook 日程以不同颜色标签区分（如蓝色=内部日程、橙色=Outlook 日程）
- 支持将 Outlook 日程关联到 TBH 任务

#### 邮件面板（工作站侧边栏）

- Dashboard 右侧新增「邮件」小面板
- 显示最近 10 封未读邮件
- 点击可关联到项目/任务（一键「转为任务」）
- 不显示邮件正文，仅显示发件人+主题+时间

---

## 三、实施计划

### Phase 1：基础设施（Day 1）

| 任务 | 产出 | 工时 |
|------|------|------|
| Azure AD 应用注册 | Client ID + Secret + Redirect URI | 0.5h |
| Supabase Auth 启用 Microsoft Provider | Auth 配置完成 | 0.5h |
| 数据库建表 | oauth_tokens + outlook_calendar_events + outlook_mail_summary | 1h |
| tokenManager.ts 实现 | Token CRUD + 自动刷新 | 2h |
| graphClient.ts 实现 | 带自动刷新的 API 客户端 | 2h |

### Phase 2：日程集成（Day 2）

| 任务 | 产出 | 工时 |
|------|------|------|
| calendarSync.ts 增量同步 | Delta query 拉取+缓存 | 3h |
| OutlookCalendarView.tsx | 日程展示组件 | 2h |
| 中台→Outlook 日程推送 | 任务截止日期→Outlook event | 2h |
| IntegrationsTab Outlook 连接 UI | 授权/断开/同步状态 | 1h |

### Phase 3：邮件集成（Day 3-4）

| 任务 | 产出 | 工时 |
|------|------|------|
| mailSync.ts 邮件拉取 | 最近邮件+未读数 | 2h |
| OutlookMailPanel.tsx | 邮件摘要面板 | 2h |
| 邮件转任务 | 一键关联到 TBH 任务 | 1h |
| outlookSlice.ts store 管理 | reducer + 实时更新 | 2h |

### Phase 4：联调+上线（Day 5）

| 任务 | 产出 | 工时 |
|------|------|------|
| 端到端测试 | 3 种场景走通 | 2h |
| 安全审计 | Token 存储+RLS 验证 | 1h |
| 文档+部署 | 集成配置指南 | 1h |

**总计: 4-5 个工作日**

---

## 四、前置条件（需要你操作）

| # | 操作 | 在哪里做 | 预计时间 |
|---|------|---------|---------|
| 1 | **注册 Azure AD 应用** | [Microsoft Entra admin center](https://entra.microsoft.com) → App registrations → New registration | 15 min |
| 2 | **配置 API 权限** | 应用注册 → API permissions → Add → Microsoft Graph → Delegated: `Calendars.ReadWrite`, `Mail.Read` | 5 min |
| 3 | **创建 Client Secret** | 应用注册 → Certificates & secrets → New client secret | 5 min |
| 4 | **配置 Redirect URI** | 应用注册 → Authentication → Add platform → Web → `https://<your-supabase>.supabase.co/auth/v1/callback` | 5 min |
| 5 | **Supabase 启用 Microsoft Provider** | Supabase Dashboard → Authentication → Providers → Microsoft → 填入 Client ID + Secret | 5 min |
| 6 | **(可选) 企业管理员同意** | 如果是组织账号，需 IT 管理员在 Entra admin center 审批应用授权 | 取决于组织 |

> 步骤 1-5 均可自助完成，每个 5-15 分钟。步骤 6 仅企业版可能需要。

---

## 五、安全设计

### 5.1 Token 安全

| 措施 | 说明 |
|------|------|
| 服务端存储 | access_token/refresh_token 存 Supabase DB，前端仅持内存副本 |
| RLS 保护 | oauth_tokens 表 RLS 策略限用户只读自己的 token |
| 自动刷新 | access_token 1h 过期，tokenManager 提前 5min 自动刷新 |
| 断开即删 | 用户断开连接时，立即删除 DB 中的 token 记录 |
| 最小权限 | 仅申请 `Calendars.ReadWrite` + `Mail.Read`，不申请 `Mail.ReadWrite`/`Mail.Send` |

### 5.2 数据安全

| 措施 | 说明 |
|------|------|
| 邮件不存正文 | outlook_mail_summary 仅存 subject/sender/time 元数据 |
| 缓存 TTL | 邮件/日程缓存 7 天自动清理，用户可手动刷新 |
| 可逆授权 | 随时可在 Microsoft 账户设置中撤销应用授权 |
| 审计日志 | 每次同步操作写入 audit_logs，含数据范围和时间戳 |

### 5.3 Graph API 限流应对

- 微软 Graph API 限流: 每应用每租户约 10,000 请求/5分钟
- 同步策略: 增量 delta query + 5 分钟轮询间隔
- 失败重试: 指数退避 (1s → 2s → 4s → 放弃)

---

## 六、扩展性预留

| 方向 | 预留接口 |
|------|---------|
| Google Calendar | oauth_tokens.provider = 'google'，graphClient 抽象为 CalendarProvider |
| 邮件发送 | 预留 `Mail.Send` 权限位，Phase 2 后可选开启 |
| Teams 会议 | Graph onlineMeeting API，日程创建时附带 Teams 链接 |
| 联系人同步 | 预留 `Contacts.Read` 权限位 |
| 多日历视图 | ScheduleTab 扩展为支持多数据源的统一日历 |

---

## 七、风险与降级

| 风险 | 概率 | 影响 | 降级方案 |
|------|------|------|---------|
| 企业 IT 禁止第三方 OAuth | 中 | 无法连接 | 提供「管理员预授权」文档，或降级为仅日历只读 |
| Graph API 限流 | 低 | 同步延迟 | 增大轮询间隔至 15min，队列化请求 |
| Token 刷新失败 | 低 | 功能中断 | 提示用户重新授权，缓存最近一次数据 |
| 微软 API Breaking Change | 极低 | 接口不可用 | 版本锁定 `v1.0` endpoint，监控 GitHub changelog |

---

## 八、验收标准

| # | 验收项 | 标准 |
|---|--------|------|
| 1 | 授权流程 | 点击→微软登录→回调→Token 入库→UI 显示"已连接" |
| 2 | 日程同步 | Outlook 日程 5 分钟内出现在 TBH 日历视图中 |
| 3 | 双向同步 | TBH 任务截止日期创建 Outlook 日程项 |
| 4 | 邮件摘要 | 未读邮件列表正确显示，点击可跳转 Outlook |
| 5 | 邮件转任务 | 选择邮件→一键创建任务→任务含邮件主题+链接 |
| 6 | 断开连接 | 点击断开→Token 从 DB 删除→UI 恢复未连接状态 |
| 7 | 安全 | 同一团队成员无法看到其他人的邮件/日程 |
| 8 | 降级 | Token 过期时 UI 提示重新授权，不白屏 |

> AI生成