/**
 * E-E-A-T 4-dimension mapping over the existing 9-tactic GEO scorer.
 *
 * Pure naming/categorization layer. Does NOT modify scoring logic — every
 * point comes from the same scoreGeo() function. The mapping just regroups
 * tactics under Google's E-E-A-T framework so the UI can speak the language
 * customers already know from SEO.
 *
 * Mapping rationale (sums updated by scorer v2 weight calibration, 档位 C2):
 *   - Expertise        (37)  citation + statistics — knowledge demonstrated
 *                            via concrete evidence
 *   - Experience       (14)  authority + position — first-hand voice +
 *                            information ordering as if from someone who
 *                            actually does this work
 *   - Authoritativeness (21) quotation + unique — the borrowed authority of
 *                            named sources, plus non-template phrasing
 *                            (i.e. not parroting industry boilerplate)
 *   - Trustworthiness   (28) fluency + readability + keyword_freq — clear,
 *                            accurate, no manipulation
 *
 * (Buckets are unequal because the underlying tactic weights are unequal —
 * we don't reweight here, just regroup.)
 */

import type { GeoScore } from './scorer';

export type EeatDimension = {
  /** Sum of contributing tactic scores. */
  score: number;
  /** Sum of contributing tactic max values. */
  max: number;
  /** Names of the 9-law tactics that contributed to this dimension. */
  tactic_keys: Array<keyof GeoScore['breakdown']>;
};

export type EeatBreakdown = {
  expertise: EeatDimension;
  experience: EeatDimension;
  authoritativeness: EeatDimension;
  trustworthiness: EeatDimension;
};

const MAPPING: Record<string, Array<keyof GeoScore['breakdown']>> = {
  expertise: ['citation', 'statistics'],
  experience: ['authority', 'position'],
  authoritativeness: ['quotation', 'unique'],
  trustworthiness: ['fluency', 'readability', 'keyword_freq'],
};

export function mapToEeat(score: GeoScore): EeatBreakdown {
  const result = {} as EeatBreakdown;
  for (const [dim, keys] of Object.entries(MAPPING)) {
    let s = 0;
    let m = 0;
    for (const k of keys) {
      const t = score.breakdown[k];
      s += t.score;
      m += t.max;
    }
    (result as Record<string, EeatDimension>)[dim] = {
      score: s,
      max: m,
      tactic_keys: keys,
    };
  }
  return result;
}

/** UI-friendly Chinese labels for each dimension. */
export const EEAT_LABELS: Record<keyof EeatBreakdown, { zh: string; en: string; hint: string }> = {
  expertise: {
    zh: '专业性',
    en: 'Expertise',
    hint: '具体数据 + 具名权威源 = 内容知道自己在说什么',
  },
  experience: {
    zh: '经验性',
    en: 'Experience',
    hint: '权威短语 + 关键信息前置 = 像真做过这件事的人在写',
  },
  authoritativeness: {
    zh: '权威性',
    en: 'Authoritativeness',
    hint: '直接引语 + 避开模板套话 = 借力外部权威 + 自身可识别',
  },
  trustworthiness: {
    zh: '可信度',
    en: 'Trustworthiness',
    hint: '流畅 + 易读 + 关键词准确 = 没偷工减料,读者读完愿意相信',
  },
};
