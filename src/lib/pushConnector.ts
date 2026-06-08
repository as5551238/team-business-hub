/**
 * 轻量生态连接层 — 企微/钉钉/飞书推送 + Webhook + Zapier连接器
 *
 * Round 4 — 中期攻坚
 * - Webhook 推送：支持企业微信、钉钉、飞书三种 IM 推送
 * - Zapier/n8n 连接器：标准 Webhook 端点
 * - OAuth 集成框架：预留钉钉/飞书 OAuth
 */

import { getSupabaseClient } from '@/supabase/client';
import { handleError } from '@/lib/errorHandler';
import { saveSettingDualWrite } from '@/supabase/teamSettings';

// ===== 类型定义 =====

export type PushChannel = 'wechat_work' | 'dingtalk' | 'feishu' | 'webhook';

export interface PushConfig {
  channel: PushChannel;
  enabled: boolean;
  webhookUrl: string;
  secret?: string;
  corpId?: string;
  agentId?: string;
}

export interface PushMessage {
  title: string;
  content: string;
  url?: string;
  mentionedList?: string[]; // @的用户手机号
}

export interface PushResult {
  success: boolean;
  channel: PushChannel;
  error?: string;
  responseCode?: number;
}

const PUSH_CONFIG_KEY = 'tbh-push-configs';

// ===== 配置管理 =====

export function getPushConfigs(): PushConfig[] {
  try {
    return JSON.parse(localStorage.getItem(PUSH_CONFIG_KEY) || '[]');
  } catch (e) { handleError(e, { module: 'pushConnector', operation: 'LOAD_CONFIGS', severity: 'debug' }); return []; }
}

export function savePushConfigs(configs: PushConfig[]) {
  localStorage.setItem(PUSH_CONFIG_KEY, JSON.stringify(configs)); { const _tid = localStorage.getItem('tbh-current-team') || ''; if (_tid) saveSettingDualWrite('push_configs', PUSH_CONFIG_KEY, configs, _tid); }
}

export function getPushConfig(channel: PushChannel): PushConfig | undefined {
  return getPushConfigs().find(c => c.channel === channel && c.enabled);
}

// ===== 企业微信推送 =====

async function pushToWeChatWork(config: PushConfig, msg: PushMessage): Promise<PushResult> {
  if (!config.webhookUrl) return { success: false, channel: 'wechat_work', error: 'Webhook URL 未配置' };

  try {
    const body: Record<string, any> = {
      msgtype: 'markdown',
      markdown: {
        content: `### ${msg.title}\n${msg.content}${msg.url ? `\n[查看详情](${msg.url})` : ''}`,
      },
    };
    if (msg.mentionedList && msg.mentionedList.length > 0) {
      body.markdown.mentioned_mobile_list = msg.mentionedList;
    }

    const resp = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await resp.json();
    return { success: result.errcode === 0, channel: 'wechat_work', responseCode: resp.status, error: result.errcode !== 0 ? result.errmsg : undefined };
  } catch (e: unknown) {
    return { success: false, channel: 'wechat_work', error: e instanceof Error ? e.message : String(e) };
  }
}

// ===== 钉钉推送 =====

async function pushToDingTalk(config: PushConfig, msg: PushMessage): Promise<PushResult> {
  if (!config.webhookUrl) return { success: false, channel: 'dingtalk', error: 'Webhook URL 未配置' };
  try {
    const body: Record<string, any> = {
      msgtype: 'markdown',
      markdown: {
        title: msg.title,
        text: `### ${msg.title}\n\n${msg.content}${msg.url ? `\n\n[查看详情](${msg.url})` : ''}`,
      },
    };
    if (config.secret) body.secret = config.secret;
    if (msg.mentionedList && msg.mentionedList.length > 0) {
      body.markdown.text += `\n\n@${msg.mentionedList.join(' @')}`;
    }
    const sb = getSupabaseClient();
    const { data, error } = await sb.rpc('send_webhook', { channel: 'dingtalk', url: config.webhookUrl, body: JSON.stringify(body), secret: config.secret || null });
    if (error) return { success: false, channel: 'dingtalk', error: error.message };
    return { success: true, channel: 'dingtalk' };
  } catch (e: unknown) {
    return { success: false, channel: 'dingtalk', error: e instanceof Error ? e.message : String(e) };
  }
}

// ===== 飞书推送 =====

async function pushToFeishu(config: PushConfig, msg: PushMessage): Promise<PushResult> {
  if (!config.webhookUrl) return { success: false, channel: 'feishu', error: 'Webhook URL 未配置' };
  try {
    const body = {
      msg_type: 'interactive',
      card: {
        header: { title: { tag: 'plain_text', content: msg.title }, template: 'blue' },
        elements: [
          { tag: 'markdown', content: msg.content },
          ...(msg.url ? [{ tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: '查看详情' }, url: msg.url, type: 'primary' }] }] : []),
        ],
      },
    };
    const sb = getSupabaseClient();
    const { data, error } = await sb.rpc('send_webhook', { channel: 'feishu', url: config.webhookUrl, body: JSON.stringify(body), secret: config.secret || null });
    if (error) return { success: false, channel: 'feishu', error: error.message };
    return { success: true, channel: 'feishu' };
  } catch (e: unknown) {
    return { success: false, channel: 'feishu', error: e instanceof Error ? e.message : String(e) };
  }
}

// ===== 通用 Webhook =====

async function pushToWebhook(config: PushConfig, msg: PushMessage): Promise<PushResult> {
  if (!config.webhookUrl) return { success: false, channel: 'webhook', error: 'Webhook URL 未配置' };

  try {
    const resp = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: msg.title, content: msg.content, url: msg.url, timestamp: new Date().toISOString(), source: 'team-business-hub' }),
    });

    return { success: resp.ok, channel: 'webhook', responseCode: resp.status, error: resp.ok ? undefined : `HTTP ${resp.status}` };
  } catch (e: unknown) {
    return { success: false, channel: 'webhook', error: e instanceof Error ? e.message : String(e) };
  }
}

// ===== 统一推送入口 =====

export async function pushNotification(msg: PushMessage, channels?: PushChannel[]): Promise<PushResult[]> {
  const configs = getPushConfigs().filter(c => c.enabled);
  const targetChannels = channels || configs.map(c => c.channel);
  const results: PushResult[] = [];

  for (const channel of targetChannels) {
    const config = configs.find(c => c.channel === channel);
    if (!config) { results.push({ success: false, channel, error: '未配置' }); continue; }

    switch (channel) {
      case 'wechat_work': results.push(await pushToWeChatWork(config, msg)); break;
      case 'dingtalk': results.push(await pushToDingTalk(config, msg)); break;
      case 'feishu': results.push(await pushToFeishu(config, msg)); break;
      case 'webhook': results.push(await pushToWebhook(config, msg)); break;
      default: results.push({ success: false, channel, error: '不支持的渠道' });
    }
  }

  return results;
}

// ===== Zapier/n8n 连接器 Webhook =====
export async function triggerZapierWebhook(event: {
  type: 'task.created' | 'task.updated' | 'task.completed' | 'goal.created' | 'goal.updated' | 'goal.completed';
  data: Record<string, any>;
}, webhookUrl?: string): Promise<boolean> {
  const config = getPushConfig('webhook');
  const url = webhookUrl || config?.webhookUrl;
  if (!url) return false;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: event.type, data: event.data, timestamp: new Date().toISOString(), source: 'team-business-hub' }),
    });
    return resp.ok;
  } catch (e) { handleError(e, { module: 'pushConnector', operation: 'TRIGGER_WEBHOOK', severity: 'warn' });
    return false;
  }
}

// ===== 推送模板 =====

export function formatTaskNotification(task: { title: string; status: string; leaderId: string; dueDate?: string }, getName: (id: string) => string): PushMessage {
  const statusMap: Record<string, string> = { todo: '待处理', in_progress: '进行中', done: '已完成', blocked: '已阻塞' };
  return {
    title: `任务状态更新: ${task.title}`,
    content: `状态: ${statusMap[task.status] || task.status}\n负责人: ${getName(task.leaderId)}${task.dueDate ? `\n截止日: ${task.dueDate}` : ''}`,
  };
}
