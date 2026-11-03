import fs from 'node:fs';

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
  'Prefer': 'return=representation'
};

async function seedPrices() {
  console.log('Seeding portal_price_indexes & portal_hospital_prices...');

  // 1. Define 22 dental core price indexes
  const priceIndexes = [
    // 1. 种植牙系列 (Implant)
    {
      category: 'implant',
      category_name: '口腔种植',
      item_name: '韩国登腾种植牙集采全包套餐',
      brand: '韩国登腾 Dentium',
      price_min: 1980,
      price_max: 2980,
      price_unit: '颗',
      is_procurement: true,
      included_items: ['数字化CBCT三维拍片', '韩国登腾纯钛植体', '原厂标准基台', '爱尔创全瓷牙冠', '种植手术费', '终身质保'],
      guidance_desc: '国家种植牙集采执行重点项目，全包一口价，高性价比首选。',
      sort_weight: 100
    },
    {
      category: 'implant',
      category_name: '口腔种植',
      item_name: '韩国奥齿泰种植牙集采套餐',
      brand: '韩国奥齿泰 Osstem',
      price_min: 2480,
      price_max: 3580,
      price_unit: '颗',
      is_procurement: true,
      included_items: ['三维口扫数字化设计', '韩国奥齿泰GSIII植体', '原厂纯钛基台', '爱尔创全瓷牙冠', '微创手术费'],
      guidance_desc: '亚洲人骨质特性设计植体，稳定性极佳，临床使用量巨大。',
      sort_weight: 95
    },
    {
      category: 'implant',
      category_name: '口腔种植',
      item_name: '美国皓圣Hiossen种植牙微创套餐',
      brand: '美国皓圣 Hiossen',
      price_min: 3680,
      price_max: 4980,
      price_unit: '颗',
      is_procurement: true,
      included_items: ['术前数字化CBCT', '皓圣纯钛植体', '原厂精密基台', '德国威兰德全瓷冠', '终身维护保修'],
      guidance_desc: '兼具骨结合速度与初期稳定性，适合拔牙后即刻种植及骨量正常人群。',
      sort_weight: 90
    },
    {
      category: 'implant',
      category_name: '口腔种植',
      item_name: '瑞士ITI Straumann亲水种植牙高品质套餐',
      brand: '瑞士士卓曼 ITI',
      price_min: 5800,
      price_max: 8800,
      price_unit: '颗',
      is_procurement: true,
      included_items: ['数字化3D动态导航', '瑞士ITI亲水纯钛植体', '原厂解剖基台', '德国威兰德全瓷牙冠', '专家种植手术费', '终身质保'],
      guidance_desc: '全球种植牙天花板，SLActive亲水表面技术，骨结合仅需3-4周，高龄与糖尿病患者优选。',
      sort_weight: 88
    },
    {
      category: 'implant',
      category_name: '口腔种植',
      item_name: '瑞典诺贝尔Nobel微创种植牙旗舰套餐',
      brand: '瑞典诺贝尔 Nobel Biocare',
      price_min: 6800,
      price_max: 9800,
      price_unit: '颗',
      is_procurement: true,
      included_items: ['全套三维种植导板设计', 'Nobel PMC/PCC纯钛植体', '原厂高精基台', '泽康/Lava氧化锆全瓷冠', '终身免费质保'],
      guidance_desc: '现代种植牙开创者，TiUnite钛易耐表面处理，长期存留率领先。',
      sort_weight: 85
    },
    {
      category: 'implant',
      category_name: '口腔种植',
      item_name: 'All-on-4半口即刻种植修复套餐',
      brand: '瑞士ITI / 韩国登腾',
      price_min: 35000,
      price_max: 58000,
      price_unit: '程',
      is_procurement: true,
      included_items: ['全口CBCT与骨密度重建', '4颗集采特制纯钛植体', '即刻负重全瓷连桥冠', '当天戴牙恢复进食功能'],
      guidance_desc: '半口/全口无牙颌或重度牙周炎患者当天微创手术即刻恢复咀嚼。',
      sort_weight: 82
    },

    // 2. 牙齿矫正系列 (Orthodontics)
    {
      category: 'orthodontics',
      category_name: '牙齿矫正',
      item_name: '传统金属托槽正畸套餐',
      brand: '普特/新亚',
      price_min: 4999,
      price_max: 6999,
      price_unit: '程',
      is_procurement: false,
      included_items: ['数字化头颅侧位测量', '传统金属托槽', '全套正畸钢丝与结扎丝', '全程复诊调牙', '透明保持器一副'],
      guidance_desc: '经典高性价比正畸方案，矫治力充足，适应证极为广泛。',
      sort_weight: 80
    },
    {
      category: 'orthodontics',
      category_name: '牙齿矫正',
      item_name: '金属自锁托槽轻力矫正套餐',
      brand: '进口Damon Q / 国产欧晴',
      price_min: 7800,
      price_max: 11800,
      price_unit: '程',
      is_procurement: false,
      included_items: ['3D数字化口扫印模', '自锁金属托槽', '低摩擦力澳丝与热激活丝', '复诊调整', '保持器一副'],
      guidance_desc: '摩擦力极小、疼痛轻微、复诊周期延长至8-10周一次，学生与白领首选。',
      sort_weight: 78
    },
    {
      category: 'orthodontics',
      category_name: '牙齿矫正',
      item_name: '陶瓷半隐形自锁托槽矫正套餐',
      brand: '3M Clarity / 普特陶瓷',
      price_min: 10800,
      price_max: 14800,
      price_unit: '程',
      is_procurement: false,
      included_items: ['头影侧位分析与方案设计', '单晶透明陶瓷托槽', '美学覆白钢丝', '全程复诊调校', '保持器一副'],
      guidance_desc: '色泽与牙齿天然颜色浑然一体，兼具隐形美观与固定矫正的高效控根。',
      sort_weight: 75
    },
    {
      category: 'orthodontics',
      category_name: '牙齿矫正',
      item_name: '时代天使隐形矫正标准版',
      brand: '时代天使 Angelalign Standard',
      price_min: 13800,
      price_max: 19800,
      price_unit: '程',
      is_procurement: false,
      included_items: ['iTero 3D口扫取模', 'masterControl高分子双膜牙套', '全套复诊监控', '排牙动态预览', '保持器两副'],
      guidance_desc: '国民隐形矫正明星单品，计算机全数字化推演移动路径，近乎全隐形美观。',
      sort_weight: 73
    },
    {
      category: 'orthodontics',
      category_name: '牙齿矫正',
      item_name: '时代天使隐形矫正双模冠军版',
      brand: '时代天使 Angelalign Pro',
      price_min: 21800,
      price_max: 29800,
      price_unit: '程',
      is_procurement: false,
      included_items: ['数字化颌骨三维模拟', '薄厚双膜交替矫治器', '主治医师全程亲诊', '阶段精细调整', '保持器两副'],
      guidance_desc: '7天薄膜柔和启动+3天厚膜精准控根，适合拔牙矫正与复杂深覆合错颌畸形。',
      sort_weight: 70
    },
    {
      category: 'orthodontics',
      category_name: '牙齿矫正',
      item_name: '美国隐适美Invisalign隐形矫正套餐',
      brand: '隐适美 Invisalign System',
      price_min: 25800,
      price_max: 38800,
      price_unit: '程',
      is_procurement: false,
      included_items: ['iTero 5D口扫即刻成效模拟', 'SmartTrack专利医用高分子膜片', '正畸黑钻/特聘专家方案设计', '全套牙套与保持器'],
      guidance_desc: '全球隐形矫正宗师级品牌，佩戴贴合度极高，复杂错颌控制精准稳定。',
      sort_weight: 68
    },

    // 3. 补牙与牙体牙髓修复 (Restore)
    {
      category: 'restore',
      category_name: '补牙修复',
      item_name: '美国3M纳米树脂补牙Z250型',
      brand: '3M ESPE Filtek Z250',
      price_min: 120,
      price_max: 260,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['龋坏组织探查与去腐', '酸蚀与粘结剂涂布', '3M微杂化复合树脂充填', '光固化与解剖形态雕刻'],
      guidance_desc: '入门级高性价比树脂，抗压强度高，适用于前牙与后牙轻度浅龋。',
      sort_weight: 65
    },
    {
      category: 'restore',
      category_name: '补牙修复',
      item_name: '美国3M纳米微球树脂补牙Z350高端型',
      brand: '3M ESPE Filtek Z350XT',
      price_min: 180,
      price_max: 380,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['橡皮障隔离防污染', '龋损微创清理', '真正纳米级树脂多层充填', '精细调合与抛光镜面处理'],
      guidance_desc: '真正纳米粒子技术，光泽持久度极佳，色泽天然逼真，补牙首选推荐。',
      sort_weight: 63
    },
    {
      category: 'restore',
      category_name: '补牙修复',
      item_name: '前牙美学分层纳米树脂充填修复',
      brand: '义获嘉伟瓦登特 / 3M',
      price_min: 380,
      price_max: 680,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['天然牙比色分析', '牙釉质/牙本质分层仿真充填', '切端透光层雕塑', '高精抛光套装研磨'],
      guidance_desc: '前牙切角缺损、门牙缝隙黑三角等高美学要求区域的微创仿生充填。',
      sort_weight: 60
    },
    {
      category: 'restore',
      category_name: '补牙修复',
      item_name: '显微根管治疗（前牙单根管）',
      brand: '蔡司/徕卡牙科显微镜',
      price_min: 480,
      price_max: 800,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['数字化牙片辅助定位', '德国光学显微镜下根管探查', '镍钛根管机扩马达预备', '热牙胶三维致密充填'],
      guidance_desc: '在显微镜放大20倍视野下彻底清除感染牙髓组织，杜绝遗漏变异侧支根管。',
      sort_weight: 58
    },
    {
      category: 'restore',
      category_name: '补牙修复',
      item_name: '显微根管治疗（后磨牙多根管复杂）',
      brand: '蔡司/徕卡牙科显微镜',
      price_min: 880,
      price_max: 1680,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['CBCT三维三维解剖评估', '多根管显微疏通与超声荡洗', '氢氧化钙暂封封药消毒', '热牙胶三维连续波充填'],
      guidance_desc: '针对后磨牙3-4个弯曲或钙化根管的高难度保牙治疗，挽救天然真牙最后屏障。',
      sort_weight: 55
    },
    {
      category: 'restore',
      category_name: '补牙修复',
      item_name: '国产爱尔创全瓷牙冠修复',
      brand: '爱尔创 Upcera',
      price_min: 980,
      price_max: 1580,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['数字化口扫精准取模', 'CAD/CAM智能切削', '二氧化锆全瓷冠', '专用树脂粘结', '5年原厂质保'],
      guidance_desc: '不含任何金属成分，不影响核磁共振与CT检查，牙龈边缘绝无黑线。',
      sort_weight: 53
    },
    {
      category: 'restore',
      category_name: '补牙修复',
      item_name: '德国威兰德全瓷牙冠高端修复',
      brand: '德国威兰德 Wieland Zenostar',
      price_min: 1800,
      price_max: 2800,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['高精比色板定色', '微创牙体预备', '威兰德高透纯氧化锆冠', '永久粘结与咬合调校', '终身质保'],
      guidance_desc: '德系超高抗弯折强度（>1200MPa），后牙受力咀嚼坚固耐磨。',
      sort_weight: 50
    },

    // 4. 微创拔牙与外科 (Extraction)
    {
      category: 'extraction',
      category_name: '微创拔牙',
      item_name: '上颌正位萌出智齿拔除',
      brand: '无痛微创器械',
      price_min: 200,
      price_max: 450,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['局麻浸润浸润镇痛', '微创牙挺松动分离', '完整拔除', '棉球压迫止血与术后医嘱'],
      guidance_desc: '解剖结构标准的正位智齿微创快速拔除，创伤微小恢复快。',
      sort_weight: 48
    },
    {
      category: 'extraction',
      category_name: '微创拔牙',
      item_name: '下颌完全阻生智齿微创超声骨刀拔除',
      brand: '微创超声骨刀 / 进口气动仰角机头',
      price_min: 450,
      price_max: 1380,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['三维CBCT确定下牙槽神经管距离', 'STA电脑控制无痛局麻', '超声骨刀微创去骨分牙', '微创拔除', '可吸收缝线对位缝合'],
      guidance_desc: '针对近中水平倾斜或骨埋伏阻生复杂智齿，拒绝传统敲击震荡，保护神经血管。',
      sort_weight: 45
    },

    // 5. 儿童齿科与预防 (Pediatrics & Periodontics)
    {
      category: 'pediatrics',
      category_name: '儿童齿科',
      item_name: '儿童全口防龋涂氟套餐',
      brand: '德国高露洁 / 多乐氟 Duraphat',
      price_min: 50,
      price_max: 120,
      price_unit: '次',
      is_procurement: false,
      included_items: ['全口乳牙健康检查与龋病风险评估', '牙面软垢清洁与隔湿', '医用高浓度氟保护漆全口涂布', '家长口腔防龋指导'],
      guidance_desc: '每3-6个月规范涂布一次，促进牙面再矿化，抑制致龋变异链球菌滋生。',
      sort_weight: 40
    },
    {
      category: 'pediatrics',
      category_name: '儿童齿科',
      item_name: '适龄儿童第一恒磨牙窝沟封闭',
      brand: '3M Clinpro / 卡瓦',
      price_min: 60,
      price_max: 150,
      price_unit: '颗',
      is_procurement: false,
      included_items: ['6-8岁六龄齿萌出排查', '微创窝沟清洁与酸蚀', '进口光固化高流动性树脂封闭剂注入', '光固化照合与咬合检查'],
      guidance_desc: '国家重大公共卫生推荐项目，为后牙天然深窝沟建立物理防护铠甲，松鼠口腔定点可免/普惠。',
      sort_weight: 38
    },
    {
      category: 'periodontics',
      category_name: '牙周洁治',
      item_name: '超声波舒适洁牙+全口抛光护理',
      brand: '瑞士EMS舒适洁治机',
      price_min: 68,
      price_max: 198,
      price_unit: '次',
      is_procurement: false,
      included_items: ['一次性无菌器械盘', '超声波龈上牙结石清洁', '牙面色素菌斑清除', '牙面氧化铝膏细腻抛光'],
      guidance_desc: '基础口腔卫生维护核心项目，预防牙龈红肿出血及牙周炎骨质吸收。',
      sort_weight: 35
    }
  ];

  console.log(`Checking existing price indexes... Total to ensure: ${priceIndexes.length}`);
  
  // Clean or upsert price indexes
  // Fetch existing indexes first to map by item_name
  const curIndexesRes = await fetch(`${SUPABASE_URL}/rest/v1/portal_price_indexes?select=id,item_name`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  });
  const curIndexes = await curIndexesRes.json();
  const curMap: Record<string, string> = {};
  curIndexes.forEach((ci: any) => {
    curMap[ci.item_name] = ci.id;
  });

  const finalIndexMap: Record<string, string> = {};

  for (const item of priceIndexes) {
    if (curMap[item.item_name]) {
      // Update
      const id = curMap[item.item_name];
      finalIndexMap[item.item_name] = id;
      await fetch(`${SUPABASE_URL}/rest/v1/portal_price_indexes?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(item)
      });
      console.log(`✓ Updated index: ${item.item_name}`);
    } else {
      // Insert
      const insRes = await fetch(`${SUPABASE_URL}/rest/v1/portal_price_indexes`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(item)
      });
      const insData = await insRes.json();
      finalIndexMap[item.item_name] = insData[0].id;
      console.log(`+ Inserted index: ${item.item_name}`);
    }
  }

  // 2. Fetch all hospitals to populate hospital_prices table
  const hospRes = await fetch(`${SUPABASE_URL}/rest/v1/portal_hospitals?select=id,slug,name,hospital_level`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  });
  const allHospitals = await hospRes.json();
  console.log(`Fetched ${allHospitals.length} hospitals for price generation.`);

  // Clear existing portal_hospital_prices to re-link freshly
  await fetch(`${SUPABASE_URL}/rest/v1/portal_hospital_prices?hospital_id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  });
  console.log('Cleaned old portal_hospital_prices.');

  // For each hospital, insert representative pricing for common items
  const hospitalPricesToInsert: any[] = [];

  for (const h of allHospitals) {
    const isSongshu = h.slug === 'km-songshu';
    const isPublicTop = ['km-yn-dental', 'km-yd-dental', 'km-kunhua-dental', 'km-child-dental'].includes(h.slug);
    const isHighEnd = ['km-baide', 'km-meiao'].includes(h.slug);

    for (const item of priceIndexes) {
      const indexId = finalIndexMap[item.item_name];
      if (!indexId) continue;

      let priceVal = item.price_min;
      let priceOrigin: number | null = item.price_max;
      let note = '院内集采执行价，透明全包';

      if (isSongshu) {
        // Songshu: competitive transparent pricing, full warranty
        priceVal = item.price_min;
        priceOrigin = item.price_max;
        if (item.category === 'implant') {
          note = '集采一口价，含CBCT拍片+植体+原厂基台+全瓷冠+终身质保';
        } else if (item.category === 'orthodontics') {
          note = '免费iTero口扫体验，赠两副原装保持器，分期无压力';
        } else if (item.category === 'restore') {
          note = '3M纳米树脂首颗补贴特惠，橡皮障无菌充填';
        } else if (item.category === 'pediatrics') {
          note = '西山区定点窝沟封闭单位，儿牙趣味化看诊';
        }
      } else if (isPublicTop) {
        // Public top: higher standard pricing due to registration/guidelines
        priceVal = Math.round(item.price_min * 1.15);
        priceOrigin = Math.round(item.price_max * 1.1);
        note = '公立三甲医疗服务指导价，可走医保统筹结算';
      } else if (isHighEnd) {
        // Baide / Meiao: premium clinic pricing
        priceVal = Math.round(item.price_min * 1.25);
        priceOrigin = Math.round(item.price_max * 1.3);
        note = '高端商圈专科门诊，德系/进口设备一对一私密诊室';
      } else {
        // Other clinics
        priceVal = Math.round(item.price_min * 1.05);
        priceOrigin = item.price_max;
        note = '门诊惠民执行价';
      }

      hospitalPricesToInsert.push({
        hospital_id: h.id,
        price_index_id: indexId,
        price_val: priceVal,
        price_origin: priceOrigin,
        price_note: note,
        is_active: true
      });
    }
  }

  console.log(`Inserting ${hospitalPricesToInsert.length} hospital price mappings...`);
  // Insert in batches of 50
  for (let i = 0; i < hospitalPricesToInsert.length; i += 50) {
    const chunk = hospitalPricesToInsert.slice(i, i + 50);
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/portal_hospital_prices`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chunk)
    });
    if (!insRes.ok) {
      console.error('Failed chunk insert:', await insRes.text());
    } else {
      console.log(`✓ Inserted batch ${i / 50 + 1} (${chunk.length} items)`);
    }
  }

  // Count check
  const totalPricesRes = await fetch(`${SUPABASE_URL}/rest/v1/portal_hospital_prices?select=count`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  });
  console.log('Final portal_hospital_prices count:', await totalPricesRes.json());
}

seedPrices().catch(console.error);
