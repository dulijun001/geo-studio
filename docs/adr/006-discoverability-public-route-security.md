# ADR 006 — 可发现层公开路由安全审查 Checklist

**Status**: Accepted
**Date**: 2026-05-01
**Deciders**: 根据 ADR 005 + S3 实测结论
**Related**: ADR 005 (Discoverability Layer 决策); D15-D18

## 背景

V1.7 引入了 V1 阶段第一批**对外公开 HTTP 路由**:
- `/c/[slug]/llms.txt`
- `/c/[slug]/llms-full.txt`
- `/c/[slug]/ai-content-feed.json`
- `/c/[slug]/ai-sitemap.xml`

之前所有路由都在 admin (auth-gated) 或 staff (HMAC cookie) 后面。S3 在实测时已经撞到一个**关键 hydration cache bug**(`unstable_noStore` 缺失导致 opt-out 切换 30 秒延迟生效),修了。这份 ADR 把所有公开路由的安全护栏过一遍 OWASP Top 10,留作后续审计参考。

## 决策

公开路由必须按以下 checklist 部署。任何新增的对外路由也必须照搬这套护栏。

## OWASP Top 10 覆盖

### A01 — Broken Access Control
**风险**:租户 A 的数据被请求者按租户 B 的 slug 拿到 / 公开开关失效仍可读
**护栏**:
- [x] 路由层 `resolvePublicTenant(slug)` 严格按 slug 查租户,且必须 `tenants.settings.discoverability.public_enabled === true` 才返回数据,否则 404
- [x] 不区分"不存在"和"未开启"——统一返 404,**不暴露租户存在性**(D15)
- [x] 数据来源是 `discoverability_artifacts` 表,worker 层已应用 D16 双闸过滤(`geo_visible=true` + testimonials `compliance_status='approved'`)。路由层只读物化结果,无法被绕过到原始表
- [x] `unstable_noStore()` 在 `resolvePublicTenant` + `readArtifact` 强制声明,Next 14 Data Cache 不会返回过期的 opt-in 状态
- [x] 服务-role 客户端 (`getSupabaseServiceClient`) 仅在路由文件 + worker 文件内 import,不会被 client bundle 泄露(`'server-only'` 标记可在 V1.8 补)

### A02 — Cryptographic Failures
**风险**:敏感数据明文传输 / 存储
**护栏**:
- [x] artifacts 内容不含 PII(testimonials 有强制的 author_pseudonym + 无姓名 / 手机 / 身份证字段;DB 有 trigger 校验)
- [x] verified_credentials 中的 license_number 是公开监管数据库可查的,本身不属敏感(医师执照是公示信息)
- [x] HTTPS 终止在 Caddy 9443(IP 阶段先 HTTP,备案后切 Let's Encrypt)
- [N/A] 无登录态、无 token、无 cookie

### A03 — Injection
**风险**:SQL 注入 / Path traversal / XSS
**护栏**:
- [x] **slug 严格 regex**:`^[a-z][a-z0-9-]{2,39}$`。拒绝大写、特殊字符、`..`、空、超长——首道门
- [x] 所有 DB 查询用 `@supabase/supabase-js` 链式 builder,**SQL 100% 参数化**(无字符串拼接)
- [x] artifact 内容是文本 / JSON / XML,不在 HTML 上下文渲染——**无 XSS 表面**
- [x] sitemap.xml 对每个 `<loc>` 用 `escapeXml()` 转义 5 个 XML 特殊字符(已在生成器测试覆盖)

### A04 — Insecure Design
**风险**:协议本身有漏洞
**护栏**:
- [x] **opt-in 默认关闭** — 所有租户初始 `public_enabled=false`(0020 migration 设)。客户主动开,而非客户得想到关
- [x] 双闸模型(D16):geo_visible flag + 合规状态。即使代码绕过,DB trigger(0018)兜底
- [x] D17 build-on-write — 公开路由读物化 cache,worker 层是唯一写入路径,边界清晰

### A05 — Security Misconfiguration
**风险**:HTTP 头不严 / 未删 debug 信息 / CORS 过宽
**护栏**:
- [x] `X-Robots-Tag: noindex` —— 我们要 AI 爬虫读取,但**不要**Google / 百度等通用搜索引擎索引这些路由(原始内容应通过客户官网索引)
- [x] `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`(llms.txt 等)/ `s-maxage=900`(feed.json)
- [x] `ETag: "<sha256>"` + `If-None-Match` → 304:省带宽 + 抵御扫库
- [x] `Access-Control-Allow-Origin: *`(仅 feed.json):允许 LLM 客户端跨域 fetch,内容已是公开数据,合理
- [x] 没有 `X-Powered-By` 暴露(Next 14 默认含,**V1.8 可加 next.config 移除**)
- [x] 错误响应不带 stack trace(Next 14 prod 默认行为)

### A06 — Vulnerable & Outdated Components
**风险**:依赖库有 CVE
**护栏**:
- [x] V1.7 没引入新依赖。所有功能用现有 `@supabase/supabase-js` / `pg-boss` / `next/server`
- [ ] **TODO V1.8**:加 `pnpm audit` 到 CI,定期扫漏洞

### A07 — Identification & Authentication Failures
**风险**:绕过身份校验
**护栏**:
- [N/A] 公开路由本就**不要求** authentication(豆包 / 元宝爬虫无 cookie / token)
- [x] 但是**不暴露任何 admin 端的能力**——服务-role 仅做受限读取,所有写都通过 worker job(可审计 enqueue 来源)

### A08 — Software & Data Integrity Failures
**风险**:第三方供应链 / 包篡改
**护栏**:
- [x] 依赖锁定 `pnpm-lock.yaml`
- [N/A] 无外部 webhook 接收
- [N/A] artifact 不签名(数据本就公开,签名增加复杂度无收益)

### A09 — Security Logging & Monitoring Failures
**风险**:被扫库 / 数据被 enumeration 时无可观测信号
**护栏**:
- [x] **rate-limit** 每 (IP × slug) 60/min,超限返 429 + Retry-After。超限事件目前打 `console.log`,V1.8 可接 Axiom
- [ ] **TODO V1.8**:公开路由命中写 `audit_logs`(异步,不阻塞响应),便于事后 forensic 分析
- [ ] **TODO V1.8**:疑似扫库 pattern(同 IP 在 < 1 分钟内尝试 10+ 不同 slug)的告警

### A10 — Server-Side Request Forgery (SSRF)
**风险**:用户可控数据被路由用作 outbound 请求 URL
**护栏**:
- [N/A] 公开路由**纯读 DB,无 outbound 调用**

## 部署前 checklist

- [ ] 在 ECS 上把 `public_enabled` 设回 false(部署完默认全关,客户单独开)
- [ ] 验证 4 条公开路由在 prod 第一次 cold hit 都返回 404(no opt-in tenant)
- [ ] 把使用手册 `/help#discoverability` 加一段告诉客户:这套公开 URL 的内容、用途、风险、关闭方式
- [ ] 跑一次 `db:test-discoverability` + `db:test-schema` + `db:test-artifacts` + `db:test-uniqueness` 全绿

## 已知限制(V1.7 → V2)

1. **rate-limit 是 in-memory + per-process** — 单 ECS 实例工作,多副本部署需要切到 Postgres 或 Redis 后端
2. **审计日志缺失** — 公开路由命中目前不写 audit_logs,V1.8 补上(数据量评估:每 tenant 每 minute 60 hits × 1KB log = 86MB/day/tenant,Postgres 撑得住)
3. **没有 IP 白 / 黑名单** — 攻击者用住宅 IP 池可绕开 rate-limit。豆包 / 元宝 真实爬虫的 IP 段也无法 verify(没公开 IP 列表)
4. **slug enumeration** — 非 dictionary 字典攻击难以拿到我们的 tenant slugs(404 不暴露存在性 + slug 内容由客户自定义),低风险但记录
