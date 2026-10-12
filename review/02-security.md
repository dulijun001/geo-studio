# 02-security.md - 安全专项检查

> 验收执行时间: 2026-10-11
> 审计模式: 只读本地静态与动态安全分析
> 审计原则: 发现密钥/密码仅记录位置和类型，不输出敏感原文

---

## 1. 代码和 Git 历史中的凭证、密钥与默认账号

[Medium] 历史提交中曾包含默认弱口令，已于后续提交修复 | 已验证 | `apps/web/app/login/quick/route.ts:25-30`，commit `5dcb19ca` (2026-09-01) | 历史版本曾硬编码用户名与默认弱口令，任何知晓该路径者可登录为系统管理员；目前已重构成环境变量 `QUICK_LOGIN_PASS`，但历史 Git 记录中仍可溯源 | 建议对生产环境敏感口令进行全量更换，在公共仓库或开源前彻底 purge 历史记录。

[Medium] 根目录存在私钥与本地证书文件 | 已验证 | 项目根目录存在 `mac-studio.tailabfd54.ts.net.key` 与 `mac-studio.tailabfd54.ts.net.crt` | 虽然 `.gitignore` 已配置 `*.key`, `*.crt`，且 `git status` 显示未跟踪，但私钥直接放置在项目工作区根目录下，存在误提交或打包外泄风险 | 建议将私钥文件移出代码仓库，存放在系统专用目录（如 `~/.config/` 或系统钥匙串）。

[Low] 开发环境快捷登录接口存在哨兵 ID 旁路 | 已验证 | `apps/web/app/login/dev/route.ts:25`, `apps/web/lib/admin-session.ts:32` | `/login/dev` 路由硬编码判断 `process.env.NODE_ENV === 'production'` 则返回 404，但若容器或 Node 启动时未正确注入 `NODE_ENV=production`，可直接通过该接口获取 `SUPER_ADMIN_USER_ID` 权限 | 建议不仅依赖 `NODE_ENV`，追加显式 `ENABLE_DEV_LOGIN === 'true'` 门禁，生产打包阶段直接排除 dev 路由。

---

## 2. 认证授权、多租户与 RLS 穿透检查

[High] Admin Session 走 Service-Role 客户端导致数据库行级安全 (RLS) 旁路 | 已验证 | `apps/web/lib/tenant.ts:36-41`: `const client = adminCookie ? getSupabaseServiceClient() : createSupabaseServerClient();` | 管理员身份访问时，使用的是拥有最高权限的 `service-role` 客户端直接读写数据库，绕过了 Postgres RLS 隔离策略。此时多租户隔离完全依赖前端代码中 SQL 的 `tenant_id` 条件筛选，一旦代码中漏写 `tenant_id`，将直接导致跨租户越权查询或修改（历史审计 D76 已指出有部分查询邻近无过滤） | 生产管理后台应使用带租户作用域的应用专用连接角色（受 RLS 限制），而不是全局超级服务密钥。

[Low] 内部 API 采用共享 Secret 验证 | 已验证 | `apps/web/app/api/internal/ai-draft/route.ts:33`, `apps/web/app/api/internal/backfill-slices/route.ts:28` | Worker 与 Web 通信使用请求头 `x-internal-secret` 与环境变量 `DRAFT_INTERNAL_SECRET` 比对，未采用非对称签名或短期动态令牌，若反向代理（Caddy）未限制 `/api/internal/*` 仅限本地 127.0.0.1 访问，外部可能发起伪造请求 | 必须在 Caddy / 反向代理网关中强行限制 `/api/internal/*` 只能从本机 `127.0.0.1` 访问，禁止公网透传。

---

## 3. SQL 注入、XSS、CSRF、文件上传与 SSRF

[Low] 公开文章渲染使用 Markdown 危险 HTML 注入缓解措施有效 | 已验证 | `apps/web/app/c/[slug]/articles/[id]/page.tsx:260`, `apps/web/lib/markdown/safe-render.ts:30-55` | 文章渲染采用了 `dangerouslySetInnerHTML`，但后端前置通过 `marked`（关闭 HTML 直通）和 `sanitize-html` 双重白名单过滤，限制了合法标签与属性，并强制加上 `rel="noopener noreferrer ugc"` | 保持定期升级 `sanitize-html`，防御新型 DOM Mutation XSS 漏洞。

[Low] 密码存储与校验算法达到工业级安全标准 | 已验证 | `apps/web/lib/staff-passcode.ts:60-95` | 员工密码采用 `PBKDF2-SHA256` (100,000 次迭代，16 字节随机 Salt)，比对时统一采用 `timingSafeEqual` 防范时序侧信道攻击 | 符合密码安全规范。

---

## 4. 依赖漏洞与过时包审计 (pnpm audit)

[Critical] Next.js 与 sanitize-html 存在高危/严重已知 CVE 漏洞 | 已验证 | 命令输出 `npm_config_registry=https://registry.npmjs.org pnpm audit` |
1. `next@14.2.18` 存在多项已披露严重漏洞：
   - `CVE-2025-29927`: Authorization Bypass in Next.js Middleware (Critical)
   - `CVE-2024-56332`: Server Actions Denial of Service (Moderate)
   - `CVE-2026-75604`: Unauthenticated Remote Code Execution in Image Optimization (Critical)
2. `sanitize-html@2.17.3` 存在 `CVE-2026-44990`: default XSS via xmp raw-text passthrough (Critical)
3. `drizzle-orm@0.36.4` 存在 `CVE-2026-39356`: SQL injection via improperly escaped SQL identifiers (High) | 生产服务可能受已公开利用的 Next.js 中间件越权与 sanitize-html XSS 漏洞影响 | 强烈建议尽快将 Next.js 升级至 >= 14.2.25 (或 15.x 安全稳定版)，sanitize-html 升级至 >= 2.17.7，drizzle-orm 升级至 >= 0.45.2。

---

## 5. 许可证与合规

[Low] 项目及核心依赖许可证合规无冲突 | 已验证 | `package.json`, `apps/web/package.json` | 项目本身标记为 `private: true`，使用的核心第三方开源组件（Next.js / React / Drizzle / Playwright / TailwindCSS / Zod 等）均为标准 MIT 或 Apache-2.0 协议，未引入 AGPL-3.0 等高风险传染性商业限制许可证 | 许可证合规。
