# ADR 012 — 本地生产入口迁移到 Cloudflare Named Tunnel

- 日期：2026-07-30
- 状态：已采用

## 当前决策

Mac 上运行的 GEO Studio 员工端使用固定公网入口：

`https://mac-studio.tailabfd54.ts.net:8443` → Tailscale Funnel → `http://127.0.0.1:4300`

`NEXT_PUBLIC_APP_URL` 统一改为该固定域名。员工入口路径、派单任务和邀请
token 均不改变；新生成的邀请链接使用新域名。

生产服务必须运行 `next start`，开发服务运行 `next dev`。两者构建目录永久隔离：

- 生产：`apps/web/.next-prod`
- 开发：`apps/web/.next-dev`

禁止生产和开发共用默认 `.next`。2026-08-04、2026-08-15 两次员工端样式丢失，
根因都是额外的 `next dev` 覆盖了生产进程正在读取的 `.next` 静态资源。

## 原因

旧 `geo.dulijun.icu` 依赖已停用的阿里云 ECS；`ccwu.cc` 共享域名被部分
微信/浏览器安全系统拦截。Tailscale Funnel 不依赖公网 IP 或中转 ECS，且
Funnel 入口允许未加入 Tailnet 的同事公开访问。

## 兼容性

- 已发链接不会被数据库改写；当前 `:8443` 链接保持有效。
- 新旧链接的路径和 token 一致，必要时可只替换域名和端口。
- 邀请 token 自身的有效期、一次性消费规则不因域名迁移而改变。

## 回滚

关闭 Tailscale Funnel 的 8443 入口，将 `NEXT_PUBLIC_APP_URL` 恢复为原值，
重新构建并重启 Web 服务。
