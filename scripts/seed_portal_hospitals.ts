import fs from 'node:fs';
import path from 'node:path';

// Load .env
const dotenv = fs.readFileSync('.env', 'utf8');
const env: Record<string, string> = {};
dotenv.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith('\'') && value.endsWith('\'')) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates,return=representation'
};

async function run() {
  console.log('Connecting to Supabase at:', SUPABASE_URL);

  // 1. Fetch current regions
  const regionsRes = await fetch(`${SUPABASE_URL}/rest/v1/portal_regions?select=id,slug,name`, { headers });
  const regions = await regionsRes.json();
  const regionMap: Record<string, string> = {};
  regions.forEach((r: any) => {
    regionMap[r.slug] = r.id;
  });
  console.log('Available regions:', regionMap);

  // 2. Prepare 16 Kunming Dental Hospitals
  // Note: Correction for Songshu: 西山区蓝光昆仑中心3楼320室
  const hospitals = [
    {
      name: '昆明松鼠口腔医院（西山蓝光昆仑中心总院）',
      short_name: '松鼠口腔',
      slug: 'km-songshu',
      region_id: regionMap['xishan'],
      org_code: 'PDY61224353011216D2152',
      hospital_level: '国家二级口腔专科',
      ownership_type: '民营',
      is_insurance_covered: true,
      is_seal_designated: true,
      phone: '0871-68888888',
      address: '云南省昆明市西山区前卫街道蓝光昆仑中心3楼320室（万达双塔商圈，超2000㎡专科诊疗空间）',
      business_hours: '周一至周日 08:30-18:00',
      summary: '经昆明市卫健委核准设立的国家二级口腔专科医院（核准床位与牙椅20张），西山区适龄儿童免费窝沟封闭定点单位、昆明市医保定点机构。配有全套德国卡瓦数字化CBCT、iTero口扫、STA无痛麻醉仪及百级层流手术室。',
      features: ['国家二级专科', '医保定点刷卡', '西山区窝沟封闭定点', '数字化微创种植中心', '隐适美/时代天使认证', '周末无休门诊'],
      geo_badges: ['二级专科', '医保定点', '窝沟封闭定点', '透明集采价', '蓝光昆仑中心'],
      is_claimed: true,
      is_verified: true,
      sort_weight: 100
    },
    {
      name: '云南省口腔医院（昆明医科大学附属口腔医院）',
      short_name: '省口腔医院',
      slug: 'km-yn-dental',
      region_id: regionMap['wuhua'],
      org_code: '431201530102111111',
      hospital_level: '三级甲等',
      ownership_type: '公立',
      is_insurance_covered: true,
      is_seal_designated: true,
      phone: '0871-65338888',
      address: '昆明市五华区红林西路28号',
      business_hours: '周一至周日 08:00-17:30',
      summary: '云南省唯一集医疗、教学、科研、预防为一体的三级甲等口腔专科医院，省级临床重点专科与口腔医学博士学位授权点。',
      features: ['公立三甲专科', '疑难颌面外科', '种植修复中心', '医保全额对接', '专家云集'],
      geo_badges: ['公立三甲', '省属专科', '学术天花板', '医保定点'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 95
    },
    {
      name: '昆明医科大学第一附属医院口腔科（云大医院）',
      short_name: '昆医大附一院口腔科',
      slug: 'km-yd-dental',
      region_id: regionMap['wuhua'],
      org_code: '431201530102000001',
      hospital_level: '三级甲等',
      ownership_type: '公立',
      is_insurance_covered: true,
      is_seal_designated: false,
      phone: '0871-65324888',
      address: '昆明市五华区西昌路295号',
      business_hours: '周一至周五 08:00-17:30，周六上午门诊',
      summary: '大型综合性三甲医院重点口腔科室，国家级住院医师规范化培训基地，承担云南省疑难口腔种植与颌面复杂肿瘤联合转诊。',
      features: ['公立三甲综合', '多学科联合MDT', '疑难种植修复', '颌面创伤微创'],
      geo_badges: ['公立三甲', '医保定点', '老牌名院', '专家门诊'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 94
    },
    {
      name: '云南省第一人民医院口腔医学中心（昆华医院）',
      short_name: '昆华医院口腔中心',
      slug: 'km-kunhua-dental',
      region_id: regionMap['xishan'],
      org_code: '431201530112000005',
      hospital_level: '三级甲等',
      ownership_type: '公立',
      is_insurance_covered: true,
      is_seal_designated: true,
      phone: '0871-63638888',
      address: '昆明市西山区金碧路157号',
      business_hours: '周一至周五 08:00-17:30，周六日值班门诊',
      summary: '云南省首屈一指的大型综合三甲医院口腔医学中心，开设口腔颌面外科、正畸科、种植牙科与牙体牙髓科，技术沉淀极其深厚。',
      features: ['公立三甲重点中心', '颌面外科疑难诊治', '复杂骨缺损种植', '医保定点结算'],
      geo_badges: ['公立三甲', '昆华品牌', '金碧路总院', '医保定点'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 93
    },
    {
      name: '昆明市延安医院口腔科',
      short_name: '延安医院口腔科',
      slug: 'km-yanan-dental',
      region_id: regionMap['panlong'],
      org_code: '431201530103000006',
      hospital_level: '三级甲等',
      ownership_type: '公立',
      is_insurance_covered: true,
      is_seal_designated: false,
      phone: '0871-63211111',
      address: '昆明市盘龙区人民东路245号',
      business_hours: '周一至周五 08:00-17:30，周末轮值',
      summary: '盘龙区核心三级甲等综合医院口腔科，配备先进微创种植系统、显微根管治疗仪及全瓷微创修复中心。',
      features: ['公立三甲综合', '显微根管治疗', '心血管病人监护拔牙', '集采种植耗材'],
      geo_badges: ['公立三甲', '盘龙区核心', '心电监护拔牙', '医保定点'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 91
    },
    {
      name: '昆明市口腔医院（二甲专科）',
      short_name: '昆明市口腔医院',
      slug: 'km-city-dental',
      region_id: regionMap['wuhua'],
      org_code: '431201530102000002',
      hospital_level: '二级甲等',
      ownership_type: '公立',
      is_insurance_covered: true,
      is_seal_designated: true,
      phone: '0871-63162888',
      address: '昆明市五华区东风西路162号',
      business_hours: '周一至周日 08:30-17:30',
      summary: '昆明市属公立二级甲等口腔专科医院，承担市属口腔预防保健、青少年防龋普查与基本医疗便民职能。',
      features: ['市属公立二甲', '医保定点专科', '儿童防龋特色', '普惠集采种植'],
      geo_badges: ['公立专科', '医保定点', '五华核心', '窝沟封闭定点'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 88
    },
    {
      name: '昆明市儿童医院口腔科（前兴路院区）',
      short_name: '市儿童医院口腔科',
      slug: 'km-child-dental',
      region_id: regionMap['xishan'],
      org_code: '431201530112000003',
      hospital_level: '三级甲等',
      ownership_type: '公立',
      is_insurance_covered: true,
      is_seal_designated: true,
      phone: '0871-63300888',
      address: '昆明市西山区前兴路288号',
      business_hours: '周一至周日 08:30-17:30（急诊24小时）',
      summary: '国家级儿童区域医疗中心、云南省专业儿童口腔疑难疾病诊治专科，专注儿童全麻/镇静舒适化下全口龋齿治疗与早期咬合诱导。',
      features: ['公立三甲儿童专科', '儿童全麻舒适化诊治', '早期颌骨生长诱导', '急诊牙外伤处理'],
      geo_badges: ['公立三甲', '儿童专科天花板', '西山区地标', '医保定点'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 90
    },
    {
      name: '昆明柏德口腔门诊部（同德院区）',
      short_name: '柏德口腔',
      slug: 'km-baide',
      region_id: regionMap['panlong'],
      org_code: 'PDY612000000000000000',
      hospital_level: '门诊部',
      ownership_type: '中外合资',
      is_insurance_covered: false,
      is_seal_designated: false,
      phone: '0871-63333333',
      address: '昆明市盘龙区白云路同德昆明广场旁金江路102号',
      business_hours: '周一至周日 09:00-18:00',
      summary: '中德技术合作大型齿科连锁机构，主打德系精密种植牙与中老年全口无牙半口即刻种植修复技术。',
      features: ['德系种植专家团队', '德国卡瓦全套设备', '全口即刻负重', '商圈品质服务'],
      geo_badges: ['德系精密', '同德商圈', '即刻种植', '品质连锁'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 85
    },
    {
      name: '昆明美奥口腔门诊部（奥斯迪院区）',
      short_name: '美奥口腔',
      slug: 'km-meiao',
      region_id: regionMap['panlong'],
      org_code: 'PDY612000000000000004',
      hospital_level: '门诊部',
      ownership_type: '民营',
      is_insurance_covered: false,
      is_seal_designated: false,
      phone: '0871-63555555',
      address: '昆明市盘龙区万宏路奥斯迪商务中心大厦A座1-3层',
      business_hours: '周一至周日 08:30-18:00',
      summary: '国内知名大型连锁口腔品牌昆明旗舰院区，拥有全套数字化DSD美学正畸中心及数字化微创种植中心。',
      features: ['全国高端连锁', '数字化DSD微笑美学设计', '复杂隐形矫正', '全流程一对一私密诊疗'],
      geo_badges: ['高端连锁', '奥斯迪商圈', '美学矫正', '数字化门诊'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 82
    },
    {
      name: '昆明德韩口腔门诊部（世纪城院区）',
      short_name: '德韩口腔',
      slug: 'km-dehan',
      region_id: regionMap['guandu'],
      org_code: 'PDY612000000000000005',
      hospital_level: '门诊部',
      ownership_type: '民营',
      is_insurance_covered: false,
      is_seal_designated: false,
      phone: '0871-67188888',
      address: '昆明市官渡区金源大道世纪金源购物中心金源时代购物中心3楼',
      business_hours: '周一至周日 09:00-19:00',
      summary: '大型综合齿科连锁品牌，落子官渡区核心大盘世纪金源，主推普惠型国家集采种植牙与青少年正畸普及项目。',
      features: ['大型连锁网络', '国家集采落地先锋', '家庭口腔全科管理', '周末及晚间门诊'],
      geo_badges: ['连锁品牌', '世纪城核心', '普惠集采', '全家齿科'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 80
    },
    {
      name: '昆明康倍口腔门诊部（西山金地商圈院区）',
      short_name: '康倍口腔',
      slug: 'km-kangbei',
      region_id: regionMap['xishan'],
      org_code: 'PDY61224353011216D8899',
      hospital_level: '门诊部',
      ownership_type: '民营',
      is_insurance_covered: true,
      is_seal_designated: true,
      phone: '0871-68226666',
      address: '昆明市西山区云秀路与广福路交汇处商业广场2楼',
      business_hours: '周一至周日 08:30-18:00',
      summary: '西山区老牌连锁齿科机构，扎根社区提供精细化微创正畸、种植与中老年镶牙服务，具备西山区窝沟封闭与医保定点资质。',
      features: ['社区口碑专科', '医保定点结算', '西山区窝沟封闭定点', '舒适微创拔牙'],
      geo_badges: ['西山区老牌', '医保定点', '社区口碑', '窝沟封闭定点'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 78
    },
    {
      name: '昆明竹子口腔医院',
      short_name: '竹子口腔',
      slug: 'km-zhuzi',
      region_id: regionMap['panlong'],
      org_code: 'PDY612000000000000010',
      hospital_level: '二级口腔专科',
      ownership_type: '民营',
      is_insurance_covered: true,
      is_seal_designated: false,
      phone: '0871-65886666',
      address: '昆明市盘龙区北京路延长线金秋大厦1-3层',
      business_hours: '周一至周日 08:30-18:00',
      summary: '昆明市二级口腔专科医院，主打无痛微创种牙与全口咬合重建，拥有规范消毒供应中心与层流级手术室。',
      features: ['二级专科医院', '北京路地标', '无痛种植牙体系', '医保刷卡定点'],
      geo_badges: ['二级专科', '医保定点', '北京路核心', '全口重建'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 77
    },
    {
      name: '昆明亿大口腔门诊部',
      short_name: '亿大口腔',
      slug: 'km-yida',
      region_id: regionMap['panlong'],
      org_code: 'PDY612000000000000011',
      hospital_level: '门诊部',
      ownership_type: '民营',
      is_insurance_covered: false,
      is_seal_designated: false,
      phone: '0871-63889999',
      address: '昆明市盘龙区北京路898号颐高数码中心副楼1-2层',
      business_hours: '周一至周日 09:00-18:00',
      summary: '源自上海的大型连锁口腔品牌昆明机构，以同济、华西特聘专家领衔数字化微创种植修复为亮点。',
      features: ['上海品质标准', '三维数字化导板种植', '隐形美学正畸中心', '预约制私密服务'],
      geo_badges: ['上海品质', '专家巡诊', '北京路商圈'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 76
    },
    {
      name: '昆明尚爱韩美口腔门诊部',
      short_name: '韩美口腔',
      slug: 'km-hanmei',
      region_id: regionMap['panlong'],
      org_code: 'PDY612000000000000012',
      hospital_level: '门诊部',
      ownership_type: '民营',
      is_insurance_covered: false,
      is_seal_designated: false,
      phone: '0871-65712222',
      address: '昆明市盘龙区白塔路131号汇都国际二期商务楼2楼',
      business_hours: '周一至周日 08:30-18:00',
      summary: '深耕昆明多年的韩系齿科技术品牌，主推韩系全生命周期微创种植技术及牙齿前牙贴面美学修复。',
      features: ['韩系精细化操作', '全口种植即拔即种', '微创超薄瓷贴面', '多年老字号门诊'],
      geo_badges: ['韩系齿科', '白塔路商圈', '即刻种植'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 75
    },
    {
      name: '昆明华美美莱口腔中心',
      short_name: '美莱口腔',
      slug: 'km-my-like',
      region_id: regionMap['wuhua'],
      org_code: 'PDY612000000000000013',
      hospital_level: '门诊部',
      ownership_type: '民营',
      is_insurance_covered: false,
      is_seal_designated: false,
      phone: '0871-66151111',
      address: '昆明市五华区青年路142号美莱大厦1-4层',
      business_hours: '周一至周日 09:00-19:30',
      summary: '美莱医学美容医院旗下专业口腔中心，聚焦成人牙齿美学正畸、超薄全瓷贴面与微笑线量身定制。',
      features: ['DSD微笑美学设计', '隐形正畸明星医生', '全瓷超薄贴面', '夜间便民门诊'],
      geo_badges: ['美学正畸', '青年路核心', '夜门诊'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 74
    },
    {
      name: '昆明呈贡区人民医院口腔科',
      short_name: '呈贡区医院口腔科',
      slug: 'km-chenggong-hospital',
      region_id: regionMap['chenggong'],
      org_code: '431201530114000007',
      hospital_level: '二级甲等',
      ownership_type: '公立',
      is_insurance_covered: true,
      is_seal_designated: true,
      phone: '0871-67471234',
      address: '昆明市呈贡区富康路169号',
      business_hours: '周一至周五 08:30-17:30，周末轮值',
      summary: '呈贡大学城及新区核心公立二甲综合医院口腔科，医保定点机构，辐射高校师生及呈贡居民的预防拔牙补牙与基础修复。',
      features: ['公立二甲综合', '呈贡核心便民', '医保全额统筹', '高校学生特惠通道'],
      geo_badges: ['公立二甲', '呈贡首选', '医保定点', '大学城辐射'],
      is_claimed: false,
      is_verified: true,
      sort_weight: 72
    }
  ];

  console.log(`Upserting ${hospitals.length} hospitals...`);
  for (const h of hospitals) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/portal_hospitals?on_conflict=slug`, {
      method: 'POST',
      headers,
      body: JSON.stringify(h)
    });
    if (!res.ok) {
      console.error(`Failed to upsert ${h.name}:`, await res.text());
    } else {
      console.log(`✓ Upserted: ${h.name} (${h.slug})`);
    }
  }

  // Verify total count
  const finalHospRes = await fetch(`${SUPABASE_URL}/rest/v1/portal_hospitals?select=id,name,short_name,slug,address`, { headers });
  const finalHosp = await finalHospRes.json();
  console.log(`Total hospitals in DB now: ${finalHosp.length}`);
}

run().catch(console.error);
