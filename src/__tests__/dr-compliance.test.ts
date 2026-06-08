/**
 * DR合规性自动检查 — CI运行时验证关键规则
 * DR-11: 禁止lazy+namespace
 * DR-19: 敏感数据不在源码硬编码
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');

function getAllFiles(dir: string, ext: string[]): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__tests__') {
      result.push(...getAllFiles(full, ext));
    } else if (ext.some(e => entry.name.endsWith(e)) && !full.includes('__tests__')) {
      result.push(full);
    }
  }
  return result;
}

describe('DR-11: 禁止React.lazy()加载命名空间模块', () => {
  const namespaceLibs = ['recharts', 'd3', 'lodash', 'date-fns', '@heroicons'];
  const files = getAllFiles(SRC, ['.ts', '.tsx']);

  for (const lib of namespaceLibs) {
    it(`不应有lazy+import(${lib})模式`, () => {
      const violations: string[] = [];
      for (const f of files) {
        const content = fs.readFileSync(f, 'utf-8');
        if (content.includes('React.lazy') && content.includes(lib)) {
          violations.push(path.relative(SRC, f));
        }
      }
      expect(violations, `发现lazy+${lib}违规: ${violations.join(', ')}`).toHaveLength(0);
    });
  }
});

describe('DR-19: 敏感数据不在源码硬编码', () => {
  it('不包含硬编码Supabase URL', () => {
    const files = getAllFiles(SRC, ['.ts', '.tsx']);
    const violations: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('atexvoyvnnuaonvrgzhn.supabase.co')) {
        violations.push(path.relative(SRC, f));
      }
    }
    expect(violations, `硬编码Supabase URL: ${violations.join(', ')}`).toHaveLength(0);
  });

  it('不包含硬编码Supabase Anon Key', () => {
    const files = getAllFiles(SRC, ['.ts', '.tsx']);
    const violations: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('sb_publishable_WeMPVE8GNCTOqrE7OZhTIw')) {
        violations.push(path.relative(SRC, f));
      }
    }
    expect(violations, `硬编码Anon Key: ${violations.join(', ')}`).toHaveLength(0);
  });
});
