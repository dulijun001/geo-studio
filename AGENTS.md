# GEO Studio — Agent Entry Point

> **此文件只是入口,所有项目规范、决策、当前状态都在 `CLAUDE.md`。**
> 读完这页后立刻打开 [CLAUDE.md](./CLAUDE.md) 再开始动手。

---

## 一、读 CLAUDE.md 前也必须遵守的硬约束

这些是被踩过的雷,不读 CLAUDE.md 也别违反:

1. **不要自动 `git push`**,等用户明确说"push"再推
2. **Migration 一律手写**,放 `supabase/migrations/`,文件名 `00NN_<name>.sql`,绝不跑 `pnpm db:generate`(D19,journal 自 0006 起冻结)
3. **关键决策先入 CLAUDE.md 或 `docs/adr/`,再动代码** — 不许"边做边定"
4. **数据模型变更必须带 `tenant_id` + RLS policy**(D1)
5. **失败两次就停下来汇报**(用户协作规则 #10),不要第三次重试
6. **不写 `if (industry === 'dental')`** — 首客户业务全部配置化(D2)
7. **不存储员工的头条/抖音登录凭证**(D9)
8. **发布不自动化提交到平台 App**(D3)

## 二、项目元数据(给冷启动的 agent)

- **产品**:多租户生成式引擎优化(GEO)全链路平台,首客户口腔医院,后期 SaaS
- **技术栈**:Next.js 14 App Router + Supabase(自托管阿里云国内)+ Playwright Worker + Drizzle ORM + pgvector
- **目录**:`apps/web` `apps/worker` `packages/{db,geo-core,shared}` `supabase/migrations` `docs`
- **生产**:`https://geo.dulijun.icu`(Caddy 自动 HTTPS,ECS root@47.98.131.138)
- **DB migrations**:在 `supabase/migrations/`,**不在** `packages/db/migrations/`(CLAUDE.md 第四节目录树有误,以实际为准)

## 三、当前状态摘要(简版,详情看 CLAUDE.md 第九节)

- **HEAD 已上生产**:V1.9.3(2026-05-13),员工端 7 平台跳转 + D21 GEO 标准内容资产全套
- **写作流水线**:`query_intent → content_contract → writing_template × platform_style`(D21)
- **合规四道门**:关键词黑名单 + LLM 语义 + 历史案例匹配 + 高/中风险人工审批(D5/D12)
- **公开层(Layer A)**:Schema.org JSON-LD + llms.txt + AI Feed + AI Sitemap,按 tenant opt-in(D15)
- **P0 阻塞**:web 端可观测性未接通(`reportError` 0 调用);`NEXT_PUBLIC_APP_URL` 还是 IP 待 rebuild
- **临时债务**:`/login/quick` 账号密码登录,deadline **2026-06-30** 替换

---

→ **现在打开 [CLAUDE.md](./CLAUDE.md) 继续。**
