# ADR 001 — Row-Level Security 策略

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: 独立决策(按用户"按你的思路来"授权)
**Related**: CLAUDE.md D1、D2、D7、D9、D10

## 背景

GEO Studio 是多租户 SaaS,首客是医院(医疗行业合规敏感)。一旦租户 A 的用户能读到租户 B 的数据,等同于客户隐私泄露 + 监管问题 + 品牌崩塌。我们需要的不是「应用层记得加 WHERE tenant_id」,而是「数据库层即使应用代码写错也不会跨租户」。

Postgres 的 Row-Level Security(RLS)就是为此设计的。Supabase 也围绕 RLS 构建了整个 Auth → DB 的链路——每次请求带 JWT,JWT 里有 `sub`(user id),RLS policy 读 `auth.uid()` 做行级过滤。

本 ADR 定义我们的 RLS 策略。

## 核心设计

### 1. 角色模型

Postgres 角色层面:
- `anon`:未登录访客,默认无权读任何业务表
- `authenticated`:已登录用户,RLS policy 按 membership 过滤行
- `service_role`:Bypass RLS(用于 worker、管理任务、seed)
- `postgres`:Supabase 内部用,不应在应用里使用

应用角色层面(存在 `tenant_memberships.role`):
- `owner`:租户所有者,最高权限
- `admin`:管理员,与 owner 同权(除删除租户)
- `operator`:内容运营,可 CRUD 内容/派单
- `auditor`:法务/合规,只读 + 审批合规
- `staff`:员工(发布者),只能看自己任务

### 2. Helper 函数(SECURITY DEFINER)

直接在 policy 里写 `IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())` 会有两个问题:
1. **递归**:`tenant_memberships` 自己也有 RLS,policy 查自己会死循环
2. **性能**:每行每次 policy 检查都要子查询,N 行 N 次

解决:用 `SECURITY DEFINER` 函数绕过 RLS,返回当前用户所属的 tenant_id 集合。

定义三个 helper:

```sql
current_user_tenant_ids() -> SETOF uuid
current_user_has_tenant_role(tenant_id uuid, roles text[]) -> boolean
current_user_is_staff_for(staff_account_id uuid) -> boolean
```

所有 policy 通过这三个函数判断权限。

### 3. Policy 设计模式

按表的访问特征分四类:

#### 类 A:租户 scoped + 运营权限(大多数)
`brands`, `brand_vocab`, `content_items`, `content_variants`, `questions`, `compliance_reviews`, `hooks`, `conversion_events`

- SELECT:租户成员都能读
- INSERT/UPDATE/DELETE:`owner / admin / operator` 能写

#### 类 B:租户 scoped + 员工特殊访问
`staff_accounts`, `publish_tasks`

- **staff_accounts**:
  - SELECT:同租户成员能读 + 员工能读自己的
  - UPDATE:员工能改自己的 persona/platforms
  - INSERT/DELETE:`owner/admin` 专属
- **publish_tasks**:
  - SELECT:员工能看派给自己的;operator 能看所有
  - UPDATE(打卡):员工能改自己的 `published_at / published_url / feedback / skip_reason`
  - INSERT/DELETE:operator 专属(员工不能自建任务)

#### 类 C:租户 scoped + auditor 额外权限
`audit_logs`, `compliance_reviews`(部分)

- SELECT:`owner/admin/auditor` 能读
- INSERT:所有租户成员(记录自己的行为)
- UPDATE/DELETE:**禁止所有人**(审计日志不可变)

#### 类 D:全局 + 租户 scoped 双模式
`compliance_keywords`:`tenant_id IS NULL` 行是全局词典,所有人可读;`tenant_id NOT NULL` 行是租户自定义词,按租户 scoped。

- SELECT:`tenant_id IS NULL OR tenant_id IN (current_user_tenant_ids())`
- INSERT/UPDATE:全局词只有 service_role 能改;租户词 owner/admin 能改

#### 类 E:租户 scoped + 只读给 operator
`geo_snapshots`, `citations`, `tracking_accounts`

- SELECT:租户成员(tracking_accounts 例外:**完全不给客户读**,仅 service_role)
- 不允许客户端写,全部由 worker 用 service_role 插入

### 4. service_role 的边界

worker(Railway)持有 `SUPABASE_SERVICE_ROLE_KEY`,可以 bypass RLS。这是必要的——定时任务、Playwright 追踪、LLM 合规审查都需要跨租户写入。

但 web 应用**绝不持有 service_role_key**。所有用户请求走 `authenticated` 角色,全部被 RLS 过滤。Server Action 里如果确实需要跨租户(如平台管理员视图),必须通过独立的 admin API 路由,严格审计。

对应到环境变量:
- `SUPABASE_SERVICE_ROLE_KEY`:只注入 worker
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`:注入 web(客户端 + 服务端)

这条在 Railway/Vercel 的 secret 管理里强制隔离,不能图方便都塞一份。

### 5. 为什么不用 Supabase Auth Hook 写 JWT claims

Supabase 支持在 JWT 里嵌入 `app_metadata` 做授权,避免每次都查 `tenant_memberships`。但我们决定**不这么做**:

- JWT claim 需要用户重新登录才刷新,membership 变更有延迟
- 灵活性差,后期加新角色 / 临时降权 / 冻结用户 都不方便
- SECURITY DEFINER 函数 + 索引方案,实际开销 < 0.5 ms,业务量上不来前不需要优化

等日均查询到 100 万级别,再切到 JWT claim + Auth Hook refresh。

## 反例(我们明确不做的)

- ❌ 在代码里拼 `WHERE tenant_id = ?`(即使 RLS 已经 enable,应用层也会加,但它不是权威)
- ❌ 用 `postgres` 角色连 DB 做常规业务(它无视 RLS)
- ❌ 给 service_role_key 读 `web` 的任何代码路径
- ❌ 在 Edge Runtime 里用 service_role(Edge 错过请求生命周期审计不可控)

## 实施步骤

1. 写 `supabase/migrations/0001_rls_policies.sql`:helper 函数 + ENABLE RLS + 所有 policy
2. 更新 `_journal.json` 加新 entry
3. `pnpm db:migrate` 部署
4. 写 `test-rls.ts` 做四项验证:
   - anon client 读 `tenants` 应返回 0 行
   - 未 membership 的 authenticated user 读空
   - 有 membership 的用户能读自己 tenant 的 content
   - 不能读另一 tenant 的 content(即使手动构造 tenant_id)
5. 任何失败 → 立刻修补 policy,不推进到 W2.2

## 变更管理

RLS policy 变更必须:
1. 走 drizzle migration(编号递增)
2. 提交 PR 时截图 Supabase SQL Editor 跑出的 `\d tables` + `\d+ pg_policies`
3. 上线前在 staging(未来会搭) 跑 `test-rls.ts` 全绿
4. 线上变更后 24 小时内不允许删除上一版 migration(可以快速回滚)

## 参考

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Postgres RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Drizzle RLS 讨论: https://orm.drizzle.team/docs/rls
