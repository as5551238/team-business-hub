/**
 * AI Analysis Page - 独立顶级页面
 * 从管理中心Tab升级而来，与管理中心、工作台等并列
 */
import AIAnalysisTab from './admin/AIAnalysisTab';

export default function AIAnalysisPage() {
  return (
    <div className="h-full">
      <AIAnalysisTab />
    </div>
  );
}
