/**
 * 集成管理 Tab — 开放 API 文档 + Webhook 出站管理
 * Phase 3: Cross-platform protocol
 */
import { useState } from 'react';
import { Code, Webhook, Bell, Link2, Activity, Mail } from 'lucide-react';
import { IntegrationHealthTab } from './IntegrationHealthTab';
import { OpenAPISection, ApiTokenSection, WebhookSection, PushConnectorSection, OAuthSection, OutlookSection } from './IntegrationSections';

// ===== Main Component =====
export function IntegrationsTab() {
  const [section, setSection] = useState<'api' | 'webhook' | 'push' | 'oauth' | 'outlook' | 'health'>('api');

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">集成管理</h3>

      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 flex-wrap">
        <button onClick={() => setSection('api')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${section === 'api' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Code size={14} /> API
        </button>
        <button onClick={() => setSection('webhook')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${section === 'webhook' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Webhook size={14} /> Webhook
        </button>
        <button onClick={() => setSection('push')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${section === 'push' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Bell size={14} /> 推送
        </button>
        <button onClick={() => setSection('oauth')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${section === 'oauth' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Link2 size={14} /> OAuth
        </button>
        <button onClick={() => setSection('outlook')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${section === 'outlook' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Mail size={14} /> Outlook
        </button>
        <button onClick={() => setSection('health')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${section === 'health' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Activity size={14} /> 健康
        </button>
      </div>

      {section === 'api' ? <OpenAPISection /> : section === 'webhook' ? <WebhookSection /> : section === 'push' ? <PushConnectorSection /> : section === 'oauth' ? <OAuthSection /> : section === 'outlook' ? <OutlookSection /> : <IntegrationHealthTab />}
    </div>
  );
}
