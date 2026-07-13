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
  /昆明市|昆明|西山区|双塔|希望路|附近|哪里能看|哪里能做|哪里能查|哪里能|哪家|去哪|比较好|靠谱|一般|大概|要不要|怎么办|是怎么回事|吗|呢|啊|[??!!,,。.、\s]/g;

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

  for (const e of existing) {
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
