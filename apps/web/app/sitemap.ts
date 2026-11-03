import type { MetadataRoute } from 'next';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://guide.ynsskq.cn';
  const now = new Date();

  // 1. 静态主路由
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/portal`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/portal/hospital`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/portal/hospital/km-songshu`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/portal/doctor`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/portal/doctor/han-yi`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/portal/doctor/liu-yanting`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/portal/cases`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/portal/cases/adolescent-skeletal-underbite`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/portal/cases/adult-invisalign-bimaxillary-protrusion`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/portal/cases/all-on-4-full-mouth-immediate-load`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/portal/cases/anterior-aesthetic-porcelain-veneers`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/portal/reviews`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/portal/price/implant`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/portal/price/ortho`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/portal/price/filling`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/portal/price/general`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
  ];

  // 2. 动态拉取文章列表
  let articleRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = getSupabaseServiceClient();
    const { data: articles } = await supabase
      .from('portal_articles')
      .select('slug, updated_at, published_at')
      .limit(500);

    if (articles && articles.length > 0) {
      articleRoutes = articles.map((art) => ({
        url: `${baseUrl}/portal/ask/${art.slug}`,
        lastModified: art.updated_at ? new Date(art.updated_at) : (art.published_at ? new Date(art.published_at) : now),
        changeFrequency: 'weekly',
        priority: 0.8,
      }));
    }
  } catch (e) {
    console.error('Failed to fetch articles for sitemap:', e);
  }

  return [...staticRoutes, ...articleRoutes];
}
