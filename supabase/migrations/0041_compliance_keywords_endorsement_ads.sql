-- 0041 — compliance_keywords: 医生背书 + 变相医疗广告 高频话术拦截
--
-- P0-5 (新增决策, CLAUDE.md D33 见 migration 落库后更新):
-- V1.6 D5 第一道门关键词黑名单只盖了"硬禁词"(医美产品/虚假数据/绝对化用语),
-- 漏掉了软性违规高频话术:
--   1. 医生 X 年经验 / 接诊过 / 主刀 类个人背书 — 踩《广告法》第十六条
--   2. 提供专业的 X 服务 / 带来福音 / 口腔解决方案 — 踩《医务人员互联网健康
--      科普负面行为清单》第二条变相医疗广告
--
-- 2026-05-25 三篇内容审计(zhihu published / 中午新生 / 用户测试版)反复
-- 出现相同 pattern。本次基于实测样本归纳出 8 条 substring + 33 variants。
--
-- 设计纪律:
--   - scanner.ts 是纯 substring 匹配(indexOf),不是 regex — 所以无法用
--     "\d+年经验"通用 pattern,只能列穷举 variants;
--   - tenant_id=NULL = 全租户生效(医疗合规跨租户红线相同);
--   - A 级 = 直接 reject (硬禁套话);B 级 = warn → 触发 stage-2 LLM 复审。
--   - 漏检兜底: B 级命中触发 LLM 第二道门, 由 LLM 在更宽 pattern 上判断。

INSERT INTO compliance_keywords (tenant_id, term, level, category, variants, platforms) VALUES
  -- ───── A 级 (直接拒): 医疗广告高强度套话,几乎无非广告用例 ─────
  (NULL, '带来福音', 'A', 'hidden-ad',
    ARRAY['给患者带来福音','为患者带来福音','给缺牙人群带来福音','为缺牙人群带来福音','为患者朋友带来福音','给您带来福音']::text[],
    ARRAY[]::text[]),

  -- ───── B 级 (warn → LLM): 命中后触发 stage-2 LLM 复审 ─────
  -- 个人背书类 (4 条 / 19 variants)
  (NULL, '接诊过', 'B', 'endorsement-doctor',
    ARRAY['接诊很多','接诊数千','接诊数百','接诊数十','累计接诊','已接诊','曾接诊']::text[],
    ARRAY[]::text[]),
  (NULL, '年种植经验', 'B', 'endorsement-doctor',
    ARRAY['年正畸经验','年儿牙经验','年口腔种植经验','年正畸临床经验','年儿童牙科经验','年牙周经验']::text[],
    ARRAY[]::text[]),
  (NULL, '年临床经验', 'B', 'endorsement-doctor',
    ARRAY['年从业经验','年从医经验','年临床工作','年医师工作','年口腔临床']::text[],
    ARRAY[]::text[]),
  (NULL, '主刀完成', 'B', 'endorsement-doctor',
    ARRAY['独立主刀','主刀手术','累计主刀','亲自主刀']::text[],
    ARRAY[]::text[]),

  -- 变相广告类 (2 条 / 10 variants)
  (NULL, '提供专业的', 'B', 'hidden-ad',
    ARRAY['提供专业的种植牙服务','提供专业的正畸服务','提供专业的口腔服务','提供专业的儿牙服务','提供专业的种植服务','提供专业的修复服务']::text[],
    ARRAY[]::text[]),
  -- 不带"专业的"修饰的常见话术变体(2026-05-25 实测漏检补充)
  (NULL, '提供种植牙服务', 'B', 'hidden-ad',
    ARRAY['提供种植服务','提供正畸服务','提供口腔服务','提供儿牙服务','提供修复服务','提供牙周服务']::text[],
    ARRAY[]::text[]),
  (NULL, '口腔解决方案', 'B', 'hidden-ad',
    ARRAY['牙齿解决方案','缺牙解决方案','种植解决方案','口腔健康解决方案','正畸解决方案']::text[],
    ARRAY[]::text[]);
