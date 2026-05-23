/**
 * Dev test: 跑一次 LLM 子问题展开,看真实输出。
 * 不写库,只 console.log。
 */
import { expandSubtopics } from '@geo/geo-core';

async function main() {
  const topic = process.argv[2] || '昆明牙周病治疗医院';
  const result = await expandSubtopics({
    topic,
    industry_context: '昆明本地口腔医疗(西山区为主)',
    brand_name: '昆明松鼠口腔',
    count: 8,
  });
  if (!result.ok) {
    console.error('FAILED:', result.reason);
    process.exit(1);
  }
  console.log(`Expanded "${topic}" → ${result.subtopics.length} subtopics:\n`);
  for (const [i, s] of result.subtopics.entries()) {
    console.log(`#${i + 1} [${s.intent}, relevance=${s.estimated_relevance}]`);
    console.log(`   text: ${s.text}`);
    console.log(`   keywords: ${s.key_keywords.join(' / ')}\n`);
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
