/**
 * Ground-Truth 事实校验器单元契约自检
 */
import { verifyCitationsWithGroundTruth } from '../generation/ground-truth-verifier';
import type { DeepSeekToolClient } from '../llm/deepseek-tools';

async function run() {
  console.log('--- 1. 测试未配置 Fetch/Key 时的回退契约 ---');
  const dummyText = '根据中华口腔医学会 2022 年发布的《牙种植体临床应用指南》，骨量不足需做植骨。';
  const whitelist = [
    {
      id: 'c1',
      title: '牙种植体临床应用指南',
      aliases: ['《牙种植体临床应用指南》'],
      issuer: '中华口腔医学会',
      publication_year: 2022,
      source_url: 'https://example.com/guideline.html',
    },
  ];

  const resFallback = await verifyCitationsWithGroundTruth(dummyText, whitelist, {
    autoFetchSources: false,
  });

  if (resFallback.verdict === 'ok' && !resFallback.ground_truth_scanned) {
    console.log('PASS: 基础白名单回退正常');
  } else {
    console.error('FAIL: 回退逻辑异常', resFallback);
    process.exit(1);
  }

  console.log('--- 2. 测试 Mock Fetch 校验一致性 (正确场景) ---');
  const mockClientSuccess: DeepSeekToolClient = {
    isConfigured: () => true,
    search: async () => ({ results: [] }),
    fetchMarkdown: async (url: string) => ({
      url,
      title: '牙种植体临床应用指南',
      markdown: '# 中华口腔医学会 2022 年牙种植体临床应用指南\n骨量评估规范...',
      status: 200,
    }),
  } as any;

  const resSuccess = await verifyCitationsWithGroundTruth(dummyText, whitelist, {
    client: mockClientSuccess,
  });

  if (
    resSuccess.verdict === 'ok' &&
    resSuccess.ground_truth_scanned &&
    resSuccess.ground_truth_verifications[0]?.verified_in_source
  ) {
    console.log('PASS: 原文抓取一致性校验通过');
  } else {
    console.error('FAIL: 一致性校验未通过', resSuccess);
    process.exit(1);
  }

  console.log('--- 3. 测试 Mock Fetch 抓出虚假年份 (D34 场景) ---');
  const mockClientMismatch: DeepSeekToolClient = {
    isConfigured: () => true,
    search: async () => ({ results: [] }),
    fetchMarkdown: async (url: string) => ({
      url,
      title: '牙种植体临床应用指南',
      markdown: '# 国家卫健委 2019 年牙种植体临床应用指南\n并非某学会发布，全文无二零二二年...',
      status: 200,
    }),
  } as any;

  const resMismatch = await verifyCitationsWithGroundTruth(dummyText, whitelist, {
    client: mockClientMismatch,
  });

  if (
    resMismatch.verdict === 'suspected_hallucination' &&
    resMismatch.ground_truth_verifications[0]?.verified_in_source === false &&
    resMismatch.detail_issues?.some((d) => d.issue === 'year_mismatch')
  ) {
    console.log('PASS: 成功拦截虚假原文年份 (D34 漏洞防御成功)');
  } else {
    console.error('FAIL: 未能拦截虚假年份', resMismatch);
    process.exit(1);
  }

  console.log('ALL TESTS PASSED!');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
