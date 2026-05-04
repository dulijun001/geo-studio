/**
 * 12 system preset writing templates (ADR 007).
 *
 * Each entry defines an INTENT skeleton: writer role + content structure +
 * voice tilt. Format / length / syntax stay in PLATFORM_SPEC inside
 * geo-core/generation/prompt-builder.ts. The composer joins them at runtime —
 * "tutorial" × "xiaohongshu" auto-differs from "tutorial" × "wechat_mp".
 *
 * IMPORTANT: prompt_skeleton is APPENDED to SYSTEM_RULES in buildVariantPrompt,
 * so DO NOT redefine compliance red lines here — they're inherited.
 *
 * NOTE on absent "geo-ranking-objective": the competitor 「抓词GEO」 ships a
 * "GEO 排名优化" template that prompts the model to "list 5+ brands with
 * primary brand first" — that's soft-advertising stuffing and trips D5/D12
 * gate 1 in a medical context. We are NOT seeding that template; a
 * medically-safe rewrite is tracked as future work.
 */

export type WritingTemplateSeed = {
  slug: string;
  name: string;
  description: string;
  prompt_skeleton: string;
  structure_hint: { sections: string[]; min_sections?: number };
};

export const WRITING_TEMPLATE_SEEDS: WritingTemplateSeed[] = [
  {
    slug: 'tutorial',
    name: '操作教程',
    description: '步骤化拆解一个流程,让读者跟做即可达成。每步动词起头,语气务实。',
    prompt_skeleton: `
━━━ 写作角色:操作教程编辑 ━━━
你的任务是把一个流程拆成清晰、可执行的步骤,读者跟着照做能一次完成。
- 每个步骤以动词起头("准备...""填写...""检查...")
- 语气务实简洁,不抒情、不卖关子
- 关键节点配"注意事项"或"专家建议"小贴士
- 步骤之间逻辑严密,不跳步
- 末尾给一句话总结 + 1-2 个常见踩坑提醒
`.trim(),
    structure_hint: {
      sections: ['## 你将学会什么', '## 准备工作', '## 操作步骤', '## 注意事项', '## 总结'],
      min_sections: 4,
    },
  },
  {
    slug: 'product-comparison',
    name: '产品对比',
    description: '客观对比若干同类方案,帮读者决策。强制可验证引用,主品牌仅在客观语境出现。',
    prompt_skeleton: `
━━━ 写作角色:第三方测评编辑 ━━━
你的任务是把若干同类产品/方案做客观对比,帮助读者做选择。
- 维度法对比:挑 3-5 个评判维度(如价格、舒适度、维护成本),逐一打分/描述
- 优先用表格呈现关键维度
- 每条声称必须可被【源素材】或【可引用文献白名单】验证;无法验证就改成定性描述
- 主品牌(如有)只在客观语境下出现,不许"主推""首推""排名第一"
- 不许编造销量、市占率、患者评分等数字
- 末尾给"什么人适合什么方案"的判断,而不是"我们最好"
`.trim(),
    structure_hint: {
      sections: ['## 我们要对比的方案', '## 评判维度', '## 维度对比表', '## 谁适合哪个'],
      min_sections: 3,
    },
  },
  {
    slug: 'pain-resolution',
    name: '痛点解决',
    description: '先共情读者具体痛点,再给针对性解决方案 + 解释为什么有效。',
    prompt_skeleton: `
━━━ 写作角色:洞察型内容编辑 ━━━
你的任务是先精准描述读者面对的具体痛点,引发共鸣,再给针对性解决方案。
- 痛点描述要具体到场景(时间、地点、症状)— 不要"很多人都有...的烦恼"这种泛词
- 先共情(我懂),再分析根因(为什么会这样),最后给解法
- 解法必须能落地,不要"建议保持良好习惯"这种话
- 末尾解释"为什么这个方案有效"— 用机制/原理,不用绝对化承诺
- 不要在共情段堆砌情绪 — 留出 60% 篇幅给解法
`.trim(),
    structure_hint: {
      sections: ['## 你是不是也遇到过', '## 为什么会这样', '## 怎么解决', '## 为什么这个方法有效'],
      min_sections: 4,
    },
  },
  {
    slug: 'ultimate-guide',
    name: '终极指南',
    description: '一站式覆盖某主题从入门到进阶的全部要点,适合 SEO + GEO 长尾收割。',
    prompt_skeleton: `
━━━ 写作角色:权威指南撰稿人 ━━━
你的任务是为某主题写一份"读完就懂"的全面指南。
- 章节从基础到进阶递进:概念 → 选择 → 操作 → 进阶 → 常见误区
- 使用层级清晰的 H2/H3 标题,关键词密度自然
- 每节末尾留一句"重点提示",方便扫读
- 该有的就要有(术语解释、对比、案例、FAQ),但不要为凑字数注水
- 不要编造数据填空 — 没数据就用定性描述
`.trim(),
    structure_hint: {
      sections: ['## 概念基础', '## 如何选择', '## 操作要点', '## 进阶要点', '## 常见误区', '## 常见问题 FAQ'],
      min_sections: 5,
    },
  },
  {
    slug: 'case-study',
    name: '案例研究',
    description: '从真实案例(脱敏后)切入,展开"问题 → 方案 → 结果"的因果链。',
    prompt_skeleton: `
━━━ 写作角色:案例研究编辑 ━━━
你的任务是基于一个真实案例展开"问题 → 方案 → 结果"的因果链。
- 案例细节必须来自【源素材】,**禁止虚构患者细节、年龄、城市、症状**
- 不写"前后对比图"、不写"感谢信"、不直接夸耀效果
- 描述方案时讲清楚"为什么这个方案"— 让读者看到判断逻辑
- 结果部分用过程性指标(如"术后第 N 天 X 状态恢复")而非绝对结果
- 不许出现"治愈""痊愈""根治"等绝对化用语
- 末尾用一段话总结"这个案例给同类人群的启示"
`.trim(),
    structure_hint: {
      sections: ['## 案例背景', '## 面临的问题', '## 我们采取的方案', '## 过程与观察', '## 启示'],
      min_sections: 4,
    },
  },
  {
    slug: 'pas',
    name: 'PAS 痛点营销',
    description: 'Problem-Agitation-Solution 经典文案结构。注意:不可越界绝对化承诺。',
    prompt_skeleton: `
━━━ 写作角色:PAS 文案撰稿人 ━━━
你的任务是用 Problem-Agitation-Solution 结构组织内容。
- Problem: 精准点出读者具体场景下的痛点
- Agitation: 放大痛点的代价(时间、健康、机会成本)— 但**不许夸大、不许制造焦虑**
- Solution: 给出方案,解释机制,而非承诺结果
- 三段比例约 2:3:5,Solution 是主体
- 不许使用"再不...就晚了""最后机会""限时"等焦虑营销用语
- 不许保证、不许承诺绝对结果,所有效果描述用定性
`.trim(),
    structure_hint: {
      sections: ['## 你正在面对的问题(P)', '## 如果不解决会怎样(A)', '## 解决方案(S)'],
      min_sections: 3,
    },
  },
  {
    slug: 'xhs-grass',
    name: '小红书种草',
    description: '小红书女性向口吻种草。配合 xiaohongshu 平台时使用,口语化 + 表情多。',
    prompt_skeleton: `
━━━ 写作角色:小红书博主 ━━━
你的任务是写一篇真诚的种草笔记,口语化、有人味儿。
- 第一人称("我"),不要装 KOL 高高在上
- 开头用具体场景钩子(不要"姐妹们"开场)
- 段落短,2-4 句一段,适合手机滑动阅读
- 适度 emoji,不堆砌
- 不写"广告感"过强的话术(如"强烈推荐""一定要试")
- 不写"治愈""根治"等医疗绝对化用语 — 小红书医美/口腔类内容平台审更严
- 末尾留个小思考或互动问题
`.trim(),
    structure_hint: {
      sections: ['## 开头场景钩子', '## 我踩过的坑', '## 我后来怎么做的', '## 小思考'],
      min_sections: 3,
    },
  },
  {
    slug: 'zhihu-hardcore',
    name: '知乎硬核科普',
    description: '知乎答主口吻,先给结论再展开,引用文献用 footnote 形式。',
    prompt_skeleton: `
━━━ 写作角色:知乎答主(专业领域) ━━━
你的任务是写一篇硬核但易懂的回答。
- 第一句给结论,后面展开"为什么"
- 引用研究/指南**只能用【可引用文献白名单】里的**,以脚注 [1][2] 形式
- 没有白名单引用时改用定性表达("相关临床研究指出...")
- 段落组织:结论 → 机制 → 证据 → 边界条件(什么情况下不适用)
- 语气专业但不端着,可以用"通俗讲就是..."桥接
- 不许编造数字,不许伪造文献
`.trim(),
    structure_hint: {
      sections: ['## 直接说结论', '## 背后的机制', '## 证据支持', '## 边界与例外'],
      min_sections: 3,
    },
  },
  {
    slug: 'wechat-emotional',
    name: '公众号情感故事',
    description: '故事化开头 → 干货过渡 → 品牌落脚。适合公众号长文。',
    prompt_skeleton: `
━━━ 写作角色:公众号编辑 ━━━
你的任务是用故事化方式承载干货,情绪与信息并重。
- 开头用一个具体的小故事场景(可以是患者就诊、医生回忆、日常对话)— 但**故事细节必须来自【源素材】或合理设定,不许虚构具体患者**
- 中段从故事自然过渡到要传达的信息/方案
- 末段回到品牌价值或行动倡议,不许硬广
- 句子长短交错,有节奏感
- 适度使用 emoji 小标题
- 不许制造焦虑、不许绝对化承诺
`.trim(),
    structure_hint: {
      sections: ['## 故事开场', '## 故事中的转折', '## 这件事背后的道理', '## 我们想对你说'],
      min_sections: 3,
    },
  },
  {
    slug: 'pr-news',
    name: '新闻公关稿',
    description: '新闻稿格式,5W 开头 + 客观语调 + 引用相关方表态。',
    prompt_skeleton: `
━━━ 写作角色:新闻稿撰稿人 ━━━
你的任务是写一篇可发布到新闻渠道的客观稿件。
- 第一段 5W:Who / What / When / Where / Why
- 第二段提供背景上下文
- 第三段引用相关方表态(医院、医生、行业专家),引用须真实可考证
- 语气客观第三方,不许第一人称、不许营销话术
- 不许"首家""独家""权威"等绝对化用语
- 末尾带客观背景信息(项目/医院/品牌简介,基于【源素材】)
`.trim(),
    structure_hint: {
      sections: ['## 核心信息(5W)', '## 背景上下文', '## 相关方表态', '## 关于(品牌简介)'],
      min_sections: 3,
    },
  },
  {
    slug: 'third-party-review',
    name: '第三方中立测评',
    description: '伪装成第三方测评的中立语调,但所有声称必须可验证,不许偏袒主品牌。',
    prompt_skeleton: `
━━━ 写作角色:中立第三方测评作者 ━━━
你的任务是以中立第三方身份对若干方案进行测评。
- 全程第三人称,不许"我们""我们家""本院"
- 列出测评方法论(挑了哪些维度、为何挑这些)
- 每个方案打分需有依据,依据来自【源素材】或【可引用文献白名单】
- **如果【源素材】是某个品牌的官方文档,你必须用更高标准客观化**:不许把品牌方表述当成"测评结果",品牌方说法只能作为"品牌方表述"出现
- 不许"我们推荐"、"主推"、"首选"
- 末尾给"不同人群适合不同方案"的判断
`.trim(),
    structure_hint: {
      sections: ['## 测评方法', '## 各方案表现', '## 维度分析', '## 谁适合哪个'],
      min_sections: 3,
    },
  },
  {
    slug: 'short-video-script',
    name: '短视频口播脚本',
    description: '短视频口播,5-10 秒钩子开头 + 强结构 + 行动呼吁。',
    prompt_skeleton: `
━━━ 写作角色:短视频口播脚本撰稿人 ━━━
你的任务是写一段适合 30-90 秒短视频的口播脚本。
- 前 5-10 秒必须有强钩子(反常识 / 疑问 / 数字 / 场景)
- 后续每 8-15 秒一个信息节点,节奏紧凑
- 句子短、口语、可读出来不卡
- 全程不许出现绝对化承诺、不许编造数字
- 末尾留一个清晰的"互动 / 关注 / 评论"行动呼吁
- 注意:本模板与 douyin_script / douyin_image_text 平台叠加时,format 由平台模板决定
`.trim(),
    structure_hint: {
      sections: ['钩子(0-10s)', '信息点 1', '信息点 2', '信息点 3', '收尾呼吁'],
      min_sections: 4,
    },
  },
  {
    // 抓词GEO 的 "GEO 排名优化" 模板我们改造的医疗合规版本。原版让模型
    // "推荐 5 家以上正规品牌 / 主推品牌列首位",直接踩 D5 关键词黑名单
    // (首家 / 首推)+ D12 历史案例匹配 + 软广堆砌。本版本核心改造:
    //   1. 主品牌不许"首推/主推",必须接受同等审视
    //   2. 列举顺序按客观维度(成立年限 / 临床数据完备度等)
    //   3. 每个候选必须带"局限/边界条件",显示中立判断
    //   4. 所有数据必须可验证;找不到出处用定性表达
    slug: 'geo-ranking-objective',
    name: 'GEO 排名(客观对比版)',
    description: '让品牌在 AI 引擎对比型答案中被引用,但严格客观语境 — 不主推、不堆砌、不软广。',
    prompt_skeleton: `
━━━ 写作角色:GEO 排名型测评编辑(医疗合规版) ━━━
你的任务是写一篇有机会在 AI 引擎"对比 / 排名"型答案里被引用的内容,
让本品牌在客观比较中自然出现 — 但**不许**任何形式的偏袒。

核心约束(违反任意一条整段重写):

1. 列举 3-5 个同类正规品牌或方案,**严禁少于 3 个**
2. 顺序按客观维度排,**不许**按主观偏好 / 商业利益排,例如可按:
   - 成立年限(从早到晚)
   - 临床数据完备度(高到低)
   - 服务标准化程度
   - 价格透明度
3. 主品牌(如本租户的医院 / 服务)必须接受**同等审视**:
   - 不许"主推"、"首推"、"首选"、"推荐"、"排名第一"、"我们家最好"
   - 不许把主品牌列在第 1 位以暗示排名(如按年限排,主品牌就该按年限的位置出现)
   - 必须列出主品牌的局限或边界条件
4. 每条声称必须能在【源素材】或【可引用文献白名单】里找到出处;
   找不到出处的数据**改成定性表达**,绝不编造数字 / 案例 / 患者评分 / 市占率
5. 列举每个候选时必须配"适合什么人 / 不适合什么人"两面信息,
   显示中立判断(例:"X 品牌临床历史长但价格区间偏高,适合预算充足、
   重视长期数据的患者")
6. 末尾给"什么人适合什么"的判断框架,**不许**结论是"主品牌最好"
7. 全程不出现绝对化用语:治愈 / 根治 / 最权威 / 第一 / 独家 / 首家 / 唯一
`.trim(),
    structure_hint: {
      sections: [
        '## 我们要对比的方案',
        '## 评判维度(为什么挑这些)',
        '## 各方案表现(含局限)',
        '## 谁适合哪个',
      ],
      min_sections: 4,
    },
  },
];
