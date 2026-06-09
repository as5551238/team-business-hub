/**
 * authBridge — 认证桥接层
 * 优先使用 Supabase Auth，降级到本地成员匹配
 *
 * 真实认证模式: Supabase Auth (Magic Link / OTP / OAuth)
 * 降级模式: 本地 members 数组查找（离线/未配置Supabase时使用）
 */
import type { Member } from '@/types';
import { handleError } from '@/lib/errorHandler';
import { getSupabaseClient, isSupabaseConfigured } from '@/supabase/client';

export type AuthState = 'idle' | 'authenticating' | 'callback_processing' | 'authenticated' | 'error';

let _authState: AuthState = 'idle';

export function getAuthState(): AuthState { return _authState; }

function setAuthState(s: AuthState): void { _authState = s; }

const PHONE_RE = /^1\d{10}$/;
const OTP_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 手机号+OTP登录
 * 优先: Supabase Auth verifyOtp
 * 降级: 本地成员手机号匹配
 */
export async function phoneOtpLogin(
  phone: string,
  otp: string,
  members: Member[],
): Promise<string | null> {
  if (!PHONE_RE.test(phone)) return null;
  if (!OTP_RE.test(otp)) return null;

  setAuthState('authenticating');
  try {
    // Try Supabase Auth first
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      });
      if (!error && data.user) {
        // Find matching member by phone or auth user id
        const found = members.find(m => m.phone === phone || m.authUserId === data.user!.id);
        if (found) {
          setAuthState('authenticated');
          return found.id;
        }
        // Auto-create member link via metadata or return the auth uid for downstream handling
        setAuthState('authenticated');
        return data.user.id;
      }
      // Supabase Auth failed, fall through to local match
      console.info('[AuthBridge] Supabase OTP failed, falling back to local match:', error?.message);
    }

    // Fallback: local member match
    const found = members.find(m => m.phone === phone);
    if (found) {
      setAuthState('authenticated');
      return found.id;
    }
    setAuthState('error');
    return null;
  } catch (e) {
    setAuthState('error');
    handleError(e, { module: 'authBridge', operation: 'PHONE_OTP_LOGIN', severity: 'warn' });
    return null;
  }
}

/**
 * Magic Link邮箱登录
 * 优先: Supabase Auth signInWithOtp (email)
 * 降级: 本地成员邮箱匹配
 */
export async function emailMagicLink(
  email: string,
  members: Member[],
): Promise<string | null> {
  if (!EMAIL_RE.test(email)) return null;

  setAuthState('authenticating');
  try {
    // Try Supabase Auth first
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (!error) {
        setAuthState('callback_processing');
        // Magic link sent; user will be redirected back
        // The actual authentication happens in the callback handler
        return '__magic_link_sent__';
      }
      console.info('[AuthBridge] Supabase Magic Link failed, falling back to local match:', error.message);
    }

    // Fallback: local member match
    const found = members.find(m => m.email === email);
    if (found) {
      setAuthState('authenticated');
      return found.id;
    }
    setAuthState('error');
    return null;
  } catch (e) {
    setAuthState('error');
    handleError(e, { module: 'authBridge', operation: 'EMAIL_MAGIC_LINK', severity: 'warn' });
    return null;
  }
}

/**
 * 微信OAuth登录
 * 降级模式: 本地成员wechatId匹配
 * (真实企业微信OAuth需要后端回调，此处保留降级)
 */
export async function wechatOAuthLogin(
  wechatId: string,
  members: Member[],
): Promise<string | null> {
  setAuthState('authenticating');
  try {
    // 企业微信OAuth需后端回调，当前仅支持本地匹配
    const found = members.find(m => m.wechatId === wechatId);
    if (found) {
      setAuthState('authenticated');
      return found.id;
    }
    setAuthState('error');
    return null;
  } catch (e) {
    setAuthState('error');
    handleError(e, { module: 'authBridge', operation: 'WECHAT_LOGIN', severity: 'warn' });
    return null;
  }
}

/**
 * 处理Supabase Auth回调
 * 在App初始化时调用，检查是否有Magic Link回调的session
 */
export async function handleAuthCallback(): Promise<{ userId: string; email?: string; phone?: string } | null> {
  if (!isSupabaseConfigured()) return null;

  const sb = getSupabaseClient()!;
  try {
    const { data, error } = await sb.auth.getSession();
    if (error || !data.session) return null;

    const user = data.session.user;
    return {
      userId: user.id,
      email: user.email || undefined,
      phone: user.phone || undefined,
    };
  } catch (e) {
    handleError(e, { module: 'authBridge', operation: 'AUTH_CALLBACK', severity: 'warn' });
    return null;
  }
}

/**
 * 登出
 */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseClient()!;
    await sb.auth.signOut();
  }
  setAuthState('idle');
}
