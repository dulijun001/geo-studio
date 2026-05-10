# V1.7-1.9 生产部署清单

> 最后更新:2026-05-07。本地 main 分支,**远端 47.98.131.138:9443 未含以下任何变更**。

## 一、Git 状态(必读)

**本地未提交**:V1.9 全套(批量起草 + 引用源发现 + 问题库)+ V1.7/V1.8 修复都还在工作树里,还没 commit。

**部署前必做**:
1. 把当前修改分批 commit 成有意义的 PR-like 单位(参见下方分组)
2. push 到远端
3. 服务器 pull + 重启

## 二、文件改动分组(用于 commit 切分)

### A. V1.9 批量起草(commit 1)
- `supabase/migrations/0028_draft_batches.sql` (新)
- `apps/web/lib/ai-draft-core.ts` (新,从 content/actions.ts 抽出的 RAG+LLM 核心)
- `apps/web/lib/pgboss.ts` (新,web 的 PgBoss 单例 + 自愈)
- `apps/web/app/api/internal/ai-draft/route.ts` (新)
- `apps/web/app/t/[slug]/content/batch/` (新页 + actions + 进度子页)
- `apps/web/app/t/[slug]/content/page.tsx` (改:加批量入口按钮)
- `apps/web/app/t/[slug]/content/actions.ts` (改:createAiDraft 瘦身为 thin wrapper)
- `apps/web/app/t/[slug]/content/[id]/actions.ts` (改:用 ARK_MODEL_FAST)
- `apps/worker/src/jobs/batch-draft-item.ts` (新)
- `apps/worker/src/lib/boss-ref.ts` (新,worker 内部共享 boss)
- `apps/worker/src/index.ts` (改:setSharedBoss + max=3)
- `apps/worker/src/jobs/index.ts` (改:注册 batch_draft_item)
- `apps/worker/package.json` (改:dev 加 .env.local)
- `packages/geo-core/src/generation/generator.ts` (改:用 ARK_MODEL_FAST)

### B. V1.9 引用源发现(commit 2)
- `apps/web/app/t/[slug]/citations/discover/` (新)
- `apps/web/app/t/[slug]/citations/page.tsx` (改:加发现入口)

### C. V1.9 问题库 UI(commit 3)
- `apps/web/app/t/[slug]/questions/` (新:page + ui + actions + types)
- `apps/web/app/t/[slug]/layout.tsx` (改:导航加问题库)

### D. V1.9 修复 + 配置(commit 4)
- `apps/web/package.json` (改:dev port 钉死 3001)
- `.env`(改:加 DRAFT_INTERNAL_SECRET + ARK_MODEL_FAST,**不入仓**,生产单独配)
- `apps/web/lib/ai-draft-core.ts`(改:SYSTEM_PROMPT 加反例 + 自检 + 90s 文案修正)

## 三、生产环境必须配置的 env 变量(新增)

```bash
# 必填(否则批量起草链路爆 401)
DRAFT_INTERNAL_SECRET=<生成新的 64-char hex,不要复用 dev 的>

# 必填(否则全部 LLM 走推理模型,2-3 min/篇 → 整套 timeout)
ARK_MODEL_FAST=doubao-1-5-pro-32k-250115

# 已有(跳过)
ARK_MODEL_PRO=ep-m-...  # 保持现有推理 endpoint,合规审查用
NEXT_PUBLIC_APP_URL=https://your-prod-domain  # 不能是 localhost
```

## 四、DB migrations 必跑(按顺序)

服务器 DB 当前应该停在 0027 之前(具体看 `supabase_migrations.schema_migrations`)。需要补跑:

```bash
psql $DATABASE_URL --single-transaction -f supabase/migrations/0024_writing_templates_and_keywords.sql
psql $DATABASE_URL --single-transaction -f supabase/migrations/0025_numeric_fact_check.sql
psql $DATABASE_URL --single-transaction -f supabase/migrations/0026_brand_service_areas.sql
psql $DATABASE_URL --single-transaction -f supabase/migrations/0027_kb_multitenancy_and_observability.sql
psql $DATABASE_URL --single-transaction -f supabase/migrations/0028_draft_batches.sql
```

⚠️ **D19 决策**:不跑 `pnpm db:generate`(journal 已冻结),只手动 psql apply。

## 五、部署后验证清单

按顺序点:

1. **公开层**(无需登录)
   - `https://prod/c/<slug>/llms.txt` → 200 OK + 内容
   - `https://prod/c/<slug>/ai-content-feed.json` → 200 OK + JSON
   - `https://prod/c/<slug>/ai-sitemap.xml` → 200 OK + XML

2. **登录后台**
   - 左侧导航看到 **问题库** + **写作要求** + **关键词** + **引用源** + **可发现层**
   - **问题库**点开能看到 questions 数据
   - **引用源**点开 → 右上角 **🔍 自动发现** → 输入主题 → 候选返回(LLM 链路通)

3. **批量起草链路**
   - **内容**页右上角看到紫色 **⚡ 今日批量生成**
   - 点开选 1 题 × 1 平台 → 提交
   - 进度页 1-2 分钟后 → 1 succeeded
   - 点「查看 →」能跳到主稿详情

4. **派单链路**
   - 主稿生成后,worker 自动级联 variant_generate
   - **派单**页能看到新的可派任务

## 六、回滚策略

如果出问题:

- **代码回滚**:`git revert <commit>` + push + 服务器 pull + 重启
- **DB 回滚**:0028 是新增表,可以直接 `DROP TABLE draft_batches CASCADE; DROP TABLE draft_batch_items CASCADE;`(不影响其他数据)
- **env 回滚**:删除 `DRAFT_INTERNAL_SECRET` 和 `ARK_MODEL_FAST`,旧链路降级为推理模型(慢但工作)

## 七、不在本次部署范围

- Sentry/Axiom 接入(#14)
- 30 员工 × 3 平台数据补全(#11)
- 真实客户 UAT(#15)
- console.log → logger 全量迁移(#16)

这些是部署后跟进项。
