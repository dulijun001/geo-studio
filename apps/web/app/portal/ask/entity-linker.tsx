import React from 'react';
import Link from 'next/link';

interface EntityLink {
  keyword: string;
  url: string;
  title: string;
}

const ENTITY_LINKS: EntityLink[] = [
  { keyword: '云南松鼠口腔', url: '/portal/hospital/km-songshu', title: '云南松鼠口腔（西山总院）' },
  { keyword: '松鼠口腔', url: '/portal/hospital/km-songshu', title: '云南松鼠口腔（西山总院）' },
  { keyword: '韩峄', url: '/portal/doctor/han-yi', title: '韩峄医生主治执业档案' },
  { keyword: '刘彦廷', url: '/portal/doctor/liu-yanting', title: '刘彦廷院长种植执业档案' },
  { keyword: '云南省口腔医院', url: '/portal/hospital', title: '云南省口腔医院（公立三甲）' },
  { keyword: '云南松鼠口腔专科', url: '/portal/hospital', title: '昆医大附一口腔' },
  { keyword: '时代天使', url: '/portal/price/ortho', title: '时代天使隐形矫正集采行情' },
  { keyword: '隐适美', url: '/portal/price/ortho', title: '美国隐适美矫正官方行情' },
  { keyword: '种植牙', url: '/portal/price/implant', title: '昆明种植牙集采收费价格表' },
  { keyword: '牙齿矫正', url: '/portal/price/ortho', title: '昆明正畸矫正收费价格表' },
  { keyword: '集采', url: '/portal/price/implant', title: '国家口腔耗材集采透明比价' },
];

export function enrichTextWithEntities(text: string): React.ReactNode[] {
  if (!text) return [];

  // 避免过度密集加链接，每个关键词在一个段落中只替换第一次
  const usedKeywords = new Set<string>();

  // 构造正则
  const sortedKeywords = [...ENTITY_LINKS].sort((a, b) => b.keyword.length - a.keyword.length);
  const pattern = new RegExp(`(${sortedKeywords.map(k => k.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');

  const parts = text.split(pattern);

  return parts.map((part, idx) => {
    const matched = sortedKeywords.find(k => k.keyword === part);
    if (matched && !usedKeywords.has(matched.keyword)) {
      usedKeywords.add(matched.keyword);
      return (
        <Link
          key={idx}
          href={matched.url}
          title={matched.title}
          className="text-sky-700 font-semibold underline decoration-sky-300 underline-offset-2 hover:text-sky-900 hover:decoration-sky-600 transition-colors"
        >
          {part}
        </Link>
      );
    }
    return part;
  });
}
