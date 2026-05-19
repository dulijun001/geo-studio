# 04 - 交付路线图

## 总览:24 周(6 个月)到 V3 商业化

| 阶段 | 周数 | 里程碑 |
|---|---|---|
| V0 - 骨架与规范 | 第 0 周(现在)| 本文档 + CLAUDE.md + 空仓库 |
| V1 - 口腔医院跑通 | 第 1-8 周 | 40 人矩阵实际运转 + 首份引用数据 |
| V2 - 追踪自动化 | 第 9-16 周 | 500+ 问题自动追踪 + 竞品对比 |
| V3 - 多租户 SaaS | 第 17-24 周 | 第 2-3 个客户 + 白标 + 计费 |

**每个 V 结束必须能独立产出价值**——不是"做一半等下一版",而是每版都能让客户验收。

---

## V1 — 口腔医院跑通(第 1-8 周)

### 目标
- 医院 40 名员工每天稳定发布内容
- 合规审查跑完整三道门
- 转化归因闭环(至少 1 个钩子类型)
- 追踪**半自动**(人工+脚本,验证豆包真的在引用)

### 周详细规划

#### 第 1 周 - 基础设施
- [ ] Monorepo 骨架(pnpm workspace)
- [ ] Supabase 项目初始化 + RLS policies
- [ ] Drizzle schema 第一版(所有 V1 核心表)
- [ ] Migration tooling + seed 脚本框架
- [ ] Next.js 14 App 空壳 + Supabase Auth
- [ ] Vercel 部署预览环境(main 分支自动部署)

#### 第 2 周 - 多租户认证与后台骨架
- [ ] 登录/注册流(手机号 + 验证码)
- [ ] 租户解析 middleware(subdomain 或 path)
- [ ] 角色系统(owner / admin / operator / staff / auditor)
- [ ] 后台空壳:侧边栏 + 路由 + 空页面
- [ ] 员工移动端空壳

#### 第 3 周 - 内容调度中台
- [ ] Word / PDF 上传 + 解析成 markdown(`mammoth` + `pdf-parse`)
- [ ] 内容库 UI(列表 + 编辑器)
- [ ] 话题标签系统
- [ ] 基于 GEO 9 法的改写 prompt 模板
- [ ] 调用豆包 API 改写成 N 个变体
- [ ] 变体编辑器(左边原文、右边变体,可手改)

#### 第 4 周 - 合规三道门
- [ ] 关键词库结构 + 初始 200 条(A 级)+ 500 条(B 级)
- [ ] 第一道关键词扫描(同步,< 50ms)
- [ ] 第二道 LLM 审查(异步,pg-boss 任务)
- [ ] 管理员审批台 UI
- [ ] 审计日志表 + 7 个动作埋点
- [ ] 合规仪表盘(通过率、风险分布)

#### 第 5 周 - 员工派单 + 移动端
- [ ] 派单算法 v1(防撞车 + 人设匹配 + 节奏控制)
- [ ] 员工移动 Web:今日任务卡片
- [ ] 一键复制 / 素材包下载
- [ ] 跳转头条/抖音 App(scheme url)
- [ ] 员工打卡回执(填 URL)
- [ ] 推送通知(短信 + 企微)

#### 第 6 周 - GEO 追踪(半自动)
- [ ] 问题库导入(初版 200 条)
- [ ] 品牌词典 UI + 导入
- [ ] Worker 骨架(Railway 部署)
- [ ] Playwright 脚本:豆包 Web 问答(先手动运行)
- [ ] 回答解析 pipeline(正则 + LLM)
- [ ] 引用命中入库
- [ ] 追踪报表第一版(覆盖率、SOV)

#### 第 7 周 - 转化归因
- [ ] 钩子生成(每条任务自动带医生名 + 电话尾号 + utm)
- [ ] 前台小程序极简版(一个页面:暗号/尾号录入)
- [ ] 到店事件回流 API
- [ ] 漏斗看板(内容 → 引用 → 咨询 → 到店)
- [ ] ROI 计算(单客成本 / 单员工产出)

#### 第 8 周 - 收尾 + 真实数据验收
- [ ] Bug 修复 + 性能优化
- [ ] 管理员 onboarding 流程
- [ ] 员工培训文档 + 视频
- [ ] 与医院一起做 40 人培训
- [ ] 第一周真实数据复盘

### V1 验收标准
- [ ] 40 人员工有 ≥ 34 人连续 5 天打卡
- [ ] 合规自动通过率 ≥ 75%
- [ ] 人工审批 SLA 中位数 < 2 小时
- [ ] 第一轮追踪(100 个问题)能拿到数据且解析准确
- [ ] 至少 5 起到店转化能追溯到具体发布内容
- [ ] 医院管理层的 2 人愿意上台讲一段见证

---

## V1.10 — 日常运营自动化(插队 Sprint,1 周)

> 触发:2026-05-19 客户反馈"每天都要盯,太麻烦"。V1.9.x 维稳 7 天后立刻开。详见 `docs/09-daily-ops-automation.md`。

### 目标(P0)

- 客户每天人肉 40 min → 自动 + 异常时 30 秒审
- 出差/生病/周末不再"停摆"
- 复用 80%(V1.9 batch / 合规四道门 / D21 DoD / V1 派单算法 / V1.9.3 跳转)

### 模块清单

- [ ] migration 0036 `daily_ops_runs` + `daily_ops_settings` + content_variants.daily_run_id
- [ ] 选题选择器:5 抽(questions.priority × last_used)+ 2 客户手填位(前一日 23:59 锁)
- [ ] cron #1 `nightly-draft`(02:00 触发,pg-boss schedule)
- [ ] 自动放行规则(DoD=passed AND compliance=auto_approved AND auto_rewrite=0 AND numeric_fact_check OK → 绿色)
- [ ] `/t/[slug]/today` 待审页(4 类:绿/黄/红/黑,批量 approve)
- [ ] cron #2 `auto-dispatch-timeout`(超时 6h → 绿色默认派,黄红黑 stay)
- [ ] 通知:站内 banner + 邮件(V2 加企微/短信)
- [ ] `/settings/daily-ops` 配置页(频率 / 超时 / 节流 / 周末跳过 / 平台覆盖)
- [ ] reportError 全链路埋点

### V1.10 验收

- [ ] 客户连续 5 天 0 干预,内容仍按计划派送
- [ ] 异常率(黄/红/黑)< 20%
- [ ] 客户日均交互时长 < 5 min(平均每天 30s + 偶尔异常)
- [ ] 周末跳过 toggle 跑通

---

## V1.11 — V1.10 bug 修复 + cron 自动改写 + xiangyu P0(5.5d)

> 触发条件:V1.10 维稳 7d(2026-05-26+)或客户反馈 cron stuck。

### 必修先做(2026-05-19 真生产部署后发现的 V1.10 bug,1d)

- [ ] **🚨 T0a: nightly-draft 没调 evaluateDod 修复**(0.5d):
      ECS 生产真跑后发现 — 30 个 variants 全 `dod_status=unknown` →
      cron #2 `stillEvaluating` 永真 → run 永远 stuck 在 drafting。
      Fix:`apps/worker/src/jobs/batch-draft-item.ts` 或 `compliance-review.ts`
      在 variant 生成后调用 `evaluateDod`(packages/geo-core/scorer-l2.ts)写回
      `content_variants.dod_status`。
- [ ] **🚨 T0b: today-view status filter 修复**(0.25d):
      `apps/web/app/t/[slug]/daily-ops/today-view.tsx` 当前 `.eq('status','draft')`
      漏掉 V1.9 cascade 升级到 `pending_review` / `auto_approved` 的 variants。
      Fix:改成 `.in('status', ['draft','pending_review','auto_approved'])`。
- [ ] **🚨 T0c: cron #2 stillEvaluating 逻辑修复**(0.25d):
      `apps/worker/src/jobs/auto-dispatch-timeout.ts` 现在把 `compliance_status='pending'`
      当 "still evaluating",但 pending 实际 = "等人工审"应算 yellow 桶。
      Fix:stillEvaluating 只看 `dod_status='unknown'`,不看 compliance pending。

### 新加:cron 自动改写 yellow(C 方案,2026-05-19 用户拍板,0.5d)

- [ ] **🔥 T4: cron 自动改写 yellow variants**(0.5d):
      cron #2 advance run 后扫所有 yellow 状态(auto_rewrite_count=0),
      自动 enqueue `compliance.auto_rewrite` job。worker 跑 LLM 改写,重审,
      期望部分进 auto_approved → 客户不用点 22 次「AI 一键改写」。
      D5/D12 §13.3 max 1× 限制保留。
      新 settings 字段:`auto_rewrite_yellow boolean DEFAULT true`(migration 0037)。

### xiangyu CLI 借鉴 P0(详见 `docs/adr/010-xiangyu-cli-integration.md` §IV-P0,4d)

- [ ] **🥇 ai-citation-track 4 引擎 adapter**(2d):OpenAI / Perplexity / Gemini / Claude API,扩 `packages/geo-core/tracking/adapters/`,补 D4 豆包 Playwright → 5 大引擎覆盖
- [ ] **🥈 information-gain-check → D21 DoD 维度 6**(1.5d):scorer-l2 加 `independent_signals` 维度,D21 14+5 → 15+5 条 DoD
- [ ] **🥉 geo-fanout-check 合并 docs/08 §8**(1d 但有重叠,实际 0.5d):双源驱动选题(高追踪零引用 query + Google PAA/Related 缺口)
- [ ] tenants.settings.tracking.engines enum 扩 OpenAI/Perplexity/Gemini/Claude

### V1.11 验收

- [ ] **V1.10 cron 真自动跑通,不需要 SQL hack**(T0 三 bug 全修)
- [ ] **客户进 /daily-ops today 看到 4 buckets 真实分布**,yellow 经 cron 自动改写后部分变 green
- [ ] 至少 1 个海外引擎 adapter 跑通(OpenAI 优先)
- [ ] 新生成内容 DoD 15+5 条全过(`independent_signals` ≥ 1)
- [ ] /daily-ops today tab 选题建议标注"反馈回路 + fanout 缺口"

---

## V1.12 — xiangyu CLI 借鉴 P1(D21 / scorer / Schema 补强,3d)

> 触发条件:V1.11 完成后,客户反馈"内容评分不够细"。详见 ADR 010 §IV-P1。

### 模块清单

- [ ] audit-geo 维度增补:权威外链白名单 + 新鲜度 dateModified(0.5d)
- [ ] geo-snippet-extract 6 维评分接入 slice-extractor(1d)
- [ ] judgment-density 三层正则(立场/实测/失败坦白)中英双语接入 scorer-l2(0.5d)
- [ ] content-readability Flesch Reading Ease 中英自适应(0.5d)
- [ ] audit-rich-results Schema 类目扩 7 → 17 类(0.5d)

---

## V2 — 追踪自动化 + 反馈回路(第 9-16 周)

### 目标
- GEO 追踪完全无人值守
- 问题库扩到 500+,每日自动轮询
- 加入竞品对比
- 支持元宝、夸克、DeepSeek、Kimi(4 个额外引擎)
- **闭合 5 处横向反馈回路**(详见 `docs/08-feedback-loops.md`)— 追踪/引用/归因/audit 的产出反哺到内容选题、关键词词库、内容评分

### 重点模块

#### 反馈回路(新增,V2 第 13-14 周,详见 `docs/08-feedback-loops.md`)
- [ ] 断点 1:追踪 → 内容选题工单建议(tenant home + wizard query_param)
- [ ] 断点 3:归因 → 内容业务价值(linear 归因 + ¥列 + Top10 卡)
- [ ] 断点 5:Audit → 内容向导 banner 提示
- [ ] 断点 2:引用 → 关键词热度(worker job + meta enrich)
- [ ] 断点 4:员工反馈 → 内容难发布标签
- [ ] 合并入 tenant home 「本周回路」hero(扩展 V1.9.2.x 的「今日运营」briefing)
- [ ] 验收:客户老板 3 秒内能从主页看到「赚钱内容 Top3 + 该补内容 Top3」


#### 追踪账号池管理
- [ ] 追踪账号生命周期管理(创建/限流/封禁/替换)
- [ ] 代理 IP 池集成(LunaProxy / BrightData)
- [ ] 浏览器指纹隔离(每账号独立 context)
- [ ] 反检测技巧(humanize 输入、随机延迟)

#### 多引擎适配
- [ ] 豆包 Web / App(V1 已有)
- [ ] 腾讯元宝 Web + 微信小程序
- [ ] 夸克 AI 超级框
- [ ] DeepSeek Chat
- [ ] Kimi Chat
- [ ] 抽象层:所有引擎走统一 `TrackerAdapter` 接口

#### 问题库管理
- [ ] 问题库编辑器(批量导入 / 单条编辑)
- [ ] 笛卡尔积生成器(城市 × 意图 × 科室 × 品牌痛点)
- [ ] 问题优先级调度(用过的降权,新的高权)
- [ ] 向量去重(pgvector)

#### 竞品对比
- [ ] 竞品品牌词典(租户自建)
- [ ] 同一问题下,本品牌 vs 竞品的 SOV 曲线
- [ ] 竞品内容来源分析(他们被引用的内容来自哪里)
- [ ] 短板诊断(哪些问题竞品被引用你没被)

#### 数据可视化升级
- [ ] 引用日历热力图(每日引用事件分布)
- [ ] 员工贡献榜(哪个员工的内容引用率最高)
- [ ] 单条内容追溯时间轴(发布 → 索引 → 首次引用 → 累计引用)

### V2 验收
- [ ] 无人值守 7 天,追踪 500 问题 × 6 引擎 = 21000 次查询全部有结果
- [ ] 单次追踪平均成本 < 0.05 元
- [ ] 解析准确率 ≥ 90%(人工抽检 100 条)

---

## V3 — 多租户 SaaS(第 17-24 周)

### 目标
- 第 2-3 个客户上线(医美或月子中心)
- 支持白标(不同客户看到不同 LOGO / 域名 / 主题)
- 计费与订阅
- 自助 onboarding(无需我们介入)

### 重点模块

#### 白标
- [ ] 租户级主题配置(色彩、LOGO、产品名)
- [ ] 自定义域名(CNAME + SSL 自动签发)
- [ ] 邮件发件人自定义

#### 计费
- [ ] 计费模型:基础订阅 + 按量(追踪查询次数、LLM 调用 tokens、存储)
- [ ] Stripe(海外)+ 微信支付商户(国内)
- [ ] 发票管理
- [ ] 试用期自动降级 / 升级

#### 自助 onboarding
- [ ] 引导向导(创建品牌 / 上传员工 / 上传初始内容 / 生成第一批任务)
- [ ] 示例数据一键填充(新客户 10 分钟就能看到 demo 效果)
- [ ] 帮助文档 + 视频

#### 合规的行业化
- [ ] 不同行业加载不同关键词包(医美有自己的禁词、律所有自己的)
- [ ] 行业模板(医美 vs 口腔的 GEO 问题库差异)

### V3 验收
- [ ] 第 2 家客户 onboarding 我们介入 < 2 小时
- [ ] 第 3 家客户能完全自助 onboarding
- [ ] 计费系统连续 30 天 0 事故
- [ ] 单客户日均服务成本 < ARPU 的 15%

---

## 不做(V1-V3 明确排除)

| 功能 | 为什么不做(现在)|
|---|---|
| 原创内容代生成(MCN 服务) | 我们是工具不是内容方,免疫力低、差异化弱 |
| 自动发布到头条/抖音 | 封号风险,绝不碰 |
| Agent GEO(服务层)| 豆包 2.0 生态还没成熟,V4+ 再评估 |
| 视频自动剪辑生成 | 有现成工具(剪映、Capcut),我们集成不自建 |
| 内部 CRM | 客户自己有 CRM,我们是归因数据源 |
| 手机 App | 员工端 PWA 已经足够 |

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 豆包 Web 反爬加强,Playwright 失效 | 中 | 高 | 代理池 + 账号池 + 指纹隔离 + 降级到半自动 |
| 首个客户效果不达预期(3 个月引用率 < 10%) | 中 | 高 | 每 2 周 checkpoint,低于预期先调内容策略,不堆功能 |
| 医疗广告法罚单 | 低但致命 | 极高 | 三道门 + audit_log + 客户签承诺书 |
| 一个员工账号被封带崩整个矩阵 | 中 | 中 | 不碰自动化 + 人设隔离 + 节奏控制 |
| 我一个人撑不住 V2 之后的工作量 | 高 | 高 | V2 结束前招 1 个全栈/AI 工程师 |
| 模仿者跟进(知推时代等)| 高 | 中 | 转化归因闭环是时间堆出来的,暂时领先 3-6 个月 |
| 豆包政策变化(字节官方封禁 GEO 工具)| 低 | 极高 | 多引擎策略分散风险,不把鸡蛋放一个篮 |

## 下一次沟通节点

**每周五**:我主动同步本周完成度 + 下周计划,你决定要不要调整优先级。

**每个 V 结束**:做完整 demo + 复盘,决定下一版方向。
