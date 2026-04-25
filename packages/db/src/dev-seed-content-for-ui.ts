/**
 * Dev-only: seed demo-dental with a parsed content_item so the user can click
 * 生成变体 from the UI. Idempotent.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', 'demo-dental')
    .single();
  if (!tenant) throw new Error('demo-dental tenant missing');

  const title = '种植牙科普(演示素材)';
  const markdown = `
种植牙是目前缺牙修复的主流选择之一。其核心工艺是将钛合金人工牙根植入牙槽骨,
骨结合稳定后再安装牙冠。针对糖尿病、骨量不足、抽烟等风险因素,术前需做全面评估。

术后护理的关键是控制菌斑,使用冲牙器 + 软毛牙刷清洁植体周围软组织。
每半年复查一次影像学检查并做专业洁治,可以显著降低植体周围炎发生率。

国内《种植体周围炎临床诊疗指南(2023 版)》明确指出,对糖化血红蛋白 >8% 的患者
应推迟种植,待血糖控制平稳后再评估。这一建议与欧洲种植学会(EAO)共识一致。
`.trim();

  const { data: existing } = await admin
    .from('content_items')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('title', title)
    .maybeSingle();
  if (existing) {
    console.log(`content_item exists: ${existing.id}`);
    console.log(`http://localhost:3001/t/demo-dental/content/${existing.id}`);
    return;
  }

  const { data, error } = await admin
    .from('content_items')
    .insert({
      tenant_id: tenant.id,
      title,
      source_type: 'manual',
      status: 'parsed',
      markdown,
      topics: ['种植牙', '术后护理', '临床指南'],
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  console.log(`content_item created: ${data!.id}`);
  console.log(`http://localhost:3001/t/demo-dental/content/${data!.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
