import { genId } from '@/store/utils';
import type { Member } from '@/types';

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
}

export interface MemberLookup {
  id: string;
  name: string;
  wechatId: string;
  phone: string;
  email: string;
  role: string;
}

export interface SubLookup {
  id: string;
  teamId: string;
  tier: string;
}

export function syncAuthUserToMember(
  authUser: AuthUser,
  dispatch: (action: { type: string; payload: Record<string, unknown> }) => void,
  existingMembers: MemberLookup[],
): string {
  const byAuthId = existingMembers.find(m => m.id === authUser.id);
  if (byAuthId) return byAuthId.id;

  if (authUser.email) {
    const byEmail = existingMembers.find(m => m.email === authUser.email);
    if (byEmail) return byEmail.id;
  }

  if (authUser.phone) {
    const byPhone = existingMembers.find(m => m.phone === authUser.phone);
    if (byPhone) return byPhone.id;
  }

  const meta = authUser.user_metadata ?? {};
  const newId = genId('member');

  dispatch({
    type: 'ADD_MEMBER',
    payload: {
      id: newId,
      name: (meta.name as string) ?? (meta.full_name as string) ?? authUser.email ?? authUser.id,
      nickname: (meta.nickname as string) ?? '',
      wechatId: (meta.wechat_id as string) ?? '',
      phone: authUser.phone ?? '',
      email: authUser.email ?? '',
      role: 'member',
      department: (meta.department as string) ?? '',
      avatar: (meta.avatar_url as string) ?? '',
      status: 'active',
      joinDate: new Date().toISOString(),
      permissions: [],
      teamId: '',
    },
  });

  return newId;
}

export function getOrCreateSubscription(
  teamId: string,
  dispatch: (action: { type: string; payload: Record<string, unknown> }) => void,
  existingSubs: SubLookup[],
): string {
  const existing = existingSubs.find(s => s.teamId === teamId);
  if (existing) return existing.id;

  const newId = genId('sub');

  dispatch({
    type: 'UPDATE_SUBSCRIPTION',
    payload: {
      id: newId,
      teamId,
      tier: 'free',
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  return newId;
}
