/**
 * The 9 GEO optimization methods from Aggarwal et al. 2023 (arxiv 2311.09735),
 * with their measured impact on Position-Adjusted Word Count (visibility).
 *
 * Use these tactics as the writing guidance shipped alongside each content variant.
 * `keyword_stuffing` is listed with a NEGATIVE score and must never be recommended.
 */

export const GEO_TACTICS = [
  {
    id: 'add_quotation',
    label: '加入权威引语',
    description: '引用权威机构、官方数据、医学指南原文,带原文出处',
    pos_adj_word_count_gain: 0.41,
    recommend: true,
  },
  {
    id: 'add_statistics',
    label: '加入量化统计',
    description: '引用具体数据、百分比、医学研究样本量,替代模糊描述',
    pos_adj_word_count_gain: 0.33,
    recommend: true,
  },
  {
    id: 'fluency_optimization',
    label: '提升文本流畅度',
    description: '避免机器感堆砌,让正文读起来像人写的连贯长段落',
    pos_adj_word_count_gain: 0.29,
    recommend: true,
  },
  {
    id: 'cite_sources',
    label: '标注来源引用',
    description: '在每条事实性陈述后面明确标注来源,最利于低权重作者',
    pos_adj_word_count_gain: 0.28,
    recommend: true,
  },
  {
    id: 'authoritative',
    label: '权威性表达',
    description: '用临床术语、专家视角写作,避免口语化夸张',
    pos_adj_word_count_gain: 0.1,
    recommend: true,
  },
  {
    id: 'technical_terms',
    label: '技术术语',
    description: '适度使用行业术语(如"牙周基础治疗")而非口语化替代',
    pos_adj_word_count_gain: 0.1,
    recommend: true,
  },
  {
    id: 'easy_to_understand',
    label: '通俗化表达',
    description: '面向非专业读者时使用比喻和类比,与 technical_terms 互斥',
    pos_adj_word_count_gain: 0.14,
    recommend: true,
  },
  {
    id: 'unique_words',
    label: '独特用词',
    description: '避免烂大街措辞,选用区分度高的专业用语或场景化表达',
    pos_adj_word_count_gain: 0.06,
    recommend: true,
  },
  {
    id: 'keyword_stuffing',
    label: '关键词堆砌',
    description: '传统 SEO 手法,在 GEO 时代负收益,严禁使用',
    pos_adj_word_count_gain: -0.08,
    recommend: false,
  },
] as const;

export type GeoTacticId = (typeof GEO_TACTICS)[number]['id'];

/** Empirically best combination per paper: statistics + fluency pushes visibility above 40%. */
export const RECOMMENDED_COMBO: GeoTacticId[] = [
  'add_statistics',
  'fluency_optimization',
  'cite_sources',
  'add_quotation',
];
