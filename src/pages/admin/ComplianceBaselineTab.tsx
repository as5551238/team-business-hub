/**
 * 等保 Baseline 安全面板 — 等保二级基线自查、合规评分、修复建议
 * Phase 3-3: 等保合规
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RotateCw,
  FileText,
  Download,
  Lock,
  Users,
  Eye,
  Database,
  Server,
  Wifi,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

// ===== 类型定义 =====

type ComplianceCategory = 'identity' | 'access' | 'audit' | 'data' | 'network' | 'ops';

interface ComplianceItem {
  id: string;
  category: ComplianceCategory;
  title: string;
  description: string;
  level: 'required' | 'recommended' | 'optional';
  status: 'pass' | 'fail' | 'partial' | 'not_checked';
  autoFixable: boolean;
  fixSuggestion: string;
  weight: number; // 1-5
}

// ===== 等保二级检查项 =====

const COMPLIANCE_ITEMS: ComplianceItem[] = [
  // 身份鉴别
  { id: 'id-1', category: 'identity', title: '用户身份标识唯一性', description: '每个用户应有唯一的身份标识，不得存在共享账号', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: '已使用members表主键作为唯一标识，符合要求', weight: 5 },
  { id: 'id-2', category: 'identity', title: '口令复杂度', description: '口令应>=8位，含大小写+数字+特殊字符', level: 'required', status: 'fail', autoFixable: true, fixSuggestion: '当前为简单位匹配登录，建议增加密码策略验证', weight: 5 },
  { id: 'id-3', category: 'identity', title: '登录失败处理', description: '应限制非法登录次数，超过5次锁定账号', level: 'required', status: 'fail', autoFixable: true, fixSuggestion: '当前无限次重试，需在登录流程增加失败计数+锁定机制', weight: 4 },
  { id: 'id-4', category: 'identity', title: '会话超时管理', description: '会话空闲超过30分钟应自动断开', level: 'recommended', status: 'partial', autoFixable: false, fixSuggestion: 'Supabase JWT默认1小时过期，建议增加到业务层空闲检测', weight: 3 },
  { id: 'id-5', category: 'identity', title: '多因素认证', description: '重要系统应支持双因素认证', level: 'recommended', status: 'fail', autoFixable: false, fixSuggestion: '暂无MFA，Phase 2规划中。可选短信验证码或TOTP方案', weight: 3 },

  // 访问控制
  { id: 'ac-1', category: 'access', title: '最小权限原则', description: '用户只能访问其职责范围内的资源', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: 'RLS策略已按team_id隔离+角色策略，管理员/负责人/成员权限分级', weight: 5 },
  { id: 'ac-2', category: 'access', title: '默认拒绝', description: '默认应拒绝所有访问，仅显式授权', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: 'RLS策略默认DENY，需匹配team_id+角色才允许', weight: 5 },
  { id: 'ac-3', category: 'access', title: '特权用户控制', description: '管理员操作应可审计且双人复核', level: 'required', status: 'partial', autoFixable: false, fixSuggestion: '管理员操作已有audit_logs记录，但缺少双人复核机制', weight: 4 },
  { id: 'ac-4', category: 'access', title: '功能权限分离', description: '不同角色的功能权限应相互独立', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: 'admin/manager/leader/member四级权限分离已实现', weight: 4 },
  { id: 'ac-5', category: 'access', title: '敏感操作二次确认', description: '删除、导出等敏感操作需二次确认', level: 'recommended', status: 'partial', autoFixable: true, fixSuggestion: '删除已有软删除+回收站，但缺少操作前的二次确认弹窗', weight: 3 },

  // 安全审计
  { id: 'au-1', category: 'audit', title: '审计日志记录', description: '应记录重要用户行为和系统事件', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: 'audit_logs表已建，5张核心表有审计触发器', weight: 5 },
  { id: 'au-2', category: 'audit', title: '审计日志保护', description: '审计日志应防篡改，仅管理员可查看', level: 'required', status: 'partial', autoFixable: true, fixSuggestion: '日志有RLS保护，但缺少防篡改机制(如哈希校验)', weight: 4 },
  { id: 'au-3', category: 'audit', title: '审计日志保留期', description: '日志应保留至少180天', level: 'recommended', status: 'fail', autoFixable: false, fixSuggestion: '当前无自动清理策略，相当于永久保留。建议增加保留期配置', weight: 3 },
  { id: 'au-4', category: 'audit', title: '异常行为告警', description: '应对异常行为(如频繁删除、批量导出)告警', level: 'recommended', status: 'partial', autoFixable: true, fixSuggestion: 'AI主动推送有5分钟扫描，但缺少异常行为规则引擎', weight: 3 },

  // 数据安全
  { id: 'dt-1', category: 'data', title: '数据传输加密', description: '传输应使用HTTPS/TLS', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: 'Supabase强制HTTPS，GitHub Pages强制HTTPS', weight: 5 },
  { id: 'dt-2', category: 'data', title: '敏感数据脱敏', description: '手机号、邮箱等敏感字段应脱敏展示', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: 'members_safe视图已实现字段脱敏(手机号中间4位*号)', weight: 5 },
  { id: 'dt-3', category: 'data', title: '数据备份恢复', description: '应具备数据备份和恢复能力', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: 'Excel备份导出+Supabase自动备份', weight: 4 },
  { id: 'dt-4', category: 'data', title: '隐私政策', description: '应有隐私政策并获取用户同意', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: 'PrivacyPage + ConsentDialog 已实现', weight: 4 },
  { id: 'dt-5', category: 'data', title: '数据删除权', description: '用户应可请求删除个人数据', level: 'recommended', status: 'partial', autoFixable: false, fixSuggestion: '软删除已实现，但缺少用户自主数据清除请求流程', weight: 3 },

  // 网络安全
  { id: 'nw-1', category: 'network', title: '边界防护', description: '应对访问进行控制和防护', level: 'required', status: 'partial', autoFixable: false, fixSuggestion: 'RLS提供行级边界，但缺少IP白名单/地域限制', weight: 4 },
  { id: 'nw-2', category: 'network', title: '入侵防范', description: '应能检测和防范网络攻击', level: 'recommended', status: 'fail', autoFixable: false, fixSuggestion: '缺少WAF/入侵检测。Supabase内置DDoS防护，但无应用层防护', weight: 3 },
  { id: 'nw-3', category: 'network', title: '安全通信', description: '应有安全通信协议', level: 'required', status: 'pass', autoFixable: false, fixSuggestion: '全链路HTTPS/TLS', weight: 4 },

  // 运维安全
  { id: 'op-1', category: 'ops', title: '漏洞管理', description: '应及时修补安全漏洞', level: 'required', status: 'partial', autoFixable: false, fixSuggestion: '无自动化漏洞扫描。建议引入npm audit + Dependabot', weight: 4 },
  { id: 'op-2', category: 'ops', title: '变更管理', description: '系统变更应有审批和记录', level: 'recommended', status: 'partial', autoFixable: false, fixSuggestion: 'Git版本控制+PR流程已提供变更追踪，但缺少正式审批流程', weight: 3 },
  { id: 'op-3', category: 'ops', title: '安全事件响应', description: '应有安全事件响应流程', level: 'recommended', status: 'fail', autoFixable: false, fixSuggestion: '无正式安全事件响应流程文档。Sentry提供错误追踪但不覆盖安全事件', weight: 3 },
  { id: 'op-4', category: 'ops', title: '安全配置基线', description: '系统应有安全配置基线并定期核查', level: 'recommended', status: 'fail', autoFixable: true, fixSuggestion: '本面板即为基线检查工具，建议每月执行一次自动扫描', weight: 3 },
];

const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  identity: '身份鉴别',
  access: '访问控制',
  audit: '安全审计',
  data: '数据安全',
  network: '网络安全',
  ops: '运维安全',
};

const CATEGORY_ICONS: Record<ComplianceCategory, typeof Shield> = {
  identity: Lock,
  access: Users,
  audit: Eye,
  data: Database,
  network: Wifi,
  ops: Server,
};

const LEVEL_COLORS = {
  required: 'bg-red-100 text-red-700',
  recommended: 'bg-yellow-100 text-yellow-700',
  optional: 'bg-gray-100 text-gray-600',
};

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: '通过' },
  fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: '不通过' },
  partial: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: '部分通过' },
  not_checked: { icon: Shield, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', label: '未检查' },
};

// ===== 子组件 =====

function ComplianceScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground">合规分</span>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: ComplianceItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sc = STATUS_CONFIG[item.status];
  const StatusIcon = sc.icon;
  return (
    <div className={`border rounded-lg overflow-hidden ${expanded ? 'ring-1 ring-primary/20' : ''}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <StatusIcon size={14} className={sc.color} />
        <span className="text-xs font-medium flex-1 truncate">{item.title}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${LEVEL_COLORS[item.level]}`}>
          {item.level === 'required' ? '必选' : item.level === 'recommended' ? '建议' : '可选'}
        </span>
        <span className={`text-[10px] font-medium ${sc.color}`}>{sc.label}</span>
        {item.autoFixable && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700">可修复</span>}
      </button>
      {expanded && (
        <div className={`px-3 pb-3 space-y-2 border-t ${sc.bg}`}>
          <p className="text-xs text-muted-foreground pt-2">{item.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold">修复建议:</span>
            <span className="text-[11px]">{item.fixSuggestion}</span>
          </div>
          {item.autoFixable && (
            <button type="button" className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-primary text-white hover:bg-primary/90 transition-colors">
              <RotateCw size={10} />一键修复
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 主组件 =====

export function ComplianceBaselineTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ComplianceCategory | 'all'>('all');
  const [items, setItems] = useState<ComplianceItem[]>(COMPLIANCE_ITEMS);

  const filteredItems = useMemo(() => {
    if (categoryFilter === 'all') return items;
    return items.filter(i => i.category === categoryFilter);
  }, [items, categoryFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const pass = items.filter(i => i.status === 'pass').length;
    const fail = items.filter(i => i.status === 'fail').length;
    const partial = items.filter(i => i.status === 'partial').length;
    const autoFixable = items.filter(i => i.autoFixable && i.status !== 'pass').length;

    // 加权评分：pass=100%, partial=50%, fail=0%
    let totalWeight = 0;
    let earnedWeight = 0;
    for (const item of items) {
      totalWeight += item.weight;
      if (item.status === 'pass') earnedWeight += item.weight;
      else if (item.status === 'partial') earnedWeight += item.weight * 0.5;
    }
    const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

    // 各类别评分
    const categoryScores: Record<string, number> = {};
    for (const cat of Object.keys(CATEGORY_LABELS) as ComplianceCategory[]) {
      const catItems = items.filter(i => i.category === cat);
      let catTotal = 0;
      let catEarned = 0;
      for (const item of catItems) {
        catTotal += item.weight;
        if (item.status === 'pass') catEarned += item.weight;
        else if (item.status === 'partial') catEarned += item.weight * 0.5;
      }
      categoryScores[cat] = catTotal > 0 ? Math.round((catEarned / catTotal) * 100) : 0;
    }

    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    return { total, pass, fail, partial, autoFixable, score, categoryScores, grade };
  }, [items]);

  const handleExportReport = useCallback(() => {
    const lines = [
      '# 等保二级合规自查报告',
      '',
      `生成时间: ${new Date().toLocaleString('zh-CN')}`,
      `综合合规评分: ${stats.score}/100 (等级: ${stats.grade})`,
      '',
      '## 各领域评分',
      '',
      ...Object.entries(stats.categoryScores).map(([cat, score]) => `- ${CATEGORY_LABELS[cat as ComplianceCategory]}: ${score}/100`),
      '',
      '## 检查项详情',
      '',
      ...items.map(item => {
        const sc = STATUS_CONFIG[item.status];
        return `- [${sc.label}] ${item.title} (${CATEGORY_LABELS[item.category]})${item.autoFixable && item.status !== 'pass' ? ' [可自动修复]' : ''}`;
      }),
      '',
      '## 修复建议',
      '',
      ...items.filter(i => i.status !== 'pass').map(item => `- ${item.title}: ${item.fixSuggestion}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `等保合规报告_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items, stats]);

  return (
    <div className="space-y-4">
      {/* 评分概览 */}
      <div className="flex items-start gap-6">
        <ComplianceScoreRing score={stats.score} />
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">等保二级合规评分</h3>
              <span className={`text-sm font-bold px-2 py-0.5 rounded ${stats.score >= 80 ? 'bg-green-100 text-green-700' : stats.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                {stats.grade}级
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.score >= 80 ? '合规状态良好，少量待改进项' :
               stats.score >= 60 ? '基本合规，存在中等风险项需改进' :
               '存在重要合规缺口，需优先修复'}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="text-center border rounded-lg p-2">
              <div className="text-lg font-bold text-green-600">{stats.pass}</div>
              <div className="text-[10px] text-muted-foreground">通过</div>
            </div>
            <div className="text-center border rounded-lg p-2">
              <div className="text-lg font-bold text-red-600">{stats.fail}</div>
              <div className="text-[10px] text-muted-foreground">不通过</div>
            </div>
            <div className="text-center border rounded-lg p-2">
              <div className="text-lg font-bold text-yellow-600">{stats.partial}</div>
              <div className="text-[10px] text-muted-foreground">部分通过</div>
            </div>
            <div className="text-center border rounded-lg p-2">
              <div className="text-lg font-bold text-blue-600">{stats.autoFixable}</div>
              <div className="text-[10px] text-muted-foreground">可修复</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Download size={12} />导出合规报告
          </button>
        </div>
      </div>

      {/* 各领域评分条 */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(CATEGORY_LABELS) as [ComplianceCategory, string][]).map(([cat, label]) => {
          const CatIcon = CATEGORY_ICONS[cat];
          const score = stats.categoryScores[cat];
          const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';
          return (
            <div key={cat} className="border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <CatIcon size={14} className="text-muted-foreground" />
                <span className="text-xs font-semibold">{label}</span>
                <span className="text-xs font-mono ml-auto">{score}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">筛选:</span>
        <button onClick={() => setCategoryFilter('all')} className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${categoryFilter === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
          全部
        </button>
        {(Object.entries(CATEGORY_LABELS) as [ComplianceCategory, string][]).map(([cat, label]) => (
          <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${categoryFilter === cat ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 检查项列表 */}
      <div className="space-y-1.5">
        {filteredItems.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
          />
        ))}
      </div>

      {/* 合规路线图 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
        <h4 className="font-semibold text-sm flex items-center gap-2"><FileText size={14} />等保合规路线图</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck size={12} className="text-green-600" />
            <span className="font-medium">Phase 1 (评估)</span>
            <span className="text-muted-foreground">— 当前：基线自查 + 差距分析（已完成）</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={12} className="text-yellow-600" />
            <span className="font-medium">Phase 2 (整改)</span>
            <span className="text-muted-foreground">— 修复高优先级不通过项：口令复杂度、登录失败处理、审计日志防篡改</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield size={12} className="text-blue-600" />
            <span className="font-medium">Phase 3 (认证)</span>
            <span className="text-muted-foreground">— 正式申请等保二级认证，提交测评报告</span>
          </div>
        </div>
      </div>
    </div>
  );
}
