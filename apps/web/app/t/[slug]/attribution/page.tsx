import { requireRole } from '@/lib/tenant';
import { ComingSoon } from '../_shared/coming-soon';

export default async function AttributionPage({ params }: { params: { slug: string } }) {
  await requireRole(params.slug, ['owner', 'admin', 'operator']);
  return (
    <ComingSoon
      title="转化归因"
      subtitle="W7 · 多钩子转化漏斗"
      bullets={[
        '钩子管理:医生名 / 活动暗号 / 电话尾号 / 企微 utm',
        '前台打卡端(小程序)→ 到店事件自动回流',
        '漏斗看板:内容 → 引用 → 咨询 → 到店 → 成交',
        'ROI 计算:单客成本 · 单员工产出 · 单篇内容 LTV',
      ]}
    />
  );
}
