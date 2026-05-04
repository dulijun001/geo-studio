/**
 * String literal unions mirroring pg enums.
 * Keep in sync with packages/db/src/schema/*.ts.
 */

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const REVIEW_STAGES = ['keyword', 'llm', 'manual'] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

export const REVIEW_VERDICTS = ['pass', 'warn', 'reject'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const ENGINES = [
  'doubao',
  'yuanbao',
  'quark',
  'deepseek',
  'kimi',
  'wenxin',
  'qwen',
  'chatgpt',
  'perplexity',
] as const;
export type Engine = (typeof ENGINES)[number];

export const MEMBER_ROLES = ['owner', 'admin', 'operator', 'auditor', 'staff'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const HOOK_TYPES = ['doctor_name', 'activity_code', 'phone_tail', 'utm_qrcode'] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const CONVERSION_STAGES = [
  'arrived',
  'consulted',
  'treated',
  'paid',
  'lost',
] as const;
export type ConversionStage = (typeof CONVERSION_STAGES)[number];

export const VARIANT_PLATFORMS = [
  'toutiao_article',
  'douyin_script',
  'douyin_image_text',
  'wechat_mp',
  'zhihu',
  'xiaohongshu',
  'baijiahao',
  'souhu',
] as const;
export type VariantPlatform = (typeof VARIANT_PLATFORMS)[number];

export const PUBLISH_TASK_STATUSES = [
  'pending',
  'dispatched',
  'published',
  'skipped',
  'failed',
] as const;
export type PublishTaskStatus = (typeof PUBLISH_TASK_STATUSES)[number];
