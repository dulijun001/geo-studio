import { requireRole } from '@/lib/tenant';
import { ComingSoon } from '../_shared/coming-soon';

export default async function PublishPage({ params }: { params: { slug: string } }) {
  await requireRole(params.slug, ['owner', 'admin', 'operator']);
  return (
    <ComingSoon
      title="派单"
      subtitle="W5 · 员工派单 + 移动端"
      bullets={[
        '派单算法:防撞车 + 人设匹配 + 节奏控制',
        '今日 40 员工的发布计划总览',
        '员工打卡回执追踪 + 失败原因收集',
        '手动重派、跳过、改档功能',
      ]}
    />
  );
}
