# 06 — Discoverability Layer(可发现层)

> 让本品牌的内容、医生、服务、客户见证、FAQ 在 AI 引擎(豆包/元宝/ChatGPT/Perplexity)的索引侧被结构化地"看懂"。这是 V1 阶段我们的最大空白。

## 一、GEO 三层模型

读完两个对标项目(AIGEOTOOLS, Laravel aigeo)后归纳出来:

```
┌──────────────────────────────────────────────────────────────┐
│  C. 验证 / 优化层(我们已强)                                  │
│     • 多引擎 Playwright 真实抓取(D4)                          │
│     • SOV 8 周热力图、单内容 ROI                                │
│     • 三模型客户旅程归因(D6)                                   │
└──────────────────────────────────────────────────────────────┘
                      ↑
                      │ 反馈
                      │
┌──────────────────────────────────────────────────────────────┐
│  B. 生产层(我们中上)                                         │
│     • AI 起草 / 9 法评分 / KB / 引用守卫                        │
│     • 计划补强:内容独特性检测 + E-E-A-T 4 维度                   │
└──────────────────────────────────────────────────────────────┘
                      ↑
                      │ 喂数据
                      │
┌──────────────────────────────────────────────────────────────┐
│  A. 可发现层(本文档,我们 V1.7 新增)                          │
│     • Schema.org JSON-LD 生成(5 类)                           │
│     • llms.txt / llms-full.txt(LLM 爬虫导航协议)               │
│     • AI Content Feed(LLM 友好聚合 JSON)                       │
│     • AI Sitemap(XML 变体)                                     │
│     • Discoverability Audit(分维度评分 + 阈值)                  │
└──────────────────────────────────────────────────────────────┘
```

A 是 B + C 的上游:内容再好,AI 引擎索引侧读不懂结构,生成答案时就跳过你。

## 二、决策一览(不重复 ADR)

| # | 决策 | 详见 |
|---|---|---|
| D14 | 增加可发现层(Layer A),覆盖 Schema.org / llms.txt / AI Feed / Sitemap / Audit | ADR 005 |
| D15 | 公开路由按 tenant 显式 opt-in(`tenants.settings.discoverability.public_enabled`) | 本文 §五 |
| D16 | 公开路由内容过滤:仅 `geo_visible=true` 的实体 + testimonial 必须 `compliance_status=approved` | 本文 §五 |
| D17 | 缓存策略:build-on-write,artifacts 表存物化结果,公开路由单行读 | 本文 §六 |
| D18 | Schema 生成纪律:只填有值字段,不用 placeholder 凑数(gaming 招致惩罚) | 本文 §三 |

## 三、要做什么(对照两个对标项目的取舍)

### 从 Laravel aigeo 借鉴(全做)
- ✅ Schema.org JSON-LD 生成器(他们 5 类,我们映射到医疗本地服务:**MedicalBusiness / Physician / MedicalProcedure / Review / FAQPage / BreadcrumbList / Organization**)
- ✅ `llms.txt` + `llms-full.txt` 自动生成
- ✅ AI Content Feed(`/api/feed/[slug].json`)
- ✅ AI Sitemap(`/api/ai-sitemap/[slug].xml`)
- ✅ Discoverability Audit(分维度评分 + 阈值)
- ✅ `HasGeoProfile` 模式 → 我们用 TS interface `GeoProfile` 替代 Laravel trait

### 从 AIGEOTOOLS 借鉴(B 层补强)
- ✅ 内容独特性检测(Jaccard 词级 40% + 结构 30% + 关键信息 30%,> 0.7 触发自动改写)
- ✅ E-E-A-T 4 维度对齐 9 法(命名 + UI 标签,scorer 不动)

### 明确**不抄**的
- ❌ Streamlit Tab 化 UI(单用户工具形态,不适合多租户 SaaS)
- ❌ GitHub publisher / 自动平台同步(撞 D3 决策)
- ❌ 关键词匹配 RAG(我们 pgvector 更先进)
- ❌ 多 Provider 全接(我们维持豆包主 + OpenAI 兜底)

## 四、数据模型 diff

### 扩列(已存在表)
- `brands`
  - `location` JSONB:已含 `{city, district, address, lat, lng}`,**追加** `{neighborhood, postal_code, country, region}`
  - 新增 `medical_specialties` `text[]` — schema.org `medicalSpecialty`
  - 新增 `business_hours` `jsonb` — schema.org `openingHoursSpecification`
  - 新增 `website_url` `text` — 客户网站(可空,空时用我们提供的 subdomain)
  - 新增 `social_urls` `jsonb` — `{wechat_mp, weibo, douyin, ...}`
  - 新增 `description_md` `text` — 长描述(用于 llms-full.txt + Organization schema)
  - 新增 `verified_credentials` `jsonb` — `{licenses: [...], accreditations: [...]}`,JCI/三甲等
- `staff_accounts`
  - 新增 `geo_profile_visible` `boolean default false` — 该医生是否进 schema/feed/llms.txt
  - 新增 `credentials` `jsonb` — `{license_number, board_certifications: [...], specialties: [...], experience_years, education: [...]}`(对应 schema.org `Physician`)

### 新表(每个都带 RLS)
- `services` — 治疗 / 项目目录
  - id / tenant_id / brand_id / name / description_md / price_range jsonb / duration_minutes / medical_procedure_code(SNOMED 或自定义) / category / geo_visible / 标准时间戳
- `testimonials` — 客户见证
  - id / tenant_id / brand_id / service_id(可空)/ author_pseudonym / body / rating(1-5)/ attested_at / **`compliance_status`(走四道门)** / geo_visible / 标准时间戳
  - 默认 `geo_visible=false`,合规通过后管理员显式开启
- `faqs` — FAQ 条目
  - id / tenant_id / brand_id(可空)/ question / answer_md / category / geo_visible / 标准时间戳

### 新表(基础设施)
- `discoverability_artifacts` — 物化产物缓存
  - id / tenant_id / artifact_type(`'llms_txt' | 'llms_full' | 'feed_json' | 'sitemap_xml'`)/ content text / etag / generated_at / 标准时间戳
  - 唯一索引 `(tenant_id, artifact_type)`

### tenants.settings 扩展
```jsonc
{
  // 已有字段不动 ...
  "discoverability": {
    "public_enabled": false,            // V1 默认关,客户主动开
    "public_slug": "demo-dental",       // 公开访问的 slug,默认等于 tenants.slug
    "llms_txt_overrides": "...",        // 管理员手动追加段落
    "thresholds": {
      "min_description_words": 150,
      "min_reviews_for_signal": 10,
      "min_rating_for_signal": 4.0,
      "min_business_hours_completeness": 0.8
    }
  }
}
```

### Migration 编号(本期工单)
| # | 文件名 | 内容 |
|---|---|---|
| 0015 | `0015_brand_discoverability.sql` | brands 扩列 |
| 0016 | `0016_staff_geo_profile.sql` | staff_accounts.geo_profile_visible + credentials |
| 0017 | `0017_services_table.sql` | services 表 + RLS |
| 0018 | `0018_testimonials_table.sql` | testimonials 表 + RLS + 四道门字段 |
| 0019 | `0019_faqs_table.sql` | faqs 表 + RLS |
| 0020 | `0020_tenant_discoverability_settings.sql` | tenants.settings.discoverability 默认值 + check |
| 0021 | `0021_discoverability_artifacts.sql` | artifacts 缓存表 |

> ⚠️ 同时需要修复 tenant_id FK 缺失的问题(已在 V1.6 通过 0014 修了 `tenant_memberships`),新表 0017-0019 的 `tenant_id` 必须显式 `REFERENCES tenants(id) ON DELETE CASCADE`(不再用残破的 `tenantFk()` helper)。这是 D10 的延续应用。

## 五、模块结构

```
packages/geo-core/src/discoverability/
├── index.ts
├── types.ts                # GeoProfile interface, EntityType enum
├── profile/
│   ├── index.ts
│   ├── brand.ts            # buildBrandProfile(brand) -> GeoProfile<'brand'>
│   ├── physician.ts        # buildPhysicianProfile(staff) (only when geo_profile_visible)
│   ├── service.ts
│   ├── testimonial.ts
│   ├── faq.ts
│   └── content.ts          # buildArticleProfile(content_item)
├── schema/
│   ├── index.ts
│   ├── builder.ts          # generic dispatcher: buildSchema(profile, type) -> JSON-LD
│   ├── medical-business.ts
│   ├── physician.ts
│   ├── medical-procedure.ts
│   ├── review.ts
│   ├── faq.ts
│   ├── breadcrumb.ts
│   └── organization.ts
├── llms-txt.ts             # generateLlmsTxt / generateLlmsTxtFull
├── feed.ts                 # generateContentFeed
├── sitemap.ts              # generateAiSitemap
└── audit.ts                # runDiscoverabilityAudit(tenant) -> 每实体维度评分
```

放在 `geo-core` 而不是 `apps/web` 下,因为可能要被 worker(定时重建 artifacts)和 web(实时预览) 共同消费。

## 六、公开路由 + 安全 + 缓存

### 路由清单(V1 第一次有对外公开 API!)

| 路径 | 内容 | 缓存 |
|---|---|---|
| `/api/llms.txt/[slug]` | 短版 llms.txt | s-maxage=3600,artifact 表读 |
| `/api/llms-full.txt/[slug]` | 完整版 | s-maxage=3600 |
| `/api/feed/[slug].json` | AI Content Feed | s-maxage=900 |
| `/api/ai-sitemap/[slug].xml` | AI 优先 sitemap | s-maxage=3600 |

> 未来可能加 subdomain mapping(`demo-dental.geo.studio/llms.txt` → 上面的路由),V1 先用 path-based 验证。

### 安全模型

1. **opt-in 闸门**:`tenants.settings.discoverability.public_enabled` 必须为 `true`,否则路由返 404(不返 403,避免暴露 tenant 存在性)。
2. **rate limit**:每 slug 每 IP 每分钟 60 次,超过返 429。用 pg-boss / pg `tenant_rate_limits` 表实现;Vercel edge 也可叠加。
3. **内容过滤双闸**:
   - 实体级 `geo_visible = true`
   - testimonials 额外要求 `compliance_status = 'approved'`(已通过四道门)
   - staff_accounts 要求 `status = 'active'`(请假 / 离职医生不公开)
4. **路由层用 service-role 客户端**(不走 RLS 的 anon),手动按 1+2+3 过滤——因为公开访客没有 user_id,RLS 跑不通。把责任挪到代码层,显式可审。
5. **审计日志**:每次公开访问写一条 `audit_logs` (low-cost 通过 worker 异步,不阻塞响应)。

### 缓存策略(build-on-write)

```
管理员保存 service/FAQ/testimonial 通过审核
   ↓
revalidatePath('/t/.../discoverability') 立即同步
   ↓
enqueue 'discoverability.regenerate' job(per tenant)
   ↓
Worker 跑 generateLlmsTxt + generateContentFeed + generateAiSitemap
   ↓
upsert into discoverability_artifacts (tenant_id, artifact_type, content)
   ↓
公开路由读这一张表(单行 SELECT,< 50ms)
```

兜底:每天凌晨 cron 强制重建一次,防止 webhook 丢失。

## 七、Sprint 计划(本期工单)

依赖图:
```
S0(架构) → S1(DB+GeoProfile) → S2(Schema) → S3(public routes) → S4(admin UI)
                                           └→ S5(B 组补强)─→ S6(集成审查)
```

### S0 — 架构 + ADR(0.5-1 天)
本文 + ADR-005 + 数据模型 diff。**当前进行中**。

### S1 — DB 基础 + GeoProfile 抽象(2-3 天)
- migrations 0015-0021(7 条)
- Drizzle schema 同步
- `discoverability/types.ts` GeoProfile interface
- 6 个 profile builder(brand / physician / service / testimonial / faq / content)
- `_test/discoverability.ts` 端到端冒烟

### S2 — Schema.org 生成器(2-3 天)
- 7 类 schema(medical-business / physician / medical-procedure / review / faq / breadcrumb / organization)
- 每类:输入 GeoProfile,输出合法 JSON-LD;单元测试覆盖必填 / 选填 / 不完整数据兜底
- SchemaBuilder 总分发器 `buildSchema(profile, type)`

### S3 — 公开路由 + 缓存(2-3 天)
- LlmsTxtGenerator / FeedGenerator / SitemapGenerator
- 4 条公开路由 + service-role + 双闸过滤
- rate-limit(`tenant_rate_limits` 表 + 中间件)
- `discoverability.regenerate` worker job + 物化到 artifacts 表
- 安全审查 checklist

### S4 — 管理员 UI(3-4 天)
- `/t/[slug]/discoverability` hub:
  - 顶部:audit 总评 + 4 个维度评分卡(完整度 / 时效性 / 合规率 / 公开开关)
  - llms.txt 预览 + 手动覆盖编辑器
  - feed.json 预览(JSON tree)
  - schema 预览(per entity)
- 4 个子模块 CRUD:
  - `/discoverability/services` — services 增删改查
  - `/discoverability/testimonials` — 创建走 compliance pipeline
  - `/discoverability/faqs` — FAQ 管理
  - `/discoverability/medical-business` — brand 扩展字段编辑
- staff_accounts 列表加 `geo_profile_visible` toggle 列

### S5 — 生产层补强(B 组)(2-3 天)
- b1 内容独特性检测(`packages/geo-core/src/generation/uniqueness.ts`)
  - Jaccard 词级(40%)+ 结构哈希(30%)+ 关键信息(30%)
  - 阈值 < 0.3 / > 0.7 / 中间警告
  - 集成到 variant-generate worker job:新变体生成后跑一次,> 0.7 自动 enqueue rescue 改写
- b2 E-E-A-T 4 维度命名对齐
  - `packages/geo-core/src/generation/eeat-mapping.ts`(纯命名映射)
  - 9 法重新挂到 4 维度下展示
  - UI 在 `/t/[slug]/content/[id]` 详情页和 rescue 页加维度标签
  - scorer 一行不动

### S6 — 集成 + 安全审查(1-2 天)
- 概览页加 discoverability 卡片(llms.txt 状态 / feed 健康 / schema 覆盖率 %)
- audit 总分加"可发现层"维度
- 安全审查:公开路由的所有路径过 OWASP top 10 checklist
- e2e 烟测(全 6 sprint 联动)
- 总打包 commit + 部署窗口规划

## 八、风险 + 反 over-engineering 边界

### 已识别风险
1. **公开路由 = 攻击面**:rate-limit + opt-in + 双闸内容过滤是必须做的,做完后比员工端的 phone+passcode 风险还低(后者有 OTP 撞库可能)。
2. **合规外溢**:testimonials / FAQ 公开前必须四道门通过。这是 D5 + D12 第一次扩展到非"内容变体"实体,合规 pipeline 要新增 `target_type='testimonial' | 'faq'`。
3. **llms.txt 不是保证信号**,只是社区标准。客户预期管理:**承诺让 AI 引擎"更容易看懂",不承诺"提升排名 X%"**。
4. **Schema 数据质量决定生死**:如果医院没填 address / specialties / hours,schema 就是空的——比错的 schema 更糟。审计页要显式告诉管理员"还差什么字段"。
5. **客户没自己网站怎么办**:V1 提供 `<slug>.geo.studio` 子域名 + 我们托管 llms.txt + feed,客户在自己微信小程序 / 公众号菜单挂"医院公开档案"链接到我们的子域名。备案下来后再考虑映射客户自有域名。
6. **数据 ETL 工作量**:首批 demo-dental 客户的 brand 扩列字段 / services / testimonials / FAQs 都需要手动补,**这部分工作量在 S4 UI 跑通后约 0.5-1 天客户协作**,不算开发工时。

### 边界:**不**做的
- ❌ 实时 AI 爬虫探测(如检测 ChatGPT 的 user-agent 给增强响应) — V2 再说
- ❌ Schema A/B 测试 — 没有足够流量验证
- ❌ 自动 Schema validator(只在 dev 环境跑 schema.org 校验,生产端不跑)
- ❌ llms.txt 的国际化变体(中文站只发中文版)

## 九、相关文档

- ADR 005:Discoverability Layer 决策记录(见 `docs/adr/005-discoverability-layer.md`)
- 02-data-model.md:扩列后追加附录(S1 完成时一起更新)
- 03-compliance.md:补 testimonials 走四道门的链路(S6 完成时一起更新)
- CLAUDE.md:增加 D14-D18 决策(S0 完成本文档同步加)
