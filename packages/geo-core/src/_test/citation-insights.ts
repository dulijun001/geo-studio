/**
 * Citation insights smoke test (docs/11 P1-4/P1-3/P2 v0 共享纯函数).
 * Run: pnpm --filter @geo/geo-core exec tsx src/_test/citation-insights.ts
 */
import { computeCitationInsights, extractArticleId } from '../tracking/citation-insights';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function ok(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const NOW = new Date('2026-07-03T12:00:00Z').getTime();
const days = (n: number) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

// ── ID 提取:移动版域名改写不影响;8 位日期串不误提 ──
ok('提取头条 19 位 ID', extractArticleId('https://www.toutiao.com/article/7381234567890123456/') === '7381234567890123456');
ok('移动版同 ID', extractArticleId('https://m.toutiao.com/i7381234567890123456/') === '7381234567890123456');
ok('8 位日期串不当 ID', extractArticleId('https://site.com/2026/20260703/news.html') === null);

const insights = computeCitationInsights({
  now: NOW,
  published: [
    // 被引的头条文(发布 60 天前,但被引 → 不算 stale)
    { published_url: 'https://www.toutiao.com/article/7381234567890123456/', published_at: days(60), platform: 'toutiao_article', title: '被引老文' },
    // 未被引 + 60 天 → stale
    { published_url: 'https://www.toutiao.com/article/7999999999999999999/', published_at: days(60), platform: 'toutiao_article', title: '未被引老文' },
    // 未被引但只有 10 天 → 不 stale
    { published_url: 'https://www.toutiao.com/article/7888888888888888888/', published_at: days(10), platform: 'toutiao_article', title: '新文' },
    // 知乎未被引
    { published_url: 'https://zhuanlan.zhihu.com/p/712345678', published_at: days(50), platform: 'zhihu', title: '知乎文' },
  ],
  snapshots: [
    // 引用了我方头条文(移动版 URL)+ 一条污染源(窗口内)
    {
      question_id: 'q1',
      created_at: days(2),
      citation_urls: [
        'https://m.toutiao.com/i7381234567890123456/',
        'https://tousu.sina.com.cn/complaint/view/17389579321',
      ],
    },
    // 窗口外(30 天前)的污染源 → 不告警
    { question_id: 'q2', created_at: days(30), citation_urls: ['https://credit.zs.gov.cn/XYGSXZCFDETAIL/abc'] },
  ],
});

// ── 平台回路 ──
const tt = insights.platform_loop.find((p) => p.platform === 'toutiao_article');
const zh = insights.platform_loop.find((p) => p.platform === 'zhihu');
ok('头条 3 发 1 引', tt?.published === 3 && tt?.cited === 1, JSON.stringify(tt));
ok('知乎 1 发 0 引', zh?.published === 1 && zh?.cited === 0, JSON.stringify(zh));

// ── 时效候选:被引的不算、太新的不算 ──
ok('stale 只有 2 篇(未被引老文+知乎文)', insights.stale_uncited.count === 2, `count=${insights.stale_uncited.count}`);
ok('stale 样例含标题', insights.stale_uncited.examples.some((e) => e.title === '未被引老文'));

// ── 污染:窗口内命中、窗口外不报、同题同源去重 ──
ok('污染 1 条(新浪投诉,窗口内)', insights.pollution.length === 1 && insights.pollution[0]?.domain_label === '新浪投诉',
   JSON.stringify(insights.pollution));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
