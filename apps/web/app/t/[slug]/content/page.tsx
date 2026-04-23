import { requireTenantMember } from '@/lib/tenant';
import { ComingSoon } from '../_shared/coming-soon';

export default async function ContentPage({ params }: { params: { slug: string } }) {
  await requireTenantMember(params.slug);
  return (
    <ComingSoon
      title="内容"
      subtitle="W3 · 内容调度中台"
      bullets={[
        '上传 Word/PDF → 解析为 markdown',
        '按 GEO 9 法改写为头条号 / 抖音脚本 / 公众号多版本',
        '打标签(科室、话题、关键词)并关联目标问题',
        '一稿多发调度,防撞车 + 人设匹配 + 节奏控制',
      ]}
    />
  );
}
