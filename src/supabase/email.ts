// ==================== 邮件推送服务 ====================
// 通过 Supabase RPC (send_email) 发送邮件
// 数据库端使用 pg_net 扩展调用 Resend API，绕过浏览器 CORS 限制
// 前端仅存储配置 + 格式化邮件内容

import { getSupabaseClient } from './client';
import { loadEmailConfig, type EmailConfig } from '@/pages/admin/constants';

const EMAIL_LAST_ERROR_KEY = 'tbh-email-last-error';

export function isEmailEnabled(): boolean {
  const config = loadEmailConfig();
  return config.enabled && !!config.resendApiKey && !!config.fromEmail;
}

// 通过 Supabase RPC send_email 发送邮件（数据库端调用 Resend API）
async function sendEmailRpc(to: string, subject: string, htmlBody: string): Promise<boolean> {
  const config = loadEmailConfig();
  if (!config.enabled || !config.resendApiKey || !config.fromEmail) {
    throw new Error('邮件未启用或配置不完整');
  }
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase 客户端未初始化');
  const { data, error } = await sb.rpc('send_email', {
    p_to: to,
    p_subject: subject,
    p_html: htmlBody,
    p_api_key: config.resendApiKey,
    p_from_email: config.fromEmail,
  });
  if (error) throw new Error('邮件发送失败: ' + (error.message || JSON.stringify(error)));
  // Fire-and-forget mode: RPC returns { success: true, request_id: N }
  // Actual delivery status can be checked via net._http_response if needed
  return data?.success === true;
}

// 发送测试邮件
export async function sendTestEmail(to: string): Promise<boolean> {
  const now = new Date().toLocaleString('zh-CN');
  const subject = '团队业务中台 - 邮件测试';
  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <h2 style="color:#4f46e5;">邮件测试</h2>
    <p>这是一条测试邮件，如果你收到了说明配置正确！</p>
    <p>当前时间：${now}</p>
    <p style="color:#888;font-size:12px;">来自：团队业务中台</p>
  </div>`;
  return sendEmailRpc(to, subject, html);
}

// 格式化每日摘要邮件（HTML 格式）
export function formatDailyDigestEmail(params: {
  memberName: string;
  overdueTasks: { title: string; dueDate: string; priority: string }[];
  todayDueTasks: { title: string }[];
  todayCompleted: number;
  totalActive: number;
}): string {
  const { memberName, overdueTasks, todayDueTasks, todayCompleted, totalActive } = params;
  const now = new Date().toLocaleDateString('zh-CN');
  let html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">`;
  html += `<h2 style="color:#4f46e5;">${memberName}，你好！</h2>`;
  html += `<p style="color:#666;">${now} 每日业务现况</p>`;
  html += `<div style="display:flex;gap:12px;margin:16px 0;">`;
  html += `<div style="flex:1;background:#f0f0ff;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:bold;color:#4f46e5;">${totalActive}</div><div style="font-size:12px;color:#666;">进行中</div></div>`;
  html += `<div style="flex:1;background:#f0fff4;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:bold;color:#16a34a;">${todayCompleted}</div><div style="font-size:12px;color:#666;">已完成</div></div>`;
  html += `</div>`;
  if (overdueTasks.length > 0) {
    html += `<h3 style="color:#dc2626;">逾期任务 (${overdueTasks.length})</h3>`;
    html += `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">`;
    overdueTasks.slice(0, 10).forEach(t => {
      const badge = t.priority === 'urgent' ? '<span style="color:#dc2626;font-weight:bold;">[紧急]</span> ' : '';
      html += `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;">${badge}${t.title}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#888;">截止 ${t.dueDate}</td></tr>`;
    });
    if (overdueTasks.length > 10) html += `<tr><td colspan="2" style="padding:6px;color:#888;">...还有 ${overdueTasks.length - 10} 项</td></tr>`;
    html += `</table>`;
  }
  if (todayDueTasks.length > 0) {
    html += `<h3 style="color:#ea580c;">今日到期 (${todayDueTasks.length})</h3>`;
    html += `<ul style="padding-left:20px;margin-bottom:16px;">`;
    todayDueTasks.slice(0, 10).forEach(t => { html += `<li style="padding:4px 0;">${t.title}</li>`; });
    if (todayDueTasks.length > 10) html += `<li style="color:#888;">...还有 ${todayDueTasks.length - 10} 项</li>`;
    html += `</ul>`;
  }
  if (overdueTasks.length === 0 && todayDueTasks.length === 0) {
    html += `<p style="text-align:center;padding:24px;color:#16a34a;font-size:16px;">今日无逾期和到期任务，继续保持！</p>`;
  }
  html += `<hr style="border:none;border-top:1px solid #eee;margin:20px 0;">`;
  html += `<p style="color:#aaa;font-size:12px;text-align:center;">团队业务中台 · 每日自动推送</p>`;
  html += `</div>`;
  return html;
}

// 向指定成员发送每日摘要
export async function sendDailyDigestToMember(params: {
  memberName: string;
  memberEmail: string;
  overdueTasks: { title: string; dueDate: string; priority: string }[];
  todayDueTasks: { title: string }[];
  todayCompleted: number;
  totalActive: number;
}): Promise<boolean> {
  const html = formatDailyDigestEmail(params);
  const now = new Date().toLocaleDateString('zh-CN');
  return sendEmailRpc(params.memberEmail, `每日业务现况 - ${now}`, html);
}

// 错误记录
export function getLastEmailError(): string {
  try { return localStorage.getItem(EMAIL_LAST_ERROR_KEY) || ''; } catch { return ''; }
}
export function setLastEmailError(msg: string) {
  try { localStorage.setItem(EMAIL_LAST_ERROR_KEY, msg); } catch {}
}
