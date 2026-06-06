import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, FileText, ChevronRight, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { handleError } from '@/lib/errorHandler';

export function PrivacyPage() {
  const navigate = useNavigate();
  const [expandedSection, setExpandedSection] = useState<string | null>('collection');

  const sections = [
    {
      id: 'collection',
      title: '一、信息收集',
      icon: <Shield size={18} />,
      content: `我们收集以下必要信息以提供核心服务：

1. **账户信息**：姓名、手机号、微信号、邮箱地址
2. **业务数据**：您在平台中创建的目标、项目、任务、评论等
3. **使用数据**：登录时间、操作记录（用于审计与安全）
4. **设备信息**：浏览器类型、操作系统（用于兼容性适配）

我们不会收集与核心服务无关的个人信息，不会要求相机、麦克风、通讯录等敏感权限。`
    },
    {
      id: 'usage',
      title: '二、信息使用',
      icon: <FileText size={18} />,
      content: `您的信息仅用于：

1. **提供核心服务**：目标管理、任务协作、团队沟通
2. **AI辅助功能**：风险预测、智能分配、复盘建议（AI处理在服务器端完成，不向第三方传输原始数据）
3. **安全防护**：异常登录检测、操作审计、数据加密
4. **服务改进**：匿名化使用统计分析，不关联到个人身份

我们绝不会将您的个人信息出售或分享给第三方用于营销目的。`
    },
    {
      id: 'storage',
      title: '三、数据存储与保护',
      icon: <Shield size={18} />,
      content: `1. **存储位置**：数据存储于中华人民共和国境内的安全服务器
2. **加密措施**：敏感字段（手机号、邮箱）使用AES-256加密存储
3. **访问控制**：采用行级安全策略(RLS)，团队成员只能访问本团队数据
4. **审计追踪**：所有数据变更自动记录审计日志，不可删除
5. **传输安全**：全站HTTPS加密传输
6. **备份恢复**：数据每日自动备份，支持时间点恢复(PITR)`
    },
    {
      id: 'rights',
      title: '四、您的权利',
      icon: <FileText size={18} />,
      content: `根据《个人信息保护法》，您享有以下权利：

1. **查阅权**：随时查看您的个人信息
2. **更正权**：修改不准确的个人信息
3. **删除权**：申请删除您的个人信息（法律另有规定的除外）
4. **导出权**：导出您的全部个人数据（JSON/Excel格式）
5. **撤回同意权**：撤回对信息处理的同意，不影响撤回前的处理效力
6. **注销权**：注销账户，我们将删除您的所有个人信息

行使上述权利，请联系：隐私保护负责人 as5551238@126.com`
    },
    {
      id: 'sharing',
      title: '五、信息共享',
      icon: <Shield size={18} />,
      content: `我们仅在下述情况下共享您的信息：

1. **团队内共享**：您的姓名、部门、角色信息在团队内可见
2. **服务提供商**：使用第三方云存储服务（已签署数据处理协议）
3. **法律要求**：法律法规要求或公安、司法机关依法要求时

我们不会将您的信息用于数据交易、用户画像推送等商业化用途。`
    },
    {
      id: 'children',
      title: '六、未成年人保护',
      icon: <FileText size={18} />,
      content: `本产品面向企业及团队用户，不面向未满14周岁的未成年人。如果我们发现收集了未成年人的个人信息，将立即删除相关数据。`
    },
    {
      id: 'update',
      title: '七、政策更新',
      icon: <Shield size={18} />,
      content: `本政策可能不时更新。重大变更将通过应用内通知告知您。继续使用本服务即表示您同意更新后的政策。

本政策最后更新：2026年5月30日`
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          {(
            <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <ArrowLeft size={20} />
            </button>
          )}
          <Shield size={28} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">隐私政策</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">最后更新：2026年5月30日</p>
          </div>
        </div>

        {/* Notice */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 mb-6">
          <p className="text-sm text-indigo-800 dark:text-indigo-200">
            团队业务中台重视您的个人信息保护。本政策说明我们如何收集、使用、存储和保护您的个人信息。
            使用本服务前，请仔细阅读并确认。
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.id} className="bg-card dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)} className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <span className="text-indigo-600">{section.icon}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100 flex-1 text-left">{section.title}</span>
                <ChevronRight
                  size={18}
                  className={`text-gray-400 transition-transform ${expandedSection === section.id ? 'rotate-90' : ''}`}
                />
              </button>
              {expandedSection === section.id && (
                <div className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line border-t border-gray-100 dark:border-gray-700 pt-3">
                  {section.content}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-8 bg-card dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">联系方式</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            如有任何关于隐私保护的问题或请求，请联系我们：<br />
            邮箱：as5551238@126.com<br />
            我们将在15个工作日内回复您的请求。
          </p>
        </div>
      </div>
    </div>
  );
}

/** 知情同意弹窗 — 新用户首次登录显示 */
export function ConsentDialog({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const CONSENT_KEY = 'tbh-privacy-consented';

  // Check if already consented
  try {
    if (localStorage.getItem(CONSENT_KEY)) {
      onAccept();
      return null;
    }
  } catch (e) { handleError(e, { module: 'PrivacyPage', operation: 'CHECK_CONSENT', severity: 'debug' }); }

  if (showPrivacy) {
    return (
      <Dialog open={showPrivacy} onOpenChange={(v) => { if (!v) setShowPrivacy(false); }}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="sticky top-0 bg-card border-b border-gray-200 dark:border-gray-700 p-4 flex flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">隐私政策</DialogTitle>
            <DialogDescription className="sr-only">隐私政策全文</DialogDescription>
            <button onClick={() => setShowPrivacy(false)} className="text-sm text-indigo-600 hover:underline">返回确认</button>
          </DialogHeader>
          <div className="p-4 overflow-y-auto flex-1">
            <PrivacyContent />
          </div>
          <div className="sticky bottom-0 bg-card border-t border-gray-200 dark:border-gray-700 p-4 flex gap-3">
            <button onClick={() => setShowPrivacy(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">返回</button>
            <button onClick={() => { try { localStorage.setItem(CONSENT_KEY, String(Date.now())); } catch (e) { handleError(e, { module: 'PrivacyPage', operation: 'SAVE_CONSENT', severity: 'debug' }); } onAccept(); }} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">我已阅读并同意</button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onDecline(); }}>
      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader>
          <DialogTitle>欢迎来到团队业务中台</DialogTitle>
          <DialogDescription>开始使用前，请确认以下事项</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
            <Shield size={24} className="text-indigo-600" />
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-750 rounded-lg">
            <Shield size={18} className="text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">数据安全承诺</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">数据境内存储，行级安全隔离，敏感字段加密</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-750 rounded-lg">
            <FileText size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">个人信息保护</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">遵循《个人信息保护法》，支持查阅、更正、删除、导出</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          继续使用即表示您已阅读并同意我们的
          <button onClick={() => setShowPrivacy(true)} className="text-indigo-600 hover:underline">隐私政策</button>
        </p>

        <div className="flex gap-3">
          <button onClick={onDecline} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">不同意</button>
          <button onClick={() => { try { localStorage.setItem(CONSENT_KEY, String(Date.now())); } catch (e) { handleError(e, { module: 'PrivacyPage', operation: 'SAVE_CONSENT', severity: 'debug' }); } onAccept(); }} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 font-medium">我已阅读并同意</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 隐私政策正文（可复用） */
function PrivacyContent() {
  return (
    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-4">
      <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">一、信息收集</h3>
      <p>我们收集以下必要信息以提供核心服务：</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>账户信息</strong>：姓名、手机号、微信号、邮箱地址</li>
        <li><strong>业务数据</strong>：您在平台中创建的目标、项目、任务、评论等</li>
        <li><strong>使用数据</strong>：登录时间、操作记录（用于审计与安全）</li>
        <li><strong>设备信息</strong>：浏览器类型、操作系统（用于兼容性适配）</li>
      </ul>

      <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">二、信息使用</h3>
      <p>您的信息仅用于提供核心服务、AI辅助功能、安全防护和服务改进。我们绝不会将您的个人信息出售或分享给第三方用于营销目的。</p>

      <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">三、数据存储与保护</h3>
      <ul className="list-disc pl-5 space-y-1">
        <li>数据存储于中华人民共和国境内的安全服务器</li>
        <li>敏感字段使用AES-256加密存储</li>
        <li>行级安全策略(RLS)，团队成员只能访问本团队数据</li>
        <li>全站HTTPS加密传输</li>
        <li>数据每日自动备份</li>
      </ul>

      <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">四、您的权利</h3>
      <p>根据《个人信息保护法》，您享有查阅权、更正权、删除权、导出权、撤回同意权和注销权。</p>
      <p>联系方式：as5551238@126.com</p>

      <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">五、信息共享</h3>
      <p>我们仅在下述情况下共享您的信息：团队内必要共享、签署协议的服务提供商、法律要求。不会用于数据交易或用户画像推送。</p>

      <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">六、未成年人保护</h3>
      <p>本产品面向企业及团队用户，不面向未满14周岁的未成年人。</p>

      <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">七、政策更新</h3>
      <p>本政策最后更新：2026年5月30日。重大变更将通过应用内通知告知您。</p>
    </div>
  );
}
