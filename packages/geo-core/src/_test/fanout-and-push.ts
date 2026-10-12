import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFanoutCoverage,
  generateFanoutQueries,
  FANOUT_DIMENSIONS,
} from '../tracking/fanout-matrix';
import {
  dispatchSearchEnginePush,
} from '../discoverability/search-push';

test('evaluateFanoutCoverage detects 10 dimensions properly', () => {
  const existingQuestions = [
    { text: '昆明种植牙多少钱一颗？2026价格明细', intent: 'price_inquiry' },
    { text: '昆明西山区种植牙哪家医院好？正规机构推荐', intent: 'local_recommendation' },
    { text: '种牙怎么挑选医生？看准这几个资质', intent: 'doctor_review' },
    { text: '做种植牙全流程去几次医院？大概耗时多久', intent: 'procedure_info' },
  ];

  const report = evaluateFanoutCoverage('种植牙', existingQuestions, '昆明');
  assert.equal(report.totalDimensions, 10);
  assert.equal(report.coveredCount, 4);
  assert.equal(report.coverageScore, 40);
  assert.equal(report.missingDimensions.length, 6);

  // Covered dimensions
  const priceDim = report.dimensions.find((d) => d.spec.id === 'price_tier');
  assert.equal(priceDim?.covered, true);
  assert.equal(priceDim?.matchedQuestions.length, 1);

  // Missing dimensions
  const pitfallDim = report.dimensions.find((d) => d.spec.id === 'risk_pitfall');
  assert.equal(pitfallDim?.covered, false);
  assert.ok(pitfallDim?.suggestedQuery.includes('种植牙'));
});

test('generateFanoutQueries falls back gracefully without LLM', async () => {
  const queries = await generateFanoutQueries({
    seedKeyword: '全瓷牙',
    city: '昆明',
    targetDimensionIds: ['price_tier', 'risk_pitfall'],
  });

  assert.equal(queries.length, 2);
  const q0 = queries[0]!;
  const q1 = queries[1]!;
  assert.equal(q0.dimensionId, 'price_tier');
  assert.ok(q0.text.includes('全瓷牙'));
  assert.equal(q1.dimensionId, 'risk_pitfall');
  assert.ok(q1.text.includes('全瓷牙'));
});

test('dispatchSearchEnginePush handles empty / missing credentials cleanly', async () => {
  const emptyRes = await dispatchSearchEnginePush({ urls: [] });
  assert.equal(emptyRes.urls_count, 0);

  const res = await dispatchSearchEnginePush({
    urls: ['https://songskq.com/c/songshu/articles/test-1'],
    // No baidu or shenma config
  });
  assert.equal(res.urls_count, 1);
  assert.equal(res.baidu, undefined);
  assert.equal(res.shenma, undefined);
});
