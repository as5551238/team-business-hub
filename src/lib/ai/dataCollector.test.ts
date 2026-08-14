/**
 * dataCollector 纯函数单元测试
 * 覆盖：isOverdue / getPeriodRange
 */
import { describe, it, expect } from 'vitest';
import { isOverdue, getPeriodRange } from '@/lib/ai/dataCollector';

describe('isOverdue', () => {
  it('null endDate 不逾期', () => {
    expect(isOverdue(null)).toBe(false);
  });

  it('已完成状态不逾期', () => {
    expect(isOverdue('2020-01-01', 'done')).toBe(false);
  });

  it('已取消状态不逾期', () => {
    expect(isOverdue('2020-01-01', 'cancelled')).toBe(false);
  });

  it('过去日期 + 未完成 = 逾期', () => {
    expect(isOverdue('2020-01-01', 'in_progress')).toBe(true);
    expect(isOverdue('2020-01-01')).toBe(true);
  });

  it('未来日期不逾期', () => {
    expect(isOverdue('2099-12-31', 'in_progress')).toBe(false);
  });
});

describe('getPeriodRange', () => {
  it('daily 返回1天范围', () => {
    const { start, end } = getPeriodRange('daily');
    const diffMs = end.getTime() - start.getTime();
    // start = yesterday 00:00, end = today 23:59:59 → range is 1-2 days
    expect(diffMs).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000);
    expect(diffMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('weekly 返回7天范围', () => {
    const { start, end } = getPeriodRange('weekly');
    const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThanOrEqual(6);
    expect(diffDays).toBeLessThanOrEqual(8);
  });

  it('monthly 返回约30天范围', () => {
    const { start, end } = getPeriodRange('monthly');
    const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThanOrEqual(27);
    expect(diffDays).toBeLessThanOrEqual(32);
  });

  it('quarterly 返回约90天范围', () => {
    const { start, end } = getPeriodRange('quarterly');
    const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThanOrEqual(88);
    expect(diffDays).toBeLessThanOrEqual(93);
  });

  it('start 时间归零到 00:00:00', () => {
    const { start } = getPeriodRange('daily');
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });

  it('end 时间归到 23:59:59', () => {
    const { end } = getPeriodRange('daily');
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });
});
