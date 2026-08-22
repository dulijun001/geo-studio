#!/usr/bin/env node
/**
 * 离线合规扫描器 — 合规第一道门(D5 / D33 / D51)的无数据库版本。
 *
 * 用途:DB / Supabase 不可用时,手工撰写的医疗内容也能过一遍关键词黑名单。
 *
 * 用法(仓库根目录执行):
 *   apps/worker/node_modules/.bin/tsx ops/offline-compliance-scan.ts <file.md> [file2.md ...]
 *   node ops/offline-compliance-scan.ts <file.md>      # Node ≥22.18 原生剥类型,
 *                                                       # 会多一行 MODULE_TYPELESS 警告
 *   注:根 package.json 没装 tsx(只在 apps/worker、packages/geo-core 里有),
 *   所以 `pnpm tsx ops/...` 会报 Command "tsx" not found —— 用上面两种写法。
 *
 * 选项:
 *   --platform=<p>   按平台过滤词库,同生产 compliance-review 的
 *                    scanKeywords(text, kw, variant.platform)。
 *                    例:toutiao_article / xiaohongshu / douyin_script / zhihu /
 *                    wechat_mp / baijiahao。不传 = 不过滤 = 所有平台词都生效(更严)。
 *   --no-kb          不加载松鼠 KB 词库(默认会加载,见下)。
 *   --kb=<path>      指定 KB 根目录(默认 $KNOWLEDGE_BASE_ROOT 或
 *                    ~/Workspace/songshu-knowledge-base)。
 *   --quiet          只打印 verdict 行和汇总。
 *
 * 退出码:0 = 全部 pass / 1 = 有 warn / 2 = 有 reject(方便接 CI 或 shell 判断)。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 判定逻辑说明(与 packages/geo-core/src/compliance/scanner.ts 保持一致)
 *
 * 本脚本**重新实现**了 scanner.ts 的 scanKeywords/normalize/mapOffset/
 * extractContext 四个函数(逐行对照移植,非 import)。原因:ops/ 不是 pnpm
 * workspace 包,拿不到 @geo/geo-core 的模块解析;而任务要求脚本零依赖可独立跑。
 * 若日后 scanner.ts 改判定逻辑,本文件的 SCANNER MIRROR 段需要同步。
 *
 * 判定要点:
 *   - 纯 substring(indexOf)匹配,不做分词,不用 regex。
 *   - normalize:小写化 + 去掉所有空白与零宽字符(防"保 证")+ 全角数字/字母
 *     转半角。标点**不删**(NO.1 里的点有意义)。繁体主要靠 variants 列兜底。
 *   - context_exempt(D51):某个 term 的命中如果完整落在**它自己**的豁免短语
 *     区间内则跳过(如"第一恒磨牙"里的"第一"),豁免的是具体短语不是上下文类型,
 *     所以"绝对不会松"仍会被抓。
 *   - verdict:命中任一 A 级 → reject(high);否则命中 B 级 → warn(medium);
 *     都没有 → pass(low)。生产里 warn 会触发第二道门 LLM 复审,本脚本不调 LLM。
 *
 * 词库来源(全部内联硬编码,不连 DB):
 *   1. packages/db/src/seed/compliance-seed.ts      — 全局种子 A 29 + B 11
 *   2. supabase/migrations/0013_platform_specific_compliance.sql — 平台专属 21
 *   3. supabase/migrations/0041_compliance_keywords_endorsement_ads.sql
 *                                                    — D33 软违规 8 条 + 45 variants
 *   4.(可选,运行时读取)松鼠 KB `合规/广告法/红线词库.md`
 *      —— 生产里由 worker 的 derive-from-kb.ts 解析后写进 compliance_keywords 的
 *      **租户级**词条,不在本仓库里,所以只能运行时解析。缺文件则自动跳过。
 *
 * 已知与生产的差异:
 *   - 不含其它租户在 admin UI 手工新增的词条(只存在于 DB)。
 *   - 第二道门 LLM / 第三道门历史案例匹配 / 第四道门人审都不在本脚本范围。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ============================================================================
// 类型
// ============================================================================

type Level = 'A' | 'B';

type KeywordRow = {
  id: string;
  term: string;
  level: Level;
  category: string;
  variants: string[];
  platforms?: string[];
  context_exempt?: string[];
  /** 词条出处,只用于输出,不参与判定 */
  source: string;
};

type KeywordHit = {
  keyword_id: string;
  term: string;
  level: Level;
  category: string;
  source: string;
  matched_span: string;
  offset: number;
  context_snippet: string;
  platforms: string[];
};

type ScanResult = {
  hits: KeywordHit[];
  max_level: 'none' | 'A' | 'B';
  verdict: 'pass' | 'warn' | 'reject';
  risk_level: 'low' | 'medium' | 'high';
  duration_ms: number;
};

// ============================================================================
// 词库 1 — packages/db/src/seed/compliance-seed.ts(全局,tenant_id IS NULL)
// ============================================================================

type Seed = {
  term: string;
  category: string;
  variants: string[];
  context_exempt?: string[];
  platforms?: string[];
};

const SEED_A: Seed[] = [
  // guarantee / cure claims
  { term: '保证', category: 'guarantee', variants: ['保 证', '確保'] },
  { term: '包治', category: 'guarantee', variants: ['包 治', '包治癒'] },
  { term: '根治', category: 'guarantee', variants: ['根 治', '根治癒'] },
  { term: '治愈', category: 'guarantee', variants: ['治 愈', '治癒'] },
  { term: '痊愈', category: 'guarantee', variants: ['痊 愈', '痊癒'] },
  {
    term: '绝对',
    category: 'guarantee',
    variants: ['絕對'],
    context_exempt: ['没有绝对', '不是绝对', '并非绝对', '绝对禁忌'],
  },
  { term: '百分百', category: 'guarantee', variants: ['100%', '100 %', '百分之百'] },
  { term: '无效退款', category: 'guarantee', variants: ['无效退费'] },
  { term: '永不复发', category: 'guarantee', variants: ['永不復發', '永不反复'] },
  { term: '立竿见影', category: 'guarantee', variants: ['立竿見影', '立刻见效', '立即见效'] },
  { term: '一次搞定', category: 'guarantee', variants: ['一次根治'] },

  // absolute superlatives
  { term: '最好', category: 'absolute', variants: [] },
  { term: '最权威', category: 'absolute', variants: ['最權威'] },
  { term: '最先进', category: 'absolute', variants: ['最先進'] },
  { term: '最佳', category: 'absolute', variants: [] },
  {
    term: '第一',
    category: 'absolute',
    variants: ['no.1', 'NO.1', 'No. 1'],
    context_exempt: [
      '第一恒磨牙',
      '第一前磨牙',
      '第一磨牙',
      '第一乳磨牙',
      '第一次',
      '第一颗牙',
      '第一步',
      '第一道关',
      '第一天',
    ],
  },
  { term: '首家', category: 'absolute', variants: [] },
  { term: '独家', category: 'absolute', variants: ['獨家'] },
  { term: '唯一', category: 'absolute', variants: ['惟一'] },

  // testimonial / case comparison
  { term: '治疗前后', category: 'testimonial', variants: ['治療前後', '术前术后', '術前術後'] },
  { term: '真实病例', category: 'testimonial', variants: ['真實病例', '真实案例'] },
  { term: '感谢信', category: 'testimonial', variants: ['感謝信'] },
  { term: '患者推荐', category: 'testimonial', variants: ['病人推荐', '病患推荐'] },

  // doctor endorsement
  { term: '专家推荐', category: 'endorsement', variants: ['專家推薦'] },
  { term: '国医大师', category: 'endorsement', variants: ['國醫大師'] },
  { term: '名医推荐', category: 'endorsement', variants: [] },

  // cross-institution comparison
  { term: '北京协和', category: 'comparison', variants: ['协和'] },
  { term: '华西口腔', category: 'comparison', variants: [] },
  { term: '上海九院', category: 'comparison', variants: ['九院'] },
];

const SEED_B: Seed[] = [
  { term: '领先', category: 'absolute_soft', variants: ['領先'] },
  { term: '首选', category: 'absolute_soft', variants: ['首選'] },
  { term: '顶尖', category: 'absolute_soft', variants: ['頂尖'] },
  { term: '效果显著', category: 'weak_guarantee', variants: ['效果顯著'] },
  { term: '放心选择', category: 'weak_guarantee', variants: ['放心選擇'] },
  { term: '值得信赖', category: 'weak_guarantee', variants: ['值得信賴'] },
  { term: '买一送一', category: 'sales', variants: ['買一送一'] },
  { term: '限时优惠', category: 'sales', variants: ['限時優惠'] },
  { term: '首诊立减', category: 'sales', variants: ['首診立減'] },
  { term: '免费咨询', category: 'sales', variants: ['免費諮詢'] },
  { term: '在线咨询', category: 'sales', variants: ['線上諮詢'] },
];

// ============================================================================
// 词库 2 — migration 0013_platform_specific_compliance.sql(平台作用域)
// ============================================================================

const M0013_A: Seed[] = [
  {
    term: '瘦脸针',
    category: 'douyin_medical_aesthetic',
    variants: [],
    platforms: ['douyin_script'],
  },
  {
    term: '水光针',
    category: 'douyin_medical_aesthetic',
    variants: [],
    platforms: ['douyin_script'],
  },
  {
    term: '玻尿酸',
    category: 'douyin_medical_aesthetic',
    variants: [],
    platforms: ['douyin_script'],
  },
  {
    term: '热玛吉',
    category: 'douyin_medical_aesthetic',
    variants: [],
    platforms: ['douyin_script'],
  },
  {
    term: '埋线',
    category: 'douyin_medical_aesthetic',
    variants: ['埋 线'],
    platforms: ['douyin_script'],
  },
  {
    term: '假体',
    category: 'douyin_medical_aesthetic',
    variants: [],
    platforms: ['douyin_script'],
  },
  {
    term: '微整形',
    category: 'douyin_medical_aesthetic',
    variants: ['微 整形'],
    platforms: ['douyin_script'],
  },
  {
    term: '现在下单',
    category: 'douyin_live_sales',
    variants: ['现 在 下 单'],
    platforms: ['douyin_script'],
  },
  {
    term: '限时优惠',
    category: 'xiaohongshu_sales',
    variants: ['限 时'],
    platforms: ['xiaohongshu'],
  },
  {
    term: '医生不敢告诉你',
    category: 'toutiao_clickbait',
    variants: [],
    platforms: ['toutiao_article'],
  },
  {
    term: '本院数据显示',
    category: 'wechat_mp_falsedata',
    variants: [],
    platforms: ['wechat_mp', 'baijiahao'],
  },
  {
    term: '我院统计',
    category: 'wechat_mp_falsedata',
    variants: [],
    platforms: ['wechat_mp', 'baijiahao'],
  },
];

const M0013_B: Seed[] = [
  { term: '抢购', category: 'douyin_live_sales', variants: [], platforms: ['douyin_script'] },
  {
    term: '私信咨询',
    category: 'xiaohongshu_sales',
    variants: ['私 信'],
    platforms: ['xiaohongshu'],
  },
  {
    term: '加微信',
    category: 'xiaohongshu_sales',
    variants: ['加 微 信', '加我V', '+v'],
    platforms: ['xiaohongshu'],
  },
  { term: '到院礼包', category: 'xiaohongshu_sales', variants: [], platforms: ['xiaohongshu'] },
  { term: '扫码送', category: 'xiaohongshu_sales', variants: [], platforms: ['xiaohongshu'] },
  { term: '匿名分享', category: 'zhihu_disclosure', variants: ['匿 名'], platforms: ['zhihu'] },
  { term: '亲身经历', category: 'zhihu_disclosure', variants: ['亲 身'], platforms: ['zhihu'] },
  {
    term: '震惊!',
    category: 'toutiao_clickbait',
    variants: ['震 惊'],
    platforms: ['toutiao_article'],
  },
  { term: '炸裂', category: 'toutiao_clickbait', variants: [], platforms: ['toutiao_article'] },
];

// ============================================================================
// 词库 3 — migration 0041(D33:医生背书 + 变相医疗广告)
// ============================================================================

const M0041_A: Seed[] = [
  {
    term: '带来福音',
    category: 'hidden-ad',
    variants: [
      '给患者带来福音',
      '为患者带来福音',
      '给缺牙人群带来福音',
      '为缺牙人群带来福音',
      '为患者朋友带来福音',
      '给您带来福音',
    ],
  },
];

const M0041_B: Seed[] = [
  {
    term: '接诊过',
    category: 'endorsement-doctor',
    variants: ['接诊很多', '接诊数千', '接诊数百', '接诊数十', '累计接诊', '已接诊', '曾接诊'],
  },
  {
    term: '年种植经验',
    category: 'endorsement-doctor',
    variants: [
      '年正畸经验',
      '年儿牙经验',
      '年口腔种植经验',
      '年正畸临床经验',
      '年儿童牙科经验',
      '年牙周经验',
    ],
  },
  {
    term: '年临床经验',
    category: 'endorsement-doctor',
    variants: ['年从业经验', '年从医经验', '年临床工作', '年医师工作', '年口腔临床'],
  },
  {
    term: '主刀完成',
    category: 'endorsement-doctor',
    variants: ['独立主刀', '主刀手术', '累计主刀', '亲自主刀'],
  },
  {
    term: '提供专业的',
    category: 'hidden-ad',
    variants: [
      '提供专业的种植牙服务',
      '提供专业的正畸服务',
      '提供专业的口腔服务',
      '提供专业的儿牙服务',
      '提供专业的种植服务',
      '提供专业的修复服务',
    ],
  },
  {
    term: '提供种植牙服务',
    category: 'hidden-ad',
    variants: [
      '提供种植服务',
      '提供正畸服务',
      '提供口腔服务',
      '提供儿牙服务',
      '提供修复服务',
      '提供牙周服务',
    ],
  },
  {
    term: '口腔解决方案',
    category: 'hidden-ad',
    variants: ['牙齿解决方案', '缺牙解决方案', '种植解决方案', '口腔健康解决方案', '正畸解决方案'],
  },
];

function toRows(seeds: Seed[], level: Level, source: string): KeywordRow[] {
  return seeds.map((s, i) => ({
    id: `${source}:${level}:${i}:${s.term}`,
    term: s.term,
    level,
    category: s.category,
    variants: s.variants,
    platforms: s.platforms ?? [],
    context_exempt: s.context_exempt ?? [],
    source,
  }));
}

const BUILTIN_DICT: KeywordRow[] = [
  ...toRows(SEED_A, 'A', 'seed'),
  ...toRows(SEED_B, 'B', 'seed'),
  ...toRows(M0013_A, 'A', '0013'),
  ...toRows(M0013_B, 'B', '0013'),
  ...toRows(M0041_A, 'A', '0041'),
  ...toRows(M0041_B, 'B', '0041'),
];

// ============================================================================
// 词库 4(可选)— 松鼠 KB `合规/广告法/红线词库.md`
// 生产里由 apps/worker/src/jobs/derive-from-kb.ts 解析后写 compliance_keywords
// (租户级)。此处移植同一份解析逻辑,离线复现租户词库。
// ============================================================================

const KB_COMPLIANCE_REL = '合规/广告法/红线词库.md';

function kbInferLevel(l2Heading: string): Level | null {
  if (/^L1/.test(l2Heading)) return 'A';
  if (/^L2/.test(l2Heading)) return 'B';
  if (/^L3/.test(l2Heading)) return 'B';
  if (/品牌附加/.test(l2Heading)) return 'B';
  return null;
}

function parseKbCompliance(md: string): KeywordRow[] {
  const out: KeywordRow[] = [];
  let currentL2 = '';
  let currentL3 = '';
  let inTableBody = false;
  let n = 0;

  for (const rawLine of md.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);

    if (h2) {
      currentL2 = h2[1]!.trim();
      currentL3 = '';
      inTableBody = false;
      continue;
    }
    if (h3) {
      currentL3 = h3[1]!.trim();
      inTableBody = false;
      continue;
    }
    if (/^\|[-:\s|]+\|$/.test(line)) {
      inTableBody = true;
      continue;
    }
    if (inTableBody && line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      const firstCell = cells[0] ?? '';
      if (!firstCell) continue;

      const level = kbInferLevel(currentL2);
      if (!level) continue;

      const category = (currentL3 || currentL2.replace(/^L\d\s*/, ''))
        .replace(/^\d+\.\d+\s*/, '')
        .trim();
      const terms = firstCell
        .split(/[\/／、]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => !/^XX|^[A-Z]{2,}$/.test(t));
      if (terms.length === 0) continue;

      const [primary, ...variants] = terms;
      out.push({
        id: `kb:${level}:${n++}:${primary}`,
        term: primary!,
        level,
        category,
        variants,
        platforms: [],
        context_exempt: [],
        source: 'kb',
      });
      continue;
    }
    if (inTableBody && line.trim() === '') inTableBody = false;
  }
  return out;
}

function loadKbDict(kbRoot: string): { rows: KeywordRow[]; path: string; ok: boolean } {
  const abs = join(kbRoot, KB_COMPLIANCE_REL);
  if (!existsSync(abs)) return { rows: [], path: abs, ok: false };
  try {
    return { rows: parseKbCompliance(readFileSync(abs, 'utf-8')), path: abs, ok: true };
  } catch {
    return { rows: [], path: abs, ok: false };
  }
}

// ============================================================================
// SCANNER MIRROR — 与 packages/geo-core/src/compliance/scanner.ts 等价实现
// (逐行移植;改动此段前先看那边)
// ============================================================================

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s​‌‍﻿]+/g, '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0).toLowerCase())
    .replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function mapOffset(original: string, normalizedOffset: number): number {
  let normIdx = 0;
  for (let i = 0; i < original.length; i++) {
    if (normIdx === normalizedOffset) return i;
    const ch = original[i];
    if (!ch) continue;
    if (/[\s​‌‍﻿]/.test(ch)) continue;
    normIdx++;
  }
  return original.length;
}

function extractContext(text: string, offset: number, length: number): string {
  const pad = 15;
  const start = Math.max(0, offset - pad);
  const end = Math.min(text.length, offset + length + pad);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).replace(/\s+/g, ' ') + suffix;
}

function scanKeywords(
  text: string,
  keywords: KeywordRow[],
  targetPlatform?: string | null,
): ScanResult {
  const started = Date.now();
  const normalized = normalize(text);
  const hits: KeywordHit[] = [];
  const seen = new Set<string>();

  const applicable = targetPlatform
    ? keywords.filter(
        (kw) => !kw.platforms || kw.platforms.length === 0 || kw.platforms.includes(targetPlatform),
      )
    : keywords;

  for (const kw of applicable) {
    const needles = [kw.term, ...kw.variants].map(normalize).filter((s) => s.length > 0);

    const exemptRanges: Array<[number, number]> = [];
    for (const raw of kw.context_exempt ?? []) {
      const phrase = normalize(raw);
      if (phrase.length === 0) continue;
      let f = 0;
      while (true) {
        const i = normalized.indexOf(phrase, f);
        if (i < 0) break;
        exemptRanges.push([i, i + phrase.length]);
        f = i + 1;
      }
    }
    const isExempt = (start: number, len: number): boolean =>
      exemptRanges.some(([s, e]) => start >= s && start + len <= e);

    for (const needle of needles) {
      let from = 0;
      while (from <= normalized.length - needle.length) {
        const idx = normalized.indexOf(needle, from);
        if (idx < 0) break;

        if (isExempt(idx, needle.length)) {
          from = idx + needle.length;
          continue;
        }

        const origOffset = mapOffset(text, idx);
        const dedupKey = `${kw.id}:${origOffset}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          hits.push({
            keyword_id: kw.id,
            term: kw.term,
            level: kw.level,
            category: kw.category,
            source: kw.source,
            platforms: kw.platforms ?? [],
            matched_span: text.slice(origOffset, origOffset + needle.length) || kw.term,
            offset: origOffset,
            context_snippet: extractContext(text, origOffset, needle.length),
          });
        }
        from = idx + needle.length;
      }
    }
  }

  const hasA = hits.some((h) => h.level === 'A');
  const hasB = hits.some((h) => h.level === 'B');

  return {
    hits: hits.sort((a, b) => a.offset - b.offset),
    max_level: hasA ? 'A' : hasB ? 'B' : 'none',
    verdict: hasA ? 'reject' : hasB ? 'warn' : 'pass',
    risk_level: hasA ? 'high' : hasB ? 'medium' : 'low',
    duration_ms: Date.now() - started,
  };
}

// ============================================================================
// 输出
// ============================================================================

const COLOR = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = {
  red: (s: string) => (COLOR ? `\u001b[31;1m${s}\u001b[0m` : s),
  yellow: (s: string) => (COLOR ? `\u001b[33;1m${s}\u001b[0m` : s),
  green: (s: string) => (COLOR ? `\u001b[32;1m${s}\u001b[0m` : s),
  dim: (s: string) => (COLOR ? `\u001b[2m${s}\u001b[0m` : s),
  bold: (s: string) => (COLOR ? `\u001b[1m${s}\u001b[0m` : s),
  invert: (s: string) => (COLOR ? `\u001b[7m${s}\u001b[0m` : `【${s}】`),
};

const VERDICT_LABEL = {
  reject: (s: string) => c.red(`✖ REJECT ${s}`),
  warn: (s: string) => c.yellow(`▲ WARN   ${s}`),
  pass: (s: string) => c.green(`✔ PASS   ${s}`),
};

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

/**
 * 按真实 offset 生成"前后 15 字 + 命中词高亮"的上下文片段。
 * 不用 scanner 的 context_snippet 再去 indexOf(命中词) —— 同一个词在片段里
 * 可能出现多次(或因去空格而对不上),会高亮到错误的位置。
 */
/**
 * scanner 的 matched_span 用的是"归一化后的长度",原文里如果夹了空格
 * ("保 证" / "20 年临床经验"),按这个长度切会切歪。这里按原文往后数
 * 非空白字符,还原命中词在原文里真正占的区间,只用于展示。
 */
function originalSpanLength(text: string, offset: number, normalizedLen: number): number {
  let counted = 0;
  let i = offset;
  for (; i < text.length && counted < normalizedLen; i++) {
    if (!/[\s​‌‍﻿]/.test(text[i]!)) counted++;
  }
  return Math.max(i - offset, 1);
}

function highlightedContext(text: string, offset: number, length: number): string {
  const pad = 15;
  const start = Math.max(0, offset - pad);
  const end = Math.min(text.length, offset + length + pad);
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  return (
    (start > 0 ? '…' : '') +
    flat(text.slice(start, offset)) +
    c.invert(flat(text.slice(offset, offset + length))) +
    flat(text.slice(offset + length, end)) +
    (end < text.length ? '…' : '')
  );
}

// ============================================================================
// CLI
// ============================================================================

function printHelp(): void {
  console.log(`离线合规扫描 — 合规第一道门(关键词黑名单)的无 DB 版

用法(仓库根目录执行):
  apps/worker/node_modules/.bin/tsx ops/offline-compliance-scan.ts <file.md> [file2.md ...]
  node ops/offline-compliance-scan.ts <file.md>      # Node ≥22.18 也能直接跑

选项:
  --platform=<p>  按平台过滤(toutiao_article/xiaohongshu/douyin_script/zhihu/
                  wechat_mp/baijiahao)。不传 = 所有平台词都生效(更严)
  --no-kb         不加载松鼠 KB 红线词库
  --kb=<path>     KB 根目录(默认 $KNOWLEDGE_BASE_ROOT 或 ~/Workspace/songshu-knowledge-base)
  --text=<s>      直接扫一段文本(可与文件混用,用于快速验证)
  --raw-kb        不给 KB 词条补 D51 豁免短语(= 完全复刻生产行为,误报更多)
  --quiet         精简输出
  -h, --help      本帮助

退出码:0 全 pass / 1 有 warn / 2 有 reject`);
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  let platform: string | null = null;
  let useKb = true;
  let kbRoot =
    process.env.KNOWLEDGE_BASE_ROOT ??
    join(process.env.HOME ?? '', 'Workspace/songshu-knowledge-base');
  let quiet = false;
  let rawKb = false;
  const files: string[] = [];
  const inlineTexts: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith('--platform=')) platform = arg.slice('--platform='.length) || null;
    else if (arg === '--no-kb') useKb = false;
    else if (arg === '--raw-kb') rawKb = true;
    else if (arg.startsWith('--kb=')) kbRoot = arg.slice('--kb='.length);
    else if (arg.startsWith('--text=')) inlineTexts.push(arg.slice('--text='.length));
    else if (arg === '--quiet') quiet = true;
    else if (arg.startsWith('--')) {
      console.error(`未知选项:${arg}`);
      process.exit(1);
    } else files.push(arg);
  }

  // 组装词库
  const dict: KeywordRow[] = [...BUILTIN_DICT];
  let kbNote = useKb ? '' : 'KB 词库:已用 --no-kb 关闭';
  let exemptNote = '';
  if (useKb) {
    const kb = loadKbDict(kbRoot);
    if (kb.ok && kb.rows.length > 0) {
      // derive-from-kb.ts 给租户词条写死 context_exempt=[],所以生产里 KB 派生的
      // "第一"会把"第一恒磨牙/第一次"全部判成 A 级 reject —— 正是 D51 要消灭的
      // 误报。默认按 term 把 seed 的豁免短语补给同名 KB 词条;--raw-kb 可关掉,
      // 看生产的原始行为。
      if (!rawKb) {
        const exemptByTerm = new Map<string, string[]>();
        for (const k of BUILTIN_DICT) {
          if ((k.context_exempt ?? []).length > 0) exemptByTerm.set(k.term, k.context_exempt!);
        }
        let patched = 0;
        for (const row of kb.rows) {
          const ex = exemptByTerm.get(row.term);
          if (ex) {
            row.context_exempt = ex;
            patched++;
          }
        }
        if (patched > 0) {
          exemptNote = `D51 豁免:已给 ${patched} 条同名 KB 词条补上 seed 的豁免短语(--raw-kb 可关闭)`;
        }
      } else {
        exemptNote = 'D51 豁免:--raw-kb 已开,KB 词条不带豁免(复刻生产行为)';
      }
      dict.push(...kb.rows);
      kbNote = `KB 词库:+${kb.rows.length} 条(${kb.path})`;
    } else {
      kbNote = `KB 词库:未加载(${kb.path} 不存在或解析为空)`;
    }
  }

  const byLevel = (lv: Level) => dict.filter((k) => k.level === lv).length;
  const variantCount = dict.reduce((n, k) => n + k.variants.length, 0);

  console.log(c.bold('══ 离线合规扫描(合规第一道门 · 关键词黑名单)══'));
  console.log(
    c.dim(
      `词库 ${dict.length} 条(A 级 ${byLevel('A')} / B 级 ${byLevel('B')},另含 ${variantCount} 个变体)` +
        ` · 平台过滤:${platform ?? '无(全部词生效)'}`,
    ),
  );
  console.log(c.dim(kbNote));
  if (exemptNote) console.log(c.dim(exemptNote));
  console.log(c.dim('判定:命中 A 级 → reject;仅命中 B 级 → warn;无命中 → pass'));
  console.log('');

  const targets: Array<{ label: string; text: string }> = [];
  for (const f of files) {
    if (!existsSync(f)) {
      console.error(c.red(`文件不存在:${f}`));
      process.exit(1);
    }
    targets.push({ label: f, text: readFileSync(f, 'utf-8') });
  }
  inlineTexts.forEach((t, i) => targets.push({ label: `--text[${i + 1}]`, text: t }));

  const tally = { pass: 0, warn: 0, reject: 0 };

  for (const t of targets) {
    const res = scanKeywords(t.text, dict, platform);
    tally[res.verdict]++;

    const uniquePos = new Set(res.hits.map((h) => `${h.term}|${h.offset}`)).size;
    const head = `${VERDICT_LABEL[res.verdict](`· ${basename(t.label)}`)}  ${c.dim(
      `${uniquePos} 处命中 · ${t.text.length} 字 · ${res.duration_ms}ms`,
    )}`;
    console.log(head);
    if (t.label !== basename(t.label)) console.log(c.dim(`   ${t.label}`));

    if (!quiet && res.hits.length > 0) {
      // 按 词+级别 聚合(同一个词可能同时来自 seed 和 KB,合并展示),
      // 同一词多次命中只展开前 3 处
      const groups = new Map<
        string,
        { hits: KeywordHit[]; sources: Set<string>; offsets: Set<number> }
      >();
      for (const h of res.hits) {
        const key = `${h.term}|${h.level}`;
        const g = groups.get(key) ?? {
          hits: [],
          sources: new Set<string>(),
          offsets: new Set<number>(),
        };
        g.sources.add(h.source);
        if (!g.offsets.has(h.offset)) {
          g.offsets.add(h.offset);
          g.hits.push(h);
        }
        groups.set(key, g);
      }
      for (const [, g] of groups) {
        const h = g.hits[0]!;
        const badge = h.level === 'A' ? c.red(' A级 禁用 ') : c.yellow(' B级 慎用 ');
        const scope = h.platforms.length > 0 ? c.dim(` [仅 ${h.platforms.join('/')}]`) : '';
        console.log(
          `   ${badge} ${c.bold(h.term)}${scope} ${c.dim(
            `(${h.category} · 来源 ${[...g.sources].join('+')} · ${g.hits.length} 处)`,
          )}`,
        );
        for (const hit of g.hits.slice(0, 3)) {
          const len = originalSpanLength(t.text, hit.offset, Math.max(hit.matched_span.length, 1));
          const actual = t.text.slice(hit.offset, hit.offset + len).replace(/\s+/g, '');
          // 一条词库记录可能带多个变体(如 KB 的"保证"行含 根治/治愈),
          // 实际命中的不一定是 term 本身,单独标出来
          const via = actual === h.term ? '' : c.dim(`[命中 ${actual}] `);
          console.log(
            `        ${c.dim(`L${lineOf(t.text, hit.offset)}`)} ${via}${highlightedContext(t.text, hit.offset, len)}`,
          );
        }
        if (g.hits.length > 3) console.log(c.dim(`        …另有 ${g.hits.length - 3} 处同词命中`));
      }
    }
    console.log('');
  }

  if (targets.length > 1) {
    console.log(c.bold('══ 汇总 ══'));
    console.log(
      `共 ${targets.length} 份:${c.green(`${tally.pass} pass`)} · ${c.yellow(`${tally.warn} warn`)} · ${c.red(
        `${tally.reject} reject`,
      )}`,
    );
    if (tally.warn > 0 || tally.reject > 0) {
      console.log(c.dim('提示:warn 在生产里会触发第二道门 LLM 复审 + 自动改写;reject 直接打回。'));
    }
  }

  process.exit(tally.reject > 0 ? 2 : tally.warn > 0 ? 1 : 0);
}

main();
