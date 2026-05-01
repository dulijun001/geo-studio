/**
 * Discoverability audit — produces a 0-100 score across 4 dimensions.
 *
 * Inspired by Laravel aigeo's geo:audit but adapted for medical-vertical
 * signals (verified credentials, medicalSpecialty completeness, etc.).
 *
 * Pure function: takes a snapshot of tenant state, returns a structured
 * breakdown. The hub UI renders it as 4 cards + a top-line total.
 */

import type { ArtifactInput } from './artifact-input';

export type AuditDimension = {
  /** 0-25, dimension max. */
  score: number;
  max: number;
  /** Per-check breakdown. Each `passed=false` is shown as a TODO. */
  checks: Array<{ name: string; passed: boolean; weight: number; hint?: string }>;
};

export type AuditReport = {
  total: number;
  max: 100;
  /** Convenience grade: A>=85, B>=70, C>=55, D>=40, else F. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: {
    completeness: AuditDimension;
    data_scale: AuditDimension;
    trust: AuditDimension;
    freshness: AuditDimension;
  };
};

export type AuditContext = {
  /** When the materialized artifacts were last generated. Null = never. */
  artifacts_generated_at: string | null;
  /** Whether public_enabled flag is on. */
  public_enabled: boolean;
  /** Number of articles published in the last 30 days. */
  articles_recent: number;
};

export function runDiscoverabilityAudit(
  input: ArtifactInput,
  ctx: AuditContext,
): AuditReport {
  const completeness = scoreCompleteness(input);
  const data_scale = scoreDataScale(input, ctx);
  const trust = scoreTrust(input);
  const freshness = scoreFreshness(ctx);

  const total =
    completeness.score + data_scale.score + trust.score + freshness.score;

  const grade: AuditReport['grade'] =
    total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';

  return {
    total,
    max: 100,
    grade,
    dimensions: { completeness, data_scale, trust, freshness },
  };
}

function scoreCompleteness(input: ArtifactInput): AuditDimension {
  const b = input.brand;
  const checks = [
    {
      name: '品牌描述',
      passed: typeof b.description === 'string' && b.description.length >= 80,
      weight: 5,
      hint: '至少 80 字描述,用于 llms-full.txt + Organization.description',
    },
    {
      name: '医疗专科分类',
      passed: b.medical_specialties.length >= 1,
      weight: 5,
      hint: '填至少一个 medicalSpecialty(如 "Dentistry")',
    },
    {
      name: '营业时间',
      passed: b.business_hours ? Object.keys(b.business_hours).length >= 5 : false,
      weight: 5,
      hint: '至少覆盖 5 天工作日',
    },
    {
      name: '完整地址',
      passed:
        !!b.address?.city && !!b.address?.street && b.address.latitude !== undefined,
      weight: 5,
      hint: '城市 / 街道 / 经纬度齐全,豆包"本地推荐"才认',
    },
    {
      name: '认证资质',
      passed: b.credentials.length >= 1,
      weight: 5,
      hint: 'JCI / 三甲 / 医疗机构执业许可证 等',
    },
  ];

  return {
    score: checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0),
    max: 25,
    checks,
  };
}

function scoreDataScale(input: ArtifactInput, ctx: AuditContext): AuditDimension {
  const checks = [
    {
      name: '至少 1 位公开医生',
      passed: input.physicians.length >= 1,
      weight: 5,
      hint: '在员工管理里把医生 geo_profile_visible 打开',
    },
    {
      name: '至少 3 项公开服务',
      passed: input.services.length >= 3,
      weight: 10,
      hint: '种植 / 正畸 / 儿牙 / 美白 / 修复 等核心项目',
    },
    {
      name: '至少 5 条 FAQ',
      passed: input.faqs.length >= 5,
      weight: 5,
      hint: '医保 / 价格 / 流程 / 风险 等高频问答',
    },
    {
      name: '近 30 天有内容产出',
      passed: ctx.articles_recent >= 1,
      weight: 5,
      hint: '保持节奏,AI 引擎给"活跃"账号更高权重',
    },
  ];

  return {
    score: checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0),
    max: 25,
    checks,
  };
}

function scoreTrust(input: ArtifactInput): AuditDimension {
  const ratings = input.testimonials
    .map((t) => t.rating)
    .filter((r): r is number => r !== undefined);
  const avg =
    ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  const checks = [
    {
      name: '已通过审核的客户见证 ≥ 5',
      passed: input.testimonials.length >= 5,
      weight: 10,
      hint: 'testimonials 表 + compliance_status=approved + geo_visible=true',
    },
    {
      name: '平均评分 ≥ 4.0',
      passed: avg >= 4.0,
      weight: 5,
      hint: '低于 4.0 → 检查见证质量 / 是否选了对的服务',
    },
    {
      name: '至少 1 条验证资质',
      passed: input.brand.credentials.length >= 1,
      weight: 10,
      hint: '执业许可证 / 评级文件 等',
    },
  ];

  return {
    score: checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0),
    max: 25,
    checks,
  };
}

function scoreFreshness(ctx: AuditContext): AuditDimension {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentRegen =
    ctx.artifacts_generated_at !== null &&
    new Date(ctx.artifacts_generated_at).getTime() >= sevenDaysAgo;

  const checks = [
    {
      name: '近 7 天有重建',
      passed: recentRegen,
      weight: 15,
      hint: '点 hub 页"立即重建"或等 daily cron(每日 09:00)',
    },
    {
      name: '公开访问已开启',
      passed: ctx.public_enabled,
      weight: 10,
      hint: 'hub 页 toggle 打开后,豆包 / 元宝爬虫才能取到 llms.txt + feed',
    },
  ];

  return {
    score: checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0),
    max: 25,
    checks,
  };
}
