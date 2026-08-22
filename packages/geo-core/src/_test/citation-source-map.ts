/**
 * 引用池测绘单测 — 样本全部取自 2026-08-22 生产库真实引用源 URL。
 * Run: pnpm --filter @geo/geo-core exec tsx src/_test/citation-source-map.ts
 *
 * 重点覆盖移动版子域(m./mip./wapyyk./sj. 等):豆包引用的绝大多数是移动版
 * 域名,主域精确匹配会大面积漏配(docs/11 §2.1 记过同类教训)。
 */
import {
  classifySource,
  hostOf,
  buildSourceMap,
  capacityMismatch,
  type SourceBucket,
} from '../tracking/citation-source-map';

type Case = { url: string; expect: SourceBucket; why: string };

const CASES: Case[] = [
  // ── 移动版子域必须正确归类(实测真实 URL)──
  { url: 'https://m.yslw.com/anli/39664.html', expect: 'vertical_portal', why: '牙舒丽 m. 子域,第一大源' },
  { url: 'https://www.yslw.com/price/12537.html', expect: 'vertical_portal', why: '牙舒丽 www' },
  { url: 'https://mip.mfk.com/x.html', expect: 'vertical_portal', why: 'mip. 前缀' },
  { url: 'https://wapyyk.39.net/km/zonghe/', expect: 'vertical_portal', why: 'wapyyk. 多级子域 + 39 健康' },
  { url: 'https://sj.syakc.com/a/1.html', expect: 'vertical_portal', why: 'sj. 前缀' },
  { url: 'https://m.ksk.99.com.cn/kq/', expect: 'vertical_portal', why: '多级子域 99.com.cn' },
  { url: 'https://kq.360tulou.com/a.html', expect: 'vertical_portal', why: 'kq. 业务子域' },

  // ── 短视频 ──
  { url: 'https://www.iesdouyin.com/share/video/7659737559351198969', expect: 'short_video', why: '抖音分享视频,实测占比 10.9%' },

  // ── 自媒体 ──
  { url: 'https://m.toutiao.com/article/7412345678901234567/', expect: 'self_media', why: '头条移动版' },
  { url: 'https://m.sohu.com/a/990484411_362225', expect: 'self_media', why: '搜狐移动版' },
  { url: 'https://k.sina.cn/article_123.html', expect: 'self_media', why: '新浪 k. 子域' },
  { url: 'https://zhuanlan.zhihu.com/p/123', expect: 'self_media', why: '知乎专栏(实测被引 0,但归类不变)' },
  { url: 'https://post.m.smzdm.com/p/x/', expect: 'self_media', why: '什么值得买' },

  // ── 政府源 ──
  { url: 'https://ybj.km.gov.cn/c/2026-01-01/x.html', expect: 'government', why: '昆明医保局' },
  { url: 'https://ylbz.yn.gov.cn/x.html', expect: 'government', why: '云南医保局' },

  // ── 我方 ──
  { url: 'https://www.songskq.com/service/zhongzhi', expect: 'own_site', why: '我方官网' },

  // ── 百科 ──
  { url: 'https://baike.baidu.com/item/x', expect: 'encyclopedia', why: '百度百科' },

  // ── UGC ──
  { url: 'https://km.lieju.com/x.html', expect: 'ugc_community', why: '列举网分类信息' },

  // ── 未知 ──
  { url: 'https://some-brand-new-site.cn/a', expect: 'unknown', why: '规则表未覆盖,应进 unknown 而非静默归其他' },
  { url: 'not-a-url', expect: 'unknown', why: '非法 URL 不应崩' },
];

let pass = 0;
for (const c of CASES) {
  const got = classifySource(c.url);
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${got.padEnd(16)} 期望=${c.expect.padEnd(16)} ${c.why}`);
  if (!ok) console.log(`      host=${hostOf(c.url)} url=${c.url}`);
}

// ── 政府源优先级:gov.cn 必须先于任何垂直站规则命中 ──
const govFirst = classifySource('https://kmxs.gov.cn/yslw/x.html');
const govOk = govFirst === 'government';
if (govOk) pass++;
console.log(`${govOk ? 'PASS' : 'FAIL'}  政府域名优先于路径中出现的垂直站名 → ${govFirst}`);

// ── 聚合:我方内容识别(ID 级匹配,非 URL 精确匹配)──
const map = buildSourceMap({
  urls: [
    'https://m.toutiao.com/article/7412345678901234567/',
    'https://m.toutiao.com/article/7499999999999999999/',
    'https://m.yslw.com/anli/1.html',
    'https://m.yslw.com/anli/2.html',
    'https://m.yslw.com/price/3.html',
    'https://www.iesdouyin.com/share/video/7659737559351198969',
    'https://www.songskq.com/a',
  ],
  ourArticleIds: ['7412345678901234567'],
});
const selfMedia = map.buckets.find((b) => b.bucket === 'self_media');
const vertical = map.buckets.find((b) => b.bucket === 'vertical_portal');
const ownSite = map.buckets.find((b) => b.bucket === 'own_site');

const aggChecks: Array<[boolean, string]> = [
  [map.total === 7, `总数 7 (实得 ${map.total})`],
  [vertical?.citations === 3, `垂直门户 3 条 (实得 ${vertical?.citations})`],
  [selfMedia?.ours === 1, `自媒体中我方 1 条 — ID 级匹配生效 (实得 ${selfMedia?.ours})`],
  [ownSite?.ours === 1, `官网全部计为我方 (实得 ${ownSite?.ours})`],
  [map.buckets[0]?.bucket === 'vertical_portal', `按被引数降序,首位应为垂直门户 (实得 ${map.buckets[0]?.bucket})`],
  [vertical?.top_domains[0]?.domain === 'yslw.com', `top 域名归并 m./www 前缀 (实得 ${vertical?.top_domains[0]?.domain})`],
];
for (const [ok, label] of aggChecks) {
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

// ── 错配度:生产实况(产能 100% 自媒体)应逼近完全错配 ──
const mismatch = capacityMismatch({
  poolShares: [
    { bucket: 'vertical_portal', citations: 1197 },
    { bucket: 'short_video', citations: 177 },
    { bucket: 'self_media', citations: 174 },
    { bucket: 'own_site', citations: 9 },
    { bucket: 'government', citations: 61 }, // 不可投放,应被排除
  ],
  capacityByBucket: { self_media: 429 },
});
const mmOk = mismatch.score > 0.85 && mismatch.score <= 1;
if (mmOk) pass++;
console.log(
  `${mmOk ? 'PASS' : 'FAIL'}  生产实况错配度 ${(mismatch.score * 100).toFixed(1)}% (产能 100% 押在占 11% 的池子,应 >85%)`,
);

// 完全对齐时应为 0
const aligned = capacityMismatch({
  poolShares: [
    { bucket: 'self_media', citations: 50 },
    { bucket: 'short_video', citations: 50 },
  ],
  capacityByBucket: { self_media: 10, short_video: 10 },
});
const alignOk = aligned.score < 0.001;
if (alignOk) pass++;
console.log(`${alignOk ? 'PASS' : 'FAIL'}  完全对齐时错配度为 0 (实得 ${aligned.score.toFixed(4)})`);

const TOTAL = CASES.length + 1 + aggChecks.length + 2;
console.log(`\n${pass}/${TOTAL} passed`);
if (pass !== TOTAL) process.exit(1);
