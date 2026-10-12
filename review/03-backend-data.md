# 03-backend-data.md - 后端、数据库与架构审计

> 验收执行时间: 2026-10-11
> 审计模式: 只读本地系统与代码审计

---

## 1. 架构与模块划分、接口规范

[Medium] 知识库 (KB) 根路径存在全局单例硬编码，多租户逻辑穿透 | 已验证 | `docs/15-audit-2026-09-19.md` (P0项), `apps/web/lib/ai-draft-core.ts:125`, `apps/web/lib/kb-needle-lookup.ts:30` | 多个生成与命中检索模块直接绑定全局 `KB_ROOT` 目录，未以 `tenantId` 动态定位租户所属的诊疗事实库路径 | 若接入第二家租户，可能发生租户 B 的文章生成直接命中并引用租户 A 专属诊疗知识库的事故 | 必须使用统一的 `resolveKbRoot(tenantId)` 解析器彻底替代硬编码。

[Low] 领域模块与通用工具分层良好 | 已验证 | `packages/geo-core`, `packages/db`, `packages/shared`, `apps/worker`, `apps/web` | 系统采用 pnpm workspace 单仓架构，数据层 (Drizzle)、抓取与合规领域层 (geo-core)、共享类型与工具层 (shared) 边界清晰，Worker 与 Web 各司其职 | 保持当前模块化解耦规范。

---

## 2. 异常处理、事务与异步任务队列

[Low] 基于 pg-boss 的事务级任务队列设计可靠且具备优雅停机机制 | 已验证 | `apps/worker/src/index.ts:31-62` | 后台队列基于 PostgreSQL 原生 pg-boss，最大连接数限制为 3，失败重试设置为 3 次并开启指数退避，监听 `SIGTERM`/`SIGINT` 并支持 30s 优雅停机；致命崩溃时通过企微机器人立即告警 | 符合健壮性与可观测性要求。

[Medium] 数据库部分多步骤写操作缺乏显式事务包裹 | 已验证 | `packages/geo-core/src/generation/` 及部分 Web Actions | 在内容生成、合规审核、分发变体生成的链路中，存在多步连续 update/insert 但未包裹在 `db.transaction()` 中 | 若极端情况下网络超时或断电，可能导致中间态孤儿记录残留（如 D76 曾披露的孤儿稿现象） | 建议关键链路补齐 `db.transaction()` 显式事务包裹。

---

## 3. 表结构、索引、迁移与多租户隔离

[High] Drizzle Schema 定义与线上数据库表结构存在字段漂移 | 已验证 | `docs/15-audit-2026-09-19.md` (P2项), `packages/db/src/schema/content.ts` | 历史积累中，生产库存在 8 张表不在 `packages/db/src/schema` 目录中，部分表的字段（如 `content_variants`）在实际迁移中有新增但 schema 文件未完全同步 | 开发者若完全信赖本地 TypeScript 类型推断，在编写复杂业务或关联查询时可能引发运行时列缺失或类型不匹配异常 | 建议执行 `drizzle-kit introspect` 或对照最新 Supabase 迁移同步所有 schema 定义。

[Low] 数据库迁移管理完善且有序 | 已验证 | `supabase/migrations/` (共 49 个有序迁移脚本，覆盖 `0000_initial.sql` 至 `0048_rls_compliance_cases.sql`) | 迁移使用顺序前缀，包含 DDL、索引与 RLS 策略，且附带对应的 revert 回滚脚本 | 数据库版本控制规范。

---

## 4. 数据备份与灾难恢复机制 (关键硬指标)

[Low] 具备自动定时双周期备份、完整性自检与演练验证脚本 | 已验证 | `ops/backup/pg-backup.sh`, `ops/backup/restore.sh`, 实测备份目录 `~/Backups/geo-studio/daily/` |
- 每日 05:30 与 13:00 各执行一次全量备份，每日保留 14 天，周备保留 8 周。
- 备份脚本自动执行 gzip 完整性解压测试与字节阈值下限判定（<1MB 视为失败并不覆盖旧备份）。
- 失败时自动通过企业微信 Webhook 报警。
- 实测目录存留最新备份：`geo-studio-20261011-1300.sql.gz` (4.98MB)。
- 配备非侵入式演练还原脚本 `restore.sh`（还原至临时库并精确比对所有业务表行数）。
- **推测提醒**：目前备份位于本机硬盘，尚无跨机/异地对象存储自动同步副本。
