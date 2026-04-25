/**
 * Dev-only: exercise generator.ts against the real Doubao API.
 * Run: pnpm db:dev-test-doubao
 *
 * Prints title, first 300 chars of body, applied tactics, and token usage
 * so you can eyeball output quality before running the full pipeline.
 */
import { generateVariant, isAvailable } from '@geo/geo-core';

const markdown = `
种植牙是目前缺牙修复的主流选择之一。其核心工艺是将钛合金人工牙根植入牙槽骨,
骨结合稳定后再安装牙冠。针对糖尿病、骨量不足、抽烟等风险因素,术前需做全面评估。

术后护理的关键是控制菌斑,使用冲牙器 + 软毛牙刷清洁植体周围软组织。
每半年复查一次影像学检查并做专业洁治,可以显著降低植体周围炎发生率。

国内《种植体周围炎临床诊疗指南(2023 版)》明确指出,对糖化血红蛋白 >8% 的患者
应推迟种植,待血糖控制平稳后再评估。这一建议与欧洲种植学会(EAO)共识一致。
`.trim();

async function main() {
  console.log(`ARK available: ${isAvailable()}`);
  console.log(`Model: ${process.env.ARK_MODEL_PRO ?? 'doubao-seed-1-6-pro-250815'}`);
  console.log('');

  const started = Date.now();
  const result = await generateVariant({
    source_markdown: markdown,
    platform: 'toutiao_article',
    tactics: ['add_statistics', 'fluency_optimization', 'cite_sources', 'add_quotation'],
    brand_name: 'Demo Dental Hospital',
    industry: 'dental',
    topic_hints: ['种植牙', '术后护理', '临床指南'],
  });
  const elapsed = Date.now() - started;

  if (!result.ok) {
    console.error(`✗ generate failed (${result.provider}): ${result.reason}`);
    process.exit(1);
  }

  const v = result.variant;
  console.log(`✓ generated in ${elapsed}ms via ${v.provider}`);
  console.log(`  tokens: prompt=${v.usage?.prompt_tokens ?? '?'} completion=${v.usage?.completion_tokens ?? '?'} total=${v.usage?.total_tokens ?? '?'}`);
  console.log(`  tactics_applied: ${v.tactics_applied.join(', ')}`);
  console.log('');
  console.log(`── title ──`);
  console.log(v.title);
  console.log('');
  console.log(`── body (${v.body.length} chars, first 500) ──`);
  console.log(v.body.slice(0, 500) + (v.body.length > 500 ? '…' : ''));
  console.log('');
  console.log(`── notes ──`);
  console.log(v.notes);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
