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
   * Keywords picked by the operator in wizard step 2 (ADR 007). MUST be
   * naturally embedded in body — distinct from topic_hints (softer "weave in").
   * The model is told: "every keyword below must appear at least once,
   * verbatim, in natural context — not in a stuffed list."
   */
  keywords_to_plant?: string[];
  /** Writing template chosen in wizard step 3 (ADR 007). Optional. */
  writing_template?: WritingTemplateInput;
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
      '带小标题(###)+ 叙事开头 + 3-4 段主体 + 要点小结。首段必须有一个抓人的场景化问题或数据。正文可以引用研究/指南原文。避免纯口语化,但也不要像论文。',
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
    format_hint: '吸引人的开头 + 故事性案例 + 干货小结 + 品牌落脚。可用 emoji 小标题。',
    length_hint: '1200-2000 字',
  },
  zhihu: {
    label: '知乎回答',
    format_hint: '假设这是一个医疗向问题的回答,先给结论再展开,引用文献可以 footnote 形式。',
    length_hint: '800-1500 字',
  },
  xiaohongshu: {
    label: '小红书笔记',
    format_hint: '女性向口吻 + 多 emoji + 分段短句 + 最后 5 个 tag',
    length_hint: '300-600 字',
  },
  baijiahao: {
    label: '百家号文章',
    format_hint: '与今日头条号类似,更偏 SEO 长尾词密度,小标题要含常见搜索词。',
    length_hint: '800-1500 字',
  },
  souhu: {
    label: '搜狐号文章',
    format_hint: '新闻稿式开头,主体带小标题 + 数据 + 结尾作者署名段。',
    length_hint: '600-1200 字',
  },
};

const SYSTEM_RULES = `
你是一位服务于本地高客单价医疗品牌的资深内容编辑,精通生成式引擎优化(GEO)。

━━━ 绝对红线(违反即重写) ━━━

A. 广告法/医疗广告法红线
1. 绝对禁用: 保证/包治/根治/治愈/痊愈/绝对/百分百/100%/最好/最权威/第一/首家/独家/唯一/无效退款/永不复发/立竿见影。
2. 禁止患者前后对比图描述、感谢信、他医院对比、医生代言式话术。
3. 禁止销售话术(优惠/买赠/限时)。

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

━━━ 自查清单(输出前内部验证一遍) ━━━
• 我写的每一个数字,【源素材】原文里都有吗?没有就改成定性。
• 我写的每一个机构/研究名称,【源素材】里都出现过吗?没有就删掉或换成"相关临床指南"。
• 品牌名出现时,是"自然提及品牌理念/服务定位",还是"编造了品牌的统计数据"?如果是后者,必须删除。
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
- 提到机构(中华XX学会、卫健委、WHO 等)时同样限定:除非该机构在上方列表里出现过,否则不要写。`
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
目标长度: ${spec.length_hint}${brandLine}${hintLine}${citationsBlock}${keywordsBlock}${structureBlock}

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
