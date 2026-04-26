# 知识库 → ECS 实时同步

GEO Studio 的所有内容生产(合规词库 / 医生档案 / 品牌词典 / RAG 写作)都依赖客户知识库。本组件负责把客户 Mac 上的知识库目录实时同步到 ECS 镜像目录,GEO Studio worker 再增量索引到数据库。

## 数据流

```
[Mac] ~/Workspace/songshu-knowledge-base/
   │ (旧路径 ~/Downloads/code/口腔医院知识库 是 symlink,向后兼容)
   │ fswatch 监听(30s 防抖)
   ▼
[Mac] sync.sh → rsync over ssh
   │
   ▼
[ECS] /opt/kb/松鼠/  ←──── snapshot.sh 每天 03:00 打快照
   │                       (保留 7 天,误删可恢复)
   │ pg-boss worker 每 5 min 扫
   ▼
[Postgres] knowledge_sources 表
```

## 安全保险(三层)

1. **rsync `--max-delete=10`** — 单次同步最多删 10 个文件,超过自动拒绝(防 `rm -rf` 灾难)
2. **ECS 每日 snapshot** — `/opt/kb/snapshots/YYYY-MM-DD/` 保留 7 天,hardlink 增量,几乎不占空间
3. **watchdog 监控** — 每小时检查,文件数 < 100 / 超 24h 没变化都告警到 `/opt/kb/logs/alerts.log`

## 隐私分级处理

`rsync-excludes` 排除了:
- L3 数据:`团队/绩效/`、`团队/招聘/`、`患者/投诉/`
- L4 数据:`诊疗/病例库/`(医院病历,法律红线)
- L2 财务:**保留**(运营报表归因可能用)

后期客户在 md frontmatter 加 `privacy_level: L3` 字段,sync agent 二次校验。

## 部署

### Mac 端(一次性)

```bash
brew install fswatch    # 已装可跳过
cd ops/kb-sync
./install-mac.sh        # 注册 launchd,常驻,Mac 重启自动恢复
```

### ECS 端(一次性,从 Mac 上推)

```bash
cd ops/kb-sync
./install-ecs.sh        # 推 snapshot + watchdog 脚本 + 注册 cron
```

## 日常操作

| 场景 | 命令 |
|---|---|
| 查看同步日志 | `tail -f ~/Library/Logs/geo-studio-kb-sync.log` |
| 查看 launchd 状态 | `launchctl list \| grep kb-sync` |
| 强制立即同步(不等防抖) | `./sync.sh` |
| 查看 ECS 端文件数 | `ssh ... 'find /opt/kb/松鼠 -name "*.md" \| wc -l'` |
| 查看 ECS 告警 | `ssh ... 'cat /opt/kb/logs/alerts.log'` |
| 卸载 Mac 守护 | `./uninstall-mac.sh` |

## 配置

环境变量(可选,默认值见 `sync.sh`):

- `KB_SRC` — Mac 知识库路径(默认 `~/Workspace/songshu-knowledge-base/`)
- `KB_DST` — ECS 镜像路径(默认 `root@121.196.228.102:/opt/kb/松鼠/`)
- `KB_SSH_KEY` — ssh key(默认 `~/.ssh/geo-studio-ecs.pem`,标准位置避免 macOS 沙盒拦截)

修改 `rsync-excludes` 后下次 fswatch 触发自动生效。

## 故障排查

| 现象 | 原因 + 处理 |
|---|---|
| 修改 md 后 ECS 没更新 | `tail ~/Library/Logs/geo-studio-kb-sync.log` 看 watcher 是否在跑;若没动 `launchctl list \| grep kb-sync` |
| 同步 log 显示 `--max-delete limit exceeded` | 你删了 > 10 个文件,系统拒绝同步保护;手动跑 `KB_DST=... ./sync.sh` 不带 max-delete 强推 |
| Mac 关机后开机没拉齐 | watcher 启动时会先做一次完整 sync,30s 内完成 |
| ECS 告警 "no md files" | `ls /opt/kb/松鼠` 确认目录存在;可能 rsync 完整路径错 |
