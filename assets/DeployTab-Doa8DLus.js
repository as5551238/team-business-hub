import{r as d,j as e,b0 as j,bk as y,D as N,x as g,av as v,e as E,aB as _}from"./vendor-CRa0iWeM.js";import{u as T}from"./index-Boa60E-P.js";import"./supabase-DzztzbAt.js";import"./charts-B7e9Zyrl.js";import"./motion-jfVhqmzw.js";import"./sentry-De2dfR4m.js";const f={appName:"团队业务中台",domain:"localhost",supabaseUrl:"",supabaseKey:"",smtpHost:"",smtpPort:587,smtpUser:"",smtpPass:"",adminEmail:"admin@example.com",adminPassword:"",enableSSL:!1,port:3e3};function k(s){return`version: '3.8'

services:
  tbh-app:
    image: team-business-hub:latest
    container_name: ${s.appName.replace(/\s/g,"-")}
    ports:
      - "${s.port}:80"
    environment:
      - VITE_SUPABASE_URL=${s.supabaseUrl}
      - VITE_SUPABASE_ANON_KEY=${s.supabaseKey}
      - VITE_SMTP_HOST=${s.smtpHost}
      - VITE_SMTP_PORT=${s.smtpPort}
      - VITE_SMTP_USER=${s.smtpUser}
      - VITE_SMTP_PASS=${s.smtpPass}
      - VITE_ADMIN_EMAIL=${s.adminEmail}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3

${s.enableSSL?`  caddy:
    image: caddy:2-alpine
    container_name: tbh-caddy
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - tbh-app
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:`:""}
`}function P(s){return`${s.domain} {
    reverse_proxy tbh-app:80
    encode gzip
    header {
      X-Content-Type-Options nosniff
      X-Frame-Options DENY
      X-XSS-Protection "1; mode=block"
      Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}
`}function A(s){return`# TBH 私有化部署配置
# 生成时间: ${new Date().toISOString()}

APP_NAME=${s.appName}
DOMAIN=${s.domain}
PORT=${s.port}

# Supabase
VITE_SUPABASE_URL=${s.supabaseUrl}
VITE_SUPABASE_ANON_KEY=${s.supabaseKey}

# Email
VITE_SMTP_HOST=${s.smtpHost}
VITE_SMTP_PORT=${s.smtpPort}
VITE_SMTP_USER=${s.smtpUser}
VITE_SMTP_PASS=${s.smtpPass}

# Admin
VITE_ADMIN_EMAIL=${s.adminEmail}

# SSL
ENABLE_SSL=${s.enableSSL}
`}function C(s){return`# ${s.appName} 私有化部署指南

## 前置条件
- Docker 20.10+
- Docker Compose v2+
- 至少 2GB 内存

## 快速部署（15分钟）

### 1. 准备配置
\`\`\`bash
# 编辑 .env 文件，填入你的 Supabase 和 SMTP 配置
cp .env.example .env
vim .env
\`\`\`

### 2. 一键启动
\`\`\`bash
docker-compose up -d
\`\`\`

### 3. 验证部署
\`\`\`bash
curl http://localhost:${s.port}/
\`\`\`

### 4. 创建管理员
首次部署后访问 http://localhost:${s.port}/ 并使用 ${s.adminEmail} 注册

## 数据安全
- 所有数据存储在你自己的 Supabase 实例中
- 应用不收集任何用户行为数据
- 支持 RBAC 权限控制
- 支持 API Token 权限粒度控制

## 备份与恢复
\`\`\`bash
# 导出数据
docker-compose exec tbh-app npx ts-node scripts/export-data.ts

# 导入数据
docker-compose exec tbh-app npx ts-node scripts/import-data.ts
\`\`\`

## 更新
\`\`\`bash
docker-compose pull
docker-compose up -d
\`\`\`
`}function $(s){return{version:"1.0.0",exportedAt:new Date().toISOString(),goals:s.goals,projects:s.projects,tasks:s.tasks,members:s.members,teams:s.teams,teamMembers:s.teamMembers}}function I(s,t){const r=new Blob([JSON.stringify(s,null,2)],{type:"application/json"}),l=URL.createObjectURL(r),o=document.createElement("a");o.href=l,o.download=`tbh-export-${new Date().toISOString().split("T")[0]}.json`,o.click(),URL.revokeObjectURL(l)}function R(){const{state:s}=T(),[t,r]=d.useState(f),[l,o]=d.useState(""),i=d.useMemo(()=>k(t),[t]),x=d.useMemo(()=>A(t),[t]),u=d.useMemo(()=>P(t),[t]),b=d.useMemo(()=>C(t),[t]),h=(a,m)=>{navigator.clipboard.writeText(a).then(()=>{o(m),setTimeout(()=>o(""),2e3)})},S=()=>{const a=$(s);I(a)},n=(a,m,p,c)=>e.jsxs("div",{className:"bg-card rounded-xl border border-border",children:[e.jsxs("div",{className:"flex items-center justify-between px-4 py-3 border-b",children:[e.jsxs("h3",{className:"font-semibold text-sm flex items-center gap-2",children:[e.jsx(v,{size:16}),a]}),e.jsx("button",{onClick:()=>h(p,c),className:"flex items-center gap-1.5 px-2.5 py-1 rounded text-xs hover:bg-muted transition-colors",children:l===c?e.jsxs(e.Fragment,{children:[e.jsx(E,{size:12,className:"text-green-600"}),"已复制"]}):e.jsxs(e.Fragment,{children:[e.jsx(_,{size:12}),"复制"]})})]}),e.jsx("pre",{className:"px-4 py-3 text-xs font-mono overflow-x-auto max-h-64 bg-gray-50 rounded-b-xl",children:p})]});return e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"bg-card rounded-xl border border-border p-4",children:[e.jsxs("h3",{className:"font-semibold text-sm flex items-center gap-2 mb-3",children:[e.jsx(j,{size:16}),"私有化部署配置"]}),e.jsx("p",{className:"text-xs text-muted-foreground mb-4",children:"生成 Docker Compose 一键部署配置，15 分钟完成私有化。"}),e.jsxs("div",{className:"grid grid-cols-2 md:grid-cols-3 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{className:"text-xs text-muted-foreground block mb-1",children:"应用名称"}),e.jsx("input",{type:"text",className:"w-full border rounded px-2 py-1.5 text-sm",value:t.appName,onChange:a=>r({...t,appName:a.target.value})})]}),e.jsxs("div",{children:[e.jsx("label",{className:"text-xs text-muted-foreground block mb-1",children:"域名"}),e.jsx("input",{type:"text",className:"w-full border rounded px-2 py-1.5 text-sm",value:t.domain,onChange:a=>r({...t,domain:a.target.value})})]}),e.jsxs("div",{children:[e.jsx("label",{className:"text-xs text-muted-foreground block mb-1",children:"端口"}),e.jsx("input",{type:"number",className:"w-full border rounded px-2 py-1.5 text-sm",value:t.port,onChange:a=>r({...t,port:parseInt(a.target.value)||3e3})})]}),e.jsxs("div",{children:[e.jsx("label",{className:"text-xs text-muted-foreground block mb-1",children:"Supabase URL"}),e.jsx("input",{type:"text",className:"w-full border rounded px-2 py-1.5 text-sm font-mono text-xs",value:t.supabaseUrl,onChange:a=>r({...t,supabaseUrl:a.target.value})})]}),e.jsxs("div",{children:[e.jsx("label",{className:"text-xs text-muted-foreground block mb-1",children:"Supabase Key"}),e.jsx("input",{type:"password",className:"w-full border rounded px-2 py-1.5 text-sm font-mono text-xs",value:t.supabaseKey,onChange:a=>r({...t,supabaseKey:a.target.value})})]}),e.jsx("div",{className:"flex items-end",children:e.jsxs("label",{className:"flex items-center gap-2 text-sm",children:[e.jsx("input",{type:"checkbox",checked:t.enableSSL,onChange:a=>r({...t,enableSSL:a.target.checked}),className:"rounded"}),"启用 SSL (Caddy)"]})})]})]}),n("docker-compose.yml","docker-compose.yml",i,"docker"),n(".env",".env",x,"env"),t.enableSSL&&n("Caddyfile","Caddyfile",u,"caddy"),n("部署说明","README.md",b,"readme"),e.jsxs("div",{className:"bg-card rounded-xl border border-border p-4",children:[e.jsxs("h3",{className:"font-semibold text-sm flex items-center gap-2 mb-3",children:[e.jsx(y,{size:16}),"数据迁移"]}),e.jsx("p",{className:"text-xs text-muted-foreground mb-3",children:"导出当前所有数据为 JSON 文件，可用于迁移到私有化环境。"}),e.jsx("div",{className:"flex gap-3",children:e.jsxs("button",{onClick:S,className:"flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90",children:[e.jsx(N,{size:14}),"导出全部数据"]})}),e.jsxs("div",{className:"mt-3 text-xs text-muted-foreground",children:["当前数据量: ",s.goals.length," 目标 · ",s.projects.length," 项目 · ",s.tasks.length," 任务 · ",s.members.length," 成员"]})]}),e.jsxs("div",{className:"bg-amber-50 rounded-xl border border-amber-200 p-4",children:[e.jsxs("h3",{className:"font-semibold text-sm flex items-center gap-2 mb-2",children:[e.jsx(g,{size:16,className:"text-amber-600"}),"安全提示"]}),e.jsxs("ul",{className:"text-xs text-amber-800 space-y-1 list-disc list-inside",children:[e.jsx("li",{children:"所有数据存储在你自己的 Supabase 实例中，应用不收集用户行为数据"}),e.jsx("li",{children:"建议在 .env 中使用强密码，不要将密钥提交到代码仓库"}),e.jsx("li",{children:"启用 SSL 时，Caddy 会自动申请 Let's Encrypt 证书"}),e.jsx("li",{children:"API Token 权限粒度控制已内建，可为不同 Agent 配置不同权限"})]})]})]})}export{R as DeployTab};
