/**
 * 推送设置面板 — AI推送开关与时段设置
 *
 * 支持配置：
 * - 晨间聚焦推送开关 + 时段
 * - 周报推送开关 + 时段
 * - 风险预警推送开关
 * - 通知免打扰时段
 *
 * DR-51: 所有自动化功能支持开关、频次自定义，默认低打扰模式
 */

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Bell, Clock, Shield, Calendar, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PushSettings {
  morningBriefing: { enabled: boolean; time: string };
  weeklyReport: { enabled: boolean; time: string; day: string };
  riskAlert: { enabled: boolean; minSeverity: 'critical' | 'high' | 'medium' };
  dnd: { enabled: boolean; startTime: string; endTime: string };
}

const DEFAULT_SETTINGS: PushSettings = {
  morningBriefing: { enabled: true, time: '08:00' },
  weeklyReport: { enabled: true, time: '17:00', day: '5' },
  riskAlert: { enabled: true, minSeverity: 'high' },
  dnd: { enabled: false, startTime: '22:00', endTime: '07:00' },
};

const STORAGE_KEY = 'tbh-push-settings';

function loadSettings(): PushSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: PushSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

export function PushSettingsPanel({ className }: { className?: string }) {
  const [settings, setSettings] = useState<PushSettings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<PushSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return (
    <div className={cn('p-4 space-y-6 max-w-lg', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">推送设置</h2>
      </div>

      {/* 晨间聚焦 */}
      <div className="space-y-2 p-3 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">晨间聚焦推送</span>
          </div>
          <ToggleSwitch
            checked={settings.morningBriefing.enabled}
            onChange={(enabled) => updateSettings({ morningBriefing: { ...settings.morningBriefing, enabled } })}
          />
        </div>
        {settings.morningBriefing.enabled && (
          <div className="flex items-center gap-2 pl-6">
            <span className="text-xs text-muted-foreground">推送时间</span>
            <input
              type="time"
              className="border border-input rounded px-2 py-1 text-xs bg-card"
              value={settings.morningBriefing.time}
              onChange={(e) => updateSettings({ morningBriefing: { ...settings.morningBriefing, time: e.target.value } })}
            />
          </div>
        )}
      </div>

      {/* 周报推送 */}
      <div className="space-y-2 p-3 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">周报推送</span>
          </div>
          <ToggleSwitch
            checked={settings.weeklyReport.enabled}
            onChange={(enabled) => updateSettings({ weeklyReport: { ...settings.weeklyReport, enabled } })}
          />
        </div>
        {settings.weeklyReport.enabled && (
          <div className="flex items-center gap-3 pl-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">推送日</span>
              <select
                className="border border-input rounded px-2 py-1 text-xs bg-card"
                value={settings.weeklyReport.day}
                onChange={(e) => updateSettings({ weeklyReport: { ...settings.weeklyReport, day: e.target.value } })}
              >
                <option value="1">周一</option>
                <option value="2">周二</option>
                <option value="3">周三</option>
                <option value="4">周四</option>
                <option value="5">周五</option>
                <option value="6">周六</option>
                <option value="0">周日</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">推送时间</span>
              <input
                type="time"
                className="border border-input rounded px-2 py-1 text-xs bg-card"
                value={settings.weeklyReport.time}
                onChange={(e) => updateSettings({ weeklyReport: { ...settings.weeklyReport, time: e.target.value } })}
              />
            </div>
          </div>
        )}
      </div>

      {/* 风险预警 */}
      <div className="space-y-2 p-3 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">风险预警推送</span>
          </div>
          <ToggleSwitch
            checked={settings.riskAlert.enabled}
            onChange={(enabled) => updateSettings({ riskAlert: { ...settings.riskAlert, enabled } })}
          />
        </div>
        {settings.riskAlert.enabled && (
          <div className="flex items-center gap-2 pl-6">
            <span className="text-xs text-muted-foreground">最低严重程度</span>
            <select
              className="border border-input rounded px-2 py-1 text-xs bg-card"
              value={settings.riskAlert.minSeverity}
              onChange={(e) => updateSettings({ riskAlert: { ...settings.riskAlert, minSeverity: e.target.value as any } })}
            >
              <option value="critical">仅关键</option>
              <option value="high">高及以上</option>
              <option value="medium">中等及以上</option>
            </select>
          </div>
        )}
      </div>

      {/* 免打扰时段 */}
      <div className="space-y-2 p-3 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">免打扰时段</span>
          </div>
          <ToggleSwitch
            checked={settings.dnd.enabled}
            onChange={(enabled) => updateSettings({ dnd: { ...settings.dnd, enabled } })}
          />
        </div>
        {settings.dnd.enabled && (
          <div className="flex items-center gap-2 pl-6">
            <input
              type="time"
              className="border border-input rounded px-2 py-1 text-xs bg-card"
              value={settings.dnd.startTime}
              onChange={(e) => updateSettings({ dnd: { ...settings.dnd, startTime: e.target.value } })}
            />
            <span className="text-xs text-muted-foreground">至</span>
            <input
              type="time"
              className="border border-input rounded px-2 py-1 text-xs bg-card"
              value={settings.dnd.endTime}
              onChange={(e) => updateSettings({ dnd: { ...settings.dnd, endTime: e.target.value } })}
            />
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">设置保存在本地，切换设备需重新配置</p>
    </div>
  );
}

// 简易开关组件
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={cn(
        'relative w-9 h-5 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-4'
        )}
      />
    </button>
  );
}
