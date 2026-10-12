# 05-ops-docs.md - 部署、运维与文档专项

> 验收执行时间: 2026-10-11
> 审计模式: 只读本地系统与文档审查，不连接生产服务器

---

## 1. CI/CD 与自动化流水线

[Medium] 缺少 GitHub Actions / 自动化 CI 流程 | 已验证 | 项目根目录缺少 `.github/workflows/` 目录 | 所有的 Lint、Typecheck、自动化测试目前全依赖开发者本地手动运行，代码 push 到仓库时缺乏持续集成门禁保护，存在将破坏性改动直接合入 main 分支的隐患 | 建议补齐基础 GitHub Actions 工作流（触发 `pnpm -r typecheck` 和核心测试套件）。

---

## 2. 部署机制、监控告警与环境隔离

[Low] 部署架构清晰，具备零停机平滑更新与运维手册 | 已验证 | `ops/deploy/README.md`, `ops/deploy/deploy.sh`, `ops/deploy/ecosystem.config.cjs` |
- 采用 PM2 进行多进程管理 (`geo-web`, `geo-worker`)，带有内存自愈限制（Worker 限制 2GB 防止 Playwright 爬虫内存泄漏）。
- 部署脚本支持增量构建与平滑重载 (`pm2 reload all`)。
- 环境变量隔离明确：`.env.production`、`.env.example`，避免生产配置随代码入库。

[Low] 告警机制与企业微信对接就绪 | 已验证 | `apps/worker/src/lib/wecom.ts`, `ops/backup/pg-backup.sh:30-40` | Worker 核心异常退出、大模型产线故障、每日数据库备份失败均直连企业微信机器人 Webhook 推送。

---

## 3. 本地启动实测与运行状态

[Low] 本地开发与后台服务运行验证无卡点 | 已验证 | `ps aux | grep geo-studio`, `pnpm --filter @geo/db test-rls` |
- **数据库层**: 本地 Docker Supabase 正常运行中，端口 `54321`/`5432` 正常开放，RLS 7 项基准测试实测全绿。
- **后台服务 (`@geo/worker`)**: 进程常驻在后台运行（PID 66578, 66559），监听任务调度正常。
- **前端服务 (`@geo/web`)**: 随时可通过 `pnpm dev` 启动并绑定 3001 端口，健康探测 `/api/health` 路由规范完好。

---

## 4. 文档新鲜度与准确度

[Medium] 部分设计文档指标超前于实际业务代码实现 | 已验证 | `docs/15-audit-2026-09-19.md`, `CLAUDE.md:101` |
- 文档与 CLAUDE.md 在 D76 中已诚实自纠：早期文档把「转化归因闭环」列为核心护城河，但实测相关表行数均为 0（实际尚未打通）。
- `ops/deploy/deploy.sh` 历史注释中涉及的部分老 IP 和用户已于 D76 修正并存档。
- 整体架构、合规与 ADR 文档完备性极高，与当前单体 SaaS 交付形态契合。
