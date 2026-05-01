# ADR 005 — 增加可发现层(Discoverability Layer)

**Status**: Proposed
**Date**: 2026-05-01
**Deciders**: 待用户 review
**Related**: D14-D18(CLAUDE.md 同步追加); ADR 002(GEO 追踪解析); ADR 004(V2 反爬路线); `docs/06-discoverability.md`(完整设计)

## 背景

V1.6 收尾时复盘两个对标项目:

1. **AIGEOTOOLS**(Python + Streamlit,11 个 Tab 的内容生产工具)— 强在内容产出,弱在追踪和验证
2. **Laravel aigeo**(PHP package)— 强在让你的内容**被 AI 引擎索引侧理解**:Schema.org / llms.txt / AI Feed 一整套

复盘后归纳出 GEO 工程的三层模型:

| 层 | AIGEOTOOLS | Laravel aigeo | **GEO Studio(我们)** |
|---|---|---|---|
| A. 可发现 | ⚠️只 Schema | ✅✅✅ 整套 | ❌ **完全空白** |
| B. 生产 | ✅✅ EEAT + 去重 | ⚠️ 弱 | ✅✅ 9 法 + KB + 引用守卫 |
| C. 验证 / 优化 | ⚠️ Perplexity API | ⚠️ 静态评分 | ✅✅✅ 多引擎 + SOV + 归因 |

**我们 C 最强,B 中上,A 是 0**。A 是 B 和 C 的上游——内容再好,索引侧读不懂结构,AI 答案里就跳过你。

V1.6 的 SOV 数据已经显示:demo-dental 在豆包"南京/昆明 + 推荐"类问题里的"失守 / 真空"格子比"守住"多。我们能改写文案、能追踪、但**没有杠杆作用于 AI 索引侧的解析**。补 A 层是最大杠杆。

## 决策

D14:V1.7 增加可发现层(Layer A),覆盖 5 个能力:

1. **Schema.org JSON-LD 生成**(7 类:MedicalBusiness / Physician / MedicalProcedure / Review / FAQPage / Breadcrumb / Organization)
2. **llms.txt + llms-full.txt**(LLM 爬虫导航协议)
3. **AI Content Feed**(`/api/feed/[slug].json`)
4. **AI Sitemap**(`/api/ai-sitemap/[slug].xml`)
5. **Discoverability Audit**(分维度评分 + 配置阈值)

D15:公开路由按 tenant 显式 opt-in,默认关闭。
D16:公开路由内容过滤双闸 — 实体 `geo_visible=true` + testimonials 必须 `compliance_status='approved'`。
D17:缓存策略 build-on-write,artifacts 表存物化结果,公开路由单行读。
D18:Schema 生成纪律 — 只填有值字段,不用 placeholder 凑数。

详细数据模型 / 模块结构 / Sprint 计划见 `docs/06-discoverability.md`。

## 备选方案考虑过

### 方案 B:只做 Schema(选项 b)
- 工作量 3-5 天,价值有但碎片
- 没有 llms.txt + feed,AI 引擎在索引时只能逐页爬,效率低
- 拒绝理由:**A 层是个完整 surface**,缺一不可;一次性补到位比挑食地补效益高

### 方案 C:延后到 V2,先做反爬基础设施(ADR 004)
- 拒绝理由:V2 反爬解决的是"我们追踪 7×24 不掉队",但**追到的数据如果一直显示我们失守,反爬再硬也无意义**。先补 A 让数据可改善,再上 V2 让追踪规模化。
- 顺序:**A(本 ADR)→ V2 反爬 → V2 多引擎完善**

### 方案 D:让客户自己写 schema / llms.txt
- 拒绝理由:首客是医疗机构,IT 能力 = 0;让他们自己写=永远写不出。SaaS 价值在自动化产出 → **D2 配置化原则的延伸**。

## 影响

### 正面
- 补 GEO 三层模型最大空白
- 给客户可量化的"GEO 基础设施完成度"指标(audit 评分)
- AI 引擎(豆包/元宝/ChatGPT)对结构化数据的引用偏好已被多个 GEO 论文验证;医疗本地服务用 `MedicalBusiness` schema 收益尤其大
- SOV 数据有了真正可改善的杠杆(改 schema → 引擎重索引 → 引用提升)

### 负面 / 成本
- ~12-18 天工程时间,V2 反爬基础设施延期 2-3 周
- V1 第一次有对外公开 API 路由,新增攻击面(rate-limit / 内容过滤 / 审计已规划)
- 数据模型增加 7 条 migration、3 张新表、2 张表扩列 —— 数据复杂度上升一档
- 对客户的数据完整度要求提升(brand 完整地址 / 营业时间 / 医生 credentials 等),首批客户需要 0.5-1 天协作录入
- 合规四道门 pipeline 要扩展 `target_type='testimonial' | 'faq'`(目前只支持 'content_variant')

### 中性
- E-E-A-T 命名重组对 9 法 scorer **零侵入**(只是 UI 标签 + 分类映射)
- 内容独特性检测在 worker variant-generate 后挂钩,与现有改写 / rescue 流程兼容

## 实施

按 `docs/06-discoverability.md` §七 Sprint 0-6 顺序执行,工单跟踪在内置 Task 系统。

S0(本 ADR + 设计文档)完成后请 user review 决策记录,再启动 S1 落库。

## Open Questions

1. **公开访问的域名**:V1 用 `geo.studio/api/llms.txt/[slug]`,V1.7 收尾考虑 `<slug>.geo.studio/llms.txt` subdomain mapping;客户自有域名映射等备案下来再说
2. **审计阈值具体数字**:`min_description_words: 150` / `min_reviews_for_signal: 10` 这些值是从 Laravel aigeo 抄的英文/电商场景默认,医疗中文场景可能要调,V1.7 上线后看真实数据再迭代
3. **客户数据 ETL 谁做**:S4 UI 跑通后,demo-dental 的 services / testimonials / FAQs 录入责任在客户还是我们?**建议:首客我们代录半天,作为冷启动样本,之后客户自己维护**
