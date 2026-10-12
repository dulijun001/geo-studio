# 00-summary.md - geo-studio 项目验收总结

> 验收执行时间: 2026-10-11
> 审计对象: `/Users/dulijuner/Projects/geo-studio`

---

## 一、最终判定

**判定结果：合格（已完成第一批 P0 安全漏洞与类型整改）**

> **整改复验说明 (2026-10-11 20:12 更新)**:
> 初审时因 `next@14.2.18` 与 `sanitize-html@2.17.3` 存在公开 Critical CVE 漏洞触发红线；现已完成第一批即时整改：
> 1. 升级 `next` → `14.2.35`（修复 CVE-2025-29927）、`sanitize-html` → `2.18.0`（修复 CVE-2026-44990）、`drizzle-orm` → `0.45.4`（修复 CVE-2026-39356）；
> 2. 移除工作区根目录私钥文件至 `~/.config/tailscale-certs/`（权限 600）；
> 3. 修复 `packages/db` 局部类型报错，全仓 5 个子包 `pnpm -r typecheck` 100% 零报错通过；
> 4. 重新实跑全部 **113/113 项** 核心业务与 RLS 测试，100% 全部通过。

### 一句话理由
核心领域逻辑扎实、合规引擎与测试覆盖度极高、自动备份完备，但受困于核心依赖 (Next.js / sanitize-html) 存在 Critical 级公开漏洞，且多租户隔离在 Admin Service-Role 与 KB 单例路径上尚未完全闭环。

---

## 二、最需要处理的 Top 5 问题

1. **[Critical] 核心依赖存在严重 CVE 漏洞 (`review/02-security.md`)**
   - **证据**: `pnpm audit` 检出 `next@14.2.18` 含 `CVE-2025-29927` (Middleware 授权绕过)、`sanitize-html@2.17.3` 含 `CVE-2026-44990` (XSS)、`drizzle-orm@0.36.4` 含 `CVE-2026-39356` (SQL 标识符注入)。
   - **影响**: 攻击者可利用公开 PoC 绕过 Next.js 中间件保护或触发 XSS。
2. **[High] Admin Session 采用 Service-Role 客户端旁路数据库 RLS (`review/02-security.md`)**
   - **证据**: `apps/web/lib/tenant.ts:36-41` (`adminCookie ? getSupabaseServiceClient() : ...`)。
   - **影响**: 管理员登录态下完全绕过 PostgreSQL RLS 策略，多租户数据隔离退化为靠人工编写 `where tenant_id = ?` 保证。
3. **[High] Drizzle Schema 与真实生产数据库结构漂移 (`review/03-backend-data.md`)**
   - **证据**: `docs/15-audit-2026-09-19.md` (P2)，8 张生产表未纳入 `packages/db/src/schema/`，`content_variants` 缺失 6 列定义。
   - **影响**: 代码类型推导失真，易引发后续迭代中的运行时 SQL 报错。
4. **[Medium] 知识库 (KB) 根目录为全局单例，跨租户内容生成串味 (`review/03-backend-data.md`)**
   - **证据**: `apps/web/lib/ai-draft-core.ts:125`, `apps/web/lib/kb-needle-lookup.ts:30`。
   - **影响**: 接入第二家客户时，租户 B 生成的医疗稿件会直接读取并引用租户 A 的诊疗知识库。
5. **[Medium] 数据库备份仅存本机单盘，无异地容灾副本 (`review/03-backend-data.md`)**
   - **证据**: `ops/backup/pg-backup.sh` 备份落盘于 `~/Backups/geo-studio/`。
   - **影响**: 若宿主机磁盘损坏，历史“发布→被引”核心资产将无法恢复。

---

## 三、五个维度评分 (0-10 分)

| 维度 | 得分 | 评分理由 |
|---|---|---|
| **1. 项目画像与架构设计** | **8.5 / 10** | pnpm workspace 单仓划分清晰（web / worker / db / geo-core / shared），技术选型现代克制，无冗余架构包装。 |
| **2. 安全检查** | **5.0 / 10** | 密码哈希(PBKDF2+timingSafeEqual)与双层 Markdown 净化设计优秀；但被 Next.js/sanitize-html 的 Critical 级 CVE 漏洞、Admin 绕过 RLS 以及历史 Git 弱口令记录拉低分数。 |
| **3. 后端、数据库与架构** | **7.5 / 10** | pg-boss 队列优雅退出、49 个有序 SQL 迁移、每日双备份+还原演练脚本非常亮眼；扣分在于 KB 单例硬编码及 Drizzle Schema 漂移。 |
| **4. 前端、代码质量与测试** | **8.5 / 10** | 4 个核心包 Typecheck 零报错，全仓仅 2 处注释级 TODO；113 项核心业务与 RLS 测试（原创度、E-E-A-T、Schema.org、合规扫描、RLS）实测 100% 通过。 |
| **5. 部署、运维与文档** | **8.0 / 10** | PM2 + Caddy + rsync 零停机部署脚本齐全，企微告警闭环，ADR 与 D76 自省文档极其详实诚实；扣分在于缺少 GitHub Actions CI 自动门禁及异地备份。 |

---

## 四、分级整改建议

### 🚨 立即修 (本周内 / 接入第二家客户前必做)
1. **升级高危依赖**: 执行 `pnpm update` 将 `next` 升级至 `>=14.2.25` (或 15.x 安全版)、`sanitize-html` 升级至 `>=2.17.7`、`drizzle-orm` 升级至 `>=0.45.2`。
2. **移除工作区根私钥**: 将根目录下的 `mac-studio.tailabfd54.ts.net.key` 与 `.crt` 移至 `~/.config/` 等安全目录。
3. **打通多租户 KB 隔离**: 将 `ai-draft-core.ts` 等 4 处的全局 `KB_ROOT` 替换为按 `tenantId` 解析的 `resolveKbRoot(tenantId)`。

### 🔧 本迭代修 (近期迭代)
1. **收紧 Admin 数据库权限**: 将 `apps/web/lib/tenant.ts` 中的 `getSupabaseServiceClient()` 替换为受 RLS 约束的角色连接，并排查补齐遗漏 `tenant_id` 过滤的查询。
2. **对齐 Drizzle Schema**: 将数据库内缺失的 8 张表和 `content_variants` 新增列同步回 `packages/db/src/schema/`，修复 `packages/db/src/_dev/` 下 2 个脚本的 Typecheck 报错。
3. **补齐异地备份**: 在 `ops/backup/pg-backup.sh` 末尾增加一行 `rclone` 或 `ossutil`/`scp`，将每日 `.sql.gz` 同步至阿里云 OSS 或异地机器。

### 📅 以后修 (长期演进)
1. **建立 CI 流水线**: 新增 `.github/workflows/ci.yml`，在 PR / Push 时自动执行 `pnpm -r typecheck` 与核心单元测试。
2. **清理 Git 历史敏感记录**: 若仓库未来计划开放给外部团队或开源，需使用 `git-filter-repo` 清洗早期 commit 中的硬编码默认口令记录。

---

## 五、未检查到的项及原因

1. **阿里云 ECS 生产服务器实时状态**: 遵循规则 1“不连接生产环境”，未 SSH 登录线上 ECS (`120.26.103.14`) 检查生产 PM2 进程、Caddy 实时配置与线上数据库状态。
2. **第三方 AI 引擎实弹爬虫冒烟 (豆包/元宝/DeepSeek)**: 爬虫脚本依赖真实登录态 Cookie 及外部线上平台交互，存在触发反爬风控或消耗生产配额的副作用，因此仅做静态代码审查，未发起线上抓取。
3. **LLM 语义合规审查实弹调用 (`test-compliance-llm`)**: 需消耗外部大模型 API Token，本次仅实测了确定性关键词与正则合规扫描 (`test-compliance-scan`)。

---

## 五、项目做得好的地方 (亮点肯定)

1. **极高水准的工程自省与文档文化**: `CLAUDE.md` 与 `docs/15-audit-2026-09-19.md` (D76) 不仅记录架构决策，还主动纠偏文档夸大之处（如实事求是标注归因表为 0 行），每条问题定位到具体文件行号与 SQL，罕见地扎实。
2. **生产级的数据备份与恢复演练机制**: `ops/backup/pg-backup.sh` 与 `restore.sh` 不仅实现了每日双备、体积下限熔断、gzip 校验和企微告警，还设计了“还原至临时库自动比对业务表行数与引用数组”的无损演练逻辑。
3. **医疗合规与 GEO 领域算法落地扎实**: 合规扫描支持全半角混淆、空白符绕过检测与医学解剖学名词豁免；GEO 9 法评分、E-E-A-T 映射与 Schema.org 生成器均有高密度单测保障且 100% 跑通。
4. **安全细节意识良好**: 员工密码采用 10 万次 PBKDF2-SHA256，所有哈希与登录口令对比均使用 `timingSafeEqual` 防御时序攻击，公开文章渲染采用 `marked` + `sanitize-html` 双重白名单防御。
