/**
 * Definition of Done (DoD) evaluator — D21 / ADR 009 P2-4.
 *
 * 把"L2 score + slice 完整性"翻译成 dispatchable / blocked 决策.
 *
 * 状态:
 *   passed       — total ≥ 60 AND 关键 slice 齐
 *   failed       — total < 60 OR 关键 slice 缺
 *   legacy_passed — caller 显式标(只在 migration 0032 用)
 *   manual_pass  — 管理员手动放行,审计追溯(后续 UI 实现)
 *
 * 不调 LLM,毫秒级.
 */

import { checkLocalGeo } from './local-geo-check';
import { scoreGeoL2, type GeoL2Score, type L2Context } from './scorer-l2';
import type { ExtractedSlices } from './slice-extractor';

export type DodStatus = 'unknown' | 'passed' | 'failed' | 'legacy_passed' | 'manual_pass';

export type DodEvidence = {
  /** L2 总分(0-100)。failed 时通常 < 60。 */
  l2_total: number;
  /** L2 5 维度详情。 */
  l2_breakdown: GeoL2Score['breakdown'];
  /** 缺失的关键 slice 名单。 */
  missing_slices: string[];
  /** 本地化 GEO 结构失败项(地域分布/机构植入/转化入口)。可直接当改写 hint。 */
  local_geo_failures: string[];
  /** 人话解释为什么 failed(passed 时此数组空)。 */
  reasons: string[];
  /** Threshold used. */
  threshold: number;
  evaluated_at: string;
  /** Optional admin override metadata. */
  override_by?: string;
  override_at?: string;
  override_reason?: string;
};

export type DodResult = {
  status: 'passed' | 'failed';
  score: number;
  evidence: DodEvidence;
};

export type DodInput = {
  title: string;
  body: string;
  /** Slices extracted from body (or empty if extractor hasn't run yet). */
  slices?: ExtractedSlices;
  /** L2 context — brand name / city / is_medical. */
  ctx?: L2Context;
  /** Custom threshold; defaults to 60 (medical-class minimum quality bar). */
  threshold?: number;
  /** Skip required-slice check; used for short-form (douyin_script / xiaohongshu)
   *  where FAQ ≥ 5 or Trust Block don't fit the format. */
  skip_required_slices?: boolean;
  /** 长文平台(头条/公众号/知乎/百家号/搜狐号)。true 时跑本地化 GEO 结构检查。
   *  短文(抖音/小红书)结构不同,不套用。caller 按 platform 推导。 */
  is_long_form?: boolean;
  /** brands.service_areas — 当 ctx.city 缺省时,用 [0] 作地域锚点 fallback。 */
  service_areas?: string[];
};

/** Required slices for a passing medical-class article. */
const REQUIRED_SLICES_MEDICAL: Array<keyof ExtractedSlices> = [
  'direct_answer',
  'when_to_seek_care',
  'trust_block',
  'faq_pairs',
];

export function evaluateDod(input: DodInput): DodResult {
  const threshold = input.threshold ?? 60;
  const l2 = scoreGeoL2({ title: input.title, body: input.body, ctx: input.ctx });
  const reasons: string[] = [];
  const missing: string[] = [];

  // (1) Total score check
  if (l2.total < threshold) {
    reasons.push(`L2 总分 ${l2.total}/100 低于阈值 ${threshold}`);
  }

  // (2) Required-slice check (skipped for short-form platforms)
  if (!input.skip_required_slices && input.ctx?.is_medical !== false) {
    const slices: ExtractedSlices = input.slices ?? { version: 1, extracted_at: '' };
    for (const key of REQUIRED_SLICES_MEDICAL) {
      const v = slices[key];
      if (v === undefined || v === null) {
        missing.push(String(key));
        continue;
      }
      // Trust block: at least 4 of 7 fields present
      if (key === 'trust_block') {
        const tb = slices.trust_block ?? {};
        const filled = Object.values(tb).filter((x) => typeof x === 'string' && x.length > 0).length;
        if (filled < 4) {
          missing.push(`${String(key)} (only ${filled}/7 fields)`);
        }
      }
      // FAQ: ≥ 5 pairs
      if (key === 'faq_pairs') {
        const pairs = slices.faq_pairs ?? [];
        if (pairs.length < 5) {
          missing.push(`faq_pairs (only ${pairs.length}/5)`);
        }
      }
    }
    if (missing.length > 0) {
      reasons.push(`关键 slice 缺失: ${missing.join(', ')}`);
    }
  }

  // (3) Specific weak dimensions
  const trustDim = l2.breakdown.trust_block_completeness;
  if (input.ctx?.is_medical !== false && !trustDim.unknown && trustDim.score < 50) {
    reasons.push(`Trust Block 完整度仅 ${trustDim.score}/100(医疗类必须 ≥ 50)`);
  }

  // (4) 本地化 GEO 结构检查 (V1.13) — 仅长文医疗。地域分布/机构植入/转化入口。
  let localGeoFailures: string[] = [];
  if (input.is_long_form && input.ctx?.is_medical !== false) {
    const anchorCity = input.ctx?.city ?? input.service_areas?.[0];
    const lg = checkLocalGeo({
      title: input.title,
      body: input.body,
      city: anchorCity,
      brand_name: input.ctx?.brand_name,
    });
    localGeoFailures = lg.failures;
    if (lg.failures.length > 0) {
      reasons.push(`本地化 GEO 结构不达标: ${lg.failures.length} 项`);
    }
  }

  const status: 'passed' | 'failed' = reasons.length === 0 ? 'passed' : 'failed';

  return {
    status,
    score: l2.total,
    evidence: {
      l2_total: l2.total,
      l2_breakdown: l2.breakdown,
      missing_slices: missing,
      local_geo_failures: localGeoFailures,
      reasons,
      threshold,
      evaluated_at: new Date().toISOString(),
    },
  };
}
