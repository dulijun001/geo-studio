/**
 * Smoke test for V1.7 b1 + b2:
 *   b1 — content uniqueness detection
 *   b2 — E-E-A-T 4-dim mapping over 9 法 scorer
 *
 * Pure-function tests. Run: pnpm db:test-uniqueness
 */

import {
  classifySimilarity,
  compare,
  computeSimilarity,
  EEAT_LABELS,
  findMostSimilar,
  mapToEeat,
  scoreGeo,
} from '@geo/geo-core';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

// ─── b1: uniqueness ─────────────────────────────────────────────────────

// Identical strings → similarity ~ 1
{
  const a = '种植牙术后第一周避免硬食。详细注意事项如下。';
  const sim = computeSimilarity(a, a);
  record('uniqueness: identical → total ≈ 1', sim.total > 0.95, `total=${sim.total.toFixed(3)}`);
  record('uniqueness: identical → verdict rewrite', classifySimilarity(sim.total) === 'rewrite');
}

// Wholly different topics → similarity ~ 0
{
  const a = '种植牙术后护理:第一周避免硬食,使用温水漱口。';
  const b = '正畸需要拔牙吗?多数情况下医生根据牙列拥挤度判断。';
  const sim = computeSimilarity(a, b);
  // Note: Chinese chars share a small alphabet so even unrelated medical
  // sentences will have some bigram overlap. < 0.5 is the realistic ceiling
  // for "different topics in the same vertical."
  record('uniqueness: different topics → total < 0.5', sim.total < 0.5, `total=${sim.total.toFixed(3)}`);
  record('uniqueness: different → verdict good or warn', ['good', 'warn'].includes(classifySimilarity(sim.total)));
}

// Near-duplicate (one word changed) → high similarity
{
  const a =
    '## 种植牙术后注意\n\n第一周避免硬食。建议使用温水漱口。如果有疼痛应立即联系医生。';
  const b =
    '## 种植牙术后须知\n\n第一周避免硬食。建议使用温水漱口。如果有疼痛应立即联系医生。';
  const sim = computeSimilarity(a, b);
  record('uniqueness: near-duplicate → total > 0.7', sim.total > 0.7, `total=${sim.total.toFixed(3)}`);
  record('uniqueness: near-duplicate → verdict rewrite', classifySimilarity(sim.total) === 'rewrite');
}

// Same topic, different angle → moderate similarity
{
  const a = '种植牙价格区间在 5000-15000 之间,影响因素包括品牌选择和医生资历。';
  const b = '正规医院做种植牙花费多少?一般 5000-15000,主要看种植体牌子和主治医师水平。';
  const sim = computeSimilarity(a, b);
  record('uniqueness: same-topic-different-angle → total in 0.3-0.7', sim.total >= 0.3 && sim.total < 0.7, `total=${sim.total.toFixed(3)}`);
}

// Empty inputs
{
  const sim = computeSimilarity('', '');
  record('uniqueness: empty/empty → total 0', sim.total === 0);
}

// findMostSimilar
{
  const target = '种植牙术后第一周避免硬食。';
  const candidates = [
    { id: 'v1', body: '正畸什么时候做最合适' },
    { id: 'v2', body: '种植牙术后第一周建议软食' }, // most similar
    { id: 'v3', body: '儿童牙齿矫正注意事项' },
  ];
  const best = findMostSimilar(target, candidates);
  record('findMostSimilar: returns highest-similarity id', best?.id === 'v2');
}

{
  const best = findMostSimilar('any', []);
  record('findMostSimilar: empty array → null', best === null);
}

// ─── b2: E-E-A-T mapping ────────────────────────────────────────────────

{
  const score = scoreGeo({
    title: '种植牙术后护理',
    body: `# 种植牙术后护理(临床指南)

第一周务必避免硬食。临床数据显示,**坚持冰敷的患者愈合时间平均缩短 25%**。

> 「术后 24 小时是关键窗口」 — 张医生(主治)。

参考《中华口腔医学指南》第三版,卫健委 2024 年发布。

实践中,我们医院 5000+ 例患者中,90% 都遵循以下流程:

1. 第一天:冰敷 + 流食
2. 第二到三天:冷食 + 漱口
3. 第四天起:温热半流食

如果有持续疼痛超过 48 小时,请立即联系医生。`,
    primary_keyword: '种植牙术后',
  });

  const eeat = mapToEeat(score);

  record('eeat: has 4 dimensions', Object.keys(eeat).length === 4);
  record('eeat: expertise sums citation+statistics max', eeat.expertise.max === 35);
  record('eeat: experience sums authority+position max', eeat.experience.max === 15);
  record('eeat: authoritativeness sums quotation+unique max', eeat.authoritativeness.max === 20);
  record('eeat: trustworthiness sums fluency+readability+keyword_freq max', eeat.trustworthiness.max === 30);
  record(
    'eeat: total max = total of 9 法 = 100',
    eeat.expertise.max + eeat.experience.max + eeat.authoritativeness.max + eeat.trustworthiness.max === 100,
  );
  record(
    'eeat: total score = sum of 9 法 score',
    eeat.expertise.score + eeat.experience.score + eeat.authoritativeness.score + eeat.trustworthiness.score ===
      score.total,
    `eeat_sum=${eeat.expertise.score + eeat.experience.score + eeat.authoritativeness.score + eeat.trustworthiness.score}, geo_total=${score.total}`,
  );
  record('eeat: tactic_keys preserved', eeat.expertise.tactic_keys.includes('citation') && eeat.expertise.tactic_keys.includes('statistics'));

  record(
    'eeat-labels: each dim has zh + en + hint',
    Object.values(EEAT_LABELS).every((l) => !!l.zh && !!l.en && !!l.hint),
  );
}

// ─── tally ──────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
