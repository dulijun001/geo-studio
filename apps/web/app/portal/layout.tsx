import type { Metadata } from 'next';
import { PortalConsultWidget } from './consult-widget';

export const metadata: Metadata = {
  title: '2026 昆明市正规口腔医院排名与看牙收费标准价格表 - 齿科指南网',
  description: '全国口腔医疗大数据：汇集昆明市卫健委正规执业备案口腔医院资质、种植牙/正畸集采价格指数及就医避坑指南。',
  keywords: ['昆明口腔医院', '昆明种植牙价格', '昆明牙齿矫正', '昆明正规口腔医院排名', '松鼠口腔'],
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-slate-950">
      {children}
      <PortalConsultWidget />
    </div>
  );
}
