import { requireRole } from '@/lib/tenant';
import { ComingSoon } from '../_shared/coming-soon';

export default async function CompliancePage({ params }: { params: { slug: string } }) {
  await requireRole(params.slug, ['owner', 'admin', 'auditor']);
  return (
    <ComingSoon
      title="合规审核"
      subtitle="W4 · 医疗合规三道门"
      bullets={[
        '审批台:左原文 · 右 LLM 分析 + 改写建议 · 底部三按钮',
        '待审队列 · SLA 倒计时 · 历史审批记录',
        '关键词词库管理(A 级 40 条 / B 级 11 条,可加租户自定义)',
        '审计日志导出(≥ 3 年,应对监管询问)',
      ]}
    />
  );
}
