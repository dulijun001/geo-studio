/**
 * 引用池测绘 —— 把追踪采到的引用源 URL 归类成「渠道池」,回答一个
 * 既有看板答不了的问题:**引擎实际取用内容的地方,我们占了几成?**
 *
 * 为什么需要它(2026-08-22 实测):
 *   `citation-insights.ts` 的平台回路表只统计「我方发布的平台」的发布→被引,
 *   看到的是「我方头条发了 53 篇被引 3 篇」。但它看不见分母——引用池里
 *   还有谁。实测把 1,619 条引用源 URL 归类后结果是:
 *     口腔/医疗垂直站群 1,197 (73.9%) — 我方零覆盖
 *     抖音视频            177 (10.9%) — 我方零覆盖
 *     自媒体平台          174 (10.7%) — 我方 100% 产能在此
 *     政府源               61 (3.8%)
 *     我方官网              9 (0.6%)
 *   即:全部产能投在只占一成的池子里。这个错配在旧看板上完全不可见,
 *   因为旧看板的分母是「我方发布数」而不是「引用池总量」。
 *
 * 设计取舍:
 *   - 归类靠**域名规则表**,不靠 LLM。域名是稳定标识,LLM 分类既贵又会漂移,
 *     而这个数字要用来做产能分配决策,必须可复现、可审计。
 *   - 规则表按「我们能不能往里投内容」组织,而不是按网站性质。运营要的是
 *     「哪些池子可以打进去」,不是「这是什么类型的网站」。
 *   - 未识别域名一律进 `unknown` 并保留样本,便于定期回看补规则 —— 静默
 *     归到「其他」会让新出现的大源永远看不见。
 */

/** 渠道池分类。命名按「可投放性」而非网站性质。 */
export type SourceBucket =
  | 'vertical_portal' // 医疗/口腔垂直门户 — 可入驻、可投稿
  | 'short_video' // 抖音等短视频 — 可自产
  | 'self_media' // 头条/搜狐/知乎等自媒体 — 当前主战场
  | 'government' // 政府/官方机构 — 不可自建,只能争取被收录
  | 'encyclopedia' // 百科类 — 可编辑词条
  | 'own_site' // 我方官网 — 完全可控
  | 'ugc_community' // 问答/点评/投诉类 UGC
  | 'unknown';

export type BucketMeta = {
  bucket: SourceBucket;
  label: string;
  /** 我们能否主动往这个池子投放内容 —— 决定它是不是「机会」。 */
  actionable: boolean;
  /** 给运营看的一句话说明。 */
  note: string;
};

export const BUCKET_META: Record<SourceBucket, BucketMeta> = {
  vertical_portal: {
    bucket: 'vertical_portal',
    label: '医疗垂直门户',
    actionable: true,
    note: '可机构入驻/投稿。实测第一大引用源,被引最多的是案例页。',
  },
  short_video: {
    bucket: 'short_video',
    label: '短视频',
    actionable: true,
    note: '可自产。引用全为视频形态,非图文。',
  },
  self_media: {
    bucket: 'self_media',
    label: '自媒体平台',
    actionable: true,
    note: '当前产能所在。注意池内各平台差异极大(知乎实测为 0)。',
  },
  government: {
    bucket: 'government',
    label: '政府/官方源',
    actionable: false,
    note: '不可自建。只能通过进入定点名单/官方公示间接获得。',
  },
  encyclopedia: {
    bucket: 'encyclopedia',
    label: '百科',
    actionable: true,
    note: '可编辑词条。DeepSeek 侧权重高于豆包。',
  },
  own_site: {
    bucket: 'own_site',
    label: '我方官网',
    actionable: true,
    note: '完全可控。DeepSeek 实测引用占比高,豆包侧弱。',
  },
  ugc_community: {
    bucket: 'ugc_community',
    label: 'UGC 社区/点评',
    actionable: false,
    note: '含投诉类站点。不主动投放 —— 见 D37,买号发内容属禁止范围。',
  },
  unknown: {
    bucket: 'unknown',
    label: '未归类',
    actionable: false,
    note: '规则表未覆盖。占比升高时应回看并补规则。',
  },
};

/**
 * 域名 → 池子规则表。
 *
 * 匹配用「域名后缀包含」而非正则全匹配,以覆盖移动版子域(m./wap./mip. 等)——
 * 豆包引用的绝大多数是移动版域名,用主域精确匹配会大面积漏配(docs/11 §2.1
 * 记录过同类教训:URL 精确匹配为 0 是移动版域名假象)。
 *
 * 顺序无关,但同一域名只应出现一次。
 */
const RULES: ReadonlyArray<{ match: string; bucket: SourceBucket }> = [
  // ── 政府 / 官方(优先级最高,先于其它规则判断)──
  { match: '.gov.cn', bucket: 'government' },
  { match: '.org.cn', bucket: 'government' },

  // ── 我方 ──
  { match: 'songskq.com', bucket: 'own_site' },

  // ── 短视频 ──
  { match: 'iesdouyin.com', bucket: 'short_video' },
  { match: 'douyin.com', bucket: 'short_video' },
  { match: 'kuaishou.com', bucket: 'short_video' },
  { match: 'ixigua.com', bucket: 'short_video' },

  // ── 自媒体平台 ──
  { match: 'toutiao.com', bucket: 'self_media' },
  { match: 'sohu.com', bucket: 'self_media' },
  { match: 'sina.cn', bucket: 'self_media' },
  { match: 'sina.com.cn', bucket: 'self_media' },
  { match: '163.com', bucket: 'self_media' },
  { match: 'baijiahao.baidu.com', bucket: 'self_media' },
  { match: 'zhihu.com', bucket: 'self_media' },
  { match: 'qq.com', bucket: 'self_media' },
  { match: 'weixin.qq.com', bucket: 'self_media' },
  { match: 'xiaohongshu.com', bucket: 'self_media' },
  { match: 'jianshu.com', bucket: 'self_media' },
  { match: 'smzdm.com', bucket: 'self_media' },

  // ── 百科 ──
  { match: 'baike.baidu.com', bucket: 'encyclopedia' },
  { match: 'baike.com', bucket: 'encyclopedia' },
  { match: 'wikipedia.org', bucket: 'encyclopedia' },

  // ── UGC / 点评 / 投诉 ──
  { match: 'tousu.sina.com.cn', bucket: 'ugc_community' },
  { match: 'dianping.com', bucket: 'ugc_community' },
  { match: 'lieju.com', bucket: 'ugc_community' },
  { match: '58.com', bucket: 'ugc_community' },

  // ── 医疗/口腔垂直门户(实测第一大源;按被引次数降序排列)──
  { match: 'yslw.com', bucket: 'vertical_portal' }, // 牙舒丽网
  { match: 'mfk.com', bucket: 'vertical_portal' },
  { match: 'mingyihui.net', bucket: 'vertical_portal' }, // 名医汇
  { match: 'youlai.cn', bucket: 'vertical_portal' }, // 有来医生
  { match: '35jk.com', bucket: 'vertical_portal' },
  { match: '39.net', bucket: 'vertical_portal' }, // 39 健康
  { match: '360tulou.com', bucket: 'vertical_portal' },
  { match: 'hnqnw.com', bucket: 'vertical_portal' },
  { match: 'kanyabao.com', bucket: 'vertical_portal' }, // 看牙宝
  { match: 'bohe.cn', bucket: 'vertical_portal' }, // 薄荷健康
  { match: 'njuha.cn', bucket: 'vertical_portal' },
  { match: 'kelete.com', bucket: 'vertical_portal' },
  { match: '398.cn', bucket: 'vertical_portal' },
  { match: 'fh21.com.cn', bucket: 'vertical_portal' }, // 飞华健康
  { match: 'ruchuai.com', bucket: 'vertical_portal' },
  { match: 'meiliwuyou.cn', bucket: 'vertical_portal' },
  { match: 'xizee.com', bucket: 'vertical_portal' },
  { match: 'mp17.com', bucket: 'vertical_portal' },
  { match: 'cuancen.com', bucket: 'vertical_portal' },
  { match: 'faxingbao.com', bucket: 'vertical_portal' },
  { match: 'poushuan.com', bucket: 'vertical_portal' },
  { match: 'poucen.com', bucket: 'vertical_portal' },
  { match: 'joyisnow.com', bucket: 'vertical_portal' },
  { match: 'yadoo.cn', bucket: 'vertical_portal' },
  { match: 'beise.com', bucket: 'vertical_portal' },
  { match: 'tuboshu.cn', bucket: 'vertical_portal' },
  { match: 'vv27.com', bucket: 'vertical_portal' },
  { match: 'kq90.com', bucket: 'vertical_portal' },
  { match: 'familydoctor.cn', bucket: 'vertical_portal' },
  { match: 'zhezhui.com', bucket: 'vertical_portal' },
  { match: '99.com.cn', bucket: 'vertical_portal' },
  { match: 'syakc.com', bucket: 'vertical_portal' },
  { match: 'bghospital.cn', bucket: 'vertical_portal' },
  { match: 'xsqrmyy.net', bucket: 'vertical_portal' },
  { match: 'yn-tcm-hospital.com', bucket: 'vertical_portal' },
  { match: 'mebkq.com', bucket: 'vertical_portal' },
  { match: 'kq36.com', bucket: 'vertical_portal' },
  { match: 'yayi.com', bucket: 'vertical_portal' },
];

/** 从任意 URL 取出主机名(小写,去 www.)。取不出返回空串。 */
export function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url.trim());
  if (!m?.[1]) return '';
  return m[1].toLowerCase().replace(/^www\./, '');
}

function matchRule(host: string): { match: string; bucket: SourceBucket } | null {
  for (const r of RULES) {
    // 后缀匹配:m.yslw.com / mip.mfk.com / wapyyk.39.net 都能命中主域规则。
    if (host === r.match || host.endsWith(`.${r.match}`) || host.endsWith(r.match)) return r;
  }
  return null;
}

/** 单条 URL 归类。 */
export function classifySource(url: string): SourceBucket {
  const host = hostOf(url);
  if (!host) return 'unknown';
  return matchRule(host)?.bucket ?? 'unknown';
}

/** 移动版子域前缀 —— 归并统计时剥掉,否则同一家站被拆成多行。 */
const MOBILE_PREFIX_RE = /^(m|wap|mip|3g|mobile|sj|k|touch|h5)\./;

/**
 * 归并后的站点标识 —— 回答「这条引用来自哪一家站」。
 *
 * 必要性:生产实测 `m.yslw.com` 234 次 + `www.yslw.com` 32 次是**同一家**
 * 牙舒丽网,合计 266 次才是它的真实体量(全池第一)。按原始 host 统计会
 * 拆成两行,让最大的源看起来只有一半大 —— 直接误导投放决策。
 *
 * 命中规则表时用规则的主域作为归并键(最准);未命中时退化为剥移动前缀。
 */
export function canonicalDomain(url: string): string {
  const host = hostOf(url);
  if (!host) return '';
  const rule = matchRule(host);
  if (rule) return rule.match;
  return host.replace(MOBILE_PREFIX_RE, '');
}

export type BucketStat = {
  bucket: SourceBucket;
  label: string;
  actionable: boolean;
  note: string;
  citations: number;
  share: number;
  /** 该池中我方内容被引次数 —— 覆盖率的分子。 */
  ours: number;
  /** 该池内 top 域名,便于运营认出具体该打哪家。 */
  top_domains: Array<{ domain: string; count: number }>;
};

export type SourceMapResult = {
  total: number;
  buckets: BucketStat[];
  /** 未归类域名样本 —— 用于定期补规则,避免新大源静默消失在「其他」里。 */
  unknown_samples: Array<{ domain: string; count: number }>;
};

/**
 * 引用池测绘主函数。
 *
 * @param urls 全部引用源 URL(可含重复 —— 重复即代表被引次数,不去重)
 * @param ourArticleIds 我方已发布内容的平台文章 ID(如头条 9 位以上数字 ID),
 *        用于判断某条引用是不是我方内容。URL 精确匹配会因移动版域名改写
 *        漏配,所以按 ID 子串匹配(docs/11 §2.1)。
 * @param ownHostPatterns 视为我方自有资产的域名片段(官网等)。
 */
export function buildSourceMap(input: {
  urls: string[];
  ourArticleIds?: string[];
  ownHostPatterns?: string[];
}): SourceMapResult {
  const { urls, ourArticleIds = [], ownHostPatterns = ['songskq.com'] } = input;
  const idSet = new Set(ourArticleIds.filter((id) => id && id.length >= 9));

  const counts = new Map<SourceBucket, number>();
  const ours = new Map<SourceBucket, number>();
  const domainsByBucket = new Map<SourceBucket, Map<string, number>>();
  let total = 0;

  for (const url of urls) {
    if (!url) continue;
    total++;
    const bucket = classifySource(url);
    const host = hostOf(url);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);

    // 按归并后的站点计数,不按原始 host —— m./www 同站必须合成一行。
    const dm = domainsByBucket.get(bucket) ?? new Map<string, number>();
    const site = canonicalDomain(url);
    dm.set(site, (dm.get(site) ?? 0) + 1);
    domainsByBucket.set(bucket, dm);

    // 我方内容判定:域名属自有资产,或 URL 里含我方已发布文章 ID
    let isOurs = ownHostPatterns.some((p) => host.includes(p));
    if (!isOurs && idSet.size) {
      const found = url.match(/(\d{9,})/g);
      if (found?.some((id) => idSet.has(id))) isOurs = true;
    }
    if (isOurs) ours.set(bucket, (ours.get(bucket) ?? 0) + 1);
  }

  const buckets: BucketStat[] = [...counts.entries()]
    .map(([bucket, citations]) => {
      const meta = BUCKET_META[bucket];
      const dm = domainsByBucket.get(bucket) ?? new Map<string, number>();
      return {
        bucket,
        label: meta.label,
        actionable: meta.actionable,
        note: meta.note,
        citations,
        share: total ? citations / total : 0,
        ours: ours.get(bucket) ?? 0,
        top_domains: [...dm.entries()]
          .map(([domain, count]) => ({ domain, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      };
    })
    .sort((a, b) => b.citations - a.citations);

  const unknownDm = domainsByBucket.get('unknown') ?? new Map<string, number>();
  const unknown_samples = [...unknownDm.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return { total, buckets, unknown_samples };
}

/**
 * 产能错配度 —— 一个数字回答「产能投放和引用池对齐吗」。
 *
 * 定义:对每个**可投放**的池子,取 |产能占比 − 引用池占比| 求和后折半
 * (即 total variation distance,值域 0-1)。0 = 完全对齐,1 = 完全错配。
 * 不可投放的池子(政府源/UGC)不计入 —— 它们不是产能可以选择的去处,
 * 算进去会让指标恒高且不可改善,失去指导意义。
 */
export function capacityMismatch(input: {
  poolShares: Array<{ bucket: SourceBucket; citations: number }>;
  /** 我方产能分布,如 { self_media: 429, short_video: 0 } */
  capacityByBucket: Partial<Record<SourceBucket, number>>;
}): { score: number; details: Array<{ bucket: SourceBucket; pool: number; capacity: number }> } {
  const actionable = input.poolShares.filter((p) => BUCKET_META[p.bucket].actionable);
  const poolTotal = actionable.reduce((s, p) => s + p.citations, 0);
  const capTotal = Object.entries(input.capacityByBucket)
    .filter(([b]) => BUCKET_META[b as SourceBucket]?.actionable)
    .reduce((s, [, v]) => s + (v ?? 0), 0);

  if (!poolTotal || !capTotal) return { score: 0, details: [] };

  const details = actionable.map((p) => ({
    bucket: p.bucket,
    pool: p.citations / poolTotal,
    capacity: (input.capacityByBucket[p.bucket] ?? 0) / capTotal,
  }));

  const score = details.reduce((s, d) => s + Math.abs(d.pool - d.capacity), 0) / 2;
  return { score, details };
}
