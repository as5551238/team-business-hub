/**
 * 角色工具函数 — 单一数据源
 *
 * 所有角色→标签映射、角色判断逻辑集中在此，
 * UI 层通过 usePermissions() hook 访问，
 * Store 层通过本文件函数访问（store 不能使用 hooks）。
 */

/** 角色→中文标签映射（唯一来源） */
export const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  manager: '经理',
  leader: '负责人',
  member: '成员',
};

/** 获取角色中文标签 */
export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

/** 是否为管理员角色（Store 层使用，UI 层用 usePermissions().isAdmin） */
export function isAdminRole(role?: string): boolean {
  return role === 'admin';
}

/** 是否为管理层角色（admin/manager/leader） */
export function isManagerRole(role?: string): boolean {
  return role === 'admin' || role === 'manager' || role === 'leader';
}

/** 是否为管理员或经理（admin/manager，不含 leader） */
export function isAdminOrManagerRole(role?: string): boolean {
  return role === 'admin' || role === 'manager';
}
