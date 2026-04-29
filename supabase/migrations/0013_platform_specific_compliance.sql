-- 0013_platform_specific_compliance: 平台差异化合规 — 不同平台不同红线.
--
-- 现状:全平台用同一套关键词词典.结果是:
--   - 抖音对医美/瘦脸针/水光针 类硬禁,但词典里只有"无痛"等通用绝对化用语
--   - 小红书对"私信购买/限时优惠/扫码加微信" 销售话术敏感,但通用词典抓不到
--   - 头条号容忍度高一些,绝对化误抓会让通过率下降
--
-- 这次:
--   1. compliance_keywords 加 platforms TEXT[] 列(null/空 = 全平台,有值 = 限定)
--   2. 种入 ~20 条平台专属红线
--   3. 应用层(compliance-review worker)按 variant.platform 过滤
--
-- 数据来源:
--   - 抖音《医疗类内容创作发布规范》2024 版
--   - 小红书《医疗机构号管理规范》
--   - 头条号《医疗健康内容生态规则》

ALTER TABLE compliance_keywords
  ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS compliance_keywords_platforms_idx
  ON compliance_keywords USING GIN (platforms) WHERE deleted_at IS NULL;

COMMENT ON COLUMN compliance_keywords.platforms IS
  '空数组 = 适用所有平台.有值时只对这些 platform 的变体生效.';

-- ───────────────────────────────────────────────────────────────────────
-- 平台专属种子(tenant_id IS NULL = 全租户共享)
-- ───────────────────────────────────────────────────────────────────────

INSERT INTO compliance_keywords (tenant_id, term, level, category, variants, platforms) VALUES
  -- 抖音 — 医美 / 整形 / 注射类硬禁(douyin_script + 视频化)
  (NULL, '瘦脸针', 'A', 'douyin_medical_aesthetic', '{}', ARRAY['douyin_script']),
  (NULL, '水光针', 'A', 'douyin_medical_aesthetic', '{}', ARRAY['douyin_script']),
  (NULL, '玻尿酸', 'A', 'douyin_medical_aesthetic', '{}', ARRAY['douyin_script']),
  (NULL, '热玛吉', 'A', 'douyin_medical_aesthetic', '{}', ARRAY['douyin_script']),
  (NULL, '埋线', 'A', 'douyin_medical_aesthetic', '{"埋 线"}', ARRAY['douyin_script']),
  (NULL, '假体', 'A', 'douyin_medical_aesthetic', '{}', ARRAY['douyin_script']),
  (NULL, '微整形', 'A', 'douyin_medical_aesthetic', '{"微 整形"}', ARRAY['douyin_script']),
  -- 抖音 — 直播话术红线
  (NULL, '现在下单', 'A', 'douyin_live_sales', '{"现 在 下 单"}', ARRAY['douyin_script']),
  (NULL, '抢购', 'B', 'douyin_live_sales', '{}', ARRAY['douyin_script']),

  -- 小红书 — 销售类话术
  (NULL, '私信咨询', 'B', 'xiaohongshu_sales', '{"私 信"}', ARRAY['xiaohongshu']),
  (NULL, '加微信', 'B', 'xiaohongshu_sales', ARRAY['加 微 信', '加我V', '+v'], ARRAY['xiaohongshu']),
  (NULL, '限时优惠', 'A', 'xiaohongshu_sales', '{"限 时"}', ARRAY['xiaohongshu']),
  (NULL, '到院礼包', 'B', 'xiaohongshu_sales', '{}', ARRAY['xiaohongshu']),
  (NULL, '扫码送', 'B', 'xiaohongshu_sales', '{}', ARRAY['xiaohongshu']),

  -- 知乎 — 软广检测严,要求"利益相关"声明,匿名禁止打广告
  (NULL, '匿名分享', 'B', 'zhihu_disclosure', '{"匿 名"}', ARRAY['zhihu']),
  (NULL, '亲身经历', 'B', 'zhihu_disclosure', '{"亲 身"}', ARRAY['zhihu']),

  -- 头条号 — 标题党 / 假诱导
  (NULL, '震惊!', 'B', 'toutiao_clickbait', '{"震 惊"}', ARRAY['toutiao_article']),
  (NULL, '炸裂', 'B', 'toutiao_clickbait', '{}', ARRAY['toutiao_article']),
  (NULL, '医生不敢告诉你', 'A', 'toutiao_clickbait', '{}', ARRAY['toutiao_article']),

  -- 公众号 — 比较温和,只要避开广告法即可,但"原创"声明造假是大问题
  (NULL, '本院数据显示', 'A', 'wechat_mp_falsedata', '{}', ARRAY['wechat_mp', 'baijiahao']),
  (NULL, '我院统计', 'A', 'wechat_mp_falsedata', '{}', ARRAY['wechat_mp', 'baijiahao'])
ON CONFLICT DO NOTHING;
