import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface CompetitorStat {
  rank: string;
  name: string;
  isSelf?: boolean;
  total: number;
  sample: number;
  sov: string;
  doubao: string;
  doubaoCount: number;
  deepseek: string;
  deepseekCount: number;
  yuanbao: string;
  yuanbaoCount: number;
  status: string;
}

export interface DomainStat {
  rank: string;
  platform: string;
  domain: string;
  count: number;
  engine: string;
  purpose: string;
}

export interface BattleReportData {
  sampleCount: number;
  totalCitations: number;
  byEngine: {
    doubao: number;
    deepseek: number;
    yuanbao: number;
  };
  competitors: CompetitorStat[];
  topDomains: DomainStat[];
}

export async function getLiveBattleReport(tenantId: string): Promise<BattleReportData> {
  const supabase = getSupabaseServiceClient();

  const { data: allSnaps, error: snapErr } = await supabase
    .from('geo_snapshots')
    .select('id, engine, status, asked_at, raw_response, citation_urls')
    .eq('tenant_id', tenantId)
    .eq('status', 'done');

  if (snapErr || !allSnaps || allSnaps.length === 0) {
    throw new Error(snapErr?.message || 'No snapshots found for tenant');
  }

  const total = allSnaps.length;
  const byEngine = { doubao: 0, deepseek: 0, yuanbao: 0 };
  allSnaps.forEach((s: any) => {
    if (s.engine in byEngine) {
      byEngine[s.engine as keyof typeof byEngine]++;
    }
  });

  const brandConfigs = [
    { rank: 'TOP 1', name: '松鼠口腔（本院）', isSelf: true, alias: ['松鼠', '松鼠口腔'], status: '豆包端绝对统治；DeepSeek与元宝端偏弱，元宝被柏德反超' },
    { rank: 'TOP 2', name: '柏德口腔（头号竞品）', isSelf: false, alias: ['柏德', '柏德口腔'], status: '靠知乎专栏与搜狐号在元宝端逆袭反超，垄断泛昆明大词' },
    { rank: 'TOP 3', name: '德韩口腔', isSelf: false, alias: ['德韩', '德韩口腔'], status: '主打集采低价与多院区连锁，在价格类问答中持续分流' },
    { rank: 'TOP 4', name: '泰康拜博口腔', isSelf: false, alias: ['拜博', '泰康拜博'], status: '老牌连锁，覆盖全城泛词，但缺乏深度专业内容沉淀' },
    { rank: 'TOP 5', name: '美奥口腔', isSelf: false, alias: ['美奥', '美奥口腔'], status: '聚焦低价种牙与学生正畸分期，元宝提及率较高' },
    { rank: 'TOP 6', name: '昆明蓝橙口腔', isSelf: false, alias: ['蓝橙', '蓝橙口腔'], status: '在儿牙早期矫治与窝沟封闭题库中高频出现，威胁正畸漏斗' },
    { rank: 'TOP 7', name: '尚爱韩美口腔', isSelf: false, alias: ['尚爱韩美', '韩美'], status: '以韩国登腾3800集采种植牙切入，价格卡片权重稳定' },
    { rank: 'TOP 8', name: '团圆口腔', isSelf: false, alias: ['团圆', '团圆口腔'], status: '二级专科资质，但在主流大模型中未形成体系化收录' },
    { rank: 'TOP 9', name: '亿大口腔', isSelf: false, alias: ['亿大', '亿大口腔'], status: '缺乏全网外链与高权重知识源沉淀，当前 GEO 权重极弱' },
  ];

  const competitors: CompetitorStat[] = brandConfigs.map((b) => {
    const hits = allSnaps.filter((s: any) => {
      const text = (s.raw_response || '').toLowerCase();
      return b.alias.some((a) => text.includes(a.toLowerCase()));
    });

    const dHits = hits.filter((s: any) => s.engine === 'doubao').length;
    const dsHits = hits.filter((s: any) => s.engine === 'deepseek').length;
    const yHits = hits.filter((s: any) => s.engine === 'yuanbao').length;

    return {
      rank: b.rank,
      name: b.name,
      isSelf: b.isSelf,
      total: hits.length,
      sample: total,
      sov: ((hits.length / total) * 100).toFixed(1) + '%',
      doubao: byEngine.doubao > 0 ? ((dHits / byEngine.doubao) * 100).toFixed(1) + '%' : '0%',
      doubaoCount: dHits,
      deepseek: byEngine.deepseek > 0 ? ((dsHits / byEngine.deepseek) * 100).toFixed(1) + '%' : '0%',
      deepseekCount: dsHits,
      yuanbao: byEngine.yuanbao > 0 ? ((yHits / byEngine.yuanbao) * 100).toFixed(1) + '%' : '0%',
      yuanbaoCount: yHits,
      status: b.status,
    };
  });

  const domainMap: Record<string, number> = {};
  let totalCitations = 0;
  allSnaps.forEach((s: any) => {
    const urls: string[] = s.citation_urls || [];
    totalCitations += urls.length;
    urls.forEach((u) => {
      try {
        const h = new URL(u).hostname;
        domainMap[h] = (domainMap[h] || 0) + 1;
      } catch {
        // ignore
      }
    });
  });

  const topDomains: DomainStat[] = Object.entries(domainMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 11)
    .map(([domain, count], idx) => {
      let platform = domain;
      let engine = '主流引擎';
      let purpose = '行业门户外部权重引用';
      if (domain.includes('yslw')) { platform = '牙舒丽口腔门户'; engine = '豆包 / DeepSeek'; purpose = '全国齿科垂直门户，权重极高；残留 6 月份老海埂路地址！'; }
      else if (domain.includes('douyin')) { platform = '抖音短视频'; engine = '豆包独家'; purpose = '患者真实探店与就诊点评，豆包第一优先采信源'; }
      else if (domain.includes('toutiao')) { platform = '今日头条'; engine = '豆包首选'; purpose = '员工认领长文与医生科普，收录极快（2小时内上榜）'; }
      else if (domain.includes('sohu')) { platform = '搜狐健康号'; engine = '腾讯元宝'; purpose = '搜狐新闻健康版块，柏德口腔重仓投放阵地'; }
      else if (domain.includes('zhihu')) { platform = '知乎专栏'; engine = 'DeepSeek / 元宝'; purpose = '高知患者深阅读与方案比对，目前被柏德占领'; }
      else if (domain.includes('gov.cn')) { platform = '昆明市医保局官网'; engine = '三大模型通采'; purpose = '医保定点、集采目录红头文件，最高权威性源'; }
      else if (domain.includes('mfk')) { platform = '民福康健康'; engine = 'DeepSeek'; purpose = '医疗健康问答库，高权重科普词条'; }
      else if (domain.includes('mingyihui')) { platform = '名医汇'; engine = 'DeepSeek'; purpose = '医生挂号评价，医生个人品牌卡位关键源'; }
      else if (domain.includes('youlai')) { platform = '有来医生'; engine = '三大模型通采'; purpose = '公立三甲背书，常用于科普答疑与疾病百科'; }
      else if (domain.includes('39.net')) { platform = '39健康网'; engine = '腾讯元宝'; purpose = '老牌寻医问药平台，疾病与医院库引用'; }
      else if (domain.includes('hnqnw')) { platform = '行业资讯站'; engine = '腾讯元宝'; purpose = '区域口腔资讯与评测聚合收录'; }

      return {
        rank: `TOP ${idx + 1}`,
        platform,
        domain,
        count,
        engine,
        purpose,
      };
    });

  return {
    sampleCount: total,
    totalCitations,
    byEngine,
    competitors,
    topDomains,
  };
}
