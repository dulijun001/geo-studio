/**
 * Citation insights — 发布→被引回路的纯计算(docs/11 P1-4 / P1-3 v0 / P2 v0)。
 *
 * worker 早报和 web 回路看板共用这一套(业务逻辑必须在 packages/,CLAUDE.md 铁规)。
 * 输入是调用方查好的行,本模块零 DB、零 IO,毫秒级。
 *
 * 匹配纪律:文章数字 ID(≥9 位,躲开 8 位日期串)交叉,**不做 URL 精确匹配** —
 * 同一篇头条文被引用时是 m.toutiao.com 移动版链接,只有 ID 稳定
 * (2026-07-03 实测:URL 精确匹配 0 命中,ID 匹配 14 命中)。
 */

export type PublishedRowInput = {
  published_url: string;
  published_at: string | null;
  platform: string;
  title: string | null;
};

export type SnapshotRowInput = {
  citation_urls: string[];
  question_id: string;
  created_at: string;
};

export type PlatformLoopEntry = { platform: string; published: number; cited: number };

export type StaleCandidate = { title: string; platform: string; published_at: string | null };

export type PollutionHit = { question_id: string; domain_label: string; url: string };

export type CitationInsights = {
  /** 每平台累计:发布数 vs 被 AI 引擎引用数。 */
  platform_loop: PlatformLoopEntry[];
  /** 发布超过 staleDays 且未被引 — 时效刷新候选(D37 B4,人工更新)。 */
  stale_uncited: { count: number; examples: StaleCandidate[] };
  /** 近 pollutionWindowDays 天,追踪答案引用了风险源(投诉/行政处罚/裁判文书)。 */
  pollution: PollutionHit[];
};

/**
 * AI 答案污染监测的风险源域名(D37 防御职责)。
 * 2026-07-03 DeepSeek 首采实锤:同名机构(福州/中山"松鼠口腔")的新浪投诉 +
 * 行政处罚被实体混淆进本品牌答案。
 */
export const POLLUTION_DOMAIN_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /tousu\.sina\.com/, label: '新浪投诉' },
  { re: /credit\.[a-z]+\.gov\.cn/, label: '政府信用公示(含行政处罚)' },
  { re: /wenshu\.court\.gov\.cn/, label: '裁判文书网' },
  { re: /12315/, label: '12315 投诉' },
  { re: /(heimao|blackcat)/, label: '黑猫投诉' },
];

/** 提取 URL 里的文章数字 ID(≥9 位;8 位日期串不算)。 */
export function extractArticleId(url: string): string | null {
  return url.match(/(\d{9,20})/)?.[1] ?? null;
}

export function computeCitationInsights(input: {
  published: PublishedRowInput[];
  snapshots: SnapshotRowInput[];
  /** 注入时间,默认当前;测试用。 */
  now?: number;
  /** 时效候选阈值天数,默认 45。 */
  staleDays?: number;
  /** 污染扫描窗口天数,默认 7。 */
  pollutionWindowDays?: number;
  /** 时效候选样例上限,默认 10。 */
  maxStaleExamples?: number;
}): CitationInsights {
  const now = input.now ?? Date.now();
  const staleMs = (input.staleDays ?? 45) * 24 * 3600 * 1000;
  const pollutionSince = now - (input.pollutionWindowDays ?? 7) * 24 * 3600 * 1000;
  const maxExamples = input.maxStaleExamples ?? 10;

  // (1) 被引 ID 池 + 污染扫描
  const citedIds = new Set<string>();
  const pollution: PollutionHit[] = [];
  const pollutionSeen = new Set<string>();
  for (const snap of input.snapshots) {
    const recent = new Date(snap.created_at).getTime() >= pollutionSince;
    for (const url of snap.citation_urls ?? []) {
      const id = extractArticleId(url);
      if (id) citedIds.add(id);
      if (recent) {
        const hit = POLLUTION_DOMAIN_PATTERNS.find((p) => p.re.test(url));
        if (hit) {
          const key = `${snap.question_id}:${hit.label}`;
          if (!pollutionSeen.has(key)) {
            pollutionSeen.add(key);
            pollution.push({ question_id: snap.question_id, domain_label: hit.label, url });
          }
        }
      }
    }
  }

  // (2) 平台回路 + 时效候选
  const byPlatform = new Map<string, { published: number; cited: number }>();
  let staleCount = 0;
  const staleExamples: StaleCandidate[] = [];
  for (const row of input.published) {
    const entry = byPlatform.get(row.platform) ?? { published: 0, cited: 0 };
    entry.published += 1;
    const id = extractArticleId(row.published_url);
    const cited = !!id && citedIds.has(id);
    if (cited) entry.cited += 1;
    byPlatform.set(row.platform, entry);

    const publishedAt = row.published_at ? new Date(row.published_at).getTime() : null;
    if (!cited && publishedAt !== null && now - publishedAt > staleMs) {
      staleCount += 1;
      if (staleExamples.length < maxExamples && row.title) {
        staleExamples.push({ title: row.title, platform: row.platform, published_at: row.published_at });
      }
    }
  }

  return {
    platform_loop: [...byPlatform.entries()]
      .map(([platform, v]) => ({ platform, ...v }))
      .sort((a, b) => b.published - a.published),
    stale_uncited: { count: staleCount, examples: staleExamples },
    pollution,
  };
}
