// ==================== 微信通知服务 ====================
// 双通道：企业微信群机器人 + Server酱（个人微信）
// 当前仅支持手动发送每日摘要 + 测试通道

const WECHAT_CONFIG_KEY = 'tbh-wechat-config';

export type NotifyChannel = 'work_wechat' | 'server_chan';

export interface WeChatConfig {
  enabled: boolean;
  channel: NotifyChannel;
  workWechat: { webhookUrl: string };
  serverChan: { sendKey: string };
}

export const defaultWeChatConfig: WeChatConfig = {
  enabled: false,
  channel: 'server_chan',
  workWechat: { webhookUrl: '' },
  serverChan: { sendKey: '' },
};

export function loadWeChatConfig(): WeChatConfig {
  try {
    const saved = localStorage.getItem(WECHAT_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.webhookUrl) {
        parsed.workWechat = { webhookUrl: parsed.webhookUrl };
        parsed.serverChan = parsed.serverChan || { sendKey: '' };
        delete parsed.webhookUrl;
      }
      return { ...defaultWeChatConfig, ...parsed };
    }
  } catch { /* ignore */ }
  return defaultWeChatConfig;
}

export function saveWeChatConfig(config: WeChatConfig): void {
  try { localStorage.setItem(WECHAT_CONFIG_KEY, JSON.stringify(config)); } catch {}
}

export function isWeChatEnabled(): boolean {
  const config = loadWeChatConfig();
  return config.enabled && (config.channel === 'server_chan'
    ? !!config.serverChan.sendKey
    : !!config.workWechat.webhookUrl);
}

// ==================== 发送逻辑 ====================

// CORS 代理列表（按优先级尝试，用于浏览器跨域场景）
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
];

// 企业微信群机器人（直接POST失败时尝试CORS代理）
async function sendToWorkWechat(content: string): Promise<boolean> {
  const config = loadWeChatConfig();
  const webhookUrl = config.workWechat.webhookUrl;
  if (!webhookUrl) return false;
  const body = JSON.stringify({ msgtype: 'markdown', markdown: { content } });

  // 方法1: 直接 POST（同源或服务端配置了 CORS 时可用）
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.errcode === 0) return true;
      if (data.errcode) throw new Error(`企业微信错误: ${data.errcode} ${data.errmsg || ''}`);
    }
  } catch {
    // 方法2: 通过 CORS 代理 POST
    for (const proxy of CORS_PROXIES) {
      try {
        const res = await fetch(proxy + encodeURIComponent(webhookUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.errcode === 0) return true;
        }
      } catch { /* try next proxy */ }
    }
    throw new Error('所有发送方式均失败，请检查网络或webhook地址');
  }
  return false;
}

// Server酱 v3（GET优先，失败POST，再失败放弃）
async function sendToServerChan(title: string, content: string): Promise<boolean> {
  const config = loadWeChatConfig();
  const sendKey = config.serverChan.sendKey;

  // 方法1: GET请求（不受CORS限制）
  try {
    const url = `https://sctapi.ftqq.com/${sendKey}.send?title=${encodeURIComponent(title)}&desp=${encodeURIComponent(content)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 0) return true;
    if (data.code === 40001) throw new Error('SendKey无效，请检查配置');
    if (data.code === 40003) throw new Error('SendKey格式错误，应为SCT开头');
  } catch (e: any) {
    // 方法2: POST请求
    try {
      const apiUrl = `https://sctapi.ftqq.com/${sendKey}.send`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, desp: content }),
      });
      const data = await res.json();
      if (data.code === 0) return true;
    } catch {
      throw new Error('网络请求失败，请检查网络环境或使用企业微信群机器人通道');
    }
  }
  return false;
}

// 统一发送入口
export async function sendWeChatMessage(content: string): Promise<boolean> {
  const config = loadWeChatConfig();
  if (!config.enabled) return false;
  try {
    if (config.channel === 'server_chan' && config.serverChan.sendKey) {
      return await sendToServerChan('团队业务中台', content);
    }
    if (config.channel === 'work_wechat' && config.workWechat.webhookUrl) {
      return await sendToWorkWechat(content);
    }
    return false;
  } catch (e: any) {
    console.error('通知发送失败:', e);
    return false;
  }
}

// 测试指定通道
export async function testChannel(channel: NotifyChannel, config: WeChatConfig): Promise<boolean> {
  try {
    const now = new Date().toLocaleString('zh-CN');
    if (channel === 'server_chan') {
      const content = `[测试消息]\n这是一条测试消息，如果收到说明配置正确！\n当前时间：${now}\n来自：团队业务中台`;
      return await sendToServerChan('团队业务中台 - 测试', content);
    }
    const content = `### 团队业务中台 - 测试消息\n\n> 这是一条测试消息，如果你看到了说明配置正确！\n> 当前时间：${now}\n> 来自：团队业务中台`;
    return await sendToWorkWechat(content);
  } catch (e: any) {
    console.error('测试发送失败:', e);
    throw e;
  }
}

// 获取/设置最后一次错误（用于UI展示）
export function getLastTestError(): string {
  try { return localStorage.getItem('tbh-wechat-last-error') || ''; } catch { return ''; }
}
export function setLastTestError(msg: string) {
  try { localStorage.setItem('tbh-wechat-last-error', msg); } catch {}
}

// ==================== 格式化消息 ====================

export function formatDailyDigest(params: {
  overdueTasks: { title: string; assignee: string; dueDate: string; priority: string }[];
  todayDueTasks: { title: string; assignee: string }[];
  todayCompleted: number;
  totalActive: number;
}): string {
  const { overdueTasks, todayDueTasks, todayCompleted, totalActive } = params;
  let msg = `每日任务提醒\n\n`;
  msg += `进行中任务：${totalActive} 个 | 昨日完成：${todayCompleted} 个\n\n`;
  if (overdueTasks.length > 0) {
    msg += `逾期任务 (${overdueTasks.length})\n`;
    overdueTasks.slice(0, 15).forEach(t => {
      const p = t.priority === 'urgent' ? '【紧急】' : '';
      msg += `- ${p}${t.title} (${t.assignee}) 截止${t.dueDate}\n`;
    });
    if (overdueTasks.length > 15) msg += `... 还有 ${overdueTasks.length - 15} 项\n`;
    msg += '\n';
  }
  if (todayDueTasks.length > 0) {
    msg += `今日到期 (${todayDueTasks.length})\n`;
    todayDueTasks.slice(0, 15).forEach(t => {
      msg += `- ${t.title} (${t.assignee})\n`;
    });
    if (todayDueTasks.length > 15) msg += `... 还有 ${todayDueTasks.length - 15} 项\n`;
  }
  return msg;
}
