/**
 * Initial compliance keyword seed.
 * Derived from 《医疗广告管理办法》《广告法》and common medical-advertising enforcement cases.
 * IMPORTANT: this is a STARTER list. Must be reviewed by 医院法务/合规顾问 before production.
 */

export type KeywordSeed = {
  term: string;
  category: string;
  variants: string[];
};

/** A-level: zero tolerance. Triggers auto-reject. */
export const A_LEVEL_KEYWORDS: KeywordSeed[] = [
  // guarantee / cure claims
  { term: '保证', category: 'guarantee', variants: ['保 证', '確保'] },
  { term: '包治', category: 'guarantee', variants: ['包 治', '包治癒'] },
  { term: '根治', category: 'guarantee', variants: ['根 治', '根治癒'] },
  { term: '治愈', category: 'guarantee', variants: ['治 愈', '治癒'] },
  { term: '痊愈', category: 'guarantee', variants: ['痊 愈', '痊癒'] },
  { term: '绝对', category: 'guarantee', variants: ['絕對'] },
  { term: '百分百', category: 'guarantee', variants: ['100%', '100 %', '百分之百'] },
  { term: '无效退款', category: 'guarantee', variants: ['无效退费'] },
  { term: '永不复发', category: 'guarantee', variants: ['永不復發', '永不反复'] },
  { term: '立竿见影', category: 'guarantee', variants: ['立竿見影', '立刻见效', '立即见效'] },
  { term: '一次搞定', category: 'guarantee', variants: ['一次根治'] },

  // absolute superlatives
  { term: '最好', category: 'absolute', variants: [] },
  { term: '最权威', category: 'absolute', variants: ['最權威'] },
  { term: '最先进', category: 'absolute', variants: ['最先進'] },
  { term: '最佳', category: 'absolute', variants: [] },
  { term: '第一', category: 'absolute', variants: ['no.1', 'NO.1', 'No. 1'] },
  { term: '首家', category: 'absolute', variants: [] },
  { term: '独家', category: 'absolute', variants: ['獨家'] },
  { term: '唯一', category: 'absolute', variants: ['惟一'] },

  // testimonial / case comparison
  { term: '治疗前后', category: 'testimonial', variants: ['治療前後', '术前术后', '術前術後'] },
  { term: '真实病例', category: 'testimonial', variants: ['真實病例', '真实案例'] },
  { term: '感谢信', category: 'testimonial', variants: ['感謝信'] },
  { term: '患者推荐', category: 'testimonial', variants: ['病人推荐', '病患推荐'] },

  // doctor endorsement
  { term: '专家推荐', category: 'endorsement', variants: ['專家推薦'] },
  { term: '国医大师', category: 'endorsement', variants: ['國醫大師'] },
  { term: '名医推荐', category: 'endorsement', variants: [] },

  // cross-institution comparison (examples; tenant should extend)
  { term: '北京协和', category: 'comparison', variants: ['协和'] },
  { term: '华西口腔', category: 'comparison', variants: [] },
  { term: '上海九院', category: 'comparison', variants: ['九院'] },
];

/** B-level: suggest rewrite, route to LLM review. */
export const B_LEVEL_KEYWORDS: KeywordSeed[] = [
  { term: '领先', category: 'absolute_soft', variants: ['領先'] },
  { term: '首选', category: 'absolute_soft', variants: ['首選'] },
  { term: '顶尖', category: 'absolute_soft', variants: ['頂尖'] },
  { term: '效果显著', category: 'weak_guarantee', variants: ['效果顯著'] },
  { term: '放心选择', category: 'weak_guarantee', variants: ['放心選擇'] },
  { term: '值得信赖', category: 'weak_guarantee', variants: ['值得信賴'] },
  { term: '买一送一', category: 'sales', variants: ['買一送一'] },
  { term: '限时优惠', category: 'sales', variants: ['限時優惠'] },
  { term: '首诊立减', category: 'sales', variants: ['首診立減'] },
  { term: '免费咨询', category: 'sales', variants: ['免費諮詢'] },
  { term: '在线咨询', category: 'sales', variants: ['線上諮詢'] },
];
