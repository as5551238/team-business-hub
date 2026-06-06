/**
 * 表单验证工具 — R8 App Store Readiness
 * 统一的验证规则 + 错误提示组件
 */

export interface ValidationRule {
  type: string;
  message: string;
  validate: (value: string) => boolean;
}

/** 常用验证规则工厂 */
export const rules = {
  required: (field: string): ValidationRule => ({
    type: 'required',
    message: `${field}不能为空`,
    validate: (v) => v.trim().length > 0,
  }),
  minLength: (field: string, min: number): ValidationRule => ({
    type: 'minLength',
    message: `${field}至少${min}个字符`,
    validate: (v) => v.trim().length >= min,
  }),
  maxLength: (field: string, max: number): ValidationRule => ({
    type: 'maxLength',
    message: `${field}不能超过${max}个字符`,
    validate: (v) => v.trim().length <= max,
  }),
  email: (): ValidationRule => ({
    type: 'email',
    message: '请输入有效的邮箱地址',
    validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  }),
  phone: (): ValidationRule => ({
    type: 'phone',
    message: '请输入有效的手机号',
    validate: (v) => /^1[3-9]\d{9}$/.test(v.replace(/\s/g, '')),
  }),
};

/** 验证单个值 */
export function validate(value: string, ruleList: ValidationRule[]): string | null {
  for (const rule of ruleList) {
    if (!rule.validate(value)) return rule.message;
  }
  return null;
}

/** 验证多个字段 */
export function validateFields(fields: Record<string, { value: string; rules: ValidationRule[] }>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, { value, rules: ruleList }] of Object.entries(fields)) {
    const error = validate(value, ruleList);
    if (error) errors[key] = error;
  }
  return errors;
}
