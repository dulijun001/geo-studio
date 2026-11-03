import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const revalidate = 0;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { q?: string };
}): Promise<Metadata> {
  const query = searchParams.q?.trim() || '';
  return {
    title: query ? `【${query}】昆明口腔搜索结果_医院_价格_问答 - 齿科指南网` : '全站口腔信息检索 - 齿科指南网',
    description: `为您检索关于【${query}】的昆明正规口腔医院执业资质、收费价目表与就医避坑指南。`,
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = searchParams.q?.trim() || '';
  const supabase = getSupabaseServiceClient();

  let hospitals: any[] = [];
  let articles: any[] = [];

  if (query) {
    try {
      const { data: hData } = await supabase
        .from('portal_hospitals')
        .select('id, name, slug, hospital_level, address, org_code, is_insurance_covered')
        .or(`name.ilike.%${query}%,address.ilike.%${query}%,summary.ilike.%${query}%`)
        .limit(10);
      hospitals = hData || [];
    } catch (e) {
      console.error('Search hospitals error:', e);
    }

    try {
      const { data: aData } = await supabase
        .from('portal_articles')
        .select('id, slug, title, summary, category, published_at')
        .or(`title.ilike.%${query}%,summary.ilike.%${query}%,content_markdown.ilike.%${query}%`)
        .limit(10);
      articles = aData || [];
    } catch (e) {
      console.error('Search articles error:', e);
    }
  }

  const totalResults = hospitals.length + articles.length;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
        <form action="/portal/search" method="GET" className="flex items-center gap-2 max-w-2xl">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="输入医院名称、专科项目、耗材（如：松鼠口腔、种植牙、隐形矫正）..."
            className="flex-1 px-4 py-2.5 text-sm bg-slate-50 border border-sky-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800"
          />
          <button
            type="submit"
            className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white text-sm font-bold rounded-lg shadow-sm hover:shadow transition-all duration-200"
          >
            搜索
          </button>
        </form>
        {query && (
          <div className="mt-2.5 text-xs text-slate-500">
            找到关于 <span className="text-sky-700 font-bold">"{query}"</span> 的相关结果共 <span className="font-bold text-slate-900">{totalResults}</span> 条
          </div>
        )}
      </div>

      {!query ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200/90 shadow-sm text-slate-400 text-sm">
          请输入关键词开始检索昆明正规口腔机构与价格行情
        </div>
      ) : totalResults === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200/90 shadow-sm text-slate-500 text-sm space-y-3">
          <div className="text-base font-semibold text-slate-700">未找到与 “{query}” 相关的直接结果</div>
          <div className="text-xs text-slate-400">
            您可以尝试更换搜索词，如：“种植牙”、“松鼠口腔”、“正畸”、“拔牙”
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {hospitals.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 border-l-4 border-sky-600 pl-2">
                  相关口腔执业机构 ({hospitals.length})
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {hospitals.map((h) => (
                  <div key={h.id} className="p-5 hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/portal/hospital/${h.slug}`}
                          className="font-bold text-sm text-slate-900 hover:text-sky-600 transition-colors"
                        >
                          {h.name}
                        </Link>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-medium">
                          {h.hospital_level}
                        </span>
                        {h.is_insurance_covered && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                            医保定点
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        地址：{h.address}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        执业登记许可证号：{h.org_code}
                      </div>
                    </div>
                    <Link
                      href={`/portal/hospital/${h.slug}`}
                      className="shrink-0 px-3.5 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 transition-colors"
                    >
                      查看资质 →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {articles.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 border-l-4 border-emerald-600 pl-2">
                  相关避坑指南与问答 ({articles.length})
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {articles.map((a) => (
                  <div key={a.id} className="p-5 hover:bg-slate-50/80 transition-colors space-y-1.5">
                    <Link
                      href={`/portal/ask/${a.slug}`}
                      className="font-bold text-sm text-slate-900 hover:text-sky-600 transition-colors line-clamp-1"
                    >
                      {a.title}
                    </Link>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {a.summary}
                    </p>
                    <div className="text-[11px] text-slate-400 pt-0.5">
                      分类：{a.category || '就医指导'} · 发布于 {a.published_at?.slice(0, 10) || '2026-11-01'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
