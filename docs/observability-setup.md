# 错误监控 + 日志聚合接入指引

> 当前状态:`reportError()` 和 `reportEvent()` 已经在 `@geo/shared/observability.ts`,
> 但只输出 stdout JSON。生产部署后接入 Sentry / Axiom 才能聚合 + 告警。

## 一、Sentry(错误监控)

**目标**:线上 LLM 失败 / DB 超时 / 合规误判 → 5 分钟内手机 push 到你

### 注册 + 拿 DSN
1. 去 https://sentry.io 注册(免费 5K events/month 起步够用)
2. 创建项目 type=Node.js,记下 DSN(类似 `https://xxx@oyyy.ingest.sentry.io/zzz`)

### 装包
```bash
pnpm --filter @geo/shared add @sentry/node
```

### 改 `packages/shared/src/observability.ts`
把 `reportError` 末尾的注释展开:
```ts
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN && !Sentry.isInitialized()) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
}

export function reportError(err: unknown, context: ErrorContext = {}): void {
  // ...existing JSON log code...

  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: { scope: context.scope ?? 'unknown' },
      user: context.user_id ? { id: context.user_id } : undefined,
      contexts: { tenant: { id: context.tenant_id }, extra: context.extra },
    });
  }
}
```

### 配 env
- 本地 `.env`:`SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz`(可选,跑 dev 测试)
- 生产 `.env.production`:**必填**

### 验证
触发一个已知错误(批量起草跑 1 个不存在的 tenant id),Sentry 后台 1 分钟内看到事件。

## 二、Axiom(日志聚合)

**目标**:跑批量起草 / 派单 / 追踪时,所有 `console.log` 的 `[scope]` 标签可搜索筛选,而不是 ssh 上去 grep。

### 注册 + 拿 token
1. https://axiom.co 注册,免费 500GB/month
2. 创建 dataset 名 `geo-studio`(已对应现有 .env `AXIOM_DATASET=geo-studio`)
3. 创建 API token,记下

### 装包
```bash
pnpm --filter @geo/shared add @axiomhq/js
```

### 接入(2 选 1)

**方案 A:专门日志路径**(推荐)— 在 `observability.ts` 加 `reportLog()`:
```ts
import { Axiom } from '@axiomhq/js';

const axiom = process.env.AXIOM_TOKEN
  ? new Axiom({ token: process.env.AXIOM_TOKEN })
  : null;

export async function reportLog(msg: string, context: ErrorContext = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...context }));
  if (axiom && process.env.AXIOM_DATASET) {
    await axiom.ingest(process.env.AXIOM_DATASET, [{ msg, ...context }]);
  }
}
```
然后逐步把核心路径的 `console.log` 改成 `reportLog`(参考红旗 #16,这是迁移时机)。

**方案 B:Vercel/Railway 日志钩子转发** — 不改代码,在部署平台配置"日志 drain"指向 Axiom HTTP endpoint,所有 stdout 自动进。开销低但失控时全量(不便宜)。

### 配 env
- 生产:`AXIOM_TOKEN=xaat-xxx` + `AXIOM_DATASET=geo-studio`(已存在)

### 验证
跑一次批量起草,Axiom 后台筛 `scope:"ai-draft-core"` 看到批量事件流。

## 三、推荐告警(部署后立即配)

Sentry alerts:
1. `scope:"compliance.review"` 错误 1 分钟内 ≥ 3 → 邮件 + 推送(合规链路挂会卡所有内容生产)
2. `scope:"batch-draft-item"` 失败率 5 分钟内 > 50% → 邮件(LLM 服务异常)
3. `scope:"pg-boss"` 任意错误 → 邮件(队列底层故障)

Axiom 看板:
1. 每天批量起草成功率(按 `[ai-draft-core]` 过滤)
2. 平均 LLM 响应时间(按 `provider=doubao` 过滤,看趋势识别 ARK 性能漂移)
3. 合规拒绝率随时间(看 #3 prompt 改动是否真的把 47% → 20%)

## 四、为什么现在不直接做

部署到生产前不接 Sentry 没意义(本地 stdout 已够看)。等 #10 部署落地后做,顺序:
1. 部署上生产
2. 跑 1-2 天看哪些 scope 出错
3. 接 Sentry 优先告警那几个 scope
4. 真翻车率高的(如 #3 SYSTEM_PROMPT 仍打不下来 47%)再回头改

**这是工程纪律**:监控不是装饰品,是问题驱动加的。先有问题再装。
