# GEO Studio — 项目规范与决策归档

> 每次进入这个项目,第一件事读这个文件。所有关键决策在这里,详细设计在 `docs/`。

## 一、产品一句话定义

**GEO Studio 是一个多租户的生成式引擎优化(GEO)全链路运营平台——帮本地高客单价服务品牌(口腔、医美、律所、教育、月子中心)在豆包、元宝、夸克、DeepSeek 等 AI 搜索里系统性获得被引用、被推荐、被转化的能力。**

首个客户:某口腔医院(40 人员工号矩阵)。后期 SaaS 化开放给其他品类。

## 二、核心差异化(护城河)

区别于市面上只做「监测出报表」的 GEO 工具,本产品做**完整闭环**:
1. **内容调度中台**:图文 + 抖音脚本双轨,基于 GEO 学术 9 法内置写作指南
2. **员工发布助手**:40 人矩阵派单 + 执行打卡,解决「自动化封号」问题
3. **GEO 追踪引擎**:Playwright 模拟真人在豆包/元宝 App/Web 追踪引用
4. **转化归因**:多钩子(医生名/活动暗号/电话尾号/企微 utm)→ 闭环到到店/成交

竞品做 1 或 3,极少有人做 2 和 4。2 和 4 是真正的壁垒。

## 三、关键决策(不可轻易推翻,推翻前先改这份文档)

| # | 决策 | 定于 | 理由 |
|---|---|---|---|
| D1 | 多租户架构,数据模型第一天带 `tenant_id` + Postgres RLS | 2026-04-23 | 后期要 SaaS 化,不能硬编码单客户逻辑 |
| D2 | 首个客户业务逻辑全部配置化,不写 `if (industry === 'dental')` | 2026-04-23 | 同 D1 |
| D3 | 发布环节**绝不**自动化提交到头条/抖音 App | 2026-04-23 | 员工实名号,自动化=封号集体事件+法律风险 |
| D4 | GEO 追踪**不走火山方舟 API**,走 Playwright 模拟真人在豆包 Web/App | 2026-04-23 | API 返回的是纯 LLM,不带 RAG 检索层,和真实用户看到的答案完全不一样 |
| D5 | 医疗合规采用**三道门**:关键词黑名单 + LLM 语义审查 + 高风险人工复核 | 2026-04-23 | 纯关键词会漏软性违规("效果好""首家"等),翻车即十万起罚 |
| D6 | 转化归因不依赖「前台强制问话」,用多钩子自动回流 | 2026-04-23 | 前台执行率低,会漏 50%+ 数据 |
| D7 | 技术栈锁定:Next.js 14 App Router + Supabase(Postgres+Auth+RLS)+ Playwright Worker + pgvector | 2026-04-23 | 一人+Claude Code 可维护,后期可扩 |
| D8 | 豆包 API(火山方舟)**只用作** LLM 能力调用(品牌识别、合规审查、内容生成),不用作 GEO 追踪 | 2026-04-23 | 见 D4 |
| D9 | 绝不存储员工的头条/抖音账号登录凭证 | 2026-04-23 | 合规、隐私、风控三重风险 |
| D10 | 每条 DB 变更都走 migration,绝不在生产手改 schema | 2026-04-23 | 多租户环境下手改=数据灾难 |
| D11 | 员工端(`/staff`)不走 Supabase Auth,用 phone + 一次性 passcode + HMAC cookie 自建 session | 2026-04-25 | 员工只有手机号没邮箱;Supabase Auth 强绑邮箱魔链不适合移动端高频场景;V1 W5 用管理员手发 dev-passcode 跑通,V1 收尾接阿里云 SMS OTP,`staff_invites` 表结构不变 |
| D12 | 医疗合规升级为**四道门**:在 D5 三道门基础上叠加(a) 历史案例匹配 + (b) 关键词按平台作用域 | 2026-04-29 | (a) 让违规判断有「过往真实罚单」做锚,而不是只靠抽象关键词或 LLM 主观;(b) 同一关键词在抖音和小红书风险等级不同(平台规则差异),全局判罚会过严或过松 |
| D13 | Supabase 改为自托管到阿里云国内节点(替换商业 us-east-1) | 2026-04-25 | 医疗个人信息出境违反《个人信息保护法》;延迟 + 合规两个问题一次解;详见 ADR 003 |
| D14 | V1.7 增加**可发现层(Layer A)**:Schema.org JSON-LD 7 类 + llms.txt + AI Content Feed + AI Sitemap + Discoverability Audit | 2026-05-01 | GEO 三层模型(可发现 / 生产 / 验证)分析下我们 A 层完全空白,而 A 是 B+C 的上游。详见 ADR 005、`docs/06-discoverability.md` |
| D15 | 公开路由按 tenant 显式 opt-in(`tenants.settings.discoverability.public_enabled`) | 2026-05-01 | V1 第一次有对外公开 API,默认关闭、显式开启,降低误暴露概率 |
| D16 | 公开路由内容过滤双闸:实体 `geo_visible=true` + testimonials 必须 `compliance_status='approved'` | 2026-05-01 | 防止未审客户见证 / 草稿状态服务流到公网,合规外溢 |
| D17 | 公开路由缓存策略:build-on-write,artifacts 表存物化结果,公开路由单行读 | 2026-05-01 | 把可能的 N×M 重构成本(N 实体 × M 路由)摊到一次写入,公开访问 < 50ms 单行 SELECT |
| D18 | Schema 生成纪律:**只填有值字段,不用 placeholder 凑数** | 2026-05-01 | placeholder schema 比缺字段更糟,gaming 招致 AI 引擎降权;审计页显式提示"还差什么字段" |
| D19 | 禁用 `pnpm db:generate`,migration 一律手写 | 2026-05-01 | Drizzle journal 自 0006 起冻结,手写为主流;运行 generate 会重新编号撞库导致冲突(2026-05-01 已撞过一次) |
| D20 | **写作要求(意图骨架)× 平台风格(格式/口吻)** 双层叠加,不替换。新增 `writing_templates` 表 + `keywords` 词库,`buildVariantPrompt` 加 `writing_template?` 入参向后兼容 | 2026-05-04 | 抓词GEO 只有意图模板没有平台维度,我们叠加后"产品对比×小红书"和"产品对比×公众号"自动差异化输出,延续 D2 配置化思想;详见 ADR 007 |
| D21 | **GEO 标准内容资产** = 问题资产 + 引用资产 + 结构化资产 + 可验证资产。生成顺序前置两层:`query_intent → content_contract → writing_template × platform_style`(D20 双层叠加保留,降为生成第 3-4 层)。存储改 slice-first(direct_answer / faq_pairs / trust_block 等 typed slices)。DoD 闸门(14+5 条)代替自由审核 | 2026-05-13 | V1.8 内容只是"写得通顺",对 AI 引擎不够"可引用";要从"GEO 运营平台"升级为"GEO 内容标准系统"必须把内容侧也产品化。详见 `docs/07-geo-article-spec.md` + ADR 009 |
| D22 | **核心发布号显式 opt-in**:`staff_accounts.settings.publishing.is_active` 字段(V1.11),`undefined`/`false` 都被 dispatcher H0 过滤跳过派单。新增 staff 默认是辅助号,需 admin UI 手动开启 | 2026-05-20 | 40 人矩阵里日常发布只该有 5-15 个号长期发,其余号留辅助/潜伏避免被算法识别;原 dispatcher 是"所有 active operator 都派",核心号反而吃不饱、辅助号 6h 超时再轮转 |
| D23 | **dispatcher 评分 fallback**:`topicPersonaScore = max(Jaccard, char-trigram*0.7)`,3-字 n-gram 桥接"种植牙知识"(persona tag)和"种植牙 5 年存活率"(variant.topics)。V1.10 起 Jaccard 静默退化为 0(整句 vs 短标签,中文不可能精确匹配),专长派单一直失效 | 2026-05-20 | V1.11 改造时探查发现的隐藏 bug;不修则"上下午档+专长匹配"形同虚设;V1.12 后续 ticket 用 LLM 在 ai-draft 时直接产出 specialty tags 列代替 |
| D24 | **`content_items.target_questions[]` 必须写**:`batch-draft-item` 成功后回写 `[question_id]`,`nightly-draft` enqueue 时传 `question_id`。RPC `daily_ops_pick_topics` 靠该字段反查 `last_used_at` 做 7 天去重;以前从未写过,所以每天选同一批 priority=9 题反复起草 | 2026-05-20 | 冒烟测试发现 02:00 cron 起的 12 题里 4-5 对重复("昆明种植牙医院推荐"×2、"昆明老人种植牙补贴"×2 等),客户每天看到同题客户怀疑产品 + AI 引擎按 spam 降权;同时清理 questions 里 8 个**南京题污染**(songshu 是昆明医院,数据卫生 P0) |
| D25 | **LLM 响应 JSON 解析必须 healing + retry**:`generator.parseResponse` 接住 markdown fence / 前文 preface / 后文 postscript,carve 出 `{..}` 块再 parse;首次失败 retry 1 次 + 强化 prompt "PURE JSON"。total LLM calls per variant 仍 ≤ 2(initial + 1 retry,与既有 rewrite 路径互斥)| 2026-05-20 | 冒烟测试发现 02:00 cron 12 题里 2 题(17%)因豆包返回带 preface 文字而 fail("LLM returned unparseable JSON")→ variant 沉默丢失;`response_format='json_object'` 在 thinking endpoint fallback 后并非铁律 |
| D26 | **GEO 追踪 web adapter 全部走 CloakBrowser**(替换 Playwright vanilla)+ ECS worker 走 `xvfb-run`。CloakBrowser 在 C++ 源码级 patch 了 Chromium 49 处指纹(canvas/WebGL/audio/fonts/GPU/WebRTC/UA/CDP/TLS),Linux 默认伪装 Windows fingerprint 跟 Mac 端 fingerprint seed 一致 → Mac 扫码 cookie 跨设备复用到 ECS 不会失效 | 2026-05-21 | V1.11.1 装 Chromium 后撞了两堵墙:(a) 真 Chrome 在 ECS 没 X server 跑不起;(b) Mac 扫码后 rsync cookie 到 ECS 被豆包识别"跨设备指纹不一致"让 cookie 失效。CloakBrowser 同时解了这两个:(a) 走 xvfb 提供虚拟 X;(b) 设备指纹源码级伪装 ECS = Mac 同一台 Windows。206MB binary 国内拉 GitHub 被 502,本地代理下载后 scp 部署。verifying snapshot test 2026-05-21 10:20 收到豆包 627 字节真实回答,V1.10 以来 7+ 天 41/41 failed 后首次成功 |
| D27 | **Tracker adapter 提交按钮必须 per-attempt 短超时**(3s)+ `force:true` 跳过 actionability 等待,失败 fall-through 下一个 selector,所有 selector 用完再走 keyboard Enter 兜底。**严禁单 click 默认 30s** | 2026-05-21 | V1.11.2 后第一次跑 local 推荐题"昆明全口种植牙哪家好"30s 卡死,根因是 V1 send-button loop 没传 click timeout option,Playwright 默认 actionTimeout=30s。RAG 模式下豆包 DOM 在 transient state,等 "stable" 等不来 → 单 click 烧光全部 budget。新协议把 worst case 从 30s 压到 ~15s(5 selector × 3s) |
| D28 | **Tracker 判定"已提交"用 URL flip OR welcome-card hidden 双信号 OR**,不再单看 URL。普通 chat 模式 URL flip 到 `/chat/<id>`;RAG 模式 URL 保留 `/chat/` 但隐藏 welcome 卡片。两个信号缺一就保守拒绝 + 报错明确分类 | 2026-05-21 | 同 D27 — 强单一信号(URL)在 RAG 模式下永远 false-negative。`failure_reason` 不再叫 "login required",而是 "submit not accepted — neither URL flip nor welcome hide observed",更准 |
| D29 | **Adapter `meta` 必须记录关键调试维度**(`submitted_via` / `flipped_by` / `winning_selector` / `current_url`),让 Sentry 上看到每次失败时具体哪个 selector path 用了 / 哪个 URL 没切。**禁止"failed: timeout 30000ms"这种黑盒报错** | 2026-05-21 | V1.11.2 → V1.11.4 调试一次烧 90 分钟,主要时间花在 SSH 进 ECS 查 worker log 推断哪个 selector 卡了。meta 写进 Sentry tag 后下次类似问题 30 秒定位 |
| D30 | **worker 必须用固定 `DISPLAY=:99`,禁止 xvfb-run wrapper**。Xvfb :99 由 start-worker.sh 检测启动(boot 时也可加 systemd unit),worker 进程共享同一 display。`pnpm doubao:login`(或 novnc-login)用同一 display 扫码 → cookie 自动给 worker。**这是 CloakBrowser + headful + cookie 复用的关键纪律** | 2026-05-21 | V1.11.4d 之后 SOV 流通了,但 brand-review/local 类题仍 fail。诊断发现根因:xvfb-run 每次 worker 启动随机分配新 display(:1001/:1002/…),CloakBrowser fingerprint seed 跟 display/进程关联 → 同一 cookie 在不同启动间被豆包识别为"新设备"→ 当未登录处理。固定 DISPLAY=:99 后,worker 跨重启共享 fingerprint,豆包识别为同一设备,登录态 stable;V1.11.4e ship 后"松鼠口腔怎么样" 立刻 done + 756 字节真 RAG 答案 + 8 brand + 9 service + 1 location citations |
| D31 | **GEO 内容矩阵的最小单位是「子问题」,不是「主题词」**。`questions.parent_id` 自指 — 主题题(parent_id=NULL)+ 由 LLM 展开的 8-10 子问题(parent_id=主题题 id,subtopic_source='llm_expand')。daily-ops cron 应优先选子问题派单 — 颗粒度更细,标题命中关键词概率更高 | 2026-05-23 | 豆包GEO检索增强报告 §1.8 + §3.3:豆包「边想边搜」Agent 把 1 个 query 内部拆 8-10 子查询,新榜大样本(2026 Q1, 47.4 万引用源)测得**标题与子问题关键词匹配度 r=0.23 是唯一显著正相关因子**;字数/粉丝/互动 r<0.04 全不显著。GEO 战略从"做几篇 10W+ 爆款"换成"建几百长尾覆盖关键词矩阵"。详见 `docs/research/doubao-geo-mechanism.pdf` |
| D32 | **子问题展开 + 任意内容生产链路 严禁 mention 具体竞品名**。SYSTEM_PROMPT 加 5 条医疗合规红线(竞品/绝对化/疗效/贬低/comparison-by-name),server action 加 `brand_vocab.competitor` grep 兜底层 — 任何子问题 text 含竞品名 → 自动 reject 不入库 | 2026-05-23 | V1.12 D31 上线 1 小时内首次实测就触雷:LLM 生成"松鼠 vs 德韩口腔 性价比"子问题。**《广告法》第十三条禁止医疗机构贬低同行、对比性词语**,翻车一次 = 十万起罚。子问题作为后续 cron 起草的 seed,seed 含竞品名 → 起草内容必违规。这是 GEO Studio 跨任意行业(医疗/法律/教育)都必须刚的合规结构 |
| D33 | **合规第一道门必须覆盖"软性违规"高频话术,不只是硬禁词**。migration 0041 加 8 条 B/A 级 substring 规则(医生背书:接诊过/年种植经验/年临床经验/主刀完成;变相广告:带来福音/提供专业的/提供种植牙服务/口腔解决方案)+ 45 variants。**关键架构事实**:D5 第二道门 LLM 复审**只在第一道门 verdict=warn 时触发**,如果软性违规不进黑名单 → keyword pass → 直接 auto_approved → 漏到生产。**这是 V1.6 起隐藏一年的产品级 P0** | 2026-05-25 | 2026-05-25 三篇内容审计(zhihu published / 中午新生成 / 用户测试版)反复出现相同 pattern:"刘彦廷有 20 年种植经验"+"为缺牙人群带来福音"+"提供种植牙服务"。修复后同篇 keyword 命中从 0 → 4,LLM 第二道门真触发并额外抓到"不会被身体排斥"绝对化用语。scanner.ts 是纯 substring(indexOf)不支持 regex,所以 X 年经验类只能列穷举 variants;通用兜底靠 stage-2 LLM。详见 migration 0041 + `docs/03-compliance.md` (待同步) |
| D34 | **白名单引用必须有 ground-truth 校验维度,不只匹配标题**(P0-1)。citation_check 当前只比 `<...》` 标题字符串,issuer/year/页码/key_claims 数据点全部漏校验 → LLM 可以"标题对但说错出版方/年份/编造页码",验证 verdict 仍 'ok'。**修复方案**:scanner 扩展三种新校验模式 — (a) 出现 `<标题> + <出版方>` 时校验 issuer (b) 出现 `<标题> + N 年` 时校验 publication_year (c) 出现"第 N 页"时直接 reject(key_claims 无页码字段=一律视为编造) | 2026-05-25 | 同次审计发现:white-list 里《牙种植体临床应用指南》issuer="国家卫健委"/year=2022,但 LLM 写"中华口腔医学会 2023 年发布"标题相同 issuer/year 全错,citation_check verdict 仍 'ok'。这道门修不齐 = 白名单收紧也只防"无中生有",防不了"借真书名包假数据" |
| D35 | **Stage-2 LLM 判 warn 也触发 auto-rewrite(限 1 次),不直接进人审队列**。compliance-review.ts L227 原行为:LLM warn → finalStatus=pending → 进人审。改为 finalStatus=pending(UI 不变)+ `warnNeedsRewrite=true` flag → 走 L340 auto-rewrite 路径,payload 带 `reason: 'warn-d33'`。compliance-auto-rewrite.ts L96-99 gate 放宽 — `reason='warn-d33' AND compliance_status='pending'` 也接受。auto_rewrite_count cap=1 自然防循环:第二次 review 仍 warn 时 count=1 → 不再 enqueue → 落 pending 进人审 | 2026-05-25 | D33 黑名单生效后实测发现:Round-3 生成的"提供专业的种植牙服务/带来新的希望/不会被排斥"3 处违规 stage-1 抓 1 条 + stage-2 LLM 多抓 2 条,但 LLM 判 verdict='warn'(medium) 不够 reject 强度 → 直接进人审。客户 40 人矩阵每天 N 篇全靠人审审核不现实。auto-rewrite 让 LLM 用 findings 改写一次,改完仍 warn 再进人审,人工成本下降 50%+ |
| D36 | **改写后兜底:keyword pass 但 LLM 历史 spans 仍在 body → 强制降级 pending**。compliance-review.ts L243 clean-keyword 分支里加 guard:当 `auto_rewrite_count >= 1`,聚合 **全部历史** stage='llm' findings 的 span 集合,任何 span 仍 literally 在 body 里 → finalStatus 从 auto_approved 降回 pending。**关键设计**:必须 union 全部历史 LLM findings 而非"最近一次",因为改写后的二次 LLM 复审看到的是改写后 body,会漏抓原始 spans。无新 LLM 调用,纯 text contains() check | 2026-05-25 | D35 cascade 实测:LLM 改写有 ~30% 漏改率,具体 case 是 "不会被身体排斥" 这种弱保证绝对化语 stage-1 没收(变体太多),stage-2 上次抓了但改写漏改,变体 keyword 仍 pass → 错误 auto_approved。D36 兜底后同 variant 真实从 auto_approved 降回 pending_review。**遗留小 bug**:worker 端 writeAudit 在此分支 silently 失败(直接 SQL INSERT 同样行能写),不影响 status 字段降级,留 V1.13 修 |
| D37 | **GEO Studio 的 AEO 演进边界 — 4 类 GEO 战术分级,B+C 类激进合规明确允许做,A+D 类违法/攻击永不做**(2026-05-27 用户对齐版)。GEO Studio 未来从 GEO 延伸到 AEO(Answer / Agent Engine Optimization),目标 = **让豆包 / 元宝 / 夸克在多家可选时优先推荐我们**,做法分四级:**(A) 真违法黑帽 — 永不做**:RAG Poisoning(虚假内容站)/ Citation Poisoning(假 DOI 假期刊) / Entity Poisoning(假资质假补贴) / Service Registry Poisoning(假服务条目) / 竞品贬低 / 疗效造假("100%" "根治" "无副作用" "首家") / 数据造假;依据《广告法》第 16/17 条 +《刑法》222 条 +《反不正当竞争法》第 11 条。**(B) 激进合规 GEO — 明确允许且应该做**:B1 子问题 700+ 量级覆盖(D31)/ B2 同主题多角度同日发布 / B3 占满 AI 偏好源(头条/抖音/百家号/知乎/公众号/小红书/搜狐/视频号/网易号)/ B4 高频刷 updated_at 时效信号 / B5 数量级压制(40 员工 × 9 平台)。**(C) 灰色合规 — 显式允许,单独审计追溯**:C1 借品类词阵地("昆明哪家口腔好"等不带品牌名 query)/ C2 真数据可视化诱导(数据必须经 D34 ground-truth 校验)/ C3 AI 友好结构信号(reviewed_by/updated_at/citation **真值**,三个值必须真且经 verified_citations 白名单校验)。**(D) 攻击型黑帽 — 永不做**:Negative SEO 攻击 / 第三方站投毒 / 买号假装患者发负评 / 内容里植入恶意 prompt 改写竞品答案;反不正当竞争法 + ROI 论证(一次被识别永久域名级降权)。**永不做的其他边界**(独立于黑帽):MCP Server / A2A 协议落地(国内 agent 未消费)/ 自动支付 / 自动预约成交 / 自动医疗诊断 / D3 自动登录员工平台 / D9 存储员工凭证。AEO 三大产品(AEO Readiness 8 维评分 / Agent Service Feed / AI 答案污染监测)同时承担**防御**(监测 A 类污染我品牌)+ **进攻**(主动发现 B+C 类 GEO 机会并 enqueue 工单)双职责,代码层硬约束:不允许 outbound 写入第三方平台、不允许生成针对竞品负面提示词、任何 B/C 类工单必须经客户管理员人审、任何 reviewed_by/citation 字段必须有真值依据。P0(2026-05-27)产出 ADR 011 + `docs/10-aeo-readiness.md` + `docs/04-roadmap.md` V3 候选 + 本决策,**零代码 / 零 SQL / 零 migration**。**本决策不推翻 D1-D36 任何一条**,所有 AEO 演进复用现有 Layer A(D14-D18)+ D21(content_contract)+ D33-D36(合规四道门)+ 反馈回路(docs/08)| 2026-05-27 | 论文《Agentic Web: Weaving the Next Web with AI Agents》(arxiv 2507.21206,SJTU+UC Berkeley+UCL,2025-07,76 页)论证 Web 三段论 PC→Mobile→Agentic 进入第三阶段 + Agent Attention Economy 第三方服务竞争 agent invocation;论文 §7.1.1 Table 5 把 C2 Knowledge Base Poisoning 归为威胁。**初稿(2026-05-27 上午)把"黑帽"一刀切禁了 B+C 类激进合规战术,2026-05-27 下午用户拍板修正**:GEO Studio 产品定位本身就是激进合规 GEO,B+C 类是核心战术杠杆(D31 子问题矩阵命中 r=0.23 唯一显著因子);只有 A+D 类(虚假信息 / 攻击竞品)真违法。**关键洞察**:C 类的"诱导"是优化真实数据呈现 + 暴露 AI 偏好的机器可读字段;A 类是伪造数据本身 — 两者根本区别在数据真伪而非操控意图。详 ADR 011 §5.4 4 级分类 + `docs/10-aeo-readiness.md` §5.2 监测模块双职责 |

## 四、目录结构(强制)

```
geo-studio/
├── CLAUDE.md              # 本文件(项目规范 + 决策归档)
├── README.md              # 对外简介(后期写)
├── docs/                  # 所有设计文档
│   ├── 00-product-definition.md   # 产品定位、用户画像、价值主张
│   ├── 01-architecture.md         # 系统架构、技术栈、部署拓扑
│   ├── 02-data-model.md           # 多租户数据模型、核心表、RLS 策略
│   ├── 03-compliance.md           # 医疗合规四道门、关键词库、LLM prompt、历史案例库
│   ├── 04-roadmap.md              # V1-V3 分阶段交付路线
│   └── adr/                       # Architecture Decision Records(后续追加)
├── apps/
│   ├── web/               # Next.js 主 App(前台 + 后台 + API Routes)
│   └── worker/            # Node.js 独立 Worker(Playwright 爬虫、定时任务)
├── packages/
│   ├── db/                # Drizzle ORM schema + migrations
│   ├── shared/            # 跨 app 共享的类型、工具、常量
│   └── geo-core/          # GEO 追踪核心逻辑(可独立发包,后期单独售卖)
├── supabase/              # Supabase 本地配置、seed、RLS policies
├── .env.example
├── .gitignore
├── package.json           # pnpm workspace 根配置
└── pnpm-workspace.yaml
```

**不允许**:
- 在 `apps/web/` 里写业务领域逻辑,必须抽到 `packages/`
- 新建 `src/utils/` 这种放杂物的目录,命名要明确意图
- 文件名用中文

## 五、技术栈(详细见 `docs/01-architecture.md`)

| 层 | 选型 |
|---|---|
| 语言 | TypeScript(全栈唯一语言,含 Worker) |
| 前端框架 | Next.js 14 App Router + React Server Components |
| UI | Tailwind CSS + shadcn/ui |
| 状态 | Zustand(客户端)+ Server Actions(服务端) |
| 后端 | Next.js API Routes + Server Actions |
| 数据库 | Postgres(Supabase)+ pgvector |
| ORM | Drizzle(比 Prisma 轻,类型更好) |
| 认证 | Supabase Auth(邮箱+手机号) |
| 权限 | Postgres RLS(行级权限,多租户核心) |
| 任务队列 | pg-boss(纯 Postgres,不开 Redis) |
| 对象存储 | Supabase Storage(Word/PDF/图片/视频) |
| 爬虫 | Playwright(独立 Worker 进程) |
| LLM | 火山方舟 SDK(豆包 Pro 做语义分析)+ OpenAI(兜底,英文场景) |
| 包管理 | pnpm(workspace monorepo) |
| 部署 | Vercel(web)+ Supabase(DB/Auth/Storage)+ Railway(worker) |
| 监控 | Sentry(错误)+ Axiom(日志)+ Supabase Realtime(指标) |

## 六、命名规范(强制)

### 代码 / 文件
- **文件名**:kebab-case(`content-item.ts`,不是 `ContentItem.ts` 或 `content_item.ts`)
- **React 组件**:PascalCase 文件(例外:`ContentCard.tsx`)
- **数据库表**:snake_case 复数(`content_items`)
- **字段**:snake_case(`tenant_id`,不是 `tenantId`)
- **TypeScript 类型**:PascalCase(`ContentItem`,DB 层用 Drizzle 自动推导)
- **常量**:SCREAMING_SNAKE_CASE

### 业务概念(中英对照,所有代码用英文)
| 中文 | 英文 | 缩写 |
|---|---|---|
| 租户 | Tenant | - |
| 品牌 | Brand | - |
| 员工账号(矩阵节点)| Staff Account | `staff` |
| 内容条目 | Content Item | `content` |
| 发布任务 | Publish Task | `task` |
| 问题库条目 | Question | `question` |
| GEO 快照(一次追踪)| GEO Snapshot | `snapshot` |
| 引用记录 | Citation | - |
| 转化事件 | Conversion Event | `conversion` |
| 合规审查 | Compliance Review | `review` |

### Git
- **分支**:`feat/xxx`、`fix/xxx`、`refactor/xxx`、`docs/xxx`
- **commit**:英文,conventional commits(`feat:`, `fix:`, `refactor:`)
- **绝不**自动 `git push`(用户协作规则)

## 七、合规红线(医疗语境强制,详细见 `docs/03-compliance.md`)

所有用户可见的内容发布前必走**四道门**(D5 + D12):
1. 关键词黑名单(同步,< 50ms,按平台作用域过滤)
2. 豆包 LLM 语义审查(异步,< 3s)
3. 历史违规案例匹配(Jaccard 相似度 on `compliance_cases.violation_patterns`,锚定真实罚单,跨租户共享)
4. 高/中风险 → 管理员人工审批

**审计日志保留 ≥ 3 年**(医疗广告法诉讼时效)。详细设计见 `docs/03-compliance.md`(2026-05-11 已对齐四道门版本)。

## 八、协作准则(和用户约定)

1. 关键决策先改 `CLAUDE.md` 或 `docs/` 再动手,不许"边做边定"
2. 新模块动手前先画数据模型 diff,贴在 PR 描述里
3. 改 `packages/db/schema.ts` 必须同步生成 migration,不在生产手改
4. 失败两次就停下来汇报(用户规则 #10)
5. 所有 commit 保留 `Co-Authored-By: Claude`,不隐藏 AI 参与
6. 涉及金钱/合规/隐私的变更,必须和用户确认后才推进

## 九、当前状态(2026-05-20 更新)

### 已完成
- **V0 骨架**(2026-04-23):docs/ 五份 + CLAUDE.md + monorepo 立起
- **V1 W1-W7 主体**(2026-04-23 → 2026-04-25):多租户 + 内容中台 + 合规三道门 + 派单 + 移动端 + GEO 半自动追踪 + 转化归因
- **V1.5 知识库驱动 AI 内容工厂**(2026-04-25 前后):KB 实时同步、AI 起草、平台风格从 KB 派生、引用守卫、周报邮件
- **V1.6 增量补强**:合规四道门(D12)、GEO 9 法评分、低分变体自动改写 + rescue 页、SOV 8 周热力图、引用幻觉检查、verified-citations 白名单、多引擎 dispatcher 起步
- **V1.7 可发现层**(2026-05-01,**Sprint 0-6 全部完成**):
  - **A 组(可发现层)**:Schema.org JSON-LD 7 类生成器、`/c/[slug]/llms.txt` + `llms-full.txt` + `ai-content-feed.json` + `ai-sitemap.xml` 4 条公开路由 + ETag/304 + 60/min rate-limit + opt-in 闸 + service-role 物化缓存(`discoverability_artifacts`)+ build-on-write worker job(`discoverability.regenerate`)+ 4 维度 audit 评分(完整度/数据规模/可信度/时效性)+ 完整 admin UI(hub + brand 编辑 + services/testimonials/faqs CRUD)
  - **B 组(生产层补强)**:内容独特性检测(Jaccard + 结构 + 关键信息,自动加 `uniqueness_warning` 到跨平台变体)+ E-E-A-T 4 维度命名映射(scorer 不动,纯命名 + UI 标签)
  - 数据模型扩 7 张 migration(0015-0021):brands 扩列、staff 加 geo_profile_visible、新增 services / testimonials / faqs / discoverability_artifacts、tenants.settings.discoverability 默认值
  - 109 项纯函数测试覆盖(profile builders 33 + schema generators 49 + artifact generators 23 + uniqueness/eeat 19 + RLS / behavioral 已在 S1 e2e 验证)
  - **关键安全 bug 抓+修**:`unstable_noStore()` 缺失会让 Next 14 Data Cache 把过期的 opt-in 状态喂给路由 → opt-out 失效 → 客户内容继续泄露。S3 实测时定位 + 修复
- **V1.8 创作向导(D20 / ADR 007)**(2026-05-04):由竞品「抓词GEO」分析驱动:
  - 数据模型 migration 0024:`writing_templates`(系统预设 + 租户自定义)+ `keyword_groups` + `keywords`(三种来源 manual/combine/ai_dig)+ `content_items` 扩 `writing_template_id` + `keyword_ids`
  - 12 个系统预设写作要求(操作教程 / 产品对比 / 痛点解决 / 终极指南 / 案例研究 / PAS / 小红书种草 / 知乎硬核 / 公众号情感 / 新闻公关稿 / 第三方测评 / 短视频脚本)
  - `buildVariantPrompt` 扩展 `writing_template?` + `keywords_to_plant?`,**红线优先于模板**(防 prompt injection),20 case 单测全过含恶意模板防御
  - `createAiDraft` 扩展同两参数,系统模板 prompt_skeleton 拼到 SYSTEM_PROMPT 之后
  - 三个新 admin 页:写作要求库 / 关键词词库(含 6 维组合 + AI 智能挖掘 + 合规第一道门入库前过滤)/ 创作向导(3 步:参考资料 → 关键词 → 写作要求)
  - 抓词GEO 的 "GEO 排名优化" 模板**未照抄**(软广堆砌,踩医疗合规),作为后续工单单独评估改造为 `geo-ranking-objective`
- **V1.8.x 增量补强**(2026-05-04 → 2026-05-10):
  - migration 0025 `numeric_fact_check` — 数值类事实检查,防止杜撰统计
  - migration 0026 `brand_service_areas` — 品牌服务区域多对多
  - migration 0027 `kb_multitenancy_and_observability` — KB 多租户隔离 + 观测字段
  - 反幻觉:上游断源 + 双层 sanitizer + 收紧引用检测(commits 3f3abce / 6fdb14e)
  - UI 暗色 cinematic redesign 跨 landing/tenant/staff(9ee7ddc + 两个 stragglers 修复)
  - 安全:暴破限速 + 用户枚举修复 + URL 域名白名单(ac2629e)、gitignore 真实员工 handle(fd57823)
  - 员工邀请链接 TTL 24h → 7d + 手机号绑定校验(56b0c1d,D11 衍生)
- **V1.9 batch AI drafting**(2026-05-10,migration 0028 `draft_batches`,commit 4bba685):
  N 题 × M 平台一键派发,把"逐题逐平台调 LLM"折叠成单次批处理 job
- **V1.9.1 工程纪律补强**(2026-05-11,本次会话):
  - kb-sync `URI too long` 修复(unchangedIds 分批 100 / batch,commit ed616b0)
  - 测试 hardening:`_test/_runner.ts` 全局 unhandled-rejection guard + 90s per-test timeout,3 个失败测试加入 guard(commit 3e7eaff)
  - 顺手清:next.config `trustHostHeader`(Next 15 only,14 no-op)、/staff themeColor 拆 viewport
  - test-auth marker 改为 OR 探测(V1.7 cinematic redesign 后 stale 的 marker 复活)
- **V1.9.2 生产上线**(2026-05-12):本地 main `c8d237d → fa6331b` 全套推上 ECS,Caddy 切 HTTPS,域名 `https://geo.dulijun.icu` Let's Encrypt 自动签证书。途中修了 PWA SW 缓存陷阱(`fix(staff): drop PWA`)、worker tsx 路径(`fix(deploy): worker tsx path`)、standalone static 漏 cp(`fix(deploy): rsync .next/static`)、暗色 cinematic 漏改的对比 bug、prose-slate→prose-invert
- **V1.9.2.x 滚动 deploy(2026-05-12 → 2026-05-13,补记)**:V1.9.2 上线 24h 内继续把 32 个 commit 滚动上 ECS,HEAD `fa6331b → 379ea0b`。这批含 **D21 GEO 标准内容资产 P0~P3 全套**(migration 0030~0033 / slice-first 存储 / DoD 闸门 / L2 scorer / wizard contract persistence / 公开层消费 D21 slices / tenant home briefing hero)、**合规自动改写**(第一次 reject 最多重写 1 次)、extractor 多种 FAQ 格式补、KB safety abort、Ark response_format fallback 等 P0 修。**当时 CLAUDE.md 未同步**,V1.9.3 顺手补
- **V1.9.3 员工端跳转按钮全覆盖**(2026-05-13,commit `d6f90b7`):员工任务卡之前只 3 个平台(头条/抖音/小红书)有"打开 App"按钮,公众号/知乎/百家号/搜狐号 4 个平台无任何跳转。本次扩**7 平台全覆盖**,按内容类型分流——视频/短图文(抖音脚本/小红书)→ App scheme 跳手机端;长图文(头条/公众号/知乎/百家号/搜狐号)→ PC 创作后台 URL 新标签。按钮文案动态化("打开公众号后台"等)。顺手运维:**ECS 配 GitHub deploy key**(以前 deploy.sh `git pull` 每次卡交互 auth,本次 ed25519 deploy key 配置永久解决);ECS ssh 凭证存 memory `reference-ecs-ssh.md`,实际是 `root@`,不是 deploy.sh 顶部注释的 `ubuntu@`
- **V1.11 核心发布号 opt-in + dispatcher 评分修复**(2026-05-20,本次会话):
  - 客户痛点:40 个员工号轮派 → 核心号吃不饱、辅助号 6h 超时再轮转,且每天每号上下午各一发的工作流没法精准落到指定号
  - **migration 0038** `staff_accounts.settings jsonb` + 部分索引 (D22)
  - **dispatcher H0 过滤**:`settings.publishing.is_active=true` 才接派单,`undefined`/`false` 跳过。dispatcher.ts/types.ts/scoring.ts 同步改;新增 per-staff `daily_quota` 覆盖 (default global cap=2 即"上午+下午")
  - **隐藏 bug 修复(D23)**:V1.10 起 Jaccard 在"短 persona 标签 × 整句 topics"组合下静默退化为 0,专长派单一直失效。新加 `topicPersonaScore` 用字符 3-gram fallback 桥接(Math.min(0.7, hits/personaTags.length)),实测"种植牙知识 ↔ 种植牙 5 年存活率"能 match。**4 个新 dispatcher 测试**(T7 H0 inactive / T8 per-staff quota / T9 全 inactive 错误诊断 / T9b trigram fallback)全过,共 12 测试
  - **SQL 落库 13 个核心号**(songshu):矫正组 4 + 种植组 4 + 儿牙组 4 + 综合 1。其余 6 个 operator(orz/sorrikemn/呀哈哈/喝可乐的猫猫/小呆的追剧小日常/王)保持 `'{}'` 默认 inactive
  - **quota 升级**:songshu `daily_ops_settings.topic_count_auto` 5 → 11(13 题/天 × 2 平台 = 26 variants/天,正好覆盖 13 核心号 × 上下午各 1),LLM 成本预估 ~$2.5/天 = $75/月
  - **admin UI**:员工列表新增"核心发布"列,绿/灰双态 toggle + 表头实时统计"X 个核心号接派单 · Y 个辅助/潜伏";server action `togglePublishingActive` 带 audit log
  - **未部署**:Checkpoint A+B 落地 local DB,代码改完未推 ECS、未 git commit(等用户验收)。F2(LLM 提 specialty)留 V1.12 ticket
- **V1.11.2 CloakBrowser 替换 Playwright vanilla → GEO 追踪 7 天停摆复活**(2026-05-21,本会话):
  - 起因:I4 装 Chromium 后第一次 trigger snapshot 在 ECS 上失败 ——「`Missing X server or $DISPLAY`」(headful Chrome 在 headless Linux 上没法跑)+ rsync Mac cookie 到 ECS 被豆包识别为「跨设备指纹不一致」让 cookie 失效
  - **D26 决策**:把 doubao/yuanbao/deepseek 三个 web adapter 的 `chromium.launchPersistentContext` 全替换成 `cloakbrowser` 的 drop-in 替代(`cloakbrowser ^0.3.28`)。CloakBrowser 在 C++ 源码级 patch 了 Chromium 49 处指纹(canvas/WebGL/audio/fonts/GPU/WebRTC/UA/CDP/TLS),Linux 默认伪装成 Windows 指纹,跟 Mac 端 fingerprint seed 一致 → Mac 扫码的 cookie 拿到 ECS 直接复用,不需要在 ECS 现场扫码
  - **配套**:start-worker.sh 加 `xvfb-run -a --server-args="-screen 0 1280x900x24"` 包装(headful Chrome 比 headless 反爬更稳,但 ECS 无桌面要 xvfb 提供虚拟 X server)
  - **二进制部署**:206MB CloakBrowser Linux 二进制本地下载 + scp 上 ECS `/root/.cloakbrowser/chromium-146.0.7680.177.3/`,写 latest_version marker 文件防 auto-redownload。国内 ECS 拉 GitHub release 被 502 blocked,必须本地代理下载后传
  - **真生产验证**:`/root/.cache/geo-tracker/doubao/` rsync 145MB Mac userDataDir → ECS,触发 doubao snapshot 跑通 ——「种植牙有副作用吗」豆包返回 627 字节完整结构化中文回答(短期反应/风险/长期坏处),status=done。**这是 V1.10 以来 7+ 天 41/41 failed 之后第一次 GEO 追踪成功**
  - 7 个文件改 + 3 处源码级反爬补丁全部由 CloakBrowser binary 承担(原代码删 `--disable-blink-features=AutomationControlled` / Mac UA spoof / `navigator.webdriver` init script)。typecheck 全栈 clean
  - **风险标记**:CloakBrowser 是社区 GPL 项目,生产 worker 一旦核心依赖它,它出 bug 会拖累 GEO 追踪。仓库已 clone 在本地 `/Users/dulijuner/projects/CloakBrowser` 必要时可自己 patch + fork
- **V1.11.1 冒烟测试发现三连修复 + 数据卫生**(2026-05-20,同会话续):
  - 起因:用户要求"项目开发得差不多了,冒烟测试一遍"。L1 typecheck 全栈过、L2 213 项纯函数测试全过、L4 prod 数据健康、L5 HTTP smoke 公开层全 200 — 但同时挖出 3 个 P0 真问题
  - **S1 假电话修复**:`brands.contact_phones` 从 `{0571-88888888}` (杭州区号占位)改为真号 `{0871-68152121}`。enqueue `discoverability.regenerate` → 4 个 artifact(llms.txt / llms_full / feed_json / sitemap_xml)09:46:29 重生,HTTP 实测真号已 LIVE。源头是 W5 dev seed (`packages/db/src/_dev/seed-w5.ts:192`),保留为 dev 占位
  - **S2 LLM JSON 解析失败修复(D25)**:`generator.parseResponse` 加 `{..}` 块 carve healing(吃掉 markdown fence / 前文 preface / 后文 postscript)+ 失败 retry 1 次 + 强化 prompt "PURE JSON"。新增 `parse-response.ts` 10 项测试覆盖 fence / 前文 / 后文 / 夹心 / 损坏 5 种 case 全过。02:00 cron 12 题中 2 题(17%)沉默 fail 的损耗止血
  - **S3 题目重复修复(D24)**:`nightly-draft` enqueue 时 select + 传 `question_id`,`batch-draft-item` 成功后回写 `content_items.target_questions = [question_id]`。**历史 12 个 content_items 回填 10 个 target_questions**(2 个是手填 manual_slot 无 question_id)。明早 cron 选题预演 11 个题 100% 新题 + 0 重复
  - **数据卫生**:soft-delete 8 个**南京题污染**(songshu 是昆明医院,questions 表里"南京种植牙推荐哪家口腔医院?" / "南京正畸专家推荐?"等 priority 9-6 的错地域题导致 stuck variants)
  - **均已 LIVE 数据 + 待部署代码**:DB 改动(电话 + target_questions backfill + 南京清理)直接生效;S2/S3 代码改动等 G2 一起部署
  - **2 个 commit 待 push**:eaea1a7 (V1.11 dispatcher) + 新 commit (V1.11.1 S2+S3 + CLAUDE.md)

### 当前阶段
- **2026-05-13 决策**:D21 GEO 标准内容资产(ADR 009 + docs/07-geo-article-spec.md),写作环节从"自由 prompt"升级为"contract → slice → DoD"工程化产线
- **V2 反爬基础设施可启动**:多引擎 + 账号池 + 代理 + 指纹隔离(ADR 004)
- 生产环境:`https://geo.dulijun.icu`(Caddy 自动 HTTPS)+ `:9443`(IP fallback HTTP)+ `:8000`(自托管 Supabase,见 D13)

### 阻塞 / 待澄清 / 已知技术债
- ~~**D21 落地 P0 待开工**~~ **已 ship**(2026-05-12 → 2026-05-13,见 V1.9.2.x 条目):`content_contracts` migration 0030 + slice-first 存储 0031 + DoD 闸门 0032 + draft_batches_d21 0033 已上 prod,`buildVariantPrompt` 扩 contract 入参 / SYSTEM_PROMPT 10 结构块约束 / Trust Block 注入 / L2 structure-aware scorer / wizard contract persistence / 公开层消费 D21 slices 全部完成。**剩余 P2**:legacy_passed grandfather backfill 跑没跑全 ETL 没归档;DoD 五条 FAQ 严格 prompt 已经 ship 后还遇到过若干极端 case(8204731/16b6f46/379ea0b 反复改 prompt)
- **TEMPORARY 账号密码登录**:`/login/quick` (songshu/123456) 临时绕过邮箱魔链,deadline 2026-06-30 替换为 Supabase Auth 多用户或 phone+passcode
- ~~Worker pg-boss 连不上 DB(P0)~~ **已修复 2026-05-13**:DATABASE_URL 误写 `postgres.studio:`,Supavisor 实际注册 tenant 是 `your-tenant-id`(`/opt/supabase/docker/.env` `POOLER_TENANT_ID`)。sed 修正 + pm2 reload + 重启 worker = `[worker] pg-boss started`。`.env.production.example` 已加注释防再踩
- **`NEXT_PUBLIC_APP_URL` 未同步**:仍是 `http://47.98.131.138:9443`,影响 llms.txt / sitemap.xml / invite link 等"对外暴露 URL"。需 rebuild
- **W8 真实数据验收未归档**(40 人打卡率、5 起到店转化追溯、医院见证)。Stub 见本节末
- **可观测性已接通 P1**(2026-05-14):`.env` 有 `SENTRY_DSN` / `AXIOM_TOKEN` / `AXIOM_DATASET`,`packages/shared/src/observability.ts` 提供 `reportError` / `reportEvent` 抽象(当前实现 = 结构化 JSON console;`@sentry/node` 装包后无需改调用方代码)。**worker 端 10 处接通**(unhandled-rejection、main_fatal、compliance-auto-rewrite、batch-draft-item、geo-snapshot、discoverability-regenerate)。**web 端 8 处接通**(compliance: ai_rewrite_variant / ai_rewrite_geo_score / ai_rewrite_citations × 3 个 server action;ai-draft: llm_call + json_parse;api.internal: ai_draft + backfill_slices.row + rewrite_citations × 3 个内部 API)。**剩余 stub** = 装 `@sentry/node` 把 console JSON 转 Sentry SDK 调用(已写好的 TODO 注释 + `docs/observability-setup.md` 步骤),生产部署后做。详见 `docs/observability-setup.md`
- **自托管 Postgres `:shutdown, :db_termination`**:test-content 接近完成时被 server 主动断连。怀疑 connection pool 没释放 / max_connections 偏低 / idle timeout 过短。需要单独 infra 工单
- **测试自洁缺失**:`content-flow` / `compliance-llm` / `variant-flow` 创建的 tenant 没 cascade delete,每轮 kb-sync 都要 skip。需在测试 finally 里清理
- **3 个 smoke test 仍需深挖**:test-content 卡 `:db_termination`(infra)、test-compliance-llm 偶发卡住、test-auth 跑生产 URL 不跑本地(默认 fallback 链路待优化)
- **deploy.sh 文档过时**:`ops/deploy/deploy.sh` 顶部注释写 `ssh ubuntu@47.98.131.138`,但 ECS 实际登录用户是 **root**(`~/.ssh/id_ecs`)。2026-05-13 V1.9.3 部署时踩到。已写进 memory `reference-ecs-ssh.md`,deploy.sh 注释下次顺带修
- **5 处横向反馈回路未闭合**(立项 2026-05-14,详见 `docs/08-feedback-loops.md`):追踪→选题、引用→关键词热度、归因→内容业务价值、员工反馈→难发布标签、audit→生产端 banner。垂直主轴 D21 已通,横向回流 0。**总工时估算 6.5d**,排进 V2 第 13-14 周。客户感知:从"14 个 tab 各自孤岛"到"一页看全本周回路"
- **V1.10 日常运营自动化已部署但有 3 个 bug(2026-05-19)**(详见 `docs/09-daily-ops-automation.md` + `docs/04-roadmap.md` V1.11):客户反馈"每天都要盯发送给员工,太麻烦",方案=cron 定时起草 → DoD/合规自动放行 → 6h 超时机制 → 派单 → 异常时介入。混合选题(5 抽+2 手填)/ DoD+合规通过自动放行 / 6h 超时机制 三个核心策略已经用户拍板。**2026-05-19 commit fc1ba15+0f1abf1+838ab99+d79b616 push + ECS 部署完成**,songshu enabled=true。**手动 trigger 凌晨 cron #1 真跑通**:30 个 LLM 调用真生成 + 4 个 D5/D12 auto-rewrite 真触发 + 25 variants 真生成,真生产 LLM 成本 ~$1.2。**但发现 3 个 V1.10 bug 让 cron #2 无法 advance run,目前靠 SQL hack 让 hub 显示**:(a) nightly-draft 没调 `evaluateDod`,dod_status 永远 unknown;(b) today-view 只看 `status='draft'`,漏 V1.9 cascade 后 pending_review/auto_approved 的 variants;(c) cron #2 stillEvaluating 把 pending compliance 误当"还在评估"。**V1.11 T0 修这 3 个 bug(1d)**。客户痛点 #2 也确认:LLM 生成的 22 yellow GEO score 低需手动点改写 — V1.11 T4 加 cron 自动改写 yellow(C 方案,0.5d)。songshu 平台 2026-05-19 砍到 toutiao_article + zhihu(SQL UPDATE 已 apply)
- **xiangyu-search-seo-cli 借鉴清单未实施**(立项 2026-05-19,P0/P1/P2,详见 `docs/adr/010-xiangyu-cli-integration.md`):113 命令 Python CLI 评估完成,**11 项借鉴**分 3 个 sprint:V1.11(P0 ai-citation-track 4 海外引擎 + information-gain DoD 维度 6 + fanout 缺口分析,4.5d)/ V1.12(P1 audit-geo/snippet/judgment-density/readability/rich-results 维度补强,3d)/ V2(P2 kgr/entity-trust/discover 按需,2.5d)。**全部 TS port,xiangyu CLI 留私人顾问工具不入 repo**

### W8 验收追踪(stub,业务侧填写)

| 指标 | 目标 | 当前 | 责任人 | Deadline |
|---|---|---|---|---|
| 员工矩阵打卡率 | 40 人 ≥ 80% | _ | _ | _ |
| 到店转化追溯案例 | ≥ 5 起完整闭环 | _ | _ | _ |
| 医院公开见证(背书) | ≥ 1 篇 | _ | _ | _ |
| GEO 引用率(8 周热力图) | 基线 SOV ≥ 15% | _ | _ | _ |
| 合规审批 SLA | < 4h 中位数 | _ | _ | _ |

## 十、参考

- 项目研究报告:`/Users/dulijuner/Documents/GEO研究/生成式引擎优化与豆包GEO_横纵分析报告.md`
- GEO 论文原文:arxiv 2311.09735
- 国内开源 GEO 工具(参考,非依赖):github.com/CN-Sheep/SheepGeo
