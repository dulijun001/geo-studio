/**
 * 推荐名次解析 —— 回答「AI 把我们排第几」,不是「我们在正文第几个字」。
 *
 * 为什么需要这个(2026-09-11 D64):
 *   citations.mention_position 存的是品牌词在正文里的**字符偏移**,不是名次。
 *   「松鼠排民营专科第 1」这句话此前一直靠人读答案读出来,系统里没有对应字段,
 *   对外也讲不出「豆包上我们排第几」这个数——而这恰恰是客户唯一听得懂的指标。
 *
 * 豆包答案的真实结构(从 geo_snapshots 100 条实采样本归纳,不是拍脑袋):
 *   一、公立医院(适合复杂种植...)          ← 中文数字 = 板块
 *   1. 云南省第一人民医院(昆华医院・三甲)    ← 阿拉伯数字 = 板块内条目
 *   2. 解放军第九二〇医院
 *   二、合规连锁民营口腔(西山区门店...)
 *   1. 昆明松鼠口腔(蓝光昆仑中心店)        ← 松鼠在这里是第 1
 *   2. 柏德口腔
 *
 * 关键设计:**名次必须带板块**。公立板块第 1 是昆华,民营板块第 1 才是松鼠,
 * 拉平成一个「平均排名 3.1」会把这两件事混成一个没法解释的数,腾讯 AnswerBit
 * 看板上那个 3.1 就有这个毛病。所以这里输出 (板块, 名次, 板块内总数) 三元组。
 *
 * 两个从真实样本学到的坑:
 *   1. 编号不一定在行首。实采里出现过「…复诊方便。2. 柏德口腔(…」——上一条的
 *      句号后面直接接下一条编号,没有换行。所以不能用 /^\d+\./m。
 *   2. 正文里的小数和价格会伪装成编号。「3.1」「1,600.00」都长得像「3.」,
 *      靠「点后面不能紧跟数字」+「必须跟实义字符」两条排除。
 */

/** 板块内的一个条目,如「1. 昆明松鼠口腔(蓝光昆仑中心店)」。 */
export type RankedItem = {
  /** 条目自己写的序号(1 起)。 */
  ordinal: number;
  /** 序号后面那段标题文字,截断到 40 字。 */
  label: string;
  /** 条目在原文里的起止字符偏移,用来判断品牌词落在哪一条。 */
  start: number;
  end: number;
};

/** 一个板块,如「二、合规连锁民营口腔」。无板块标题时 title 为 null。 */
export type RankedSection = {
  /** 板块序号(1 起);中文数字转成的阿拉伯数字。无板块时为 0。 */
  index: number;
  /** 板块标题,如「合规连锁民营口腔(西山区门店…)」。 */
  title: string | null;
  items: RankedItem[];
  start: number;
  end: number;
};

/** 某个品牌词命中的名次。 */
export type BrandRank = {
  /** 命中的品牌词在原文的字符偏移(对应 BrandMention.offset)。 */
  offset: number;
  sectionIndex: number;
  sectionTitle: string | null;
  /** 在该板块内排第几(1 起)。 */
  rank: number;
  /** 该板块一共几条,用来判断「第 1/4」还是「第 1/12」。 */
  totalInSection: number;
  /** 命中条目的标题,用来人工核对解析对不对。 */
  itemLabel: string;
};

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** 「十一」「二十」这类中文数字转阿拉伯数字;只需要覆盖到 20 出头,板块不会更多。 */
function cnToNum(s: string): number {
  const digit = (ch: string | undefined) => (ch ? (CN_NUM[ch] ?? 0) : 0);
  if (s.length === 1) return digit(s);
  if (s === '十') return 10;
  if (s.startsWith('十')) return 10 + digit(s[1]);
  if (s.endsWith('十')) return digit(s[0]) * 10;
  return digit(s[0]) * 10 + digit(s[2]);
}

// 板块头:行首或句末之后的「一、」「二、」…
const SECTION_RE = /(?:^|[\n。！？])\s*([一二三四五六七八九十]{1,3})、\s*/g;
/**
 * 2026-09-12 豆包改版后的新板块头:行首的 ✅ / 📌 / 🔹 等标记。
 *
 * 改版把「一、公立医院 / 1. XX医院 2. YY医院」整个换成了
 * 「✅ 公立 / 公立背景」+ **无编号的机构名行**。旧解析器要求阿拉伯数字编号,
 * 对新格式一条名次都解不出来 —— 而信息其实都在(实测那条答案里松鼠就在
 * 民营板块第 1 位,共 5 家)。
 */
const MARKER_SECTION_RE = /(?:^|\n)\s*([✅📌🔹🔸▶►·]|[⭐★])\s*([^\n]{2,40})/g;
/** 机构名行的特征:短、独占一行、含机构类词。描述段落会更长且带标点。 */
// 前缀下限 2 不是 3:实测「柏德口腔（南亚院区）」的品牌名只有两个字,
// 用 {3,34} 会把它整条漏掉(5 家机构只解出 4 家)。放宽后误报由 isOrgRanking 兜。
const ORG_LINE_RE = /^[^\n]{2,34}(医院|口腔|门诊部|门诊|诊所|齿科|牙科)[^\n]{0,12}$/;
// 条目头:行首或句末/右括号之后的「1. 」「2、」…
// (?![\d%]) 挡掉小数和百分比;后面必须跟一个实义字符(中英文/数字之外的标点不算)
const ITEM_RE = /(?:^|[\n。！？；)）】]|\s)\s*([1-9]\d?)\s*[.、．]\s*(?![\d%])(?=[^\s.,、。%])/g;

const LABEL_MAX = 40;

/**
 * 把一段 AI 答案切成「板块 → 条目」两级结构。
 * 没有中文数字板块头时,整篇算一个 index=0 的匿名板块。
 */
export function parseAnswerRanking(text: string): RankedSection[] {
  if (!text) return [];

  // 1) 先切板块。两种板块头并存:老的「一、」和 2026-09 改版后的「✅ 」。
  const heads: { index: number; title: string; at: number; bodyFrom: number }[] = [];
  // 板块是从哪种格式切出来的。无编号兜底**只允许用在新标记格式上** ——
  // 2026-09-12 实测:放开给老格式会大量误报,把地址行、描述句、「长期随访与服务」
  // 这类段落都切成排行榜条目,抽查 6 条全是假的。老格式一行都不要动。
  let markerBased = false;
  SECTION_RE.lastIndex = 0;
  for (let m = SECTION_RE.exec(text); m; m = SECTION_RE.exec(text)) {
    const at = m.index + (m[0].length - m[0].replace(/^[\n。！？\s]+/, '').length);
    const bodyFrom = m.index + m[0].length;
    heads.push({
      index: cnToNum(m[1] ?? ''),
      title: takeLabel(text.slice(bodyFrom)),
      at,
      bodyFrom,
    });
  }
  if (heads.length === 0) {
    markerBased = true;
    MARKER_SECTION_RE.lastIndex = 0;
    let n = 0;
    for (let m = MARKER_SECTION_RE.exec(text); m; m = MARKER_SECTION_RE.exec(text)) {
      n += 1;
      const at = m.index + (m[0].length - m[0].replace(/^\s+/, '').length);
      heads.push({
        index: n,
        title: (m[2] ?? '').trim().slice(0, LABEL_MAX),
        at,
        bodyFrom: m.index + m[0].length,
      });
    }
    if (heads.length === 0) markerBased = false;
  }

  const spans: { index: number; title: string | null; start: number; end: number }[] =
    heads.length === 0
      ? [{ index: 0, title: null, start: 0, end: text.length }]
      : heads.map((h, i) => ({
          index: h.index,
          title: h.title,
          start: h.bodyFrom,
          end: heads[i + 1]?.at ?? text.length,
        }));

  // 2) 每个板块内部切条目
  return spans.map((s) => {
    const body = text.slice(s.start, s.end);
    const raw: { ordinal: number; start: number }[] = [];
    ITEM_RE.lastIndex = 0;
    for (let m = ITEM_RE.exec(body); m; m = ITEM_RE.exec(body)) {
      raw.push({ ordinal: Number(m[1] ?? 0), start: s.start + m.index + m[0].length });
    }

    let kept = keepAscendingRun(raw);
    // 新格式没有编号:退回按「独占一行的机构名」切条目,名次 = 出现次序。
    // 只在这个板块**一个编号项都没有**时启用,不影响老格式。
    if (kept.length === 0 && markerBased) kept = orgLineItems(text, s.start, s.end);
    const items: RankedItem[] = kept.map((it, i) => {
      const end = kept[i + 1]?.start ?? s.end;
      return {
        ordinal: it.ordinal,
        label: takeLabel(text.slice(it.start, end)),
        start: it.start,
        end,
      };
    });

    return { index: s.index, title: s.title, items, start: s.start, end: s.end };
  });
}

/**
 * 只保留「从 1 开始、逐个递增」的那串编号。
 *
 * 防的是正文里混进来的伪编号:真实列表是 1,2,3,4;而「…质保 3. 年」这种噪声
 * 会插进一个不连号的数字。要求严格 prev+1 能把绝大多数噪声挡在外面,代价是
 * AI 偶尔漏写一个序号时整串会被截断——宁可少报名次,不可报错名次。
 */
function keepAscendingRun(raw: { ordinal: number; start: number }[]) {
  const out: { ordinal: number; start: number }[] = [];
  for (const it of raw) {
    const prev = out[out.length - 1];
    if (!prev) {
      if (it.ordinal === 1) out.push(it);
      continue;
    }
    if (it.ordinal === prev.ordinal + 1) out.push(it);
  }
  return out;
}

/**
 * 取一段文字的开头当标题。
 *
 * 切三种边界:换行、句末标点、**下一个条目编号**。第三条是 2026-09-11 实采发现的:
 * 板块标题后面经常不换行直接接「1. xxx」,不切就会把第一个条目吃进板块标题里,
 * 出现「…本地主流儿牙)1、随访服务」这种脏标题。
 */
function takeLabel(s: string): string {
  const line = s.split(/[\n。！？]/, 1)[0] ?? '';
  const cut = line.search(/[1-9]\d?\s*[.、．]\s*(?![\d%])(?=[^\s.,、。%])/);
  const head = cut > 0 ? line.slice(0, cut) : line;
  const clean = head.replace(/^[\s:：]+/, '').replace(/[\s、,，]+$/, '').trim();
  return clean.length > LABEL_MAX ? `${clean.slice(0, LABEL_MAX)}…` : clean;
}

/**
 * 判断一个板块是不是「机构榜」,而不是「避坑清单」「服务项目表」。
 *
 * 2026-09-11 首轮实采教训:光看「有编号」会把一堆不是排名的东西当成排名——
 * 「1. 集采低价引流套路 2. 强制升单」是避坑清单,「1. 随访服务 2. 质保」是服务表,
 * 解析器照样给出「第 1/3 名」,误报率约 30%。这种假名次比没有名次更坏,对外一讲就露馅。
 *
 * 判据:板块里至少 minOrgItems 个条目命中了机构类词(brand_vocab 的 brand + competitor)。
 * 真正的机构榜必然并排列着好几家机构名;避坑清单里一个机构名都不会有。
 * 复用已有的 brand_vocab,不新造词表。
 */
function isOrgRanking(sec: RankedSection, orgOffsets: number[], minOrgItems: number): boolean {
  if (orgOffsets.length === 0) return true; // 没传机构词 = 不做闸门,保持旧行为
  let hits = 0;
  for (const it of sec.items) {
    if (orgOffsets.some((o) => o >= it.start && o < it.end)) hits += 1;
    if (hits >= minOrgItems) return true;
  }
  return false;
}

export type RankOptions = {
  /**
   * 机构类词(本品牌 + 竞品)在原文里的命中偏移,用来判断板块是不是机构榜。
   * 不传 = 不做闸门(会有约 30% 假名次,只适合调试)。
   */
  orgOffsets?: number[];
  /** 一个板块里至少几条命中机构词才算榜单,默认 2。 */
  minOrgItems?: number;
};

/**
 * 给定一批品牌词命中的字符偏移,查出每个偏移落在哪个板块的第几条。
 * 落在条目外(开场白、避坑段)的、或所在板块不是机构榜的,都不返回——那不是名次。
 */
export function locateRanks(text: string, offsets: number[], opts: RankOptions = {}): BrandRank[] {
  const orgOffsets = opts.orgOffsets ?? [];
  const minOrgItems = opts.minOrgItems ?? 2;
  const sections = parseAnswerRanking(text);
  const rankable = new Map<RankedSection, boolean>();
  const out: BrandRank[] = [];
  for (const offset of offsets) {
    for (const sec of sections) {
      if (offset < sec.start || offset >= sec.end) continue;
      if (!rankable.has(sec)) rankable.set(sec, isOrgRanking(sec, orgOffsets, minOrgItems));
      if (!rankable.get(sec)) break;
      const hit = sec.items.find((it) => offset >= it.start && offset < it.end);
      if (!hit) break;
      out.push({
        offset,
        sectionIndex: sec.index,
        sectionTitle: sec.title,
        rank: hit.ordinal,
        totalInSection: sec.items.length,
        itemLabel: hit.label,
      });
      break;
    }
  }
  return out;
}

/**
 * 本品牌在这条答案里的最好名次。多处提及时取名次最小的那条。
 * 返回 null = 品牌确实被提到了,但没出现在任何编号推荐位上(常见于「避坑提示」段落)。
 */
export function bestBrandRank(
  text: string,
  brandOffsets: number[],
  opts: RankOptions = {},
): BrandRank | null {
  const ranks = locateRanks(text, brandOffsets, opts);
  if (ranks.length === 0) return null;
  return ranks.reduce((best, r) => (r.rank < best.rank ? r : best));
}

/**
 * 无编号列表的条目切分(2026-09-12 豆包改版后新增)。
 *
 * 判据:独占一行、3-34 字、含机构类词(医院/口腔/门诊/诊所/齿科/牙科)。
 * 描述段落通常更长且带句号,所以长度上限就能把它们挡在外面。
 * 名次 = 这些行在板块内的出现次序。
 *
 * 注意:这里只负责「切出候选条目」,**要不要当成排行榜**仍由 isOrgRanking 决定
 * (板块内至少 2 条命中 brand_vocab),所以「📌 怎么判断靠不靠谱」这类段落
 * 即使碰巧切出几行,也不会被算成名次。
 */
function orgLineItems(text: string, start: number, end: number): { ordinal: number; start: number }[] {
  const out: { ordinal: number; start: number }[] = [];
  let cursor = start;
  let n = 0;
  for (const line of text.slice(start, end).split('\n')) {
    const trimmed = line.trim();
    if (trimmed && ORG_LINE_RE.test(trimmed)) {
      n += 1;
      out.push({ ordinal: n, start: cursor + line.indexOf(trimmed) });
    }
    cursor += line.length + 1;
  }
  return out;
}
