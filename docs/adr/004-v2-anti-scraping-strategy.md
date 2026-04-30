# ADR 004 — V2 GEO 追踪反爬策略

**Status**: Proposed
**Date**: 2026-04-30
**Deciders**: 待用户 review
**Related**: CLAUDE.md D4、D8、D9、D11; ADR 002 §V1 已知局限; docs/04-roadmap.md V2 W9-W16

## 背景

V1 W6 落地半自动 GEO 追踪后,ADR 002 末尾记录了豆包 Web 的反爬现象:**同 IP 短时高频请求 → 浏览器启动正常但 `message-list` 容器空文本**——大厂经典「对真用户优雅、对疑似爬虫静默」策略。

V1 通过「冷 IP + 低频 + 用户手动一题一点」绕开,但这条路不可能扛过 V2 验收标准:

> V2 验收:无人值守 7 天,追踪 500 问题 × 6 引擎 = 21000 次查询全部有结果

500 × 6 × 7 = **21000 次/周**,等于每分钟 ~2 次。同一 IP 这个频次必然被静默限流。同时:

- 元宝、夸克、DeepSeek、Kimi 大概率有类似策略,只是阈值不同
- V2 还要做竞品对比 → 同一问题对多个对照组重复跑,频次再翻倍
- D4/D8 决策已锁死「不走 API」,所以**必须**靠拟真访问

## 决策

V2 追踪基础设施由 4 层组成:

```
[Question Scheduler] → [Identity Pool] → [Proxy Pool] → [Browser Fingerprint]
                              ↑
                     [Health Monitor]
```

### 1. 身份池(Tracker Identity Pool)

**「身份」≠ 员工账号**。员工账号的头条/抖音号绝不进追踪流程(D9 + D3 红线)。

身份分两类:

| 类别 | 用途 | 数量级 |
|---|---|---|
| 游客身份(Guest) | 首选。无登录 cookie,纯粹的 IP + UA + 指纹组合 | 50-100 |
| 工具账号(Tool) | 游客降级失败时使用。专门为追踪注册的实名手机号(项目方持有,不挪用员工号) | 10-20 |

每个身份持久化为 `tracker_identities` 行:

```
id, kind (guest|tool), proxy_id, ua_template, viewport, timezone, locale,
cookie_blob (encrypted, tool only), last_success_at, failure_streak, status
```

**生命周期**:`failure_streak ≥ 3` 自动 quarantined,`status = active` 的身份才被 scheduler 取用;quarantined 身份每 24h 重新探活一次。

### 2. 代理池(Proxy Pool)

只用**住宅 IP(Residential)**,不用机房 IP(Datacenter)。

理由:豆包/元宝判别机房 IP 段是公开技巧(IPIP.net、MaxMind 都有数据库),机房 IP 进去就触发限流。

候选供应商(2026-04-30 调研,需用户拍板):

| 供应商 | 优势 | 劣势 |
|---|---|---|
| LunaProxy | 国内可直采,中文支持 | 单价比 BrightData 高 |
| BrightData(Luminati) | 全球住宅池最大,稳定 | 需海外支付 + 走 VPN 联调 |
| 太平洋代理 / 站大爷 | 国内便宜,纯国内 IP | 池小,IP 重复率高,质量波动 |

V2 W9 先小规模 PoC,选 LunaProxy 国内住宅(预算 ≤ 2000/月)。

**绑定规则**:每个身份固定绑一个 proxy 入口,**不轮换**——豆包会指纹 IP 与 cookie 的对应关系,频繁换 IP 同一 cookie = 高度可疑。

### 3. 浏览器指纹隔离

每个身份启 Playwright 时:

```
launchPersistentContext({
  userDataDir: `/var/lib/geo/identities/${id}/chrome`,
  proxy: { server: identity.proxy.endpoint, ... },
  userAgent: identity.ua,
  viewport: identity.viewport,        // 1280x720 / 1440x900 / 1536x864 ...
  locale: identity.locale,            // zh-CN
  timezoneId: identity.timezone,      // Asia/Shanghai
  // 可选 WebGL / Canvas noise:fingerprint-injector
})
```

**不**做的事:

- ❌ 用 puppeteer-extra-plugin-stealth 之类「全套绕过」方案 — 这些方案被反向研究透了,反而是高风险特征。原生 Playwright + 真实参数,反而更隐蔽
- ❌ 同一身份在多台机器跨机使用 — `userDataDir` 与机器绑定,跨机会触发 cookie 异常

### 4. 节奏控制(Pacing)

调度器对每个身份强制约束:

- **单身份单引擎** ≤ 30 query/day(从 V1 经验外推,豆包阈值大约 50-80,留一半冗余)
- **query 间隔** 随机 30-180 秒(用 `Math.random()` 不是固定值)
- **每日活跃窗口** 09:00-23:30 北京时间,深夜静默(模拟真人作息)
- **调度算法** = 最近一次成功时间最远的身份优先(LRU),拉平负载

V2 W9 先按这个跑,收集 7 天数据后调阈值。

### 5. 健康度监控

新建 `/t/[slug]/tracking/identities` 后台页:

| 列 | 内容 |
|---|---|
| 身份 ID | t-001、t-002 ... |
| 类型 | 游客 / 工具 |
| 状态 | 活跃 / 隔离 / 探活中 |
| 最近成功 | 12 分钟前 / 3 小时前 |
| 失败连击 | 0 / 2 / 3+ |
| IP 归属地 | 上海联通 / 广州电信 |
| 操作 | 强制隔离 / 强制激活 |

后台可见即可,V2 暂不做自动告警(V3 接 Sentry / 飞书机器人)。

## 不做的事(明确划线)

| 不做 | 为什么 |
|---|---|
| CAPTCHA 自动求解(2Captcha / DeathByCaptcha) | 法律灰色 + 准确率 < 80% + 触发 CAPTCHA 本身说明身份已暴露,该换不该绕 |
| 绕过登录页 | 工具账号本来就是合法登录,无需绕 |
| 用员工真实头条/抖音号 | D3 + D9 红线,封号 = 集体事件 + 法律风险 |
| 浏览器指纹混淆库(如 fakebrowser、stealth) | 反向研究透了反而高危,见上文 |
| 抓 LLM 公开 API 当 fallback | D4/D8 锁死,API 不带 RAG 检索层 = 与真实用户看到的答案不同 |
| 数据中心代理 | IP 段被反爬白名单 |

## 影响

### 数据模型(V2 W9 第一周)

新增 3 张表:

```sql
tracker_proxies      -- 代理凭证池(只 admin 可写)
tracker_identities   -- 身份池(关联 proxy)
tracker_identity_events -- 健康度时间序列(成功/失败/隔离/激活)
```

`geo_snapshots` 表追加 `identity_id` 外键,做事后追溯。

### Worker 改造

- `apps/worker/src/trackers/registry.ts` 新增 `acquireIdentity()` / `releaseIdentity()` 入口,所有 adapter 走统一身份借用
- `doubao-web.ts` / `yuanbao-web.ts` 删除目前的 ad-hoc `userDataDir`,改为从身份借用
- 新增 cron job:`identity-healthcheck`(每小时探活 quarantined 身份)、`identity-rotate-cookies`(工具账号每 7 天主动 refresh cookie)

### 成本估算(V2 验收口径)

| 项 | 月成本 |
|---|---|
| 住宅代理(LunaProxy 国内,~50GB/月) | 1500-2000 元 |
| 工具账号 SIM 卡(物联卡 × 20) | 100-200 元 |
| 服务器(身份池常驻,4C8G ECS) | 已并入现有 ECS,边际 0 |
| **合计** | **~2000 元/月** |

V2 验收要求「单次追踪平均成本 < 0.05 元」,21000 次/周 × 4 周 = 84000 次/月 → 单次成本 ≈ 0.024 元,在预算内。

## 待用户确认的开放点

1. **代理供应商定哪一家**? 推荐 LunaProxy(理由:国内可对公,合规性好)
2. **工具账号实名归属**? 选项 A:法人个人手机号;选项 B:专门办物联卡(成本低但实名要走流程);选项 C:暂不上工具账号,V2 全程游客身份跑
3. **V2 W9 PoC 范围**? 推荐:先只覆盖豆包 Web,身份池 10 个,跑通后扩到元宝
4. **隔离时长**? 推荐失败连击 ≥ 3 隔离 24h,但首客业务量小,可能太保守

## 参考

- ADR 002 §V1 已知局限(同 IP 静默限流原始观察)
- D4(不走 API)、D8(豆包 API 只用于 LLM)、D9(不存员工凭证)三条决策共同约束本 ADR 的设计空间
- LunaProxy 中文文档:https://www.lunaproxy.com/(待用户授权后正式签合同)
