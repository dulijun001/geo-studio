# ADR 002 — GEO 追踪解析策略

**Status**: Accepted
**Date**: 2026-04-25
**Deciders**: 独立决策(按用户"按你的思路"授权)
**Related**: CLAUDE.md D4、D8; docs/04-roadmap.md(W6)

## 背景

V1 W6 开工前,roadmap(`04-roadmap.md`)对豆包 Web 追踪解析的前提描述是:

> Playwright 脚本:豆包 Web 问答(先手动运行)
> 回答解析 pipeline(正则 + LLM)
> **引用命中入库**

"引用命中"暗示豆包 Web 会像 ChatGPT / Perplexity 那样,在答复下方渲染一组可点击的 citation chip(带 URL 和来源标题)。GEO 追踪的核心就是解析这些 chip,判断本品牌/竞品是否被引用。

但 W6.0 探针(2026-04-25 10:37)否定了这个前提。

## 探针发现

**实验**:游客模式打开 `https://www.doubao.com/chat/`,提问"南京种植牙推荐哪家口腔医院?",解析回答容器。

结果:

| 项 | 观察 |
|---|---|
| 登录要求 | 无。游客即可问,答复完整 |
| 答复容器 selector | `[class*="message-list"]` 稳定;子元素 class 是 CSS module 哈希(`scroll-view-OEiNXD` 等)随构建变化,不能硬编码 |
| 答复形式 | Markdown 风格,含 `<h3>/<h4>/<img>`,1225 字 |
| **citation URL** | **linkCount = 0**。整段答复没有任何 `<a href="http...">` |
| 品牌提及 | 有。答复明文出现"江苏省口腔医院"、"南京市口腔医院"、"江苏省人民医院"、"鼓楼医院"、"茀莱堡"、"美奥"等 |
| 机构图片 | 有。`byteimg.com` 图床图片,但没有外链到医院官网 |
| 反爬/验证码 | DOM 里有含 `login`/`captcha` 关键字的元素,但这次均未可见触发 |

豆包 Web 这次 query 走的是 "生成式 + 知识卡片"模式,而不是 "Web RAG 引用"模式。不同问题可能触发不同模式(资讯类可能有引用),但**无法假设每个问题都会返回 citation URL**。

## 决策

**GEO 追踪的解析主策略改为:品牌词典 NER,citation URL 降级为辅助信号。**

### 具体做法

1. **主信号 — 品牌提及(Brand Mention)**
   - 输入:`brand_vocab`(每个租户自建的品牌主名 + 别名 + 医生名 + 竞品名)
   - 对 `raw_response` 整段文本做关键词匹配,支持别名展开(跟 W4 合规 scanner 思路一致)
   - 输出每条 hit 的:词、首次出现偏移、上下文片段(前后 30 字)、分类(own_brand / competitor / doctor / city)

2. **次信号 — Citation URL(如果有)**
   - `querySelectorAll('[class*="message-list"] a[href^="http"]')` 全量抓取,去重
   - 抓到了就按域名分类(本品牌官网、竞品官网、第三方媒体)
   - 没抓到不影响主流程

3. **SOV 指标(Share of Voice)**
   - 定义:`mention_count(own_brand) / mention_count(all_brands_in_vocab)`,按问题 → 日 → 周累加
   - 这比"citation share"更能反映真实用户看到的品牌暴露度(因为用户看到的就是文字)

4. **未命中问题诊断**
   - 如果某问题答复里 **零** 品牌提及 → 标记为"GEO 空白",是后续内容策略的最高优先级
   - 如果命中的全是竞品 → 标记为"GEO 劣势",反推我方内容缺口

### 不做的事

- **不抓 citation URL 为主** — 即使将来豆包改版加了引用,我们仍以品牌提及为主指标,URL 作为审计补充
- **不硬编码 CSS module 哈希 class** — 所有 selector 用 `[class*="前缀"]` 形式,降低豆包构建升级的维护成本
- **不登录账号** — V1 坚持游客模式。登录可能解锁更深的 RAG 功能,但引入账号池、封禁、指纹隔离等 V2 才该碰的复杂度

## 影响

1. `packages/geo-core` 需要把 W4 compliance scanner 的通用化后复用给 tracking(本质都是"文本 → 多关键词匹配 → 命中列表")。具体做法见 W6.1 实现。
2. `citations` 表字段需要调整:原先设想每行一个 URL,改为每行一个"mention"(词/分类/偏移/上下文)+ 可选 URL。
3. W6.3 报表的"首页指标"从"引用率"改成 **"品牌提及率"** + **"SOV"**;引用 URL 列表作为 detail 页二级信息。
4. 对客户的产品叙述需要同步:不是"我们追踪你被引用了多少次",而是"我们追踪你在 AI 答案里被提到了多少次,以及提了什么场景"——这其实更直观、更可信,说服力反而更强。

## 参考

- W6.0 探针原始 dump:`candidates={"main [class*=\"message-list\"]":{"tag":"DIV","class":"message-list-S2Fv2S ...","text_len":1225}}`; `linkCount: 0`
- `brand_vocab` 表结构:`packages/db/src/schema/brands.ts`
- W4 compliance scanner(可复用的匹配核心):`packages/geo-core/src/compliance/scanner.ts`
