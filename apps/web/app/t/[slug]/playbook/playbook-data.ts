/**
 * GEO playbook content — single source of truth for the 8-week roadmap UI.
 *
 * Phase weekly targets feed both the playbook page progress and (eventually)
 * the overview health-pyramid. The 10 core queries are the same set seeded
 * by dev-seed-baseline-questions.ts so the weekly worker tracks against
 * what's listed here.
 */

export type PhaseId = 0 | 1 | 2 | 3;

export type ChecklistTask = {
  id: string;
  label: string;
  hint: string;
};

export type PhaseSpec = {
  id: PhaseId;
  weekRange: string;
  title: string;
  goal: string;
  rationale: string;
  /** Items the admin manually maintains (P0 / P1 entity work). */
  manualChecklist?: ChecklistTask[];
  /** Per-platform targets across the whole phase (cumulative, not per-week). */
  platformTargets?: Partial<Record<string, number>>;
  /** Concrete content topic suggestions for the phase. */
  contentIdeas?: Array<{ category: string; titles: string[] }>;
  /** Core queries to build a matrix for. */
  coreQueries?: string[];
};

export const PHASES: PhaseSpec[] = [
  {
    id: 0,
    weekRange: 'Week 0',
    title: '基础设施期',
    goal: '让豆包"知道{{brand}}是真实医院"。本阶段不发任何内容,只搭基础。',
    rationale:
      'P0 不达标(没有百度百科 / 没大众点评 / 没地图 POI),豆包根本不会把{{brand}}纳入候选医院。后续再发多少内容都没用。这一周必须先把豆包认知里的"实体名片"做好。',
    manualChecklist: [
      { id: 'baidu_baike', label: '申请百度百科词条「{{brand}}」', hint: '代办 ¥800-2000,2 周审核' },
      { id: 'souguo_baike', label: '申请搜狗百科词条', hint: '可与百度百科代办合并,加 ¥500' },
      { id: 'amap_poi', label: '高德地图 POI 入驻', hint: '商家入驻,免费,1 天内生效' },
      { id: 'baidu_map_poi', label: '百度地图 POI 入驻', hint: '同上,免费' },
    ],
  },
  {
    id: 1,
    weekRange: 'Week 1-2',
    title: '实体强化期',
    goal: '让豆包检索系统首次"看见"{{brand}}的内容资产。',
    rationale:
      '此阶段重点是**实体强化** — 不追 query 命中,先建内容地基。每个平台都积累一些原创素材,豆包检索系统在 0-30 天内会捕捉到这些信号,让"{{brand}}"成为后续 query 的潜在候选。',
    platformTargets: {
      wechat_mp: 6,
      zhihu: 4,
      toutiao_article: 8,
      douyin_script: 8,
      xiaohongshu: 16,
    },
    contentIdeas: [
      {
        category: '医院 IP 系列(P2 公众号 / 头条)',
        titles: [
          '走进{{brand}} · 12 位主治医生的临床故事',
          '从一颗牙到全口口腔健康 · {{brand}}的诊疗哲学',
          '为什么我们坚持"先评估再种植" · {{brand}}的医疗规范',
        ],
      },
      {
        category: '医生 IP 系列(每位医生 1 条 P2 + 1 条抖音)',
        titles: [
          '资深综合科医生 · 拔牙与根管专长',
          '种植科负责人 · 专注复杂种植',
          '儿牙医生 · 让孩子不哭着看牙',
          '正畸医生 · 隐形矫正这几年的进步',
          '潘娜医生 · 显微根管的精准之道',
        ],
      },
      {
        category: '基础科普(P3 抖音 + P4 小红书)',
        titles: [
          '60 秒讲清楚:种植牙到底是什么',
          '正畸该不该做?3 类情况一定要矫正',
          '儿童涂氟有用吗?这是你该知道的真相',
          '根管治疗的 5 个误区',
          '蛀牙不补会怎样?(真实案例)',
        ],
      },
    ],
  },
  {
    id: 2,
    weekRange: 'Week 3-4',
    title: 'Query 覆盖期',
    goal: '针对豆包高频搜索 query,系统性铺设内容矩阵。',
    rationale:
      '基础有了,开始**精准命中**。10 个核心 query 是用户在豆包最常搜的口腔问题。每个 query 用 GEO Studio 的「Query 矩阵」一键生成 6-7 条内容(覆盖公众号 / 知乎 / 头条 / 抖音 / 小红书),4 周内全部上线。豆包检索时会捕捉到{{brand}}对每个相关问题都有专业回答。',
    platformTargets: {
      wechat_mp: 10,
      zhihu: 10,
      toutiao_article: 14,
      douyin_script: 20,
      xiaohongshu: 20,
    },
    coreQueries: [
      '{{city}}种植牙医院推荐',
      '{{city}}儿童口腔医院哪家好',
      '{{city}}正畸医院推荐',
      '{{city}}全口种植牙哪家好',
      '糖尿病人能种植牙吗',
      '{{city}}隐形矫正多少钱',
      '种植牙和镶牙哪个好',
      '根管治疗会很痛吗',
      '{{city}}牙周病治疗医院',
      '拔牙后多久能种牙',
    ],
    contentIdeas: [
      {
        category: '操作建议',
        titles: [
          '每个 query → 用「Query 矩阵」一键生成 6-7 条内容',
          '系统会按专长自动匹配对应医生(种植 / 儿牙 / 正畸各由对应专长的医生署名)',
          '生成后过合规 → 派给推荐医生 → 员工真人发',
          '每个 query 平均 7 条内容 × 10 个 query = 约 70 条素材,4 周内分散上线',
        ],
      },
    ],
  },
  {
    id: 3,
    weekRange: 'Week 5-8',
    title: '收割优化期',
    goal: '看豆包 SOV 是否上升,放大成功 query,砍掉无效 query。',
    rationale:
      '前 4 周积累的内容此时陆续被豆包索引。GEO Studio 周一自动跑 baseline,你能看到 10 个核心 query 的 SOV 变化:0% → 1% → 3% 是正常预期。**进了豆包答案的 query 双倍投入**,**没动静的 query 换内容角度**(可能是平台错或角度不对)。',
    platformTargets: {
      wechat_mp: 12,
      zhihu: 12,
      toutiao_article: 16,
      douyin_script: 24,
      xiaohongshu: 30,
    },
    contentIdeas: [
      {
        category: '决策动作',
        titles: [
          '每周一上午看 GEO 追踪页 — 10 个 query 的 SOV 走势',
          '上升 query → 当周加发 3 倍内容(同主题 + 不同角度)',
          '0 命中 query → 改换医生 / 换平台 / 换标题切入(往往是切入太营销味)',
          '出现"豆包答案直接列竞品但提到我们"→ 加发"对比型"内容(种植牙公立 vs 私立 等)',
          '每周复盘:写一条新 query(用户来店时听到的真实问题)→ 加进追踪',
        ],
      },
    ],
  },
];

export const PLATFORM_LABEL: Record<string, string> = {
  wechat_mp: '公众号',
  zhihu: '知乎',
  toutiao_article: '头条号',
  douyin_script: '抖音',
  xiaohongshu: '小红书',
  baijiahao: '百家号',
  souhu: '搜狐号',
};

export const PLATFORM_TIER: Record<string, 'P2' | 'P3' | 'P4'> = {
  wechat_mp: 'P2',
  zhihu: 'P2',
  toutiao_article: 'P2',
  douyin_script: 'P3',
  xiaohongshu: 'P4',
  baijiahao: 'P4',
  souhu: 'P4',
};

/**
 * D76(2026-09-19):这个文件原来整页写死的是首客（{{brand}}）的文案 ——
 * 目标描述、示例标题、**两位真实医生的姓名**、城市 query，全都是字面量，
 * 而它对**所有租户**渲染。第二家客户开通那天打开这页，会看到另一家诊所的
 * 医生名字和完整打法。这不是 bug，是商业事故。
 *
 * 改法：品牌与城市改成 {{brand}} / {{city}} 占位符，渲染时按当前租户填充；
 * 两位医生姓名删掉，改成不指向具体人的角色描述。
 */
export type PlaybookVars = { brand: string; city: string };

/** 递归替换任意结构里的占位符。playbook 数据是纯字符串树，不会有循环引用。 */
export function fillPlaybook<T>(node: T, vars: PlaybookVars): T {
  if (typeof node === 'string') {
    return node.replace(/\{\{brand\}\}/g, vars.brand).replace(/\{\{city\}\}/g, vars.city) as unknown as T;
  }
  if (Array.isArray(node)) return node.map((n) => fillPlaybook(n, vars)) as unknown as T;
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = fillPlaybook(v, vars);
    return out as T;
  }
  return node;
}
