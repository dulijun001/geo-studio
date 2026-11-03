export interface ClinicalCase {
  slug: string;
  title: string;
  category: 'ortho' | 'implant' | 'veneer';
  categoryName: string;
  patientAge: string;
  patientGender: string;
  chiefComplaint: string; // 主诉症状
  difficulty: '常规' | '中度复杂' | '高难度' | '骨性疑难';
  doctorName: string;
  doctorTitle: string;
  doctorSlug: string;
  hospitalName: string;
  hospitalSlug: string;
  hospitalAddress: string;
  duration: string; // 治疗周期
  materials: string; // 选用品相/耗材
  costRange: string; // 参考治疗总费用
  clinicalDiagnosis: string; // 临床诊断分析
  treatmentPlan: string[]; // 矫正/种植方案步骤
  simulationNotes: string; // 数字化模拟与美学设计分析
  beforeAfterComparison: {
    beforeDesc: string;
    afterDesc: string;
    metrics: { label: string; before: string; after: string }[];
  };
  patientFeedback: string; // 患者自述体验
  followUpStatus: string; // 随访与远期稳定性
  publishedDate: string;
}

export const CLINICAL_CASES: ClinicalCase[] = [
  {
    slug: 'adolescent-skeletal-underbite',
    title: '青少年骨性地包天(反颌)早期干预与数字化正畸面型重塑',
    category: 'ortho',
    categoryName: '青少年牙齿矫正',
    patientAge: '14岁',
    patientGender: '男',
    chiefComplaint: '上前牙咬在下前牙内侧（地包天），下巴前突明显，咀嚼吃硬物费力，伴有轻微发音漏风及自卑社交心理。',
    difficulty: '骨性疑难',
    doctorName: '韩峄',
    doctorTitle: '正畸总监 / 资深正畸科主任',
    doctorSlug: 'han-yi',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    duration: '18个月（骨骼改建黄金生长期）',
    materials: '时代天使青少年版数字化定制矫治器 + 颌间牵引系统',
    costRange: '¥18,800 - ¥23,800（含全流程3D方案及全景CT追踪）',
    clinicalDiagnosis: '安氏Ⅲ类骨性错颌畸形合并前牙严重反颌、覆盖-3.5mm。侧貌呈凹面型（月牙脸），上颌骨发育相对不足，下颌升支过度发育。患者骨龄处于颈椎发育成熟度CVMS 3期，尚存骨骼改建调控潜能。',
    treatmentPlan: [
      '利用德国KaVo 3D大视野口腔CBCT联合口扫进行颌面骨骼三维重建与颅面软组织侧貌预测；',
      '第一阶段：采用上颌扩弓与前方牵引技术，促进上颌骨向前生长，抑制并引导下颌骨正常髁突轨迹；',
      '第二阶段：换用时代天使数字化全隐形矫治套，精确控制前牙轴倾度，解除前牙反锁颌，重建中性磨牙咬合关系；',
      '精细调整前牙覆颌覆盖及牙尖交错位，建立正常尖牙保护颌，同步恢复唇下颏正常侧貌美学曲度。',
    ],
    simulationNotes: '利用数字化AI正畸模拟系统（Ortho-Simulation 3D），术前精准预演牙槽骨垂直与水平向量位移。避免了传统“盲目拔前磨牙代偿”可能导致的下颌内收过度、面型更瘪的风险，保护了下颌骨髁突健康。',
    beforeAfterComparison: {
      beforeDesc: '上门牙全部被下门牙包住，下颌前凸，面中部扁平凹陷，侧貌呈月牙形，前牙无法完成正常切割食物。',
      afterDesc: '正常前牙覆颌覆盖（覆盖+2.0mm），安氏I类磨牙关系，下颌前突完全内收，鼻唇角、颏唇沟达到黄金比例侧貌。',
      metrics: [
        { label: '前牙覆盖深度', before: '-3.5 mm (反颌)', after: '+2.0 mm (健康标准)' },
        { label: 'ANB 角 (骨性关系)', before: '-1.8° (骨性Ⅲ类)', after: '+2.4° (正常Ⅰ类骨面型)' },
        { label: '上中切牙倾角 (U1-SN)', before: '93.5° (代偿直立)', after: '104.2° (自然饱满切角)' },
        { label: '侧貌鼻唇角 (Nasolabial)', before: '82° (偏凹瘪)', after: '98° (标准直面型美学)' },
      ],
    },
    patientFeedback: '“以前儿子在学校总因为下巴突出被同学起外号，整个人都不爱笑也不爱说话。在松鼠口腔韩峄主任这里做了18个月隐形矫正，不仅反颌完全纠正了，整个面型立体帅气了很多，现在爱笑也开朗了！复诊时医生每次都很耐心调方案，没有任何额外加价，体验极好。”——患者母亲口述',
    followUpStatus: '矫正结束已佩戴透明保持器12个月，颌骨生长发育稳定，咬合未见任何复发反弹，关节区无弹响杂音。',
    publishedDate: '2026-10-15',
  },
  {
    slug: 'adult-invisalign-bimaxillary-protrusion',
    title: '成人严重骨白性凸嘴改善：数字化隐适美微种植钉内收案例',
    category: 'ortho',
    categoryName: '成人隐形正畸',
    patientAge: '28岁',
    patientGender: '女',
    chiefComplaint: '自然状态下双唇无法完全闭合，微笑时露牙龈明显，侧面看嘴巴明显外凸呈“鸟嘴状”，拍照常年不敢露侧脸。',
    difficulty: '高难度',
    doctorName: '韩峄',
    doctorTitle: '正畸总监 / 资深正畸科主任',
    doctorSlug: 'han-yi',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    duration: '22个月（共计44步隐形牙套）',
    materials: 'Invisalign 隐适美完整版（System Full）+ 4颗微正畸支抗钉',
    costRange: '¥26,800 - ¥32,000（包含微种植钉及全套数字化口扫方案）',
    clinicalDiagnosis: '安氏II类分类1骨性偏牙性双颌前突，伴深覆颌II度、前牙轻度拥挤。下颌后缩，颏肌紧张，自然放松状态下唇间隙达4mm，侧貌E线（审美平面）上下唇均超出4.5mm。',
    treatmentPlan: [
      '拔除四颗第一前磨牙（14/24/34/44），获取充分牙弓间隙用于前牙整体大范围控根内收；',
      '植入上颌后牙区颊侧及下颌磨牙后区微种植支抗骨钉（TADs），提供绝对骨性强支抗；',
      '利用隐适美SmartStage技术精确压低前牙并后移切牙，抑制前牙内倾马蹄形跑偏，维持牙根骨皮质安全厚度；',
      '下颌骨顺时针/逆时针旋转调谐，消除颏肌紧张皱褶，重塑优美下巴颏部高光美学折线。',
    ],
    simulationNotes: '采用 ClinCheck 数字化三维排牙软件与面部3D摄影融合，每一步牙套位移量严格限定在0.2mm内，防止牙根骨吸收或黑三角扩大，实现“牙齿移动 + 软组织唇部回退”完美同步。',
    beforeAfterComparison: {
      beforeDesc: '侧颜嘴凸明显超出E线4.5mm，放松时唇闭不拢漏牙，笑时露龈3mm以上，伴有下巴后缩与核桃纹下颏。',
      afterDesc: '上下唇回缩至E线内侧0.5mm，下巴翘度自然显露，唇齿关系协调，自然放松闭合无紧张感，面型气质大幅蜕变。',
      metrics: [
        { label: '上下前牙内收量', before: '0 mm (严重前突)', after: '前牙内收达 5.8 mm' },
        { label: '唇部超出E线距离', before: '+4.5 mm (严重凸嘴)', after: '-0.5 mm (标准美学参考线)' },
        { label: '露龈笑高度 (Gummy Smile)', before: '3.2 mm (过度露龈)', after: '0.5 mm (微露微笑线)' },
        { label: '自然唇闭合张力', before: '紧绷伴下颏核桃纹', after: '自然贴合无皱褶' },
      ],
    },
    patientFeedback: '“工作后一直因为凸嘴自卑，身边很多医生动辄建议做正颌大手术，心理压力巨大。后来找到松鼠口腔韩峄主任，他非常专业，给看了详细的3D内收模拟，决定用隐适美加骨钉。22个月下来，不仅没开刀，同事都以为我做了鼻综合或垫下巴，整张脸轮廓都精致了！”——白领张女士评价',
    followUpStatus: '拆除矫治器佩戴Vivera保持器已有2年，咬合坚固紧密，侧颜面型美观度保持极佳。',
    publishedDate: '2026-09-20',
  },
  {
    slug: 'all-on-4-full-mouth-immediate-load',
    title: '全口无牙颌高龄微创即刻负重种植：All-on-4 一日得好牙',
    category: 'implant',
    categoryName: '高难全口种植牙',
    patientAge: '68岁',
    patientGender: '男',
    chiefComplaint: '全口牙齿常年牙周炎松动脱落，余留残根牙均三度松动无法咀嚼，常年依靠活动假牙导致牙龈压痛红烂，仅能进食流食软食，身体消瘦。',
    difficulty: '高难度',
    doctorName: '刘彦廷',
    doctorTitle: '院长 / 种植学科带头人',
    doctorSlug: 'liu-yanting',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    duration: '当天手术种牙即刻戴固定牙桥（全程恢复期约3个月完成永久全瓷冠）',
    materials: '瑞典 Nobel Biocare 活性种植体 + 钛合金CAD/CAM高强度桥架',
    costRange: '¥78,000 - ¥98,000/全口（集采后大幅惠民，含手术耗材与即刻修复桥）',
    clinicalDiagnosis: '全口重度广泛性慢性牙周炎，牙列多颗残根伴根尖炎，全口牙槽嵴重度废用性吸收萎缩，后牙区牙槽骨高度不足4mm，紧邻下齿槽神经管与上颌窦底，常规种植需大量植骨且失败率极高。',
    treatmentPlan: [
      '术前通过CBCT三维重建与动态导航定位，避开神经管与上颌窦底解剖盲区；',
      '无痛微创拔除全口无保留价值的残留松动牙根，彻底清创刮除炎性肉芽组织；',
      '上下颌各植入4颗诺贝尔高阶亲水植体（前牙2颗垂直植入，后牙2颗以30°-45°大角度斜向倾斜植入），增大骨接触面积并获得高达45N·cm的初期稳定性；',
      '术中即刻取模安装多基台及高精度一体成型临时固定过渡桥，实现“当天手术、当天恢复咀嚼功能、当天进食软固态食物”。',
    ],
    simulationNotes: '采用3D数字化数字化手术导板全程引导，定位精度控制在0.1mm级。避免了传统全口植牙需要经历大面积自体骨移植及长达6-9个月漫长无牙等待期的极大创伤。',
    beforeAfterComparison: {
      beforeDesc: '全口仅剩数颗晃动残根，牙槽嵴严重低平萎缩，脸颊凹陷苍老如八旬老翁，完全无法咀嚼固态食物。',
      afterDesc: '上下颌各4颗植体牢固支撑24颗全口固定牙冠，面容饱满年轻，恢复媲美真牙90%以上的咀嚼咬合力。',
      metrics: [
        { label: '植体初期稳定性 (ISQ)', before: '无牙/松动无法受力', after: '均值 &gt; 72 ISQ (极佳骨初期结合)' },
        { label: '咀嚼效能恢复率', before: '&lt; 15% (仅能吸食流质)', after: '恢复至 92% (可正常啃排骨苹果)' },
        { label: '手术创口与愈合周期', before: '常规大植骨需6-9月', after: '微创仅当天，24小时消肿' },
        { label: '面下1/3垂直高度', before: '下陷短缩 6.5 mm', after: '恢复正常丰满解剖高度' },
      ],
    },
    patientFeedback: '“被牙齿折磨了快十年，假牙磨得牙肉全是血泡，好几年没敢痛快吃过一口肉。在松鼠口腔刘彦廷院长这里做完全口即刻种植，当天下午就戴着新牙回了家，晚上就喝了排骨汤吃了软米饭。现在过去一年多了，硬苹果随便啃，邻居都夸我年轻了十多岁！”——昆明西山区退休教师陈大爷',
    followUpStatus: '术后定期随访18个月，植体周围骨吸收量小于0.2mm，远优于国际标准，软组织袖口粉红健康无充血。',
    publishedDate: '2026-08-18',
  },
  {
    slug: 'anterior-aesthetic-porcelain-veneers',
    title: '前牙重度氟斑牙伴牙间隙：超薄微创全瓷贴面美学微笑线重塑',
    category: 'veneer',
    categoryName: '前牙美学贴面',
    patientAge: '25岁',
    patientGender: '女',
    chiefComplaint: '前牙重度黄褐色氟斑釉质缺损，伴随门牙中缝稀疏间隙2mm，牙齿形态短方不协调，不敢开口大笑。',
    difficulty: '常规',
    doctorName: '韩峄',
    doctorTitle: '正畸总监 / 美学修复顾问',
    doctorSlug: 'han-yi',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    hospitalAddress: '昆明市西山区前卫蓝光昆仑中心3楼320室（万达广场旁）',
    duration: '2次就诊（首诊精细取模备牙，7天后二次试戴粘结交付）',
    materials: '德国义获嘉（Ivoclar e.max）铸瓷超薄美学贴面（厚度仅0.2-0.3mm）',
    costRange: '¥1,800 - ¥2,800/颗（8颗前牙微笑美学定制）',
    clinicalDiagnosis: '上前牙14至24区间重度地方性氟斑牙，牙齿唇面呈深黄褐色带状色素沉着且伴釉质表面点状脱落剥脱，11与21牙间散在间隙2.1mm，笑线低平，前牙长宽比失调（宽长比达90%）。',
    treatmentPlan: [
      '应用DSD（Digital Smile Design）数字化微笑美学设计软件，按黄金比例设计前牙长宽比与微笑红白美学边缘；',
      '显微镜下超微创牙体预备（磨牙量仅0.2mm，部分天然缺隙区零磨牙保全牙髓健康）；',
      '运用高精度3Shape口内三维扫描仪建立数字印模并远程同步义齿美学切削中心；',
      '使用义获嘉高强度美学树脂水门汀在橡皮障严密隔离防潮下进行超强微米级粘结。',
    ],
    simulationNotes: '采用前牙美学腊型（Mock-up）口内实景试戴技术，在没有磨除任何真牙前，先让患者在口内直观感知新笑容的外观、唇形匹配度与发音，确认满意后再行动工，做到真正“所见即所得”。',
    beforeAfterComparison: {
      beforeDesc: '前牙大片斑驳黄褐素沉着，门牙中缝稀疏漏风，拍照暗沉不敢大笑，牙面粗糙失去光泽。',
      afterDesc: '8颗贴面色泽达到高透自然白（色阶BL3），通透温润微具天然荧光质感，中缝闭合，微笑线如新月自然上扬。',
      metrics: [
        { label: '牙齿色阶提升', before: 'VITA 16色 A4 (重度发黄发褐)', after: '高透美白 BL3 (自然白皙通透)' },
        { label: '门牙中缝间隙', before: '散在缝隙 2.1 mm', after: '完全密合无黑三角缝隙' },
        { label: '牙体微创磨切量', before: '常规烤瓷牙需磨掉 50% 牙体', after: '超薄显微备牙仅磨除 &lt; 0.2 mm' },
        { label: '前牙微笑红白曲线', before: '牙龈缘参差不齐、平直僵硬', after: '双侧对称，龈缘扇贝弧度完美' },
      ],
    },
    patientFeedback: '“云南这边很多人因为水质有氟斑牙，我从小到大就特别怕张嘴。本来很担心做烤瓷牙要把牙齿磨成小尖尖伤害神经，韩主任给方案做的0.2毫米超薄瓷贴面，几乎没磨牙，打麻药都不疼。做好之后连闺蜜都以为是我天生的好牙齿，笑起来特别自然自信！”——患者李小姐',
    followUpStatus: '术后使用3年回访，贴面无崩瓷、无脱落，边缘无继发龋，牙龈边缘粉质健康紧实。',
    publishedDate: '2026-07-12',
  },
];
