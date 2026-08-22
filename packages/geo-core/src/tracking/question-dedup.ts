/**
 * 子问题语义查重 (V1.13, D52) — 自动展开的子问题入库前,和存量题库做近重复检测。
 *
 * 动机:expandSubtopics 的 LLM 看不见已有题库,实测 10 题里 3 题与已发内容
 * 语义撞车("种牙多少钱一颗" ≈ "种一颗牙大概多少钱")。撞车题入库 → cron 起草
 * 换皮旧文 → 豆包按 spam 降权(D24 教训)。
 *
 * 算法:剥离地域/脚手架词后做字符 trigram 重叠系数(overlap coefficient,
 * |A∩B| / min(|A|,|B|))。选 overlap 而非 Jaccard:短句包含关系(新题是旧题
 * 子集)时 Jaccard 被长句稀释,overlap 不会。
 *
 * 阈值宁严勿松:边界情况判重跳过即可(题库还有别的主题可展开),
 * 漏判重复的代价(spam 降权)远大于误判(少一道题)。
 */

/** 地域词 + 问句脚手架 — 几乎每道本地题都带,不构成语义差异 */
const SCAFFOLD_RE =
  /昆明市|昆明|西山区|五华区|盘龙区|官渡区|呈贡区|双塔|希望路|附近|哪里能看|哪里能做|哪里能查|哪里能|哪家|去哪|比较好|靠谱|一般|大概|要不要|怎么办|是怎么回事|吗|呢|啊|[??!!,,。.、\s]/g;

/**
 * 意图词 —— 「多少钱 / 去哪里 / 有哪些」这类表达 intent 的措辞。
 *
 * 它们**保留在 trigram 打分里**(去掉会打散「种牙多少钱一颗」与「种一颗牙大概
 * 多少钱」这类真换皮题的匹配,实测会让 D24 防线漏 3 条),但在计算「主题核心」
 * 时剥掉 —— 主题核心用来回答一个独立的问题:两道题**说的是不是同一件事**。
 */
const INTENT_WORD_RE =
  /多少钱|价格|费用|贵不贵|去哪里|哪里|有哪些|注意事项|要注意|怎么样|咋样|好不好|能不能|可以|需要|方便|合适|影响|区别|不同|建议|推荐/g;

/**
 * 主题核心字符集 —— 剥掉全部脚手架与意图措辞后剩下的实义字。
 *
 * 用途见 TOPIC_OVERLAP_FLOOR。用字符集合而非 trigram,是因为中文问句语序自由
 * (「种牙多少钱一颗」vs「种一颗牙大概多少钱」),字符集对语序不敏感,正适合
 * 判断「是不是在讲同一件事」。
 */
function topicCore(s: string): Set<string> {
  const norm = s.replace(SCAFFOLD_RE, '').replace(INTENT_WORD_RE, '').toLowerCase();
  return new Set(norm.split(''));
}

/**
 * 地域层级 — 参与查重分组,**不参与文本相似度**。
 *
 * 为什么必须分组(2026-08-22 实测):SCAFFOLD_RE 把「昆明」和「西山区」一起剥掉,
 * 于是「昆明种植牙能用医保报销吗」与「昆明西山区种植牙能用医保报销吗」剥离后
 * 完全相同,overlap=1.00 判重。**这会让 D55 要求的城市级题永远进不了库** ——
 * D52 自动补货即使正常运行也补不出城市级题,D55 因此在 D56 修好 RPC 排序之后
 * 仍然无法持续生效。
 *
 * 但从 GEO 角度,「昆明X」和「昆明西山区X」是两个**不同的搜索词**,分别对应
 * 城市级与区县级战场(D44/D55 整套分级体系正建立在这个前提上),本就该各覆盖
 * 一道题,不构成 D24 所说的「换皮旧题」。
 *
 * 因此:同层级之间照常严格查重(防换皮),跨层级直接放行(它们不是重复)。
 */
export type QuestionGeoTier = 'district' | 'city' | 'none';

const DISTRICT_RE = /西山区|五华区|盘龙区|官渡区|呈贡区|安宁|东川|晋宁|富民|宜良|石林|嵩明|禄劝|寻甸|双塔|希望路/;

export function questionGeoTier(text: string): QuestionGeoTier {
  if (DISTRICT_RE.test(text)) return 'district';
  if (text.includes('昆明')) return 'city';
  return 'none';
}

function contentTrigrams(s: string): Set<string> {
  const norm = s.replace(SCAFFOLD_RE, '').toLowerCase();
  const out = new Set<string>();
  if (norm.length === 0) return out;
  if (norm.length < 3) {
    out.add(norm);
    return out;
  }
  for (let i = 0; i <= norm.length - 3; i++) out.add(norm.slice(i, i + 3));
  return out;
}

export type QuestionLike = {
  text: string;
  /** questions.intent / expandSubtopics 的 intent 分类,可缺省 */
  intent?: string | null;
};

export type DedupVerdict = {
  duplicate: boolean;
  /** 命中的存量题(仅 duplicate=true 时给) */
  matched?: string;
  /** 触发的规则 */
  rule?: 'text' | 'intent+text';
  /** 最高重叠系数 0-1 */
  score: number;
};

/** 纯文本判重阈值(语序相近的直接复述) */
const TEXT_THRESHOLD = 0.6;
/**
 * 主题核心重叠下限 —— 低于此值视为「讲的是两件事」,直接不比较。
 * 0.34 = 三分之一:实测「拔智齿」vs「洗牙」核心交集为 0(不重),
 * 而「种牙多少钱一颗」vs「种一颗牙大概多少钱」核心交集 1.0(仍判重)。
 */
const TOPIC_OVERLAP_FLOOR = 0.34;
/** 意图相同时的文本阈值(语序打乱的同义改写,如"种牙多少钱一颗"vs"种一颗牙多少钱") */
const INTENT_TEXT_THRESHOLD = 0.2;

/**
 * 双规则判重:
 *   a) 内容 trigram 重叠 ≥ 0.6 → 重(不看 intent,兜住 intent 分类漂移)
 *   b) intent 相同 且 重叠 ≥ 0.2 → 重(兜住语序打乱的同义改写)
 * 宁严勿松:误杀一道边界题的代价 << 换皮旧题被豆包降权。
 */
export function isNearDuplicateQuestion(
  candidate: QuestionLike,
  existing: readonly QuestionLike[],
): DedupVerdict {
  const cGrams = contentTrigrams(candidate.text);
  if (cGrams.size === 0) return { duplicate: false, score: 0 };

  let best = 0;
  let bestMatch: string | undefined;
  let bestRule: DedupVerdict['rule'];

  const cTier = questionGeoTier(candidate.text);
  const cCore = topicCore(candidate.text);

  for (const e of existing) {
    // 跨地域层级不构成重复 —— 城市级与区县级是两个不同的搜索词战场(D44/D55)。
    // 不做这个分组,城市级题会 100% 撞上同意图的区县级题而永远无法入库。
    if (questionGeoTier(e.text) !== cTier) continue;

    // 主题核心门槛:说的不是同一件事,就不可能是「换皮旧题」。
    // 挡住 intent 规则(阈值仅 0.2)在同 intent 不同主题间的误杀。
    const eCore = topicCore(e.text);
    if (eCore.size > 0 && cCore.size > 0) {
      let coreInter = 0;
      for (const ch of cCore) if (eCore.has(ch)) coreInter++;
      if (coreInter / Math.min(cCore.size, eCore.size) < TOPIC_OVERLAP_FLOOR) continue;
    }

    const eGrams = contentTrigrams(e.text);
    if (eGrams.size === 0) continue;
    let inter = 0;
    for (const g of cGrams) if (eGrams.has(g)) inter++;
    const score = inter / Math.min(cGrams.size, eGrams.size);

    const sameIntent =
      candidate.intent != null && e.intent != null && candidate.intent === e.intent;
    const hit =
      score >= TEXT_THRESHOLD || (sameIntent && score >= INTENT_TEXT_THRESHOLD);

    if (hit && score > best) {
      best = score;
      bestMatch = e.text;
      bestRule = score >= TEXT_THRESHOLD ? 'text' : 'intent+text';
    } else if (!hit && score > best && bestMatch === undefined) {
      best = score; // 仅记录最高分供观测,不判重
    }
  }
  return bestMatch !== undefined
    ? { duplicate: true, matched: bestMatch, rule: bestRule, score: best }
    : { duplicate: false, score: best };
}
