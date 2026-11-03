export interface PatientReview {
  id: string;
  patientName: string;
  avatarText: string;
  treatmentItem: string;
  treatmentCategory: '种植牙' | '牙齿矫正' | '补牙/根管' | '前牙贴面' | '洗牙/牙周';
  doctorName: string;
  doctorSlug: string;
  hospitalName: string;
  hospitalSlug: string;
  hospitalAddress: string;
  scores: {
    technology: number; // 技术实力
    priceTransparency: number; // 价格透明
    serviceEnvironment: number; // 环境服务
    overall: number; // 综合打分
  };
  totalExpense: string; // 实际花费明细
  visitDate: string; // 就诊时间
  isVerified: boolean; // 是否卫健委/到院就医核验
  title: string;
  content: string; // 探店点评详情
  costBreakdown: string[]; // 费用透明清单
  pitfallTips: string; // 患者亲历避坑经验分享
  tags: string[];
}

export const INSTITUTION_OVERALL_SCORE = {
  hospitalName: '云南松鼠口腔（西山总院）',
  hospitalSlug: 'km-songshu',
  totalReviews: 864,
  averageScore: 4.88,
  dimensionScores: {
    technology: 4.9, // 技术实力
    priceTransparency: 4.9, // 价格透明
    serviceEnvironment: 4.8, // 环境服务
  },
  recommendationRate: '98.6%',
  verifiedRate: '100% 真实就医账单凭证核验',
  peerComparison: '高于昆明市同级口腔机构 96.8% 的口碑评价指数',
};

export const PATIENT_REVIEWS: PatientReview[] = [
  {
    id: 'rev-01',
    patientName: '李*薇 (西山区白领)',
    avatarText: '李',
    treatmentItem: '时代天使隐形矫正（改善前牙拥挤反颌）',
    treatmentCategory: '牙齿矫正',
    doctorName: '韩峄',
    doctorSlug: 'han-yi',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    scores: {
      technology: 5.0,
      priceTransparency: 5.0,
      serviceEnvironment: 4.9,
      overall: 4.97,
    },
    totalExpense: '¥19,800（一口价打包，无二次隐形收费）',
    visitDate: '2026年10月复诊交接',
    isVerified: true,
    title: '【矫正探店】避开小诊所低价陷阱，韩峄主任的技术真的让人安心！',
    content: '坐标昆明，对比了同德某连锁和公立三甲，最终选择在松鼠口腔做矫正。一进门前卫蓝光昆仑中心3楼的环境非常明亮大气，完全没有传统医院那种刺鼻的消毒水味。接诊的是正畸总监韩峄主任，非常严谨，拍片完全免费，现场用3D口扫把牙齿每一颗在骨头里的情况模拟得清清楚楚。最关键是韩主任没有盲目劝我拔牙，而是针对我的面型保留了前牙丰满度，现在戴了14个月，地包天和牙不齐完全收进去了，下颌线特别清晰！',
    costBreakdown: [
      '初诊挂号 + 德国数字化全景CBCT拍片 + iTero三维口扫：¥0 (全免)',
      '时代天使数字化隐形双模定制矫治器：¥18,800',
      '两幅高透保持器 + 终身正畸复查跟踪包：¥1,000',
      '总计支出 ¥19,800，签署了费用明细知情确认单，中途复诊从不收挂号费与材料费。',
    ],
    pitfallTips: '看牙千千万万别信网上几千块所谓的“全包隐形矫正”！那些很多都是没执业资质的加工厂小套子，一旦牙根吸收牙齿晃动后悔莫及。一定要认准主治医师以上职称（韩主任是官方双认证讲师），且合同必须注明中途加套数或调整方案是否二次收费。松鼠口腔这点非常厚道！',
    tags: ['环境高大上', '方案透明无套路', '韩峄主任超细致', '不乱推销', '免费拍片'],
  },
  {
    id: 'rev-02',
    patientName: '周*生 (盘龙区退休职工)',
    avatarText: '周',
    treatmentItem: '韩国登腾高龄种植牙（国家集采专项两颗）',
    treatmentCategory: '种植牙',
    doctorName: '刘彦廷',
    doctorSlug: 'liu-yanting',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    scores: {
      technology: 4.9,
      priceTransparency: 4.9,
      serviceEnvironment: 4.8,
      overall: 4.87,
    },
    totalExpense: '¥5,960（两颗韩国进口植体含全瓷冠）',
    visitDate: '2026年9月种植完成',
    isVerified: true,
    title: '【种牙亲历】集采价格真的落实了！刘彦廷院长微创技术名不虚传！',
    content: '我左下边大牙掉了两颗好几年，吃东西全靠单侧嚼，消化总出问题。之前在别家咨询动不动要一万五一颗，吓得不敢看。后来看了卫健委备案和齿科指南网，慕名到蓝光中心松鼠口腔找刘彦廷院长。刘院长手法真利落，微创打麻药一点不痛，两颗牙前后不到半小时就种好了，术后当天晚上就能喝粥，没有大出血也没有脸肿。现在戴上牙冠吃花生米嚼肉一点问题没有，很扎实！',
    costBreakdown: [
      '种植专科精准CBCT骨量测量评估：¥0 (惠民减免)',
      '韩国登腾进口种植体系统（国家集采中标）：¥2,980/颗 × 2 = ¥5,960',
      '包含内容：植体 + 纯钛基台 + 爱尔创爱尔美全瓷牙冠 + 种植微创手术费 + 终身质保维护',
      '除医嘱消炎漱口水20多元外，再无任何隐形附加收费。',
    ],
    pitfallTips: '老人家种牙最怕被忽悠骨粉骨膜！很多机构把本来能常规微创植入的非要说骨量严重不足收大几千骨粉费。刘彦廷院长直接拿着三维CT断层片给我指骨皮质厚度，坦诚告诉我骨质很好不需要植骨，省了一大笔冤枉钱，医德真的值得点赞！',
    tags: ['集采价格公开', '刘院长手法好', '术后不肿痛', '老人看牙推荐', '无骨粉套路'],
  },
  {
    id: 'rev-03',
    patientName: '陈*琳 (呈贡大学城研究生)',
    avatarText: '陈',
    treatmentItem: '美国3M-Z350高阶树脂纳米补牙两颗',
    treatmentCategory: '补牙/根管',
    doctorName: '刘彦廷',
    doctorSlug: 'liu-yanting',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    scores: {
      technology: 4.9,
      priceTransparency: 4.8,
      serviceEnvironment: 4.8,
      overall: 4.83,
    },
    totalExpense: '¥560（两颗邻面深龋充填）',
    visitDate: '2026年10月日常就诊',
    isVerified: true,
    title: '【补牙避坑】医生用内窥镜拍照前后对比，真的一清二楚！',
    content: '原本以为只是普通的塞牙，来松鼠口腔拍了片子才发现牙缝里已经黑了一大块（邻面龋）。接诊医生特别有耐心，用口内内窥镜把去腐前、去腐干净后、树脂分层充填雕刻后的照片一张张投在显示屏上给我看。整个过程用了橡皮障隔湿，几乎感觉不到酸胀。补完之后用牙线过非常顺滑，咬合高度调得特别舒服！',
    costBreakdown: [
      '口腔全面检查 + 数字化口内照相：¥0',
      '美国3M-Z350 XT 树脂补牙：¥280/颗 × 2 = ¥560',
      '橡皮障隔离保护术 + 咬合精细调磨：包含在套餐内',
      '实收 ¥560，支持医保个人账户余额便捷结算。',
    ],
    pitfallTips: '补牙最重要是看机构用不用橡皮障！很多街边小作坊为了图省事不用橡皮障隔口水，口水里的细菌污染了粘接面，不出一年树脂就脱落或者底下烂成根管。松鼠口腔全流程操作规范，学生党看牙极力推荐。',
    tags: ['橡皮障操作规范', '拍照对比透明', '支持医保', '性价比高'],
  },
  {
    id: 'rev-04',
    patientName: '张*雅 (五华区媒体工作者)',
    avatarText: '张',
    treatmentItem: '前牙德国义获嘉铸瓷超薄美学贴面 (6颗)',
    treatmentCategory: '前牙贴面',
    doctorName: '韩峄',
    doctorSlug: 'han-yi',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    scores: {
      technology: 5.0,
      priceTransparency: 4.9,
      serviceEnvironment: 4.9,
      overall: 4.93,
    },
    totalExpense: '¥13,800（6颗前牙定制）',
    visitDate: '2026年8月美学交付',
    isVerified: true,
    title: '【前牙美学】超薄贴面拯救了我的严重氟斑牙，微笑线太绝了！',
    content: '从小在云南长大，牙齿有点黄褐色的氟斑，镜头前一直笑得很僵硬。对比了几家私立，有的医生动不动建议磨牙做全瓷冠，太心疼真牙了。后来找韩峄主任做了DSD数字化美学微笑设计，韩主任建议做超薄0.2mm瓷贴面，基本不需要怎么磨除原牙釉质。制作前还做了口内临时Mock-up试戴看形状，满意了才加工。交付之后无论通透度还是反光层次都跟真牙一样自然！',
    costBreakdown: [
      'DSD数字化微笑美学方案设计 + 口内实景Mock-up试戴：免费赠送',
      '德国进口义获嘉 e.max 铸瓷超薄贴面：¥2,300/颗 × 6 = ¥13,800',
      '包含显微微创预备 + 橡皮障精准美学树脂粘接 + 5年品质保证书',
      '无额外加工费、无进口材料加急费，费用单明细极为详细。',
    ],
    pitfallTips: '做美学贴面一定要找懂正畸咬合的美学专科医生！如果咬合关系没调好，贴上去不仅容易崩瓷，还会导致夜间磨牙或下巴酸胀。韩峄主任本就是正畸大咖，兼具咬合学与美学，这才是真正的高阶技术保障。',
    tags: ['超微创不伤牙', '色泽通透天然', 'DSD微笑设计', '咬合严谨'],
  },
  {
    id: 'rev-05',
    patientName: '王*华 (官渡区私营企业主)',
    avatarText: '王',
    treatmentItem: '重度牙周炎系统性治疗 + 显微根管治疗',
    treatmentCategory: '洗牙/牙周',
    doctorName: '刘彦廷',
    doctorSlug: 'liu-yanting',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    scores: {
      technology: 4.9,
      priceTransparency: 4.9,
      serviceEnvironment: 4.8,
      overall: 4.87,
    },
    totalExpense: '¥3,200（全口龈下刮治与激光牙周抑菌）',
    visitDate: '2026年9月疗程结束',
    isVerified: true,
    title: '【牙周治疗】刷牙出血口臭困扰5年，彻底治好了！',
    content: '之前刷牙满嘴泡沫全是红的，咬苹果也留血印，还老被老婆嫌弃有口臭。在松鼠口腔做了全口牙周探针检查，牙周袋深达5-6mm。刘彦廷院长团队安排了分象限无痛龈下超声刮治加牙周激光抑菌。护士全程陪伴，操作前都做了表面麻醉，真的一点都不受罪。做完半个月复查，牙龈从暗紫肿胀恢复成粉红紧致，出血口臭彻底消失了！',
    costBreakdown: [
      '全口牙周深度探针测量记录图表：¥0',
      '全口超声龈下刮治 + 根面平整术（分两次四象限）：¥2,400',
      '半导体激光辅助牙周袋杀菌与生物刺激治疗：¥800',
      '全疗程包含专用牙周维护包与漱口液。',
    ],
    pitfallTips: '普通洁牙（洗牙）只能洗掉牙龈上方的结石，牙周炎患者的病根在牙龈底下！如果刷牙经常出血伴有牙龈红肿，千万别只花几十块洗个表面，一定要查牙周袋深度。松鼠口腔会把每一颗牙的袋深数据详细打印给你，实事求是，绝不夸大病情。',
    tags: ['无痛龈下刮治', '牙龈不再出血', '科学系统治疗', '拒绝过度医疗'],
  },
];
