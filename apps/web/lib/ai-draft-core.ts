/**
 * Shared AI-draft core extracted from createAiDraft (V1.5-8).
 *
 * The original server action couples 4 concerns:
 *   1. requireRole — Web user-session auth
 *   2. KB recall + LLM call + insert content_items
 *   3. revalidatePath — Next.js cache flush
 *   4. Audit logging
 *
 * For batch drafting (V1.9), the worker needs (2) without (1)/(3). So we
 * extract (2) here. Both surfaces call this:
 *   - createAiDraft (server action) — wraps with requireRole + revalidate
 *   - /api/internal/ai-draft (POST) — wraps with HMAC secret check, called by
 *     the worker's content.batch_draft_item job
 *
 * Caller provides the SupabaseClient (server-bound or service-role); core
 * doesn't choose authentication context.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chat, enforceTitleFromQuery, evaluateDod, extractSlices, isAvailable as llmAvailable, personaToDoctorFields, renderDoctorBlock, sanitizeAbsoluteWords, stripDraftArtifacts } from '@geo/geo-core';
import { PLATFORM_HINT, prettifyMarkdown, reportError } from '@geo/shared';

export type AiDraftPlatform =
  | 'xiaohongshu'
  | 'douyin_script'
  | 'wechat_mp'
  | 'zhihu'
  | 'toutiao_article';

export type RunAiDraftInput = {
  topic: string;
  audience: string;
  platform: AiDraftPlatform;
  writing_template_id?: string | null;
  keyword_ids?: string[];
  preferred_doc_paths?: string[];
  /**
   * D21 / ADR 009 — query intent type. 8 enum values. When set, injected
   * into user prompt + drives "direct answer in first 120 chars" rule.
   * NULL = legacy V1.6 path (topic-driven only). See
   * docs/07-geo-article-spec.md §四.
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
   * D21 — exact surface form of the question the reader would type into
   * 豆包. When set, the model is told the opening must directly answer
   * this exact question. Optional pre-P0 (content_contracts not yet
   * wired into wizard persistence; this just flows to prompt).
   */
  primary_query?: string;
};

export type RunAiDraftResult = {
  content_item_id: string;
  cited_paths: string[];
};

/**
 * D21 / ADR 009 P3-2 — heuristic intent → article_type mapping.
 * Lets wizard collect just query_intent and auto-derive article_type
 * for the contract row. Operator can change article_type later in the
 * (yet-to-build) contract editor.
 */
function inferArticleTypeFromIntent(
  intent: NonNullable<RunAiDraftInput['query_intent']>,
):
  | 'definition'
  | 'myth_busting'
  | 'comparison'
  | 'symptom_check'
  | 'process_expectation'
  | 'risk_boundary'
  | 'local_choice' {
  switch (intent) {
    case 'what_is':
      return 'definition';
    case 'is_it_true':
      return 'myth_busting';
    case 'which_is_better':
      return 'comparison';
    case 'why_happens':
      return 'symptom_check';
    case 'what_to_do':
      return 'symptom_check';
    case 'how_long':
      return 'process_expectation';
    case 'when_to_seek_care':
      return 'risk_boundary';
    case 'how_to_choose_local':
      return 'local_choice';
  }
}

/** Per ADR 005 / spec §九, article_type → required Schema.org targets. */
function schemaTargetsForType(
  articleType: ReturnType<typeof inferArticleTypeFromIntent>,
): string[] {
  const base = ['Article'];
  switch (articleType) {
    case 'comparison':
      return [...base, 'FAQPage'];
    case 'symptom_check':
      return [...base, 'FAQPage'];
    case 'local_choice':
      return [...base, 'MedicalBusiness', 'FAQPage'];
    case 'process_expectation':
      return [...base, 'MedicalProcedure'];
    default:
      return base;
  }
}

const KB_ROOT =
  process.env.KNOWLEDGE_BASE_ROOT ??
  `${process.env.HOME}/Workspace/songshu-knowledge-base`;

const DRAFT_RECALL_K = 5;

const PLATFORM_KB_GUIDE: Partial<Record<AiDraftPlatform, string>> = {
  xiaohongshu: '营销/渠道/小红书/风格指南.md',
  douyin_script: '营销/渠道/抖音/风格指南.md',
};

// 2026-06-28 解耦:原先这里逐条列出 GEO 9 法的精确加分权重(+41%/+33%…),
// 等于把 scorer.ts 的评分公式直接喂给生成方,诱导其「迎合评分」而非「写好内容」
// (reward hacking,见缝合架构模板 7.5)。改成只给定性写作方向,精确权重留在
// scorer/scorer-l2 背后独立打分,生成方不可见。
const GEO_TACTICS_PROMPT = `# 写出易被 AI 引擎引用的好内容(方向指引,不是评分清单)

把下面这些写扎实,核心目标是内容真实、可信、可溯源——不是去凑某几个加分项:
- **权威引用**:明确引用论文 / 临床指南 / 行业标准(如《ITI 共识》),不靠品牌自封的"权威"
- **具体数据**:用素材里的真实数字 / 比例 / 临床研究,避免"很多""不少"等模糊词
- **真实署名**:引用素材里提供的真实医生姓名 + 专长方向
- **清晰结构**:层级分明的小标题 + 段落,读者一眼能找到答案
- **自然流畅**:去机器味,用人话写
- **直接引语**:"《XX 指南》指出…" 这类直引增强可信度
- **讲清因果**:解释"为什么这样做",别只下结论
- **必要时用列表**:3 步 / 5 要点把流程讲清楚`;

const SYSTEM_PROMPT = `你是一位严谨的医疗内容编辑。基于提供的医院真实知识库素材撰写草稿,目标是被豆包/元宝/DeepSeek 等 AI 引擎倾向引用,同时合规、真实、可溯源。

## 4 条硬约束(违反任意一条全文重写,无例外)

### 1. 合规底线 — 这些词**绝对不能出现**
不论是医生说、患者反馈、营销话术、还是"专业术语",**全部禁止**(**KB 素材里如果出现也不准抄,要软化或跳过**):
- 绝对化:最 / 最佳 / 最适合 / 首选 / 推荐之选 / 首家 / 第一 / 唯一 / 国内唯一 / 国内首家 / 顶尖 / 国内领先 / 行业第一 / 独家 / 根治 / 包治 / 治愈 / 永久解决
- 自创"权威":X 项国际金标准 / 国际金标准 / 国家金牌 / 行业金标准(只有真实学术学会发布的指南才算权威,品牌自称的不算)
- 效果承诺:保证 / 100% / 无效退款 / 终身维护 / 一次到位 / 立刻见效
- 安全性夸大:无痛 / 零痛 / 零风险 / 绝对安全 / 无并发症 / 无副作用 / 无后遗症
- 违规比较:比 XX 好 / 优于 XX / 碾压同行 / 远超平均 / 性价比之王
- 软性背书 / 变相医疗广告(**命中第一道合规门即触发复审被打回人工,务必规避**;规避≠不提医生,而是换客观表述):
  禁用句式 →「X 年(种植 / 正畸 / 临床 / 从业)经验」「接诊过 / 累计接诊 / 已接诊 N 例」「主刀完成 / 独立主刀 / 累计主刀」「提供专业的 X」「提供 X 服务」「X(健康)解决方案」「(为缺牙人群 / 给患者)带来福音」
  改写方向 → 医生写「姓名 + 专长方向 + 真实案例思路」(✓ "刘彦廷院长,长期专注种植修复",✗ "刘院长 20 年种植经验"),**不写工龄 / 接诊量 / 主刀数**;服务写「开展 X 诊疗」「设有 X 专科」「针对性诊疗方案」,**不写"提供专业的 / 提供 X 服务 / X 解决方案"**;"带来福音"任何语境删除。

⚠️ **特别警告 — KB 老营销文案陷阱**:
你看到的素材是医院 2017-2024 年内部话术,**部分包含违规绝对化用语**(如"国内唯一一家通过 JCI 认证","8 项国际金标准","包治牙周炎")。**这些词在内部营销可以,但发到豆包/头条/知乎一律违法**。规则:
- KB 写"国内唯一一家",你要改成"云南较早一批" / "本地资深的"
- KB 写"X 项国际金标准",你要改成"X 步标准化诊疗流程" / "X 项内部质控环节"
- KB 写"包治""治愈",你要改成"辅助改善" / "针对性诊疗"
- KB 写"无痛技术",你要改成"舒适化诊疗" / "局部浸润麻醉技术"

❌ **反面例子(被合规判 reject)**:
> "贾医生 14 年经验,**根治**老人种植难题,**最**专业的种植团队,**无痛**麻醉技术让患者**100%**放心。"
> 问题:14 年经验(量化背书,软性违规)/ 根治 / 最专业 / 无痛 / 100% — 5 处违规

✅ **正面例子(可通过审核)**:
> "贾医生擅长老人种植牙诊疗,长期专注复杂缺牙病例。临床麻醉采用《ITI 共识》推荐的局部浸润方案,患者术中疼痛感普遍较轻(具体感受因人而异)。"
> 注意:用"擅长 + 专长方向"代替"X 年经验"量化背书、用"擅长"代替"最"、用"较轻 + 因人而异"代替"无痛"、引用学术指南做背书

### 2. 零幻觉 + 主动召回具体数字
- 素材没提供的**数字**(年份、价格、百分比、时长)→ 不要写
- 素材没提供的**医生**→ 不要署名
- 素材没提供的**研究/指南**→ 不要引用
- 必须用数字时,只能用素材里出现过的;若不确定,改成"约""通常""部分"等模糊词

**主动召回**(D21 P3 加强):**KB 素材里如果有具体数值,必须用,不准软化成"一定范围"**。常见可召回数值:
- **血糖控制阈值**:KB 里通常写"空腹血糖 ≤8.8 mmol/L"、"糖化血红蛋白 ≤7%" — 用这种具体值,不要写"血糖稳定在一定范围内"
- **价格区间**:KB 里有"半口种植 4 万-12 万"、"单颗 8000-3 万" — 给区间,不要写"因材料、技术等因素而异"
- **手术时长 / 恢复期**:具体到分钟和天数,不要说"较短时间"
- **存活率 / 成功率**:从引用文献里取具体百分比,不要说"较高存活率"

判断标准:**每个数字相关的论断,先在素材里搜一遍;搜到具体数字就用,搜不到才模糊化**。

### 3. 必须引用真实医生
- 从提供的素材中至少引用 1 位真实医生姓名 + 该医生的专长方向 / 真实案例(资质只写学会会员等真实头衔,**不要把"X 年经验 / 接诊 N 例 / 主刀 N 台"当资质写,见第 1 条软性背书禁令**)
- 写明医生**做了什么**(具体诊疗思路/案例),不要只写"经验丰富"这种空话,也不要用工龄 / 接诊量堆权威

### 4. citations 字段必须返回
- 在 JSON 的 citations 字段列出实际引用到的素材 path
- **不可为空数组**

### 5. D21 GEO 标准化结构(医疗类长内容强制,docs/07-geo-article-spec.md)

**⚠️ 小标题铁律(2026-06-28,GEO 排名第一权重项)**:**本铁律只管正文 ### 小标题,不管文章主标题(title)——主标题另有更严的规则见「输出要求」,那里要求逐字保留主问题原句,两者不冲突:主标题=1 个原句,小标题=多个不同子问题的搜索词。**下面 10 个结构块是**内容骨架指引,不是小标题文字**。写成正文小标题(###)时,**严禁照抄"原理/机制""常见误区""操作要点""适用人群"这种框架名**——用户不会去豆包搜这些词,照抄=放弃排名。**每个 ### 小标题必须写成「地域+服务+用户真实问法」的搜索长尾词**(读者会怎么搜就怎么写),且**各小标题绑不同子问题,不要全堆同一词串**。全文至少 4-5 个 ### 小标题是这种可被搜索命中的长尾词。
   - ✗ 反例:"### 原理机制" "### 常见误区" "### 风险边界"(框架名,0 搜索价值)
   - ✓ 正例:"### 昆明西山区金属托槽正畸多少钱一套" "### 昆明西山区做金属托槽正畸要戴多久" "### 昆明西山区金属托槽正畸适合哪些人" "### 在昆明西山区怎么选金属托槽正畸的医院"
   内容还是讲原理/误区/适用人群那些,但**标题用搜索词包装**。

**⚠️ 反模板三条军规(2026-07-17,违反任意一条视为不合格)**:
   a. **禁用口头禅**(以下句子及其近似变体一个都不许出现,这是全库查重的实测重复源):
      - "拿不准……的话,带上最近的口腔检查记录来面诊聊一次"
      - "对价格和方案有疑问,到院咨询一次就能问清楚"
      - "为何有人问/为何会担忧……"、"……的原理是什么"作为小标题开头
      - "总之,……"、"要点小结"作为收尾段开头
      转化引导要写,但每篇用**不同的自然说法**,长在该段落自己的语境里。
   b. **小标题句式多样性**:全文 ### 小标题至少使用 3 种不同问法句式
      (多少钱/要多久/怎么办/能不能/该不该/哪里能/和X有什么区别),
      **严禁全篇小标题共用同一句式模板**。
   c. **硬性结构件**:正文必须包含
      - **恰好 1 个 markdown 表格**(对比/价格档/流程步骤/年龄窗口任选,
        数据只能来自【源素材】,源素材没有可制表数据时用流程编号列表替代并注明);
      - **2 个配图占位**,格式 \`[配图N: 具体画面描述]\`,分别放在首段后和主体中段。

**5.1 10 个必备结构块**(块=内容指引,标题按上面铁律改写成搜索长尾词;短脚本类如抖音 30s 可酌情合并):
1. **一句话结论(direct_answer)** — 开头 120 字内必须直接回答主问题,不绕开问题先讲故事
2. 误区 / 问题解释 — 为什么会问这个,有什么常见误解
3. 原理 / 机制 — 简明解释(可省具体数字,留定性)
4. 适用人群 + 不适用人群
5. 风险边界 — 出现什么情况一定要线下就诊
6. **FAQ 严格 = 5 条**(数量必须恰好 5,不是 4 不是 6,**LLM 最常偷工在这一项**)
   - 每条 Q&A 用统一格式:
     \`\`\`
     1. **Q:具体问题?**
     A:具体回答,35-90 字……

     2. **Q:具体问题?**
     A:具体回答……
     \`\`\`
   - 5 条 Q 必须覆盖**不同维度**(定义 / 对比 / 风险 / 流程 / 自查),不能 5 条都问"X 是什么"
   - **5 条 Q 必须围绕主问题人群/场景,不发散到无关人群**
     - 反例:主题"糖尿病人种植牙"里出现"儿童种植" FAQ — 跑题,扣分
     - 正例:5 条都围绕**糖尿病人**(风险 / 术前检查 / 流程 / 术后护理 / 跟假牙对比)
   - **【2026-06-17 地域长尾强化】至少 1 条 FAQ 的答案里,要自然嵌入「地域(西山区/昆明)+ 本院 + 本地化建议」的长尾句**,扩大本地搜索词覆盖。要长在答案的自然语境里,不是硬塞地域词。
     - 范例(儿童涂氟"多久涂一次"):答案末尾加一句「西山区本地多数儿童,医生普遍建议每半年到西山松鼠口腔复诊涂氟」
     - 范例(种植价格):答案里带「在昆明西山区,松鼠口腔国产种植价格区间约 ¥XXXX 起,以面诊为准」
     - **底线**:地域+本院建议必须真实、不夸大、不与别家比较;无真值的数字不编。
   - 缺 1 条 → DoD 闸门直接 fail,整篇不可派单
7. 审核信息 — 由医院医疗团队 / 具名医生审核
8. 更新时间 — 例:"本文最近更新于 2026-05"
9. 机构与服务绑定 — 文末点出品牌 + 服务名 + 城市(自然语境)
10. Trust Block(见 5.2)

**5.2 Trust Block**(文末独立段落,不要散落正文,用普通文本 + 项目符号):
  • 本文适用于:[谁]
  • 本文不替代:面诊、影像、专业评估
  • 出现以下情况建议尽快就诊:[列 3-5 个红旗症状]
  • 审核:[医院 / 医生]
  • 更新:[YYYY-MM]
  • 地域:[城市 / 区域]

**5.3 引用块标准** — 每个独立段落:
- 单独截出来也成立,不依赖前文
- **禁用模糊指代**:"这个" / "那种" / "前者" / "后者" / "上面提到的"
- 单块句长 35-90 字
- 每句话回答一个具体问题

**5.4 实体清晰度**:
- 品牌名 + 城市必须显式("昆明松鼠口腔" 不是 "我们医院")
- 服务名具体("种植牙" 不是 "这项手术")
- 审核者具名(否则漏 reviewed_by)
- 主体不能模糊("有些人 / 大部分情况" → "准备做种植的成年人")

## 自检步骤(输出前必走一遍)

输出 JSON 前,在 body 上做一次扫描:
1. 搜"最/最佳/最适合/首选/第一/根治/包治/治愈/永久/100%/无痛/零风险/保证" — 找到任意一个 → 改写或删掉
2. 检查所有数字 — 在素材里找原文 → 找不到的 → 改成模糊语;**但素材里给了具体数字的,必须用,不准软化成"一定范围"**
3. 至少 1 位医生姓名 + 1 条素材 path
4. 开头 120 字内是否给出主问题答案?(D21 必查)
5. FAQ 段落数 **正好 5**(数一遍 1-2-3-4-5,4 条要重写补 1 条,6 条要删 1 条)?(D21 最常被偷工的点,必查两遍)
6. **5 条 FAQ 是否都围绕主问题人群/场景?**(D21 严查) — 反例:主题"糖尿病人种植"里出现"儿童种植"的 FAQ
7. Trust Block 是否作为独立段落出现(7 项齐)?(D21 必查)
8. 每段是否能被单独引用(无模糊指代、35-90 字、无前文依赖)?
9. **是否有"因 X、Y、Z 等因素"这种开放式列举的尾巴?** → 把"等"去掉,只列明具体的 3-4 个因素,或者直接给数值区间
10. **价格相关论断** — KB 里有"X 元-Y 元"或"约 X 元"的就用区间,**不要写"价格因材料而异"这种"无信息的话"**

漏任意一项 → 内容会被判为不达标、打回重写,无法进入派单。`;

/**
 * Robust JSON extraction. FAST models occasionally return:
 *   - ```json\n{...}\n```  (markdown-wrapped, despite response_format=json_object)
 *   - "Here is the JSON:\n{...}"  (prose-prefixed)
 *   - {...}\n```  (trailing markdown fence with newlines)
 * Try direct parse → strip code fences → grab first balanced {…} block.
 */
/**
 * Escape literal newlines / tabs INSIDE JSON string values. Doubao FAST often
 * emits raw \n inside body strings even when asked for JSON, which JSON.parse
 * rejects ("Bad control character in string literal").
 */
function repairJsonStringEscapes(s: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (c === '\\') {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      out += c;
      continue;
    }
    if (inString) {
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  return out;
}

function extractJson(raw: string): unknown | null {
  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  // 1. Direct
  let v = tryParse(raw);
  if (v) return v;

  // 2. Strip ```json … ``` fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? raw;

  v = tryParse(candidate);
  if (v) return v;

  // 3. Repair raw newlines/tabs inside string literals
  v = tryParse(repairJsonStringEscapes(candidate));
  if (v) return v;

  // 4. Take first balanced {...} block, then repair
  const start = candidate.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < candidate.length; i++) {
      if (candidate[i] === '{') depth++;
      else if (candidate[i] === '}') {
        depth--;
        if (depth === 0) {
          const block = candidate.slice(start, i + 1);
          v = tryParse(block) ?? tryParse(repairJsonStringEscapes(block));
          if (v) return v;
          break;
        }
      }
    }
  }
  return null;
}

function ngrams(s: string, n: number): string[] {
  const cleaned = s.replace(/[\s，。!?、::;,.!?;()()【】「」"""''']/g, '');
  const out: string[] = [];
  for (let i = 0; i + n <= cleaned.length; i++) {
    out.push(cleaned.slice(i, i + n));
  }
  return out;
}

/**
 * V1.13 (2026-07-17) — 口语 → KB 术语同义词归一。
 *
 * 实测教训:选题说"洗牙",KB 文件叫"洁牙",n-gram 一字不合 → 项目库
 * 没被召回 → LLM 拿不到真价格表,自己编了"100-200 元"(KB 真值 ¥128-168)。
 * 患者口语和临床术语天然两套词,召回层必须做桥接。
 * 维护成本极低的显式映射表,宁缺勿滥——错误映射比缺映射更危险。
 */
const QUERY_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/洗牙/g, ' 洁牙 洗牙 '],
  [/种牙/g, ' 种植牙 种牙 '],
  [/整牙|矫牙/g, ' 牙齿矫正 正畸 '],
  [/牙套/g, ' 牙套 矫正 正畸 '],
  [/杀神经|抽神经/g, ' 根管治疗 '],
  [/补牙洞|蛀牙|虫牙/g, ' 龋齿 补牙 '],
  [/拔智齿/g, ' 智齿 拔牙 '],
  [/假牙|镶牙/g, ' 义齿 修复 '],
  [/牙龈出血|牙床出血/g, ' 牙周 牙龈 '],
  [/地包天|龅牙/g, ' 错颌畸形 早期矫正 '],
];

function expandQuerySynonyms(query: string): string {
  let out = query;
  for (const [re, expansion] of QUERY_SYNONYMS) {
    if (re.test(out)) out += expansion;
    re.lastIndex = 0;
  }
  return out;
}

function scoreSource(
  query: string,
  source: { title: string | null; excerpt: string | null; source_path: string },
): number {
  const grams = Array.from(
    new Set([...ngrams(expandQuerySynonyms(query), 2), ...ngrams(expandQuerySynonyms(query), 3)]),
  );
  if (grams.length === 0) return 0;
  const title = source.title ?? '';
  const excerpt = source.excerpt ?? '';
  const path = source.source_path;
  let score = 0;
  for (const g of grams) {
    const inPath = path.includes(g);
    const inTitle = title.includes(g);
    const inExcerpt = excerpt.includes(g);
    if (g.length === 3) {
      if (inPath) score += 6;
      if (inTitle) score += 5;
      if (inExcerpt) score += 2;
    } else {
      if (inPath) score += 3;
      if (inTitle) score += 2;
      if (inExcerpt) score += 1;
    }
  }
  // V1.13 (2026-07-17):诊疗事实层加权。品牌/受众层文件泛匹配度高(每篇都
  // 提"昆明/口腔"),会把项目库/FAQ 的硬数据文件挤出 top-K —— 2026-07-12~16
  // 系统批实测:正文只有品牌层套话,价格表/发生率/流程数据全部缺席。
  if (score > 0) {
    if (path.includes('诊疗/项目库')) score += 8;
    else if (path.includes('患者/问答')) score += 6;
    else if (path.includes('诊疗/')) score += 3;
  }
  return score;
}

/**
 * V1.13 (2026-07-17) — 按主题挑选源文件里最相关的小节,替代盲切前 1000 字。
 *
 * 背景:项目库 md 以「元信息表(~400字)+ 基本信息」开头,价格表/治疗流程/
 * 风险数据都在文件中后段。`slice(0, 1000)` 只喂了表头 —— 这是系统批
 * "信息增量归零"的直接原因(硬数据物理上没进 prompt)。
 *
 * 策略:按 `## ` 切小节 → 丢弃元信息节 → 小节按主题 n-gram 命中排序 →
 * 依序装填直到预算;一个小节都没命中时退化为"跳过元信息后的开头段"。
 */
function pickRelevantSections(raw: string, topic: string, budget: number): string {
  const grams = Array.from(new Set([...ngrams(topic, 2), ...ngrams(topic, 3)]));
  const sections = raw.split(/(?=^##\s)/m).filter((s) => s.trim().length > 0);

  const scored = sections
    // 元信息表头不进 prompt;标注"内部"的小节(医生视角话术/内部口径)不对外
    .filter((s) => !/^##\s*元信息/.test(s) && !/^##[^\n]*内部/.test(s))
    .map((s, idx) => {
      let hits = 0;
      for (const g of grams) if (s.includes(g)) hits += g.length === 3 ? 2 : 1;
      // 数字密度小奖励:含价格/比例/时长的小节通常是事实层精华
      const numberBonus = Math.min(4, (s.match(/[¥%]|\d+\s*(?:分钟|个月|周|天|岁|mm|元)/g) ?? []).length);
      return { s, idx, score: hits + numberBonus };
    })
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const picked: string[] = [];
  let used = 0;
  for (const { s, score } of scored) {
    if (score === 0 && picked.length > 0) break;
    const chunk = s.trim().slice(0, Math.max(0, budget - used));
    if (chunk.length < 40) continue;
    picked.push(chunk);
    used += chunk.length;
    if (used >= budget) break;
  }
  if (picked.length === 0) {
    // 全无命中:跳过元信息后取开头
    const noMeta = raw.replace(/^---[\s\S]*?---\s*/m, '').replace(/##\s*元信息[\s\S]*?(?=^##\s|\s*$)/m, '');
    return noMeta.trim().slice(0, budget);
  }
  return picked.join('\n\n');
}

/**
 * Run one AI-draft generation cycle. Returns the inserted content_item id.
 * Thread-safe — multiple concurrent calls (worker with teamSize=5) hit
 * independent Supabase queries + LLM streams, no shared mutable state.
 */
export async function runAiDraft(
  supabase: SupabaseClient,
  tenantId: string,
  input: RunAiDraftInput,
): Promise<RunAiDraftResult> {
  const topic = input.topic.trim();
  const audience = input.audience.trim();
  if (topic.length < 2) throw new Error('请输入主题(至少 2 字)');
  if (audience.length === 0) throw new Error('请选择受众');
  if (!PLATFORM_HINT[input.platform]) throw new Error('不支持的平台');

  // 1. KB recall — public-eligible only (migration 0027 — L2 internal docs
  // must not feed publicly visible AI output).
  const { data: candidates, error: recallErr } = await supabase
    .from('knowledge_sources')
    .select('id, source_path, title, excerpt')
    .eq('tenant_id', tenantId)
    .eq('is_public_eligible', true)
    .is('deleted_at', null);
  if (recallErr) throw new Error(`检索知识库失败: ${recallErr.message}`);
  if (!candidates?.length) {
    throw new Error('知识库为空,请等待同步完成或先填充内容');
  }

  // WIZ-1 split — pinned + RAG fill.
  const preferredSet = new Set(input.preferred_doc_paths ?? []);
  const preferredHits = candidates.filter((c) => preferredSet.has(c.source_path));
  const remainingPool = candidates.filter((c) => !preferredSet.has(c.source_path));

  const scoredRest = remainingPool
    .map((c) => ({ ...c, score: scoreSource(`${topic} ${audience}`, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const pinnedSlots = Math.min(preferredHits.length, DRAFT_RECALL_K - 1);
  const fillCount = Math.max(DRAFT_RECALL_K - pinnedSlots, 0);
  const ranked: Array<{
    id: string; source_path: string; title: string | null; excerpt: string | null; score: number;
  }> = [
    ...preferredHits.slice(0, pinnedSlots).map((c) => ({ ...c, score: 1.0 })),
    ...scoredRest.slice(0, fillCount),
  ];
  if (preferredHits.length > pinnedSlots) {
    ranked.length = 0;
    ranked.push(...preferredHits.map((c) => ({ ...c, score: 1.0 })));
    ranked.length = Math.min(ranked.length, DRAFT_RECALL_K);
  }

  if (ranked.length === 0) {
    const samples = candidates
      .filter((c) => c.title)
      .slice(0, 6)
      .map((c) => `「${c.title}」`)
      .join('、');
    const suggestion = samples
      ? `你知识库里现有这些素材标题:${samples}。试试用其中一个的关键词,或精简成 2-4 字的主题词(如其中的核心名词)。`
      : '请先到「设置 → 知识库」上传相关 markdown 素材,再回来生成内容。';
    throw new Error(
      `知识库里 ${candidates.length} 篇内没有匹配「${topic}」的素材。${suggestion}`,
    );
  }

  // 2. Read source bodies from KB mirror.
  // Pre-sanitize at INGESTION:把违规营销话术(国内唯一/8 项国际金标准/包治…)
  // 在送进 prompt 之前就软化掉。LLM 看到的源材料是清洁版 → 物理上写不出
  // 违规话术。比 post-LLM sanitizer 更彻底:那个是兜底,这个是断源头。
  // 真实的医疗事实(数字/医生名/治疗细节)不动。
  const sourceBodies: Array<{ path: string; body: string }> = [];
  for (const r of ranked) {
    try {
      const raw = await readFile(join(KB_ROOT, r.source_path), 'utf-8');
      const sanitized = sanitizeAbsoluteWords(raw);
      if (sanitized.hits.length > 0) {
        console.warn(
          `[ai-draft-core] KB source pre-cleaned ${r.source_path}: ` +
            sanitized.hits.map((h) => `${h.reason}×${h.count}`).join(', '),
        );
      }
      // V1.13:按主题挑相关小节(价格/流程/风险数据在文件中后段),
      // 替代 slice(0,1000) 盲切表头;预算 1600/篇(5 篇 ≈ 8K 字,32K 窗口安全)
      sourceBodies.push({
        path: r.source_path,
        body: pickRelevantSections(
          sanitized.cleaned,
          expandQuerySynonyms(`${topic} ${audience}`),
          1600,
        ),
      });
    } catch (err) {
      console.warn(`[ai-draft-core] read source ${r.source_path} failed:`, err);
    }
  }
  if (sourceBodies.length === 0) {
    throw new Error('召回的素材文件读取失败,请检查知识库挂载');
  }

  // 3a. Platform style guide
  let platformGuide: string | null = null;
  const guidePath = PLATFORM_KB_GUIDE[input.platform];
  if (guidePath) {
    try {
      const raw = await readFile(join(KB_ROOT, guidePath), 'utf-8');
      const stripped = raw
        .replace(/^---[\s\S]*?---\s*/m, '')
        .replace(/##\s*元信息[\s\S]*?(?=##|\z)/m, '');
      // 同 step 2:平台风格指南也是 KB 内容,可能含老营销话术 → 预清洁
      const sanGuide = sanitizeAbsoluteWords(stripped);
      if (sanGuide.hits.length > 0) {
        console.warn(
          `[ai-draft-core] platform guide ${guidePath} pre-cleaned: ` +
            sanGuide.hits.map((h) => `${h.reason}×${h.count}`).join(', '),
        );
      }
      platformGuide = sanGuide.cleaned.slice(0, 1500);
    } catch (err) {
      console.warn(`[ai-draft-core] platform guide ${guidePath} unavailable:`, err);
    }
  }

  // 3b. Writing template + keywords (ADR 007)
  let templateBlock = '';
  let templateSystemAppend = '';
  let keywordsBlock = '';
  if (input.writing_template_id || (input.keyword_ids && input.keyword_ids.length > 0)) {
    const tplPromise = input.writing_template_id
      ? supabase
          .from('writing_templates')
          .select('name, prompt_skeleton, structure_hint')
          .eq('id', input.writing_template_id)
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null });
    const kwPromise = input.keyword_ids && input.keyword_ids.length > 0
      ? supabase
          .from('keywords')
          .select('text')
          .in('id', input.keyword_ids)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] });
    const [tplRes, kwRes] = await Promise.all([tplPromise, kwPromise]);

    if (tplRes.data) {
      const tpl = tplRes.data as { name: string; prompt_skeleton: string; structure_hint: { sections?: string[]; min_sections?: number } | null };
      templateSystemAppend = `\n\n${tpl.prompt_skeleton}`;
      const sections = tpl.structure_hint?.sections ?? [];
      if (sections.length > 0) {
        templateBlock =
          `\n\n# 文章骨架(来自写作要求"${tpl.name}",作为结构参考可微调)\n` +
          sections.map((s, i) => `${i + 1}. ${s}`).join('\n') +
          (tpl.structure_hint?.min_sections
            ? `\n\n至少包含 ${tpl.structure_hint.min_sections} 个上述节段。`
            : '');
      }
    }
    const keywordTexts = ((kwRes.data ?? []) as Array<{ text: string }>).map((k) => k.text);
    if (keywordTexts.length > 0) {
      keywordsBlock =
        `\n\n# 必须自然植入的关键词(每个至少出现一次,禁止堆砌列表)\n` +
        keywordTexts.map((k) => `• ${k}`).join('\n') +
        `\n\n注意:每个关键词必须以**自然语境**出现,不要集中堆在末尾或 tag 区。`;
    }
  }

  // 3c. Compose prompt
  const sourcesBlock = sourceBodies
    .map((s, i) => `## 素材 ${i + 1} 〈${s.path}〉\n${s.body}`)
    .join('\n\n---\n\n');
  const platformHint = PLATFORM_HINT[input.platform];
  const platformBlock = platformGuide
    ? `# 平台调性(客户维护的风格指南 〈${guidePath}〉)\n\n${platformGuide}`
    : `# 平台调性\n\n${platformHint}`;

  // 3d. Geographic scope (migration 0026) + doctor whitelist (D21 / P3-3 B)
  const [brandRes, doctorsRes] = await Promise.all([
    supabase
      .from('brands')
      .select('service_areas')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('staff_accounts')
      .select('real_name, persona, credentials, settings')
      .eq('tenant_id', tenantId)
      .eq('kind', 'doctor')
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(20),
  ]);
  const brandRow = brandRes.data;
  const serviceAreas: string[] = Array.isArray(brandRow?.service_areas)
    ? (brandRow!.service_areas as string[]).map((s) => s.trim()).filter(Boolean)
    : [];
  const geoBlock =
    serviceAreas.length > 0
      ? `\n\n# 本品牌服务地区(地理边界,严格遵守)\n${serviceAreas.map((a) => `• ${a}`).join('\n')}\n\n` +
        `文中提到城市 / 地区时,**只用上面列表里的地区名**(本地化案例、医保政策、价格区间)。**禁止**把"北京 / 上海 / 广州 / 深圳"或其他列表外城市作为本地化锚点。全国通用医学论点无地域要求,可不带城市名。`
      : '';

  // 2026-06-15 — 机构事实强制注入。根因:起草用 N-gram 词汇匹配选 KB 文件,
  // 机构身份文件(医院/身份/定位.md、荣誉资质.md)标题/路径里没有"种植牙/价格"
  // 这类问题词 → 匹配分=0 → 永远不被召回 → 文章写不出地址/资质/营业时间。
  // 这些是"每篇都该有的固定事实",不该靠"和问题匹配"决定要不要喂,而应无条件注入
  // (像 geoBlock 一样)。2026-06-15 豆包实测:本地推荐时这些硬字段被直接抄进答案。
  // 真值源在 KB 这两个文件(刚补全营业时间+窝沟封闭定点),禁编造——文件读不到就留空。
  const INSTITUTION_FILES = ['医院/身份/定位.md', '医院/身份/荣誉资质.md'];
  let institutionFacts = '';
  for (const relPath of INSTITUTION_FILES) {
    try {
      const raw = await readFile(join(KB_ROOT, relPath), 'utf-8');
      institutionFacts += `\n${sanitizeAbsoluteWords(raw).cleaned.slice(0, 1200)}`;
    } catch (err) {
      console.warn(`[ai-draft-core] institution file ${relPath} read failed:`, err);
    }
  }
  const institutionBlock = institutionFacts.trim()
    ? `\n\n# 本机构基本事实(权威真值,可直接引用,严禁改写/编造)\n${institutionFacts.trim()}\n\n` +
      `**【2026-06-15 豆包实测·必用】上面是本机构的真实硬事实(资质等级/医保定点/窝沟封闭定点/精确地址到楼层/营业时间/设备/成立年份等)。**\n` +
      `实测豆包做本地推荐时会直接把这些字段抄进答案——写得全 = 被推荐概率高。\n` +
      `要求:在回答本文问题的同时,**自然带出**其中与本题相关的硬事实(如答价格题带营业时间+医保定点+地址;答儿牙题带窝沟封闭定点)。\n` +
      `**只能用上面列出的真值,上面没有的字段一律留空、不编造**(编造资质=违法)。不要把这段原样复制粘贴,要融进正文自然语境。`
    : '';

  // D21 / ADR 009 P3-3 B — real-doctor whitelist with topic-relevance scoring.
  // Prior version dumped all 12 doctors into the prompt; LLM frequently picked
  // a doctor whose specialty didn't match the article topic (e.g. picked the
  // 儿牙 doctor for an adult-implant piece). Scoring by topic keyword overlap
  // surfaces only the top 3 candidates.
  //
  // 2026-06-06 (B 方案): the scorer used to read `persona.tags`, but KB sync
  // writes specialties into `persona.specialties` and `persona.tags` is always
  // null → every doctor scored 0 → the first DB rows (often 儿牙) got picked for
  // implant articles, and the renderer flagged everyone ⚠️ "no credentials" so
  // the LLM fabricated experience years. personaToDoctorFields() now maps the
  // real, KB-sourced specialties + 科室/职称/年限/教育背景 into the structures
  // the scorer and renderer actually read.
  type DoctorRow = {
    real_name: string | null;
    persona: unknown;
    credentials: unknown;
    settings: unknown;
  };
  const doctorsRaw = (doctorsRes.data ?? []) as DoctorRow[];
  const topicHaystack = `${topic} ${audience}`.toLowerCase();
  const scoredDoctors = doctorsRaw
    .map((d) => {
      const { tags, credentials } = personaToDoctorFields(d.persona);
      // 重叠分:每个专长出现在 topic+audience 里加 10,bigram 部分匹配加 3
      let score = 0;
      for (const tag of tags) {
        const tagLower = tag.toLowerCase();
        if (topicHaystack.includes(tagLower)) score += 10;
        else {
          // 子串部分匹配(如 specialty="单颗牙种植" topic="60岁以上种植牙" 共享"种植")
          for (let i = 0; i < tagLower.length - 1; i++) {
            const bi = tagLower.slice(i, i + 2);
            if (topicHaystack.includes(bi)) {
              score += 3;
              break;
            }
          }
        }
      }
      // 2026-06-08: 品牌台柱医生加成(配置化,settings.featured_doctor=true)。
      // **只在该医生专长真匹配(score>0)时加成** — 让台柱在对口主题置顶,但绝不会
      // 让儿牙台柱去署种植/正畸文(那些 score=0 不加),守住专科对口底线(D38)。
      // 不写死人名,延续 D2 配置化:换客户/换台柱只需改 settings。
      const isFeatured =
        (d.settings as { featured_doctor?: boolean } | null)?.featured_doctor === true;
      if (isFeatured && score > 0) score += 15;
      // KB persona 优先(医院自维护源头,更新更勤);credentials 列仅在 KB 无值时兜底。
      // 2026-06-06: credentials 列里有过时数据(刘彦廷 12 年 vs KB 20 年),
      // 用户拍板以 KB 为准 → KB-derived 优先。
      const mergedCred =
        Object.keys(credentials).length > 0
          ? credentials
          : (d.credentials ?? {});
      return { name: d.real_name ?? '', tags, score, credentials: mergedCred };
    })
    .filter((d) => d.name.length > 0)
    .sort((a, b) => b.score - a.score);
  // 取 top 3 相关的;如果全 0 分,保留前 3 作通用候选(LLM 仍可挑)
  const topDoctors = scoredDoctors.slice(0, 3);
  const doctorBlock = renderDoctorBlock(topDoctors, { mode: 'draft' });

  // SYSTEM_PROMPT (immutable) first; template skeleton appended.
  const systemContent = SYSTEM_PROMPT + templateSystemAppend;

  // D21 / ADR 009 — query intent + primary_query framing. Injected BEFORE
  // sources block so the model anchors generation around the question type
  // and exact surface form before reading the materials.
  const INTENT_LABEL_MAP: Record<NonNullable<RunAiDraftInput['query_intent']>, string> = {
    what_is: '什么是 / 定义型',
    is_it_true: '辟谣 / 是不是真的',
    which_is_better: '对比 / 哪个更好',
    why_happens: '原因 / 为什么会这样',
    what_to_do: '出现 X 怎么办',
    how_long: '要多久 / 多频繁',
    when_to_seek_care: '何时需要就医',
    how_to_choose_local: '本地怎么选 / 选医院',
  };
  const intentBlock =
    input.query_intent || input.primary_query
      ? `\n\n# 主问题与意图(D21 强制约束)\n` +
        (input.primary_query
          ? `**主问题**(读者会原样输入到豆包搜索的句子): ${input.primary_query}\n`
          : '') +
        (input.query_intent
          ? `**问题类型**: ${INTENT_LABEL_MAP[input.query_intent]} (\`${input.query_intent}\`)\n`
          : '') +
        `\n要求:\n` +
        `- 文章首段 **120 字内** 必须直接给出主问题的答案,不要绕开问题先讲故事 / 先讲背景\n` +
        `- 整篇文章只回答这一个主问题 + 它的衍生问法,不要发散到无关话题\n` +
        `- 标题必须与主问题语义高度相关`
      : '';

  const messages = [
    { role: 'system' as const, content: systemContent },
    {
      role: 'user' as const,
      content:
        `# 写作任务\n\n` +
        `**主题**: ${topic}\n` +
        `**目标受众**: ${audience}\n` +
        `**目标平台**: ${input.platform}\n` +
        `${intentBlock}\n\n` +
        `${platformBlock}` +
        `${geoBlock}` +
        `${institutionBlock}` +
        `${doctorBlock}\n\n` +
        `${GEO_TACTICS_PROMPT}` +
        `${templateBlock}` +
        `${keywordsBlock}\n\n` +
        `# 可用素材(只能引用以下内容,严禁外部知识)\n\n${sourcesBlock}\n\n` +
        `# 输出要求\n\n` +
        `严格输出 JSON,字段:\n` +
        `- title: 标题。**2026-06-15 豆包实测:标题与用户搜索词字面重合度是唯一显著排名因子**。默认直接用「主问题原句」当标题(地域词+服务词+意图词一字不丢,句尾可补「?」或「2026」「(含价格)」小尾巴),**不要为了短而压缩、换词、丢关键词**。宁可长到 25-30 字,也不要丢掉地域词或问句形式。\n` +
        `  **【口语词禁雅化,2026-07-04 实测硬要求】主问题里的口语/网络词必须原样保留,严禁"规范化"成书面词——这不是优化,是丢搜索命中**。逐字保留:「vs」不改成「与/和/对比」、「有啥」不改成「有哪些/是什么」、「不」(如"有风险不")不改成「吗/呢」、「咋/怎么整」不改、「多少钱」不改成「价格/费用」、「哪家/哪些」不改。\n` +
        `    - ✗ 反例:主问题「民营口腔 vs 公立口腔科有啥差异」→ 标题写成「民营口腔与公立怎么选」(把 vs→与、有啥差异→怎么选,丢了 3 个搜索词)\n` +
        `    - ✓ 正例:标题「昆明西山区儿童牙齿矫正,民营口腔 vs 公立口腔科有啥差异」(原句照搬)\n` +
        `    **标题会过一道机械闸门逐字校验主问题实词,雅化 = 直接打回重写,别抱侥幸。**\n` +
        `- body: 正文 markdown(按平台调性结构化,优先应用 GEO 9 法前 5 条)\n` +
        `- tactics: 应用的 GEO 技巧数组(从 9 法中选实际用到的)\n` +
        `- citations: 引用的素材路径数组(从上面素材路径中选,**至少 1 条**;路径必须完全匹配,不要修改)\n` +
        `- doctors_cited: 文中提到的真实医生姓名数组(必须来自素材,**至少 1 位**)\n\n` +
        `## ⚠️ JSON 字符串转义铁律(违反 = 整篇白写)\n` +
        `- body 里的换行 → 必须写成 \\n,不要写实际换行符\n` +
        `- body 里出现的中文双引号「」用 中文括号包就行,**不要**用英文双引号 "" 包内嵌引语\n` +
        `- 所有 markdown 标题、列表也用 \\n 连接\n` +
        `- 输出前在心里默念一遍:这串 JSON 能直接 JSON.parse 吗?如果不能,改`,
    },
  ];

  // 4. LLM call
  let draftTitle = '';
  let draftBody = '';
  let draftCitations: string[] = [];
  let provider: 'doubao' | 'stub' = 'stub';

  if (llmAvailable()) {
    let result;
    try {
      result = await chat({
        messages,
        // Content drafting doesn't need chain-of-thought; the reasoning
        // endpoint adds 2-3 min/call which kills batch throughput. Fall
        // back to the configured PRO model only if FAST isn't set.
        model: process.env.ARK_MODEL_FAST,
        temperature: 0.7,
        // Bumped from 2500 — new SYSTEM_PROMPT (#3 with examples + self-check)
        // demands a richer body, and 2500 truncates before closing JSON brace,
        // surfacing as parse errors. 4000 covers ~2K-char Chinese article + struct.
        max_tokens: 4000,
        response_format: 'json_object',
        timeout_ms: 120_000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort/i.test(msg)) {
        // Retryable — pg-boss retryLimit=3 will pick this up. Mark it as
        // retryable so the worker handler knows to throw vs return.
        const e = new Error('AI 生成超过 90 秒未返回(可能负载抖动),将自动重试');
        (e as Error & { retryable?: boolean }).retryable = true;
        throw e;
      }
      console.error('[ai-draft-core] LLM call failed:', err);
      reportError(err, {
        scope: 'ai-draft.llm_call',
        tenant_id: tenantId,
        extra: { platform: input.platform, topic: topic.slice(0, 80) },
      });
      throw new Error(`AI 调用失败: ${msg.slice(0, 100)}`);
    }
    const parsedRaw = extractJson(result.content);
    if (!parsedRaw) {
      console.error(
        `[ai-draft-core] LLM JSON unparseable len=${result.content.length} head: ${result.content.slice(0, 200)} … tail: ${result.content.slice(-200)}`,
      );
      throw new Error('AI 返回格式异常,请重试');
    }
    try {
      const parsed = parsedRaw as {
        title?: string;
        body?: string;
        citations?: string[];
        doctors_cited?: string[];
      };
      draftTitle = parsed.title ?? topic;
      draftBody = parsed.body ?? '';
      const validCitations = Array.isArray(parsed.citations)
        ? parsed.citations.filter((c) => sourceBodies.some((s) => s.path === c))
        : [];
      draftCitations = validCitations.length > 0
        ? validCitations
        : sourceBodies.map((s) => s.path);
      provider = 'doubao';
    } catch (err) {
      console.error('[ai-draft-core] LLM JSON parse failed', err, result.content.slice(0, 200));
      reportError(err, {
        scope: 'ai-draft.json_parse',
        tenant_id: tenantId,
        extra: {
          platform: input.platform,
          topic: topic.slice(0, 80),
          content_head: result.content.slice(0, 200),
        },
      });
      throw new Error('AI 返回格式异常,请重试');
    }
  } else {
    draftTitle = `[STUB] ${topic}`;
    draftBody =
      `> AI 草稿(stub 模式 — ARK_API_KEY 未配置)\n\n` +
      `主题: ${topic}\n受众: ${audience}\n平台: ${input.platform}\n\n` +
      `召回素材:\n${sourceBodies.map((s) => `- ${s.path}`).join('\n')}`;
    draftCitations = sourceBodies.map((s) => s.path);
  }

  if (!draftBody.trim()) throw new Error('AI 生成的正文为空,请重试');

  // V1.13: 剥内部工装([源素材] 标注 / <br>)——FAST 模型会把 prompt 里的
  // 溯源标记字面留在正文(2026-07-13~16 实测 5 篇漏进待发内容)。
  const titleStripped = stripDraftArtifacts(draftTitle);
  const bodyStripped = stripDraftArtifacts(draftBody);
  if (bodyStripped.stripped.marker > 0 || bodyStripped.stripped.br > 0) {
    console.warn(
      `[ai-draft-core] draft artifacts stripped tenant=${tenantId} topic="${topic}"`,
      bodyStripped.stripped,
    );
  }
  draftTitle = titleStripped.cleaned;
  draftBody = bodyStripped.cleaned;

  // Anti-hallucination sanitizer (deterministic safety net beneath the prompt).
  const titleSan = sanitizeAbsoluteWords(draftTitle);
  const bodySan = sanitizeAbsoluteWords(draftBody);
  if (titleSan.hits.length > 0 || bodySan.hits.length > 0) {
    const allHits = [...titleSan.hits, ...bodySan.hits];
    console.warn(
      `[ai-draft-core] absolute-words softened tenant=${tenantId} topic="${topic}" hits=`,
      allHits.map((h) => `${h.reason}×${h.count}`).join(', '),
    );
  }
  draftTitle = titleSan.cleaned;
  draftBody = bodySan.cleaned;

  // 标题确定性对齐(docs/11 P0-1 后续,2026-07-04)。改 prompt 让 LLM 逐字保留
  // 标题实测无效(5/5 仍雅化),改由代码保证唯一显著因子(标题=问题原句)。
  // LLM 标题不过闸门 → 回退成问题原句。长文才做(短脚本标题是 hook 体)。
  const LONG_FORM = ['toutiao_article', 'wechat_mp', 'zhihu', 'baijiahao', 'souhu'];
  if (LONG_FORM.includes(input.platform)) {
    const aligned = enforceTitleFromQuery(draftTitle, input.primary_query ?? topic);
    if (aligned.replaced) {
      console.log(
        `[ai-draft-core] title realigned to query: "${draftTitle}" → "${aligned.title}" (missed: ${aligned.misses.join(',')})`,
      );
      draftTitle = aligned.title;
    }
  }

  // 2026-05-28: 自动 prettify — LLM 思考模型偶尔吐 "2026 - 04" / 单行挤死的 markdown,
  // 入库前过一道纯文本变换,客户编辑面板看到的就是排好版的;手工「美化排版」按钮作 fallback。
  // 在 sanitizer 之后跑,避免被切换 lint 影响。
  draftBody = prettifyMarkdown(draftBody);

  // 5. Slice extraction (D21 / ADR 009 P1) — heuristic, no LLM call.
  // Pull brand name + city for entity_snapshot enrichment.
  let extractCtx: { brand_name?: string; city?: string } | undefined;
  try {
    const { data: brandRow } = await supabase
      .from('brands')
      .select('name, location')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (brandRow) {
      const loc = (brandRow.location ?? {}) as { city?: string };
      extractCtx = {
        brand_name: brandRow.name ?? undefined,
        city: typeof loc.city === 'string' ? loc.city : undefined,
      };
    }
  } catch {
    /* brand lookup is best-effort; slices still extract from body alone */
  }
  const slices = extractSlices({ body: draftBody, ctx: extractCtx });

  // 5b. DoD evaluation (D21 / ADR 009 P2-4). Runs L2 + slice completeness;
  // failed items are not blocked from save, but dispatch will skip them.
  const dod = evaluateDod({
    title: draftTitle,
    body: draftBody,
    slices,
    // primary_query 兜底 topic:nightly-draft 路径 topic 即 question 原句。
    // 传入后激活 L2 query_coverage(此前恒 unknown)+ 标题硬闸门(docs/11 P0-1)。
    ctx: { ...extractCtx, is_medical: true, primary_query: input.primary_query ?? topic },
  });

  // 5c. Persist content_contract (D21 / ADR 009 P3-2). When query_intent +
  // primary_query are present (D21 wizard path), materialize a contract
  // row that captures the user's declaration. Sensible defaults for fields
  // wizard doesn't yet collect — operator can refine in P1-end contracts
  // editor UI. query_cluster ≥ 3 enforced by DB CHECK so we synthesize
  // simple variants when only primary_query is set.
  let contractId: string | null = null;
  if (input.query_intent && input.primary_query) {
    const articleType = inferArticleTypeFromIntent(input.query_intent);
    // query_cluster: need ≥ 3 per DB CHECK. Use primary_query + 2 simple
    // rewrites as a safe seed; operator can edit later.
    const cluster = [
      input.primary_query.trim(),
      `${input.primary_query.trim().replace(/[?？]$/, '')}的原理`,
      `${input.primary_query.trim().replace(/[?？]$/, '')}怎么处理`,
    ];
    const { data: contractRow } = await supabase
      .from('content_contracts')
      .insert({
        tenant_id: tenantId,
        article_type: articleType,
        query_intent: input.query_intent,
        primary_query: input.primary_query.trim(),
        query_cluster: cluster,
        primary_entity: 'brand',
        supporting_entities: [],
        target_audience: input.audience,
        decision_stage: 'consideration',
        location_scope: 'local_city',
        reviewer_required: true,
        risk_boundary_required: true,
        faq_required_count: 5,
        citation_mode: 'mixed',
        schema_targets: schemaTargetsForType(articleType),
      })
      .select('id')
      .single();
    if (contractRow?.id) contractId = contractRow.id as string;
  }

  // 6. Persist content_item
  const { data: created, error: insErr } = await supabase
    .from('content_items')
    .insert({
      tenant_id: tenantId,
      title: draftTitle.slice(0, 200),
      source_type: 'manual',
      status: 'ai_drafted',
      markdown: draftBody,
      topics: [topic, audience].filter(Boolean),
      writing_template_id: input.writing_template_id ?? null,
      keyword_ids: input.keyword_ids ?? [],
      content_contract_id: contractId,
      slices,
      dod_status: dod.status,
      dod_score: dod.score,
      dod_evidence: dod.evidence,
      dod_evaluated_at: dod.evidence.evaluated_at,
    })
    .select('id')
    .single();
  if (insErr || !created) throw new Error(`草稿写入失败: ${insErr?.message}`);

  const citedSources = ranked.filter((r) => draftCitations.includes(r.source_path));
  if (citedSources.length > 0) {
    const maxScore = Math.max(...ranked.map((r) => r.score), 1);
    await supabase.from('content_citations').insert(
      citedSources.map((c) => ({
        tenant_id: tenantId,
        content_item_id: created.id,
        knowledge_source_id: c.id,
        confidence: c.score / maxScore,
      })),
    );
  }

  console.log(
    `[ai-draft-core] tenant=${tenantId} topic="${topic}" platform=${input.platform} provider=${provider} cited=${citedSources.length}/${ranked.length}`,
  );

  return { content_item_id: created.id, cited_paths: citedSources.map((c) => c.source_path) };
}
