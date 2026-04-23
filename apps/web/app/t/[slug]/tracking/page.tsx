import { requireTenantMember } from '@/lib/tenant';
import { ComingSoon } from '../_shared/coming-soon';

export default async function TrackingPage({ params }: { params: { slug: string } }) {
  await requireTenantMember(params.slug);
  return (
    <ComingSoon
      title="GEO 追踪"
      subtitle="W6 · GEO 追踪引擎"
      bullets={[
        '问题库:城市×科室×意图 笛卡尔积生成 + 人工精选',
        'Playwright Worker 定时模拟真人问豆包 / 元宝',
        '引用识别:品牌词典 + LLM 语义匹配,溯源到具体内容',
        '报表:覆盖率 / Share of Voice / 引用排名 / 情感倾向',
      ]}
    />
  );
}
