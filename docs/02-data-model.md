# 02 - 数据模型

## 核心设计原则

1. **每张业务表都有 `tenant_id`**,且启用 Postgres RLS
2. **软删除为主**(`deleted_at`),硬删除仅限合规要求场景
3. **所有金额字段用 `bigint`(单位:分)**,不用 float,避免精度问题
4. **所有时间用 `timestamptz`**,存 UTC,前端按时区渲染
5. **关键状态机字段用 enum**,不用魔法字符串
6. **所有表自带 `created_at`、`updated_at`**(Drizzle 中间件自动维护)

## 实体关系图(ER)

```
tenants ───┬──< brands ───┬──< staff_accounts ───┬──< publish_tasks
           │              │                      │
           │              ├──< content_items ────┤
           │              │                      │
           │              ├──< questions ─────┐  │
           │              │                   │  │
           │              └──< brand_vocab    │  │
           │                                  │  │
           │            geo_snapshots ────────┤  │
           │                    │             │  │
           │                    └──< citations┘  │
           │                         │           │
           │                         └──────────┤ (match)
           │                                     │
           └──< compliance_reviews              │
                                                 │
           conversion_events ─< hooks ──────────┘
           audit_logs (cross-cutting)
```

## 表定义(V1 核心)

### `tenants`(租户)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| name | text | 租户名(如"XX 口腔医院") |
| slug | text unique | URL 用(如 `xx-dental`) |
| industry | text | 行业枚举(`dental` / `medical_beauty` / `law` 等) |
| plan | text | 计费套餐(`trial` / `pro` / `enterprise`) |
| settings | jsonb | 租户级配置(合规词典 id、主题色、LOGO url 等) |
| deleted_at | timestamptz null | 软删除 |

### `brands`(品牌)
一个租户可以有多个品牌(连锁医院多门店)。V1 强制每个 tenant 至少 1 个 brand。
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | **RLS key** |
| name | text | 品牌名 |
| location | jsonb | `{ city, district, address, lat, lng }` |
| contact_phones | text[] | 电话池(用于电话钩子) |
| wecom_qr_url | text | 企微二维码(带 utm) |

### `staff_accounts`(员工账号矩阵节点)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| brand_id | uuid FK | |
| real_name | text | 员工实名(内部用,不对外) |
| role | text | 员工职能(`doctor` / `consultant` / `receptionist` / `marketing`) |
| persona | jsonb | 人设标签(`{ specialty: "正畸", tone: "专业亲和", avatar_style: "..." }`) |
| platforms | jsonb | 账号矩阵(`{ toutiao: { nickname, profile_url }, douyin: {...} }`) |
| status | text | `active` / `paused` / `offboarding`(员工离职状态) |
| auth_user_id | uuid FK → auth.users | 对应 Supabase Auth 用户 |

### `content_items`(原始内容)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| title | text | |
| source_type | text | `word` / `pdf` / `manual` / `url_import` |
| source_url | text | 原文件在 Storage 的路径 |
| markdown | text | 解析后的 markdown 正文 |
| topics | text[] | 话题标签(`["种植牙", "术后护理"]`) |
| target_questions | uuid[] | 这篇内容瞄准的问题(→ questions) |
| status | text | `draft` / `parsed` / `variant_generated` / `archived` |
| embedding | vector(1536) | 用于去重 + 相似召回 |

### `content_variants`(内容的平台变体)
一篇 `content_items` → N 篇 `content_variants`(头条号版、抖音脚本版、公众号版等)。
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| content_item_id | uuid FK | |
| platform | text | `toutiao_article` / `douyin_script` / `wechat_mp` / `zhihu` / `xiaohongshu` |
| title | text | 平台特化标题 |
| body | text | 平台特化正文/脚本 |
| cover_image_url | text | 封面图 |
| extra_assets | jsonb | 视频分镜、BGM、话题 # 等 |
| geo_tactics | text[] | 用了哪些 GEO 9 法(`["add_quotation", "add_statistics"]`) |
| compliance_status | text | `pending` / `auto_approved` / `manual_approved` / `rejected` |
| compliance_review_id | uuid FK → compliance_reviews | |
| status | text | `draft` / `approved` / `scheduled` / `dispatched` / `archived` |

### `publish_tasks`(发布任务,派给某员工的某个 variant)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| variant_id | uuid FK | |
| staff_account_id | uuid FK | |
| scheduled_at | timestamptz | 建议发布时段 |
| dispatched_at | timestamptz | 派发给员工的时间 |
| published_at | timestamptz | 员工打卡回执时间 |
| published_url | text | 员工回填的发布链接 |
| status | text | `pending` / `dispatched` / `published` / `skipped` / `failed` |
| skip_reason | text | 员工跳过的原因(选项化) |
| feedback | text | 员工主观反馈(限流?平台提示?) |

### `questions`(GEO 追踪问题库)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| brand_id | uuid FK null | null 表示租户级通用问题 |
| text | text | 问题原文(如"南京哪家口腔医院正畸好") |
| intent | text | `local_recommendation` / `price_inquiry` / `procedure_info` / `doctor_review` |
| city | text | 问题涉及的城市 |
| category | text | 科室/领域标签 |
| priority | int | 1-10(追踪频次权重) |
| embedding | vector(1536) | |
| active | bool | |

### `geo_snapshots`(一次追踪快照)
一次追踪 = 拿一个问题去问一个 AI 引擎,得到一次快照。
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| question_id | uuid FK | |
| engine | text | `doubao` / `yuanbao` / `quark` / `deepseek` / `kimi` / `chatgpt` |
| session_account_id | uuid FK → tracking_accounts | 用哪个追踪账号问的 |
| asked_at | timestamptz | |
| raw_response | text | AI 完整回答 |
| citation_urls | text[] | AI 给出的引用链接列表 |
| status | text | `pending` / `done` / `failed` / `rate_limited` |
| failure_reason | text | |

### `citations`(引用记录,解析后的结构化数据)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| snapshot_id | uuid FK | |
| brand_mentioned | bool | 品牌是否被提及 |
| mention_position | int | 在回答中的字符偏移 |
| mention_text | text | 被提及的原文片段 |
| matched_task_id | uuid FK → publish_tasks null | 关联到哪条发布 |
| match_confidence | float | 0-1,LLM 打分 |
| sentiment | text | `positive` / `neutral` / `negative` |

### `tracking_accounts`(追踪账号池)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| engine | text | |
| nickname | text | |
| credential_ref | text | 登录凭证存储引用(不存明文,存 Vault key) |
| daily_quota | int | 每天最多问多少次 |
| last_used_at | timestamptz | |
| status | text | `active` / `rate_limited` / `banned` |

**注意**:这是**平台维护的追踪账号**,不是客户的账号,也不是员工的账号。

### `brand_vocab`(品牌词典)
租户自定义的识别词,喂给 LLM 判断引用归属。
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| term | text | 词条(医院名、医生名、特色服务名、地标别名) |
| term_type | text | `brand` / `doctor` / `service` / `location_alias` |
| aliases | text[] | 别名 / 错别字 |

### `compliance_reviews`(合规审查记录)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| target_type | text | `content_variant` |
| target_id | uuid | |
| stage | text | `keyword` / `llm` / `manual` |
| verdict | text | `pass` / `warn` / `reject` |
| risk_level | text | `low` / `medium` / `high` |
| findings | jsonb | 具体违规点清单 |
| reviewer_id | uuid null | 人工审核时的 user id |
| llm_response_raw | text | LLM 原始输出(留证) |

### `hooks`(转化归因钩子)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| publish_task_id | uuid FK | |
| hook_type | text | `doctor_name` / `activity_code` / `phone_tail` / `utm_qrcode` |
| hook_value | text | 具体值(医生名、暗号文本、电话号码、utm 参数) |
| valid_until | timestamptz | 钩子有效期 |

### `conversion_events`(转化事件)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| hook_id | uuid FK null | null = 归因失败 |
| stage | text | `arrived` / `consulted` / `treated` / `paid` |
| stage_at | timestamptz | |
| amount_cents | bigint | 当阶段涉及的金额(分) |
| patient_ref | text | 匿名患者标识(不存 PII) |
| notes | text | |

### `audit_logs`(跨切面审计)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| actor_user_id | uuid | 谁做的 |
| action | text | 如 `compliance.manual_approve` / `content.delete` |
| target_type | text | |
| target_id | uuid | |
| payload | jsonb | diff 或变更前后快照 |
| ip | inet | |
| user_agent | text | |

## RLS 策略(核心)

每张业务表基本的 policy:

```sql
-- 读:当前用户必须是该 tenant 的成员
CREATE POLICY "tenant_read"
ON <table> FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_memberships
    WHERE user_id = auth.uid()
  )
);

-- 写:同上 + 角色校验
CREATE POLICY "tenant_write"
ON <table> FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_memberships
    WHERE user_id = auth.uid() AND role IN ('admin', 'operator')
  )
);
```

**员工移动端**走独立 policy:
```sql
-- 员工只能看到自己的任务
CREATE POLICY "staff_own_tasks"
ON publish_tasks FOR SELECT
USING (
  staff_account_id IN (
    SELECT id FROM staff_accounts
    WHERE auth_user_id = auth.uid()
  )
);
```

## 关键索引

```sql
CREATE INDEX idx_content_items_tenant ON content_items(tenant_id, status);
CREATE INDEX idx_publish_tasks_staff_status ON publish_tasks(staff_account_id, status);
CREATE INDEX idx_publish_tasks_tenant_published ON publish_tasks(tenant_id, published_at DESC);
CREATE INDEX idx_geo_snapshots_question_time ON geo_snapshots(question_id, asked_at DESC);
CREATE INDEX idx_citations_matched_task ON citations(matched_task_id) WHERE matched_task_id IS NOT NULL;
CREATE INDEX idx_hooks_task ON hooks(publish_task_id);
CREATE INDEX idx_conversion_events_hook ON conversion_events(hook_id, stage);

-- 向量索引(pgvector HNSW,V2 启用)
CREATE INDEX idx_content_items_embedding
  ON content_items USING hnsw (embedding vector_cosine_ops);
```

## 状态机(关键流程)

### Content Variant 状态流
```
draft
  → pending_review(提交合规)
    → auto_approved(关键词+LLM 低风险)→ approved → scheduled → dispatched → archived
    → needs_manual(LLM 中/高风险)→ manual_approved → ... 同上
    → rejected(任一环节否决)
```

### Publish Task 状态流
```
pending(派单算法输出,未通知员工)
  → dispatched(推送到员工手机)
    → published(员工打卡回执)
    → skipped(员工主动跳过,记录原因)
    → failed(超过截止未打卡)
```

### GEO Snapshot 状态流
```
pending(入队)
  → running(Worker 拿走)
    → done(解析成功)
    → failed(Playwright 异常)
    → rate_limited(账号被限流,换号重试)
```

## 种子数据(Seed)

首个客户上线前必须预填:
1. **tenant**:1 个(口腔医院)
2. **brand**:1 个(主院区)
3. **staff_accounts**:40 条(excel 导入)
4. **brand_vocab**:医院名 + 别名 + 20-30 个医生名 + 特色服务名
5. **questions**:初版 200 条(人工精选 + LLM 生成)
6. **tracking_accounts**:5-10 个(豆包 3 + 元宝 3)
7. **compliance_keywords**:医疗广告法禁用词 + 行业惯用违规词(200+ 条)

## 不做(V1 明确排除)

- 多品牌切换的复杂权限(单租户单品牌先跑通)
- 内容的版本历史(`content_item_revisions`)——V2 加
- 员工之间的内容共享/点赞(V2+,先避免社交向偏离)
- 计费相关表(`plans` / `subscriptions` / `invoices`)——V3 商业化时加

---

## 附录:Migration 索引

> 每条 migration 的范围 + 引入物。回看时按这张表定位,不要一个个 `head` 文件。
> 命名约定:`NNNN_<scope>.sql`,scope 用语义化短语(`w5_dispatch` / `compliance_cases`)而非时间戳。

| # | 文件 | 范围 | 引入 / 修改 |
|---|---|---|---|
| 0000 | `0000_initial.sql` | V1 W1 baseline | 17 张核心表:`tenants`、`tenant_memberships`、`brands`、`staff_accounts`、`brand_vocab`、`content_items`、`content_variants`、`publish_tasks`、`citations`、`geo_snapshots`、`questions`、`tracking_accounts`、`compliance_keywords`、`compliance_reviews`、`conversion_events`、`hooks`、`audit_logs` + 全套基础 index |
| 0001 | `0001_rls_policies.sql` | V1 W1 RLS | 上述 17 表全部 `ENABLE` + `FORCE` row-level security + 多租户隔离策略(详见 ADR 001) |
| 0002 | `0002_tenant_bootstrap.sql` | V1 W2 注册流 | RPC `create_tenant_as_owner(slug, name, owner_user_id)` — 一次事务内创建 tenant + 写 owner membership,绕开 RLS 鸡蛋问题 |
| 0003 | `0003_content_storage.sql` | V1 W3 文件上传 | Storage bucket `content-uploads`(私有,50MB,docx/pdf/md/txt)+ 路径规约 `<tenant_id>/<content_item_id>.<ext>` + RLS |
| 0004 | `0004_w5_dispatch.sql` | V1 W5 派单 + 员工端 | `staff_invites` 表(phone passcode + HMAC,见 D11)+ `staff_accounts` 加 `phone`/`status` + `publish_tasks` 加 staff×scheduled 复合 index |
| 0005 | `0005_w6_tracking.sql` | V1 W6 GEO 解析升级 | `citations` 加 `mention_term`/`mention_type`/`vocab_id` 字段 + 配套 index(对齐 ADR 002 — 主信号改成品牌提及而非 URL) |
| 0006 | `0006_knowledge_base.sql` | V1.5 KB 内容工厂 | `knowledge_sources`(文件级 KB 索引)+ `content_citations`(变体↔KB 来源关联)+ `staff_accounts.platform_style` + `compliance_keywords.source_path` |
| 0007 | `0007_geo_snapshot_session_url.sql` | V1.6-2 追踪审计 | `geo_snapshots.session_url` — 追踪结果回链豆包会话,人工抽检用 |
| 0008 | `0008_staff_password.sql` | V1.6-3 自助设密 | `staff_accounts.password_hash` + `staff_invites.kind`(invite/reset)+ kind index |
| 0009 | `0009_geo_score.sql` | V1.6 9 法评分 | `content_variants.geo_score_total`/`geo_score_breakdown`(jsonb)+ score 排序 index |
| 0010 | `0010_verified_citations.sql` | V1.6 引用幻觉防护 | `verified_citations` 白名单表(每租户的可信引用源)+ `content_variants.citation_check_status` |
| 0011 | `0011_customer_journey.sql` | V1.6 多触点归因 | `customer_identities`(指纹/电话尾号合并身份)+ `journey_touchpoints`(每次接触事件)+ `conversion_events.identity_id` |
| 0012 | `0012_compliance_cases.sql` | V1.6 合规第三道门 | `compliance_cases`(历史违规罚单库,带向量)+ `content_variants.case_match_id`(命中追溯)— 实现 D12 第三道门 |
| 0013 | `0013_platform_specific_compliance.sql` | V1.6 合规作用域 | `compliance_keywords.platforms` text[](按平台限定关键词作用域)+ GIN index — 实现 D12 平台特定门 |

### Migration 编写约束

1. 改 `packages/db/src/schema/*.ts` 必同步 `pnpm db:generate`,**不在生产手改 schema**(D10)
2. 文件名前缀编号严格自增,Drizzle journal 自动维护
3. 加表必同步在 `0001_rls_policies.sql` 思路下补 RLS(已加表的后续 migration 自带 ENABLE + FORCE,不能漏)
4. 破坏性改动(rename/drop column)走两步走:先加新字段双写、灰度后再删,**不允许**单 migration 直接 drop
5. seed 脚本属一次性 dev tooling,放 `packages/db/src/_dev/`,不混入 migrations
