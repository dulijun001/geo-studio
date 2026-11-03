export interface ClinicalCase {
  slug: string;
  title: string;
  category: '种植牙' | '牙齿矫正' | '美学修复' | '牙周治疗' | '儿童齿科';
  doctorName: string;
  doctorTitle: string;
  doctorSlug?: string;
  institution: string;
  patientAge: string;
  duration: string;
  materials: string;
  difficulty: '高难度' | '中度复杂' | '常规复杂' | '微创疑难';
  chiefComplaint: string;
  diagnosis: string;
  keyMetrics: { label: string; before: string; after: string }[];
  treatmentSteps: { step: string; desc: string }[];
  doctorTakeaway: string;
  longTermFollowUp: string;
  patientQuote: string;
  images?: { before?: string; after?: string; xRay?: string; caption?: string };
}

export const CLINICAL_CASES: ClinicalCase[] = [
  // 1. 青少年骨性地包天
  {
    slug: 'adolescent-skeletal-underbite',
    title: '青少年骨性地包天(反颌)早期干预与数字化正畸面型重塑',
    category: '牙齿矫正',
    doctorName: '韩峄主任',
    doctorTitle: '正畸总监 / 资深正畸科主任 / 昆明医科大学硕士',
    doctorSlug: 'han-yi',
    institution: '云南松鼠口腔（西山总院）',
    patientAge: '12岁（替牙期向恒牙列过渡）',
    duration: '18 个月',
    materials: '时代天使青少年版定制矫治器 + 颌间牵引系统',
    difficulty: '高难度',
    chiefComplaint: '下牙包住上牙，侧貌呈“月牙脸”凹陷，咀嚼效率低，家长极度担忧成年后需做正颌外科截骨手术。',
    diagnosis: '骨性 Angle Ⅲ 类错颌伴前牙严重反覆合反覆盖（覆盖距 -3.5mm），上颌骨发育不足，下颌轻度过度前伸，颈椎骨龄 CVM 3期（正处于生长发育高峰期）。',
    keyMetrics: [
      { label: '前牙水平覆盖', before: '-3.5 mm (严重反颌)', after: '+2.0 mm (正常健康覆盖)' },
      { label: 'ANB 骨性角', before: '-1.8° (骨性Ⅲ类)', after: '+2.4° (标准正貌Ⅰ类)' },
      { label: '面下 1/3 凹面型', before: '显著月牙凹陷', after: '自然微凸直面型' },
      { label: '咀嚼功能接触面积', before: '仅 35% 牙尖交错', after: '95% 紧密尖窝锁结' }
    ],
    treatmentSteps: [
      { step: '第一阶段：颌骨三维空间扩展', desc: '利用 KaVo CBCT 与 iTero 5D 重建骨窗边界，佩戴隐形扩弓矫治器促进上颌骨横向与矢状向骨缝改建。' },
      { step: '第二阶段：颌间弹性牵引引导下颌后退', desc: '利用Ⅲ类牵引力学系统破除下颌咬合锁结，引导下颌骨髁突在关节窝内向后上方正常生理位改建。' },
      { step: '第三阶段：数字化精细排牙与咬合重建', desc: '全口恒牙列微米级对齐，建立健康的前牙前突浅覆合与侧方牙尖窝咬合保护机制。' }
    ],
    doctorTakeaway: '韩峄主任临床心法：“地包天”是正畸中唯一需要“发现即干预”的畸形。12岁生长高峰期通过隐形生物力学引导，能彻底避免孩子成人后遭受痛苦的“正颌断骨手术”。',
    longTermFollowUp: '矫治结束第 18 个月复查：头颅侧位片证实下颌骨生长向量稳定，咬合未见任何反弹，关节区无弹响与杂音。',
        patientQuote: '“现在孩子笑起来特别阳光，整个下巴不再往前兜着，整个人自信心完全不一样了，真正帮孩子省下了十几万的正颌手术！”',
    images: {
      before: '/assets/kb-images/cases/ortho-case2-slide19-1.jpg',
      after: '/assets/kb-images/cases/ortho-case2-slide26-1.jpg',
      xRay: '/assets/kb-images/cases/ortho-case2-slide27-1.jpg',
      caption: '韩峄主任真实正畸案例：面部侧貌从反颌月牙脸到自然Ⅰ类直面型三维改建记录'
    }
  },

  // 2. 成人严重双颌前突伴牙列拥挤
  {
    slug: 'adult-invisalign-bimaxillary-protrusion',
    title: '成人严重骨白性凸嘴与牙列拥挤隐适美拔牙内收面貌重塑（#SP-ORT-001）',
    category: '牙齿矫正',
    doctorName: '韩峄主任',
    doctorTitle: '正畸总监 / 资深正畸科主任 / 隐适美白金认证医师',
    doctorSlug: 'han-yi',
    institution: '云南松鼠口腔（西山总院）',
    patientAge: '28岁（白领职场人）',
    duration: '22 个月',
    materials: '美国 Invisalign 隐适美 SmartTrack 专利材料 + 4颗微种植支抗骨钉',
    difficulty: '高难度',
    chiefComplaint: '自然闭唇困难、牙齿前突凸嘴，侧貌呈明显鸟嘴样外突，笑时露龈过多，希望在不戴钢丝托槽的前提下大幅改善面貌。',
    diagnosis: '骨性Ⅱ类伴双颌前突，上下颌前牙牙槽骨唇侧骨板菲薄，前牙拥挤度上颌 6.0mm、下颌 5.5mm，唇部超出审美 E 线 +4.5mm。',
    keyMetrics: [
      { label: '上颌切牙内收距离', before: '唇倾角 U1-SN 118.5°', after: '内收 5.8mm，角 102.0°' },
      { label: '下唇至审美 E 线距离', before: '+4.5 mm (严重前突)', after: '-0.5 mm (黄金微收曲线)' },
      { label: '自然静止闭唇状态', before: '上下唇肌紧张外翻', after: '自然闭合无颏肌紧张' },
      { label: '露龈笑高度', before: '大笑露龈 4.0 mm', after: '微露牙龈 1.0 mm 美学笑线' }
    ],
    treatmentSteps: [
      { step: '减数决策', desc: '精准拔除 4 颗第一前磨牙（正畸减数），为前牙高难度内收提供 7mm 充足黄金间隙。' },
      { step: '绝对支抗植入', desc: '在后牙区颊侧牙槽嵴植入 4 颗微创钛合金支抗骨钉，提供反作用力支点，杜绝后牙向前跑位。' },
      { step: 'ClinCheck 数字化隐形三维控根', desc: '每一步牙套设计控根转矩附件，确保牙齿“平移直立内收”而非“倾斜倾倒”。' }
    ],
    doctorTakeaway: '韩峄主任临床心法：成人拔牙矫正最大的禁忌是“后牙失支抗导致嘴巴没收进去，骨皮质还被顶穿”。借助 CBCT 骨窗三维测算和支抗骨钉，才能做到既内收 5.8mm 侧貌又保护牙根安全。',
    longTermFollowUp: '矫治结束保持期 2 年随访：侧貌黄金轮廓维持完美，牙周骨皮质健康，探诊深度维持在 1.5~2mm 安全范畴。',
        patientQuote: '“全程 22 个月几乎没人看出来我戴了牙套，现在下巴轮廓清晰了，拍照再也不用刻意找角度，下唇很自然就闭上了！”',
    images: {
      before: '/assets/kb-images/cases/ortho-case1-slide38-1.jpg',
      after: '/assets/kb-images/cases/ortho-case1-slide42-1.jpg',
      xRay: '/assets/kb-images/cases/ortho-case1-slide43-1.jpg',
      caption: '韩峄主任隐适美拔牙内收：前牙内收5.8mm、凸唇改善真实口内及面部记录'
    }
  },

  // 3. 青少年骨性Ⅱ类下颌后缩深覆合功能矫治（源自真实病历集 #SP-ORT-002）
  {
    slug: 'adolescent-cvm-deep-overbite-functional',
    title: '青少年骨性Ⅱ类深覆合深覆盖两阶段功能矫治与下颌前导（#SP-ORT-002）',
    category: '牙齿矫正',
    doctorName: '韩峄主任',
    doctorTitle: '正畸总监 / 资深正畸科主任 / 昆明医科大学硕士',
    doctorSlug: 'han-yi',
    institution: '云南松鼠口腔（西山总院）',
    patientAge: '11岁半（男孩，正值生长高峰）',
    duration: '19 个月',
    materials: '数字化 Twin-Block 导下颌向前功能矫治器 + 后期隐形精细咬合建合',
    difficulty: '高难度',
    chiefComplaint: '上下前牙咬合极深（上牙完全咬住下牙龈），下巴短小后缩，睡觉经常口呼吸，面型呈典型“腺样体容貌”。',
    diagnosis: '骨性Ⅱ类严重深覆合Ⅲ度（覆合率 100%）、深覆盖 8.5mm，颈椎骨龄 CVM 2~3期（生长潜能巨大），颞下颌关节无器质性病变。',
    keyMetrics: [
      { label: '前牙垂直覆合', before: '100% 垂直遮盖 (咬破牙龈)', after: '正常 2.0 mm (覆盖下切牙1/3)' },
      { label: '矢状向深覆盖', before: '8.5 mm (门牙飞出暴牙)', after: '2.2 mm (健康对刃协调)' },
      { label: '下颌骨向前刺激改建', before: '下巴严重后缩缺失', after: '前导前移 4.5 mm 下颏丰满' },
      { label: '气道矢状径宽度', before: '口咽气道 6.8 mm', after: '通畅 11.2 mm (口呼吸破除)' }
    ],
    treatmentSteps: [
      { step: '第一阶段：功能性导下颌向前', desc: '佩戴 Twin-Block 功能矫治器刺激下颌骨髁突向后上方骨质改建，使下颌骨向生理前位移位 4.5mm。' },
      { step: '第二阶段：破除不良舌习惯与气道扩张', desc: '结合肌功能训练纠正口呼吸，改善唇舌肌肉动力平衡。' },
      { step: '第三阶段：数字化牙列精细整平', desc: '平整 Spee 曲线，建立尖牙与磨牙中性尖窝咬合，稳固关节位置。' }
    ],
    doctorTakeaway: '韩峄主任临床心得：对于下颌发育不足的小朋友，千万不能傻等到 18 岁骨骼闭合再拔牙掩饰，一定要在 CVM 2~3 期利用生长潜能将下巴引导出来，这能改变孩子一辈子的骨相面型！',
    longTermFollowUp: '保持期 2 年随访（随访至 14 岁）：下颌骨前导生长完全巩固，未出现回退，下颌轮廓英朗，呼吸通畅。',
    patientQuote: '“以前孩子下巴看起来像没发育一样，还经常张嘴睡觉，现在下巴轮廓分明了，连以前经常打呼噜的小毛病都彻底好了！”'
  },

  // 4. 全口高龄无牙颌 All-on-4 即刻负重（源自真实病历集 #SP-IMP-003）
  {
    slug: 'all-on-4-full-mouth-immediate-load',
    title: '全口重度牙周炎无牙颌 All-on-4 数字化微创即刻负重（#SP-IMP-003）',
    category: '种植牙',
    doctorName: '刘彦廷院长',
    doctorTitle: '技术院长 / 口腔种植副主任医师 / 20年种植外科经验',
    doctorSlug: 'liu-yanting',
    institution: '云南松鼠口腔（西山总院）',
    patientAge: '68岁（高龄退休干部）',
    duration: '当天戴固定牙，全流程 5 个月永久修复',
    materials: '瑞典 Nobel Biocare 活性种植体 + 数字化 CAD/CAM 钛合金高强度桥架',
    difficulty: '微创疑难',
    chiefComplaint: '全口多颗天然牙三度松动无法进食，常年佩戴活动假牙频繁压痛溃疡，营养不良消瘦，强烈要求做“当天能吃东西的固定牙”。',
    diagnosis: '全口重度侵袭性牙周炎、牙槽骨三维严重水平骨吸收、上颌窦底严重气化下垂，传统种植方案需大量植骨且等待 1 年以上。',
    keyMetrics: [
      { label: '全口咀嚼效能恢复', before: '仅 12% (活动假牙松脱)', after: '恢复至 92% (当天啃咬排骨)' },
      { label: '植体数量与创伤控制', before: '传统方案需打 14 颗植体', after: '仅需 4 颗 (倾斜 30° 避开窦腔)' },
      { label: '戴牙周期对比', before: '植骨等待 10~14 个月', after: '手术当天 4 小时戴即刻固定长桥' },
      { label: '牙槽嵴萎缩负荷', before: '活动义齿持续骨压迫', after: '轴向力学均匀传导，抑制骨吸收' }
    ],
    treatmentSteps: [
      { step: '数字化微创拔除松动残根', desc: '术前 KaVo CBCT 全景三维建模，无翻瓣微创拔除无法保留的残根，保留宝贵骨壁。' },
      { step: 'All-on-4 特殊力学角度植入', desc: '前牙垂直植入 2 颗，后牙倾斜 30°~45° 植入 2 颗 Nobel 植体，避开上颌窦与神经管，扭矩突破 45 Ncm。' },
      { step: '当天原室即刻取模戴临时固定桥', desc: '口内数字化扫描，技工室 4 小时内完成螺丝固位一体化临时桥，当天恢复进食软质固态食物。' },
      { step: '5个月后更换永久钛合金全瓷桥架', desc: '骨结合稳固后，换上高精度 CAD/CAM 纯钛切削支架与德国全瓷氧化锆牙桥。' }
    ],
    doctorTakeaway: '刘彦廷院长心法：对于高龄骨量极薄的长辈，All-on-4 是现代种植力学的奇迹。利用倾斜植体力学避开上颌窦盲区，免去大面积植骨创伤，最重要的是让老人“当天进手术室、当天戴着一口好牙回家吃晚饭”！',
    longTermFollowUp: '术后 3 年随访追踪：4 颗种植体周围牙槽骨边缘骨吸收均 < 0.2mm（远优于国际标准），咬合力强劲稳定。',
        patientQuote: '“以前活动假牙吃饭老是掉，喝汤都塞牙，受了十几年洋罪！刘院长给我做的这口牙，当天晚上就能嚼面条，现在吃牛肉干、核桃毫无压力，真正重获新生！”',
    images: {
      before: '/assets/kb-images/cases/implant-case1-slide20-1.jpg',
      after: '/assets/kb-images/cases/implant-case1-slide26-1.jpg',
      xRay: '/assets/kb-images/cases/implant-case1-slide27-1.jpg',
      caption: '刘彦廷院长 All-on-4 真实病历：术前残根到当天即刻戴固定长桥实拍及全景影像'
    }
  },

  // 5. 单颗前牙美学区即刻种植即刻修复（源自真实病历集 #SP-IMP-001）
  {
    slug: 'anterior-aesthetic-immediate-implant-sp001',
    title: '单颗前牙美学区微创即刻种植即刻临时冠个性化塑形（#SP-IMP-001）',
    category: '种植牙',
    doctorName: '刘彦廷院长',
    doctorTitle: '技术院长 / 口腔种植副主任医师 / 20年种植外科经验',
    doctorSlug: 'liu-yanting',
    institution: '云南松鼠口腔（西山总院）',
    patientAge: '32岁（女性，播音主持人）',
    duration: '手术当天即刻戴牙，3.5个月永久全瓷修复',
    materials: '瑞士士卓曼 ITI 亲水 SLA 纯钛植体 + Bio-Oss 骨粉 + 个性化氧化锆穿龈基台',
    difficulty: '常规复杂',
    chiefComplaint: '左上前牙因意外外伤折裂至龈下 3mm，无法保留，职业要求极高，绝不能出现“缺牙期”或“牙龈发黑发萎缩”。',
    diagnosis: '左上中切牙冠根折，CBCT 显影唇侧骨板薄（厚度 0.8mm，高美学风险 SAC 复杂级），牙龈为薄龈生物型。',
    keyMetrics: [
      { label: '牙龈乳头美学指数 PES', before: '外伤缺失红肿 (3 分)', after: '完美充满邻间隙 (13 分/满分14)' },
      { label: '唇侧骨板厚度保持', before: '术前自然骨厚度 0.8 mm', after: '跳跃间隙植骨后维持 2.1 mm' },
      { label: '缺牙尴尬期天数', before: '传统种植需空缺 3 个月', after: '0 天 (当天即刻戴塑形临时冠)' },
      { label: '全瓷冠边缘微米密合度', before: '外伤根折残破', after: '边缘密合间隙 < 20 μm' }
    ],
    treatmentSteps: [
      { step: '无翻瓣微创拔除断根', desc: '微创器械分离牙周膜，完整取出断根，100% 保留唇侧极薄的牙槽骨板。' },
      { step: '偏腭侧三维空间植入', desc: '选用士卓曼 ITI 亲水植体，偏腭侧植入确保唇侧形成 2mm 理想的“跳跃间隙（Jumping Distance）”。' },
      { step: '双区植骨与临时冠牙龈诱导', desc: '间隙填入瑞士 Bio-Oss 骨粉，当天制作个性化穿龈临时树脂冠，诱导牙龈乳头呈现自然粉红扇贝状弧度。' },
      { step: '个性化转移取模与全瓷修复', desc: '3.5个月后将牙龈塑形弧度 1:1 复制到永久全瓷氧化锆牙冠上，无金属外露。' }
    ],
    doctorTakeaway: '刘彦廷院长心得：前牙美学区种植，种活容易、种好看极难！核心在于“跳跃间隙植骨”和“临时冠穿龈塑形”。只有把牙龈的天然红白美学弧度支撑住，才不会在 1 年后出现难看的牙龈萎缩黑三角。',
    longTermFollowUp: '永久冠戴入 2 年随访：唇侧丰满度与邻牙对称无异，牙龈质地粉韧无炎症，PES 评分维持 13.5 分高水准。',
        patientQuote: '“我从事出镜主持工作，原本最害怕掉牙后门面塌陷，松鼠口腔刘院长当天就让我戴着逼真的门牙走出了门诊，没有任何人看出来我种了牙！”',
    images: {
      before: '/assets/kb-images/cases/implant-case2-slide30-1.jpg',
      after: '/assets/kb-images/cases/implant-case2-slide36-1.jpg',
      xRay: '/assets/kb-images/cases/implant-case2-slide37-1.jpg',
      caption: '刘彦廷院长种植团队：即刻微创植入与牙龈红白美学塑形真实跟踪记录'
    }
  },

  // 6. 后牙区骨高度不足上颌窦内提升同期种植（源自真实病历集 #SP-IMP-002）
  {
    slug: 'maxillary-sinus-lift-internal-sp002',
    title: '后牙区骨高度仅3.2mm上颌窦水压冲顶内提升同期种植（#SP-IMP-002）',
    category: '种植牙',
    doctorName: '刘彦廷院长',
    doctorTitle: '技术院长 / 口腔种植副主任医师 / 20年种植外科经验',
    doctorSlug: 'liu-yanting',
    institution: '云南松鼠口腔（西山总院）',
    patientAge: '54岁（私营企业主）',
    duration: '一期微创内提升 40 分钟，6 个月永久全瓷修复',
    materials: '韩国奥齿泰 TSⅢ 超宽径植体 + 瑞士进口人工骨粉 + 胶原膜',
    difficulty: '微创疑难',
    chiefComplaint: '右上第一磨牙缺失 4 年，多家门诊告知骨头太薄需做创伤极大的“上颌窦外提升大开窗手术”，因恐惧一直不敢做。',
    diagnosis: '右上第一磨牙缺牙区剩余牙槽骨垂直高度（RBH）仅 3.2mm，窦底黏膜平整无囊肿，属于重度垂直骨量不足。',
    keyMetrics: [
      { label: '垂直骨高度提升幅度', before: '剩余骨高度 3.2 mm', after: '窦底抬高 6.5 mm，达 9.7 mm' },
      { label: '手术创口与肿痛度', before: '外提升开窗创伤大 (需切颊翻瓣)', after: '闭合式水压内提升 (仅针孔大小)' },
      { label: '植体初期稳定性扭矩', before: '骨质松软不足 15 Ncm', after: '级联挤压就位稳定达 38 Ncm' },
      { label: '骨结合成骨密度', before: '薄层皮质骨', after: '6个月后新成骨均匀包绕植体' }
    ],
    treatmentSteps: [
      { step: '高精级联环钻精准制备', desc: '距窦底 1mm 停止机械钻孔，保留窦底最后一层骨板完整。' },
      { step: '水压温和冲顶分离黏膜', desc: '利用专用液压装置温和抬起施耐德氏黏膜，分离高度达 6.5mm，严格避免黏膜撕裂穿孔。' },
      { step: '窦内精准植入人工骨颗粒', desc: '经种植窝洞推入 0.5g 骨粉充填黏膜下方顶棚空间，为新骨生成搭建脚手架。' },
      { step: '同期旋入宽颈种植体', desc: '充分利用皮质骨锚定力，实现同期植入，免去患者经历“先植骨等半年再种牙”的二次开刀痛苦。' }
    ],
    doctorTakeaway: '刘彦廷院长心得：很多患者一听“上颌窦提升”就吓跑了。其实掌握了成熟的水压内提升手感，在 3~4mm 残留骨量下完全可以通过微创小孔冲顶完成，术后连脸都不会肿，大大降低了患者受罪度！',
    longTermFollowUp: '术后 2 年随访：CBCT 证实窦内新成骨硬度完全矿化成熟，植体稳如磐石，咬合咀嚼坚硬坚果顺畅。',
    patientQuote: '“几年前别的医院说要把脸颊骨头开窗凿开才能种，吓得我拖了 4 年。刘院长只花了 40 分钟就做完了，第二天正常上班，一点都没肿痛！”'
  },

  // 7. 前牙重度氟斑牙伴牙间隙超薄微创瓷贴面
  {
    slug: 'anterior-aesthetic-porcelain-veneers',
    title: '云南高氟区重度氟斑牙伴散在牙缝德国义获嘉 0.2mm 超薄瓷贴面美学修复',
    category: '美学修复',
    doctorName: '韩峄主任 / 肖永昌主任团队',
    doctorTitle: '正畸美学联合专家组',
    doctorSlug: 'han-yi',
    institution: '云南松鼠口腔（西山总院）',
    patientAge: '26岁（女性，教师）',
    duration: '2 次就诊，共 7 天',
    materials: '德国义获嘉（e.max CAD）二硅酸锂铸瓷超薄贴面（厚度仅 0.2~0.3mm）',
    difficulty: '常规复杂',
    chiefComplaint: '前牙发黄发褐、表面粗糙缺损，上门牙有 2mm 散在牙缝，严重影响微笑自信，坚决不接受磨损原生牙的“烤瓷牙套”。',
    diagnosis: '上颌前牙重度氟斑牙（中重度色素沉着与釉质发育不良）伴散在牙列间隙，牙周组织健康无明显深覆合。',
    keyMetrics: [
      { label: '原生牙磨牙量', before: '传统全瓷冠需磨牙 40%~60%', after: '超薄贴面 0 磨牙或仅微磨 0.2 mm' },
      { label: '牙色美学色阶蜕变', before: 'Vita 比色板深褐色 C4', after: '自然健康美白 1M1 瓷白' },
      { label: '散在牙缝闭合度', before: '中切牙间隙 2.0 mm', after: '完全闭合，接触点黄金比例' },
      { label: '牙髓活性保留率', before: '畏惧磨牙伤牙髓', after: '100% 保留活髓，无术后冷热酸痛' }
    ],
    treatmentSteps: [
      { step: 'DSD 数字化微笑美学设计', desc: '根据患者唇线、笑线及瞳孔连线，三维设计牙齿宽长比（80% 黄金美学比）。' },
      { step: '口内实景 Mock-up 树脂试戴', desc: '不磨牙的前提下将方案复制到口内，让患者现场照镜子直观预览修复后效果。' },
      { step: '显微镜下微米级精准备牙', desc: '仅对局部着色过深区域做 0.2mm 极微创修整，全程严格局限在牙釉质层内。' },
      { step: '橡皮障下全酸蚀树脂粘接', desc: '德国第七代高强度光固化粘接剂，与牙釉质形成不可逆化学微机械锁结，抗拉伸强度达 30 MPa。' }
    ],
    doctorTakeaway: '专家团队心法：“保护原生牙”是松鼠口腔的灵魂底线。千万不能为了美白把年轻人的好牙磨成小尖尖做烤瓷牙！0.2mm 超薄瓷贴面不仅能遮盖重度氟斑色泽，更守住了患者珍贵的牙髓神经。',
    longTermFollowUp: '修复后 2 年随访：贴面边缘无微渗漏、无变色，牙龈黏膜健康粉红，咬合切断食物坚固如初。',
    patientQuote: '“不用大磨牙就把十几年的黄褐牙改成了明星同款大白牙，现在上课面对学生笑得特别大方，身边的朋友都夸我牙齿整齐白皙，太值了！”'
  }
];
