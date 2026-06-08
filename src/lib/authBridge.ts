import type { Member } from '@/types';
import { handleError } from '@/lib/errorHandler';

export type AuthState = 'idle' | 'authenticating' | 'callback_processing' | 'authenticated' | 'error';

let _authState: AuthState = 'idle';

function setAuthState(state: AuthState): void {
  _authState = state;
}

const PHONE_RE = /^1\d{10}$/;
const OTP_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function wechatOAuthLogin(
  wechatId: string,
  members: Member[],
): Promise<string | null> {
  setAuthState('authenticating');
  try {
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

export async function phoneOtpLogin(
  phone: string,
  otp: string,
  members: Member[],
): Promise<string | null> {
  if (!PHONE_RE.test(phone)) return null;
  if (!OTP_RE.test(otp)) return null;

  setAuthState('authenticating');
  try {
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

export async function emailMagicLink(
  email: string,
  members: Member[],
): Promise<string | null> {
  if (!EMAIL_RE.test(email)) return null;

  setAuthState('authenticating');
  try {
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
