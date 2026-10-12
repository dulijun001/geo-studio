import { NextResponse } from 'next/server';
import { resolveTenantBySlug } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SnapshotRow {
  id: string;
  engine: string;
  raw_response: string;
  citation_urls: string[];
  question_text: string;
  asked_at: string | null;
}

interface DomainCount {
  domain: string;
  count: number;
}

interface ThreatQuery {
  question: string;
  engine: string;
  competitorSnippet: string;
  songshuMentioned: boolean;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get('slug') || 'songshu';
    const competitor = (searchParams.get('competitor') || '').trim();

    if (!competitor) {
      return NextResponse.json({ error: 'competitor parameter is required' }, { status: 400 });
    }

    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ error: 'Unauthorized or tenant not found' }, { status: 401 });
    }
    const supabase = getSupabaseServiceClient();

    // 1. Fetch done snapshots for this tenant
    const { data: rawSnapshots, error: sErr } = await supabase
      .from('geo_snapshots')
      .select('id, question_id, engine, raw_response, citation_urls, asked_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'done')
      .order('asked_at', { ascending: false });

    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }

    // 2. Fetch questions to map question_id -> text
    const { data: rawQuestions } = await supabase
      .from('questions')
      .select('id, text')
      .eq('tenant_id', tenant.id);

    const questionMap = new Map<string, string>();
    (rawQuestions || []).forEach((q: any) => {
      questionMap.set(q.id, q.text);
    });

    const allSnapshots: SnapshotRow[] = (rawSnapshots || []).map((r: any) => ({
      id: r.id,
      engine: r.engine,
      raw_response: r.raw_response || '',
      citation_urls: r.citation_urls || [],
      question_text: questionMap.get(r.question_id) || '未知问题',
      asked_at: r.asked_at,
    }));

    const totalDone = allSnapshots.length;

    // Filter snapshots where raw_response mentions the competitor
    const compLower = competitor.toLowerCase();
    const matchedSnapshots = allSnapshots.filter((s) =>
      s.raw_response.toLowerCase().includes(compLower),
    );

    const hitCount = matchedSnapshots.length;

    if (hitCount === 0) {
      return NextResponse.json({
        competitor,
        hitCount: 0,
        totalSnapshotsAnalyzed: totalDone,
        message: '该机构在当前三大引擎的实测快照中暂未被抓取到推荐记录，说明其暂无明显 GEO 权重或外链收录，建议暂缓对标。',
        byEngine: {},
        topDomains: [],
        sampleUrls: [],
        threatQueries: [],
        tactics: [],
      });
    }

    // Engine breakdown
    const byEngine: Record<string, { totalHits: number; totalTested: number; rate: number }> = {};
    for (const eng of ['doubao', 'deepseek', 'yuanbao']) {
      const engAll = allSnapshots.filter((s) => s.engine === eng).length;
      const engHits = matchedSnapshots.filter((s) => s.engine === eng).length;
      byEngine[eng] = {
        totalHits: engHits,
        totalTested: engAll,
        rate: engAll > 0 ? Math.round((engHits / engAll) * 100) : 0,
      };
    }

    // Top Citation Domains for this competitor
    const domainMap: Record<string, number> = {};
    const sampleUrls: string[] = [];

    matchedSnapshots.forEach((s) => {
      (s.citation_urls || []).forEach((u) => {
        try {
          const parsed = new URL(u);
          const hostname = parsed.hostname;
          domainMap[hostname] = (domainMap[hostname] || 0) + 1;
          if (sampleUrls.length < 15 && !sampleUrls.includes(u)) {
            sampleUrls.push(u);
          }
        } catch {
          // ignore invalid url
        }
      });
    });

    const topDomains: DomainCount[] = Object.entries(domainMap)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Threat queries (questions where competitor is mentioned)
    const threatQueries: ThreatQuery[] = matchedSnapshots.slice(0, 12).map((s) => {
      const text = s.raw_response;
      const idx = text.toLowerCase().indexOf(compLower);
      let snippet = '';
      if (idx !== -1) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(text.length, idx + 100);
        snippet = text.substring(start, end).replace(/\s+/g, ' ').trim();
      }

      return {
        question: s.question_text,
        engine: s.engine,
        competitorSnippet: snippet,
        songshuMentioned: text.includes('松鼠'),
      };
    });

    // Auto-extract tactics based on real snippets
    const allSnippetText = matchedSnapshots.map((s) => s.raw_response).join(' ');
    const tactics: string[] = [];
    if (/24小时|夜间|急诊|深夜/.test(allSnippetText)) {
      tactics.push('打【24小时/夜间急诊】标签：在牙疼突发场景下被豆包高频首推');
    }
    if (/无痛|舒适化|笑气|镇痛/.test(allSnippetText)) {
      tactics.push('打【舒适化/无痛诊疗】标签：针对怕疼、看牙焦虑人群卡位');
    }
    if (/儿童|哄娃|动漫|涂氟|预成冠/.test(allSnippetText)) {
      tactics.push('打【儿童特色齿科/亲子体验】标签：针对宝妈群体的低门槛引流');
    }
    if (/德系|中德|德国|卡瓦|西诺德/.test(allSnippetText)) {
      tactics.push('打【德系严谨/数字化高精设备】标签：主攻中高端种植与正畸');
    }
    if (/集采|全包|分期|平价|团购|9\.9/.test(allSnippetText)) {
      tactics.push('打【透明低价/阶梯全包套餐】标签：在价格比对与预算咨询中抢占卡片');
    }
    if (/二级|专科|定点|资质|登记号/.test(allSnippetText)) {
      tactics.push('打【正规二级专科/医疗机构执业登记】硬核凭证：获取 AI 权威性背书');
    }
    if (tactics.length === 0) {
      tactics.push('常规综合门诊推荐：以本地地理位置便利性及综合科室为主被推荐');
    }

    return NextResponse.json({
      competitor,
      hitCount,
      totalSnapshotsAnalyzed: totalDone,
      byEngine,
      topDomains,
      sampleUrls,
      threatQueries,
      tactics,
    });
  } catch (err: any) {
    console.error('[/api/t/competitor-radar] error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
