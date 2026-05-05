/**
 * Platform-style hints used by AI drafting / variant generation prompts.
 *
 * Single source of truth for the per-platform tone/format string injected
 * into LLM prompts. Two web actions previously kept their own copies that
 * drifted apart over time:
 *   - apps/web/app/t/[slug]/content/actions.ts (createAiDraft)
 *   - apps/web/app/t/[slug]/content/[id]/actions.ts (deriveDraftsToOtherPlatforms)
 * Both now import from here. Coverage is the full VARIANT_PLATFORMS set so
 * any new platform automatically requires a hint here (TS Record exhaustive).
 */

import type { VariantPlatform } from './enums';

export const PLATFORM_HINT: Record<VariantPlatform, string> = {
  toutiao_article:
    '头条号:资讯感开头 + 结构化小标题 + 数据/案例 + SEO 友好关键词。800-1500 字。',
  douyin_script:
    '抖音脚本:15 秒钩子 + 视觉化场景描述 + 单个核心信息 + CTA。提供分镜建议。',
  douyin_image_text:
    '抖音图文:抓人钩子开头 + 6-9 张图配套文字(每张 30-60 字)+ 末尾互动引导 + tag。350-600 字总文案。',
  wechat_mp:
    '公众号:故事化引入 + 专业内容 + 结尾引导关注/留言。1200-2000 字。',
  zhihu:
    '知乎:长文 + 权威引用 + 数据 + 逻辑解释 + 个人专业判断。1500-3000 字。',
  xiaohongshu:
    '小红书:痛点开头钩子 + 个人化叙事 + 列表分点 + 结尾问句引发评论。300-600 字。',
  baijiahao:
    '百家号:类似头条号,资讯感 + SEO 友好。800-1500 字。',
  souhu:
    '搜狐号:类似头条号,资讯感 + SEO 友好。800-1500 字。',
};
