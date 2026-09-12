/**
 * 选题优先级的唯一定义处(D68,2026-09-12)。
 *
 * 为什么要有这个文件:优先级此前在 `topic-replenish.ts` 里有一份本地实现,
 * 挖题脚本里又抄了一份。D56 已经栽过一次——补货路径没同步赋值规则,几晚就把
 * D55 定的分级冲垮。规则只允许有一处定义,所有写 `questions.priority` 的地方都调它。
 *
 * ── 规则怎么来的(D67 实测,98 道追踪题) ──
 *   找机构型(哪家/哪里/推荐/靠谱/正规/去哪) 32 道 → 8 道进推荐榜,25%
 *   价格型  (多少钱/费用/报销/医保)         11 道 → 0
 *   知识型                                   55 道 → 0
 *   **进过推荐榜的 8 道,100% 来自找机构型。**
 *
 * 这比 D44「地点 + 行动」细一层:「多少钱」也是行动词,实测 0 上榜。真正的判别式
 * 是**用户是不是在找机构**——只有这种问法,AI 才会在答案里摆一张机构推荐榜,
 * 我们才有位置可占。价格题和知识题的答案是散文,再努力也没有「榜」可上。
 *
 * ── 分档 ──
 *   12  找机构型 · 城市级   ← 唯一被实测证明能上榜的组合,吃满产能
 *   11  找机构型 · 区县级   ← 同类型内保持 D55「城市级优先于区县级」的次序
 *    5  其余(价格/知识)     ← 只当追踪题测量用,不进起草带
 *
 * 注意:无地域题(geo_tier='none')另有一道 RPC 硬过滤 `geo_tier < 2`(D44 实测边界),
 * 不靠 priority 拦,所以这里不给它单独档位。
 */
import { questionGeoTier } from './question-dedup';

/** 「用户在找机构」的问法特征。这些词一出现,AI 大概率摆推荐榜。 */
const SEEK_ORG_RE = /哪家|哪里|哪儿|哪能|哪些医院|哪些机构|哪个医院|推荐|靠谱|正规|去哪|求推荐/;
/** 价格类。实测 0 上榜,但仍是有价值的追踪题(能看竞品报价怎么被引用)。 */
const PRICE_RE = /多少钱|价格|费用|收费|报销|医保|贵不贵|价位/;

export type QuestionKind = 'seek_org' | 'price' | 'knowledge';

/** 判问法类型。找机构优先于价格——「昆明哪家种牙便宜」既找机构又问价,按找机构算。 */
export function questionKind(text: string): QuestionKind {
  if (SEEK_ORG_RE.test(text)) return 'seek_org';
  if (PRICE_RE.test(text)) return 'price';
  return 'knowledge';
}

export const PRIORITY_SEEK_ORG_CITY = 12;
export const PRIORITY_SEEK_ORG_DISTRICT = 11;
export const PRIORITY_OTHER = 5;

/**
 * 算一道题该给多少 priority。
 * 所有写 `questions.priority` 的路径都必须调这里,别再在调用方本地实现一份。
 */
export function questionPriority(text: string): number {
  if (questionKind(text) !== 'seek_org') return PRIORITY_OTHER;
  return questionGeoTier(text) === 'city' ? PRIORITY_SEEK_ORG_CITY : PRIORITY_SEEK_ORG_DISTRICT;
}
