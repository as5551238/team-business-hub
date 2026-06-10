/**
 * 私有化部署方案 — Docker Compose + 数据导出/导入
 *
 * Round 4 — 中期攻坚
 * 提供完整的私有化部署配置生成器和数据迁移工具
 */

// ===== Docker Compose 配置生成 =====

export interface DeployConfig {
  appName: string;
  domain: string;
  supabaseUrl: string;
  supabaseKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  adminEmail: string;
  adminPassword: string;
  enableSSL: boolean;
  port: number;
}

export const DEFAULT_DEPLOY_CONFIG: DeployConfig = {
  appName: '团队业务中台',
  domain: 'localhost',
  supabaseUrl: '',
  supabaseKey: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  adminEmail: 'admin@example.com',
  adminPassword: '',
  enableSSL: false,
  port: 3000,
};

/** 生成 docker-compose.yml */
export function generateDockerCompose(config: DeployConfig): string {
  return `version: '3.8'

services:
  tbh-app:
    image: team-business-hub:latest
    container_name: ${config.appName.replace(/\s/g, '-')}
    ports:
      - "${config.port}:80"
    environment:
      - VITE_SUPABASE_URL=${config.supabaseUrl}
      - VITE_SUPABASE_ANON_KEY=${config.supabaseKey}
      - VITE_SMTP_HOST=${config.smtpHost}
      - VITE_SMTP_PORT=${config.smtpPort}
      - VITE_SMTP_USER=${config.smtpUser}
      - VITE_SMTP_PASS=${config.smtpPass}
      - VITE_ADMIN_EMAIL=${config.adminEmail}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3

${config.enableSSL ? `  caddy:
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
  caddy_config:` : ''}
`;
}

/** 生成 Caddyfile (SSL) */
export function generateCaddyfile(config: DeployConfig): string {
  return `${config.domain} {
    reverse_proxy tbh-app:80
    encode gzip
    header {
      X-Content-Type-Options nosniff
      X-Frame-Options DENY
      X-XSS-Protection "1; mode=block"
      Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}
`;
}

/** 生成 .env 文件 */
export function generateEnvFile(config: DeployConfig): string {
  return `# TBH 私有化部署配置
# 生成时间: ${new Date().toISOString()}

APP_NAME=${config.appName}
DOMAIN=${config.domain}
PORT=${config.port}

# Supabase
VITE_SUPABASE_URL=${config.supabaseUrl}
VITE_SUPABASE_ANON_KEY=${config.supabaseKey}

# Email
VITE_SMTP_HOST=${config.smtpHost}
VITE_SMTP_PORT=${config.smtpPort}
VITE_SMTP_USER=${config.smtpUser}
VITE_SMTP_PASS=${config.smtpPass}

# Admin
VITE_ADMIN_EMAIL=${config.adminEmail}

# SSL
ENABLE_SSL=${config.enableSSL}
`;
}

/** 生成部署说明 README */
export function generateDeployReadme(config: DeployConfig): string {
  return `# ${config.appName} 私有化部署指南

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
curl http://localhost:${config.port}/
\`\`\`

### 4. 创建管理员
首次部署后访问 http://localhost:${config.port}/ 并使用 ${config.adminEmail} 注册

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
`;
}

// ===== 数据导出/导入 =====

export interface ExportData {
  version: string;
  exportedAt: string;
  goals: any[];
  projects: any[];
  tasks: any[];
  members: any[];
  teams: any[];
  teamMembers: any[];
}

/** 导出全部数据到 JSON */
export function exportAllData(state: {
  goals: any[];
  projects: any[];
  tasks: any[];
  members: any[];
  teams: any[];
  teamMembers: any[];
}): ExportData {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    goals: state.goals,
    projects: state.projects,
    tasks: state.tasks,
    members: state.members,
    teams: state.teams,
    teamMembers: state.teamMembers,
  };
}

/** 下载导出数据为 JSON 文件 */
export function downloadExport(data: ExportData, filename?: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `tbh-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
