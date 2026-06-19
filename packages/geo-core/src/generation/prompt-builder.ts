/**
 * Prompt templates for GEO-optimized variant generation.
 *
 * We frame the task as "rewrite THIS source material into a platform-native article,
 * applying these explicit GEO tactics, and returning strict JSON". JSON mode keeps
 * parsing deterministic — no regex-fishing assistant markdown fences.
 *
 * Tactic blurbs are injected verbatim from GEO_TACTICS so the model gets the same
 * guidance humans read. See packages/shared/src/geo-tactics.ts.
 */

import { GEO_TACTICS, type GeoTacticId, type VariantPlatform } from '@geo/shared';
import type { ChatMessage } from '../llm/doubao';

/**
 * Writing template (intent skeleton). Optional add-on per ADR 007 / D20.
 *
 * When present, the composer appends `prompt_skeleton` to SYSTEM_RULES (role
 * + intent) and injects `structure_hint.sections` into the user message
 * (structural skeleton). Stays orthogonal to PLATFORM_SPEC[platform] which
 * controls format / length / syntax.
 *
 * When absent, behaviour is identical to V1.5/V1.6 (legacy path) — required
 * for backward compatibility.
 */
export type WritingTemplateInput = {
  name: string;
  prompt_skeleton: string;
  structure_hint?: { sections?: string[]; min_sections?: number };
};

export type PromptContext = {
  source_markdown: string;
  platform: VariantPlatform;
  tactics: GeoTacticId[];
  /** Tenant brand hints — name, industry, doctor roster keywords — fed so LLM keeps them front-and-center. */
  brand_name?: string;
  industry?: string;
  /** Hints the model should weave in (city, signature treatments, doctor mentions). Optional. */
  topic_hints?: string[];
  /**
   * Geographic drainage scope from brands.service_areas. When set, the LLM
   * is told to ground city-specific claims in these areas only — preventing
   * Kunming brands from auto-generating "北京/上海" content. Empty/undefined
   * = no scope constraint, model freestyles (legacy behavior).
   */
  service_areas?: string[];
  /**
   * Keywords picked by the operator in wizard step 2 (ADR 007). MUST be
   * naturally embedded in body — distinct from topic_hints (softer "weave in").
   * The model is told: "every keyword below must appear at least once,
   * verbatim, in natural context — not in a stuffed list."
   */
  keywords_to_plant?: string[];
  /** Writing template chosen in wizard step 3 (ADR 007). Optional. */
  writing_template?: WritingTemplateInput;
  /**
   * Query intent (D21 / ADR 009). The "question type" this article answers
   * — `what_is` / `is_it_true` / `which_is_better` / `why_happens` /
   * `what_to_do` / `how_long` / `when_to_seek_care` / `how_to_choose_local`.
   *
   * Injected into the user prompt as a framing hint. Even before
   * content_contracts table ships in P0, callers can pass it from any UI
   * (wizard, manual entry) to start steering generation. Empty / unset =
   * legacy behaviour, no intent framing.
   *
   * See docs/07-geo-article-spec.md §四.
   */
  query_intent?:
    | 'what_is'
    | 'is_it_true'
    | 'which_is_better'
    | 'why_happens'
    | 'what_to_do'
    | 'how_long'
    | 'when_to_seek_care'
    | 'how_to_choose_local';
  /**
   * The primary question this article must directly answer. Surface form
   * — same form the user would type into 豆包. Example: `洗牙会不会让牙缝变大`.
   * Optional pre-P0 (no content_contracts table yet); when set, the model is
   * told to anchor the opening 120 chars to a direct answer of this exact
   * question.
   */
  primary_query?: string;
  /**
   * Whitelist of citable references. Pulled from verified_citations table.
   * The model gets explicit instruction: "this is the ONLY pool of named
   * guidelines/studies you may reference; if your point isn't covered here,
   * use a qualitative description instead of inventing one."
   *
   * Each entry includes the canonical title + aliases — the model is told
   * it can use any of those forms in the body, and post-hoc validation
   * matches against the same list.
   *
   * Empty array = no whitelist; model falls back to "only mention what's in
   * source_markdown" (legacy behavior).
   */
  verified_citations?: Array<{ title: string; aliases: string[] }>;
  /**
   * Optional hint for a rewrite pass. When the first generation came back
   * with a low GEO score, the worker injects this hint listing the weakest
   * tactics so the model knows what to improve. Format:
   *   "上一版 GEO 评分 58/100,弱项: readability=2/10(句子过长), authority=0/5。重写时重点补强这两项。"
   * Absent on the first pass.
   */
  rewrite_hint?: string;
};

const PLATFORM_SPEC: Record<VariantPlatform, { label: string; format_hint: string; length_hint: string }> = {
  toutiao_article: {
    label: '今日头条号文章',
    format_hint:
      '带小标题(###)+ 叙事开头 + 3-4 段主体 + 要点小结。首段 120 字内必须直接给出主问题的答案。正文可以引用研究/指南原文。避免纯口语化,但也不要像论文。**必须含 ≥ 5 条 FAQ + 独立 Trust Block 段落**。',
    length_hint: '800-1500 字',
  },
  douyin_script: {
    label: '抖音口播脚本',
    format_hint: '分镜格式,每条镜头一行:`[镜头 N · 时长s] 画面描述 → 台词`。',
    length_hint: '30-60 秒对应 5-8 个镜头',
  },
  douyin_image_text: {
    label: '抖音图文笔记',
    format_hint:
      '抓人钩子开头(1-2 句痛点 / 反常识) + 6-9 张图配套文字(每张 30-60 字,适配九宫格 / 单图轮播)+ 末尾互动引导 + 3-5 个话题 #tag。文字偏口语 + 短句 + emoji,不要像长文。每张图的文字独立成段,前面用「1️⃣ 2️⃣ 3️⃣」编号。',
    length_hint: '350-600 字总文案 + 6-9 张配图位',
  },
  wechat_mp: {
    label: '微信公众号推文',
    format_hint: '吸引人的开头 + 故事性案例 + 干货小结 + 品牌落脚。可用 emoji 小标题。开头 120 字内直接给出主问题答案。**必须含 ≥ 5 条 FAQ + 独立 Trust Block 段落**。',
    length_hint: '1200-2000 字',
  },
  zhihu: {
    label: '知乎回答',
    format_hint: '假设这是一个医疗向问题的回答,先给结论再展开(开头 120 字直接给答案),引用文献可以 footnote 形式。**必须含 ≥ 5 条 FAQ + 独立 Trust Block 段落**。',
    length_hint: '800-1500 字',
  },
  xiaohongshu: {
    label: '小红书笔记',
    format_hint: '女性向口吻 + 多 emoji + 分段短句 + 最后 5 个 tag',
    length_hint: '300-600 字',
  },
  baijiahao: {
    label: '百家号文章',
    format_hint: '与今日头条号类似,更偏 SEO 长尾词密度,小标题要含常见搜索词。开头 120 字内直接给出主问题答案。**必须含 ≥ 5 条 FAQ + 独立 Trust Block 段落**。',
    length_hint: '800-1500 字',
  },
  souhu: {
    label: '搜狐号文章',
    format_hint: '新闻稿式开头,主体带小标题 + 数据 + 结尾作者署名段。开头 120 字内直接给出主问题答案。**必须含 ≥ 5 条 FAQ + 独立 Trust Block 段落**。',
    length_hint: '600-1200 字',
  },
};

const SYSTEM_RULES = `
你是一位服务于本地高客单价医疗品牌的资深内容编辑,精通生成式引擎优化(GEO)。

━━━ 绝对红线(违反即重写) ━━━

A. 广告法/医疗广告法红线
1. 绝对禁用: 保证/包治/根治/治愈/痊愈/绝对/百分百/100%/最好/最权威/第一/首家/独家/唯一/国内唯一/国内首家/国际金标准/X 项国际金标准/无效退款/永不复发/永久解决/立竿见影/无痛(种植/手术/治疗)/零风险/碾压同行。
2. 禁止患者前后对比图描述、感谢信、他医院对比、医生代言式话术。
3. 禁止销售话术(优惠/买赠/限时)。
4. **【源素材】里如果出现以上词,必须在改写时软化掉,不准抄回 body**:
   - "国内唯一一家" → "云南较早一批" / "本地资深的"
   - "X 项国际金标准" → "X 项内部质控流程" / "X 步标准化诊疗流程"
   - "包治 / 根治" → "辅助改善" / "针对性诊疗"
   - "无痛技术" → "舒适化诊疗" / "局部浸润麻醉技术"
   - "JCI 认证 / 国际金牌" → 不要写,除非源材料里有第三方证书来源

A2. 软性违规话术(医生背书 / 变相医疗广告)— 第一道合规门会精确拦截,生成时就要规避,改用客观表述
   这些不是"明显违法词",而是高频踩线的**话术形式**:《广告法》第十六条(医疗机构禁用代言式背书)+《医务人员互联网健康科普负面行为清单》(变相医疗广告)。命中即触发 LLM 复审 → 大概率被打回人工审核。规避方式**不是**"不提医生 / 不提服务",而是把营销腔换成客观陈述:
   • 医生资历: ✗ "刘院长 20 年种植经验 / 25 年临床经验 / 累计接诊上千例 / 独立主刀完成" → ✓ "刘彦廷院长,长期专注种植修复方向" / "资深种植医师" / "擅长复杂种植病例"。
     **禁止出现「X 年(种植 / 正畸 / 临床 / 从业)经验」「接诊过 / 累计接诊 / 已接诊 N 例」「主刀完成 / 独立主刀 / 累计主刀」这类量化背书句式**——可以写医生姓名 + 专长方向 + 真实案例思路,但不要用工龄 / 接诊量 / 主刀数堆权威。
   • 机构服务: ✗ "提供专业的种植牙服务 / 提供种植牙服务 / 口腔(健康)解决方案" → ✓ "开展种植牙诊疗项目" / "设有种植专科" / "针对性诊疗方案"。
     **禁止「提供专业的 X」「提供 X 服务」「X 解决方案」这类广告腔。**
   • ✗ "为缺牙人群带来福音 / 给患者带来福音"——**「带来福音」整类直接删,任何语境都不要用。**
   原则:这些词的违规性在"话术形式"不在"事实",换成客观说法本就是更合规、更可信、AI 引擎更愿引用的表达。

B. 事实准确性红线(最重要,违者即弃用)
4. **绝对禁止编造任何具体数字**——百分比、样本量、年份、医院数据、病例数、手术量、存活率、并发症率、随访数据。所有具体数字**只能**来自【源素材】原文。
5. 如果【源素材】没有给出某个统计数字,你必须使用**定性描述**而不是编造一个看起来权威的数字。例:
   - ✗ 错 "1200 例患者中 112 例糖化超 8%"(源文没有)
   - ✗ 错 "2023 年门诊统计显示 62% 的并发症患者"(源文没有)
   - ✓ 对 "多数术后并发症患者都忽略了术前评估"
   - ✓ 对 "临床研究显示,严格术前评估可显著降低植体周围炎发生率"(不给具体数字)
6. 引用的指南/共识/研究名称,**只能**用【源素材】里已经出现的名称。不要"补"《中华 XX 指南》这种常见名。
7. 禁止编造品牌自己的数据("本院数据库""本院 XX 年门诊数据"等),除非【源素材】明确给出。
8. 带 \`[1][2]\` 式文献脚注可以,但**脚注内容必须对应真实存在的引用**——如果源文没给出引用详情,不要伪造脚注正文。

━━━ 质量原则 ━━━
- 事实密度高于情绪密度——但事实必须真。
- 每个论断要能被读者脑内问"凭什么" → 如果答案是"我编的",就删掉或改为定性描述。
- 避免开篇自我介绍 — 读者不关心作者。

━━━ GEO 标准化结构(D21 / docs/07-geo-article-spec.md)━━━

C. 必备结构块(医疗类长内容必须含,短内容如抖音口播/小红书可酌情合并):
1. 一句话结论(direct_answer)— 开头 **120 字内** 必须直接回答主问题。读者扫一眼就能拿到答案。
2. 误区/问题解释 — 为什么大家会问这个、有什么常见误解
3. 原理/机制 — 简明地讲为什么是这样(可省略数字,留定性)
4. 适用人群 + 不适用人群 — 谁该用、谁不该
5. 风险边界(risk_boundary)— 出现什么情况一定要去线下就诊;不替代面诊
6. **FAQ 块 ≥ 5 条**(Q + A 短答)— Q 是真实搜索词形式,A 35-90 字独立成立
7. 审核信息 — 由医院医疗团队 / 具名医生审核
8. 更新时间 — 例:"本文最近更新于 2026-05-13"
9. 机构与服务绑定 — 文末点出品牌 + 服务名 + 城市(自然语境,不广告化)
10. Trust Block(文末独立段落,见 D 项)

D. Trust Block(强制独立段落,文末出现,不要散落正文,用普通文本段落 + 项目符号):
  • 本文适用于:[谁]
  • 本文不替代:面诊、影像、专业评估
  • 出现以下情况建议尽快就诊:[列 3-5 个红旗症状]
  • 审核:[医院 / 医生]
  • 更新:[YYYY-MM]
  • 地域:[城市 / 区域]

E. 引用块(Citation Block)标准 — 每个独立段落都要满足:
- **单独截出来也成立**,不依赖前文上下文
- **禁用模糊指代**:"这个" / "那种" / "前者" / "后者" / "上面提到的"
- 不混合两个以上结论
- 单块**句长 35-90 字**(过短信息不够,过长无法被引用)
- 每句话都能回答一个具体问题

F. 实体清晰度 — 文中关键实体必须**显式表达,不能省略**:
- 品牌名 + 城市:"昆明松鼠口腔" 而不是只说 "我们医院"
- 服务名:"种植牙" 而不是 "这项手术"
- 审核者:具名医生或团队,不写就漏 reviewed_by
- 主体不能模糊化("有些人 / 大部分情况" 之类的虚指,要换成"准备做种植的成年人")

━━━ 自查清单(输出前内部验证一遍) ━━━
• 我写的每一个数字,【源素材】原文里都有吗?没有就改成定性。
• 我写的每一个机构/研究名称,【源素材】里都出现过吗?没有就删掉或换成"相关临床指南"。
• 品牌名出现时,是"自然提及品牌理念/服务定位",还是"编造了品牌的统计数据"?如果是后者,必须删除。
• 开头 120 字内有没有给出主问题的直接答案?(医疗长文必查)
• FAQ ≥ 5 条?(医疗长文必查)
• Trust Block 是否作为独立段落出现?(医疗长文必查)
• 每个段落是否能被单独引用 — 不依赖前文、句长 35-90 字、无模糊指代?
• (本地长文)地域词是否分布到 标题 + 首段 + ≥3 个小标题 + 结尾,而不是只在文末出现一次?
• (本地长文)是否设了 3 处转化引导(首段后 / 中部 / 结尾),且无任何优惠 / 促销 / 疗效承诺?
• (本地长文)品牌全称是否在正文出现 ≥5 次且分布在 ≥3 个不同场景(首段/中部/FAQ/结尾),而不是只堆在文末?
• (本地长文)医生信息有没有三处复制粘贴?是否按位置突出了不同维度?
• 我写的价格 / 医保比例 / 术式时长 / 服务承诺,是否都来自源素材 / 真实服务信息?编的一律删除或改为"建议到院咨询"。
`.trim();

export function buildVariantPrompt(ctx: PromptContext): ChatMessage[] {
  const spec = PLATFORM_SPEC[ctx.platform];
  const tacticBlock = ctx.tactics
    .map((id) => {
      const t = GEO_TACTICS.find((x) => x.id === id);
      if (!t) return '';
      return `- \`${id}\` — ${t.label}: ${t.description}`;
    })
    .filter(Boolean)
    .join('\n');
  const allowedTacticIds = ctx.tactics.map((id) => `"${id}"`).join(', ');

  const hintLine =
    ctx.topic_hints && ctx.topic_hints.length > 0
      ? `\n话题引导词(必须覆盖至少 2 个): ${ctx.topic_hints.join('、')}`
      : '';
  const brandLine =
    ctx.brand_name || ctx.industry
      ? `\n所属品牌: ${ctx.brand_name ?? '-'}${ctx.industry ? ` (行业: ${ctx.industry})` : ''}`
      : '';

  // Geographic scope block — prevents the model from defaulting to
  // tier-1-city framing (北京/上海/广州/深圳) for brands that serve other
  // regions. The instruction is firm because the model's training-data
  // prior strongly favors top-tier cities for medical search queries.
  const geoBlock =
    ctx.service_areas && ctx.service_areas.length > 0
      ? `

━━━ 本品牌服务地区(地理边界,严格遵守) ━━━
${ctx.service_areas.map((a) => `• ${a}`).join('\n')}

注意:
- 文中提到城市 / 地区时,**只用上面列表里的地区名**,例如本地化案例、医保政策、价格区间。
- **禁止**把"北京 / 上海 / 广州 / 深圳"或其他列表外城市作为本地化锚点(除非源素材里明确要求做跨城对比)。
- 全国通用论点(医学共识、术后注意事项)无地域要求,可不指定城市。`
      : '';

  // verified_citations 白名单注入。LLM 引用文献只能从这个池子里挑;不在池子里
  // 的指南/共识/研究就用定性描述代替,生成后扫描 + 校验。
  const citationsBlock =
    ctx.verified_citations && ctx.verified_citations.length > 0
      ? `

━━━ 可引用文献白名单(只能引这些,**禁止引用列表外**任何具名指南/研究/统计文档) ━━━
${ctx.verified_citations
  .map((c) => `• ${c.title}${c.aliases.length > 0 ? `(可写作: ${c.aliases.join(' / ')})` : ''}`)
  .join('\n')}

注意:
- 如果你的论点找不到上面任何一条来源,请改用定性表达("相关临床指南建议..."、"专业医师指出..."),**不要**编造具名引用。
- 引用时使用《...》或不加书名号都可,但**文字必须严格来自上方列表**。
- 提到机构(中华XX学会、卫健委、WHO 等)时同样限定:除非该机构在上方列表里出现过,否则不要写。
- **术种必须对口(严防串台)**:只引用与本文主题/术种**直接相关**的来源。如果白名单里某条明显属于**别的术种**(例:本文讲「儿童早期矫正 / 正畸」,白名单里却只有「种植」类指南),**绝对不要套用它**——这种张冠李戴比不引用更糟。此时改用定性表达。`
      : '';

  const rewriteBlock = ctx.rewrite_hint
    ? `\n\n━━━ 重写指导(上一轮分低,本轮请改进) ━━━\n${ctx.rewrite_hint}`
    : '';

  // ADR 007 — keywords picked in wizard step 2. Each must appear ≥1× verbatim
  // in natural context. Distinct from topic_hints (softer "weave in").
  const keywordsBlock =
    ctx.keywords_to_plant && ctx.keywords_to_plant.length > 0
      ? `\n\n━━━ 必须自然植入的关键词(每个至少出现一次,禁止堆砌列表) ━━━
${ctx.keywords_to_plant.map((k) => `• ${k}`).join('\n')}

注意:每个关键词必须以**自然语境**至少出现一次(可同义改写为常见表达,但核心词形需可识别)。**禁止**把它们集中堆在末尾、tag 区或单独成段;读者读起来不应感到关键词突兀。`
      : '';

  // D21 / ADR 009 — query_intent + primary_query framing. Injected BEFORE
  // platform format hint so the model knows "what kind of question I'm
  // answering" before "what format I'm writing in". This pre-empties the
  // model's tendency to write narrative-first openings.
  const INTENT_LABEL: Record<NonNullable<PromptContext['query_intent']>, string> = {
    what_is: '什么是 / 定义型',
    is_it_true: '辟谣 / 是不是真的',
    which_is_better: '对比 / 哪个更好',
    why_happens: '原因 / 为什么会这样',
    what_to_do: '出现 X 怎么办',
    how_long: '要多久 / 多频繁',
    when_to_seek_care: '何时需要就医',
    how_to_choose_local: '本地怎么选 / 选医院',
  };
  // V1.13 D38 — 本地推荐题专用红线。当 query_intent='how_to_choose_local'
  // (对应 questions.intent='local_recommendation', e.g. "昆明 X 医院推荐"
  // 这类题), LLM 极易生成"列别家医院名/排名第几/性价比第一"等违规内容。
  // 《广告法》第十三条贬低同行 / 第九条绝对化用语 / 医疗广告管理办法 都会踩。
  // 单独一段强约束 + 让 LLM 把"对比竞争"重新定义为"通用选择标准"。
  const localRecBlock =
    ctx.query_intent === 'how_to_choose_local'
      ? `

━━━ 本地推荐题专用红线(违反任何一条直接 reject,无例外) ━━━
1. **严禁列出其他医院/诊所/品牌名**。包括但不限于:"存济口腔""协尔""德韩""博牙士""医科大附属"等任何具名机构。即使是泛称如"某些公立医院""某连锁机构"也不许写。
2. **严禁排名/绝对化表述**。禁词:"排名第一/前 N 强/最佳/最专业/最权威/性价比第一/独家/首选/口碑第一/治疗效果最好"等。
3. **严禁横向比较**。不写"我院/本院比 XX 好/便宜/快"、不写"昆明最好的 X"、不写"西山区第一家 X"。
4. **改用"选医院通用标准"框架**。文章应按以下结构组织(全文聚焦本院真实信息 + 客观选择维度):
   - 一句话客观结论(本院 = 二级口腔专科 / 资质 / 数字化设备 / 数十年医生团队 / 价格区间透明)
   - 选口腔医院应该看哪几个维度(资质等级 / 设备 / 医生经验 / 价格透明度 / 距离方便等通用维度,不点名其他机构)
   - 本院在每个维度的真实情况(用 KB 数据,如刘彦廷院长专注种植修复 / 韩峄主任负责正畸 / CBCT+iTero 设备 / 价格区间起价表 等;**医生只写姓名 + 专长方向,禁止"X 年经验 / 接诊 N 例"等量化背书句式,见 A2**)
   - 适合什么样的患者(用本院科室特色定位:种植/正畸/儿牙)+ 不强推
   - 通用提醒:面诊后才能确认方案,不要单看广告
5. 让读者自己判断是否合适,不替读者排序、不替读者贴标签。
6. **【2026-06-15 豆包实测强约束】本院客观事实要密集、具体、可被 AI 抓取**。实测豆包做本地推荐时,会把以下"硬事实字段"直接抄进回答(谁的事实写得全、写得具体,谁就被推荐)。**凡 KB 里有真值的,必须写进文章**(无真值的留空,严禁编造):
   • 资质等级(如"二级口腔专科医院")
   • 官方定点资质(如"医保定点""窝沟封闭定点单位"——政府名单类资质是豆包高信任源)
   • 精确地址(到门牌/商场楼层,如"西山区前卫西路蓝光昆仑中心 3 楼")
   • 营业时间(如"营业至 21:00")
   • 核心设备型号(如"CBCT、3D 口扫 iTero、数字化导板")
   • 具体术式/技术名(如"即刻种植""ETA/罗慕早期矫正""ALL-ON-4")
   • 价格区间(KB 起价表真值,如"国产种植 ¥XXXX 起")
   • 医生姓名 + 专长方向(只写方向,不写年限/案例数,见 A2)
   这些字段越全、越具体,被豆包采纳进推荐答案的概率越高。**这不是堆砌关键词,是把本院真实信息结构化呈现** —— 合规底线是"全是本院真事实、不涉及任何别家"。
`
      : '';

  // V1.13 — 本地化 GEO 结构强化(①地域词分布 ④转化入口×3 ⑤长尾进小标题
  // ⑥医生分位差异化 ②机构自然植入)。只对长文平台生效;抖音/小红书短文
  // 结构不同,不套用。所有"事实类"内容(价格/医保/术式时长/案例)严格走
  // "可提问、不可编答案"原则,守住 D33/事实红线。
  const LONG_FORM_PLATFORMS: VariantPlatform[] = [
    'toutiao_article',
    'wechat_mp',
    'zhihu',
    'baijiahao',
    'souhu',
  ];
  const primaryArea = ctx.service_areas?.[0];
  const localGeoBlock = LONG_FORM_PLATFORMS.includes(ctx.platform)
    ? `

━━━ 本地化 GEO 结构强化(本地高客单医疗长文必做,缺项视为不达标) ━━━

① 地域词分布 — ${
        primaryArea
          ? `本文地域锚点 = "${primaryArea}"。`
          : '本文若有明确服务城市,以该城市为地域锚点(无则可省略本项)。'
      }地域词必须**自然分布**在:
   • 标题(地域 + 核心问题,如「${primaryArea ?? '本地'}……」)
   • 首段前两句
   • ≥ 3 个小标题(###)
   • **≥ 2 条 FAQ 答案**(自然嵌「地域+品牌名+本地化建议」长尾句,如「西山区本地多数儿童,医生普遍建议每半年到昆明松鼠口腔复诊涂氟」;品牌名必须完整出现,不要只写简称)
   • 结尾段
   如果服务地区含区/县级地名(如「西山区」「盘龙区」),区县级词至少在标题 + 正文中出现 2 次(2026-06-15 实测:区县级长尾被 AI 引用率远高于城市级)。
   禁止只在文末提一次地域;也禁止一句里堆叠多个地域词(堆砌会被引擎当 spam 降权)。
   **更禁止「为加关键词而加」的生硬句**——地域词要长在自然语境里,读起来不突兀。宁可少一处,也不要硬塞:
   - ✗ 反例:「针对昆明西山区有哪些做儿童早期矫正的口腔医院?这个问题,家长可以重点了解机构方案」(把整个搜索词原样塞进句子,生硬)
   - ✓ 正例:「家长在昆明本地选机构时,可以重点看是否有专门的儿童齿科团队和分龄矫正方案」(地域自然融入)

⑤ 长尾搜索词进小标题 — 小标题尽量写成"地域 + 服务 + 意图"的真实搜索词形式。除主问题外,自然覆盖 ≥ 3 个本地衍生问法(价格 / 如何选医院 / 适合人群 / 医保 等角度)。
   **关键**:小标题可以"提出"价格 / 医保这类问题,但正文回答时——没有真实数据就用定性表达或"建议到院咨询",**绝不编造具体数字 / 比例 / 政策**。

④ 转化入口 ×3 — 全文设 3 处自然的"下一步"引导(首段答案之后、正文中部、结尾各一处),用**邀约咨询 / 面诊**语气。例:"想确认自己是否适合,建议到院做面诊和影像评估。"
   **严禁**任何优惠 / 限时 / 满减 / 促销 / 疗效承诺式话术(违反广告法 A 类红线)。

② 机构自然植入 ≥ 5 次(≥ 3 个不同场景) — 品牌全称(如「昆明松鼠口腔」)在正文**至少出现 5 次**,分布在 3 个以上**不同内容场景**(讲适用人群时、讲术后护理 / 流程时、讲如何选择时、FAQ 答案中),不要只堆在文末。
   **任何涉及具体术式时长 / 服务细节 / 承诺(如"手术 30 分钟内""当天可进食""免费接送"),必须来自【源素材】或真实服务信息;缺失就不写、不编。**
   **【2026-06-15 豆包实测·必做】不管本题是价格题 / 流程题 / 护理题还是推荐题,正文都要在回答问题的同时,自然带出本院对应的"硬事实"。实测豆包做本地推荐时会直接抄这些字段进答案——写得全 = 被推荐概率高。KB 里有真值的尽量写进来(无真值留空,禁编造):资质等级(二级口腔专科) / 官方定点(医保定点、窝沟封闭定点) / 精确地址(到商场楼层) / 营业时间 / 设备型号(CBCT、iTero) / 具体术式名(即刻种植、ETA/罗慕) / 价格区间(KB 真值) / 医生姓名+专长。**
   例:答"种植牙流程"时,自然带一句"在本院,种植术前会用 CBCT 做骨量评估……";答"价格"时带"本院国产种植价格区间约 ¥XXXX 起(以面诊为准)"。**这是把本院真事实结构化呈现,不是堆关键词,更不是提及任何别家机构。**

⑥ 医生信息分位差异化 — 同一医生不要三处复制粘贴同一段。按位置突出不同维度:
   • 正文相关段落:突出其**专长方向**(候选名单里的 tags)
   • 审核信息处:突出**资质 / 学术**(仅当候选名单里确有该字段;没有就只写"由医院医疗团队审核")
   • Trust Block:只保留**姓名 + 基础执业**
   候选名单里没有的工龄 / 学历 / 头衔一律不补。`
    : '';

  const intentBlock =
    ctx.query_intent || ctx.primary_query
      ? `

━━━ 主问题与意图(D21 强制约束) ━━━
${ctx.primary_query ? `主问题(读者会原样输入到豆包搜索的句子): ${ctx.primary_query}` : ''}
${ctx.query_intent ? `问题类型: ${INTENT_LABEL[ctx.query_intent]}(\`${ctx.query_intent}\`)` : ''}

要求:
- 文章首段 **120 字内** 必须直接给出主问题的答案,不要绕开问题先讲故事 / 先讲背景。
- 整篇文章只回答这一个主问题 + 它的衍生问法,不要发散到无关话题。
- **标题是排名第一权重项(2026-06-15 豆包真机实测:标题与用户问题字面重合度是唯一显著正相关因子)**。**默认直接把主问题原句当标题**——读者在豆包会**原样输入哪句话,标题就尽量是哪句话**(可在句尾补「?」或加「2026」「(含价格)」等不丢关键词的小尾巴,但**不许改写、不许换词、不许丢任何一个关键词**)。
  - ✓ 主问题「昆明西山区种植牙哪家好」→ 标题「昆明西山区种植牙哪家好?2026 本地口腔盘点(含价格)」
  - ✓ 主问题「昆明西山区儿童牙齿矫正术前各项检查要花多少钱」→ 标题直接用原句 + 「?」
- **严禁**把标题改写成「……全解析 / 全攻略 / 大揭秘 / 你想知道的都在这」这类**丢失关键词的泛标题**——命不中搜索词等于放弃排名。
  - ✗ 反例:「老年种植牙流程全解析」(丢了地域「昆明西山区」,丢了搜索意图)
- **地域词必须在标题里**:主问题带「西山区」,标题就**必须**有「西山区」(实测:带区县词品牌被推荐率远高于只有城市词)。`
      : '';

  // ADR 007 — structure skeleton from writing template, injected after format_hint.
  const structureBlock =
    ctx.writing_template?.structure_hint?.sections &&
    ctx.writing_template.structure_hint.sections.length > 0
      ? `\n\n━━━ 文章骨架(来自写作要求"${ctx.writing_template.name}",作为结构参考,可微调) ━━━
${ctx.writing_template.structure_hint.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}${
          ctx.writing_template.structure_hint.min_sections
            ? `\n\n至少包含 ${ctx.writing_template.structure_hint.min_sections} 个上述节段。`
            : ''
        }`
      : '';

  const userContent = `
请把下面这份【源素材】改写成【${spec.label}】,严格应用下列 GEO 技法,返回严格 JSON。${rewriteBlock}

特别注意 tactics_applied 字段: 只能从下面这些 id 里选 (英文,带下划线): ${allowedTacticIds}。禁止返回中文、禁止新造 id。

目标平台格式: ${spec.format_hint}
目标长度: ${spec.length_hint}${brandLine}${hintLine}${intentBlock}${localRecBlock}${geoBlock}${localGeoBlock}${citationsBlock}${keywordsBlock}${structureBlock}

必须应用的 GEO 技法(每一条都要在正文中体现):
${tacticBlock}

【源素材】
${ctx.source_markdown}

【返回格式,严格 JSON 对象,不要额外文字】
{
  "title": "适合该平台的短标题,不含绝对化用语",
  "body": "完整正文,按格式提示组织",
  "tactics_applied": ["从下列 id 中选实际用到的,不要中文,不要新造: ${allowedTacticIds}"],
  "notes": "一句话自评:主要发挥了哪几条技法,还有什么想留给人工编辑的决策点"
}
`.trim();

  // ADR 007 — writing template prompt_skeleton appended to SYSTEM_RULES.
  // Order: SYSTEM_RULES (compliance red lines, IMMUTABLE) → template role/intent.
  // This ordering matters: red lines come first so a malicious template can't
  // "override" them by appearing earlier.
  const systemContent = ctx.writing_template?.prompt_skeleton
    ? `${SYSTEM_RULES}\n\n${ctx.writing_template.prompt_skeleton}`
    : SYSTEM_RULES;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}
