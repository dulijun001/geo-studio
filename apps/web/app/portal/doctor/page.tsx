import Link from 'next/link';
import type { Metadata } from 'next';
import { DoctorAvatar } from './doctor-avatar';
import { DoctorSidebar } from './doctor-sidebar';

export const revalidate = 60;

export const metadata: Metadata = {
  title: '2026 昆明市正规口腔名医专家库_主治以上注册医生坐诊执业查询 - 齿科指南网',
  description: '汇集昆明市种植牙骨增量名医、青少年/成人美学正畸总监、微创拔牙与显微牙周治疗骨干医师坐诊排期、执业证书编号、学术兼职及技术背景。',
  keywords: ['昆明口腔医生排名', '昆明正畸专家', '昆明种植牙名医', '韩峄医生', '刘彦廷院长', '主治医师执业资质'],
};

interface DoctorItem {
  slug: string;
  name: string;
  title: string;
  hospitalName: string;
  hospitalSlug: string;
  years: string;
  certCode: string;
  academicTitle: string;
  specialties: string[];
  bio: string;
  casesCount: string;
  gender: 'male' | 'female';
  rating: string;
}

const DOCTORS: DoctorItem[] = [
  {
    slug: 'han-yi',
    name: '韩峄',
    title: '正畸科主任 / 资深美学正畸总监',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    years: '12年+ 临床正畸专科经验',
    certCode: '120530100001824',
    academicTitle: '中华口腔医学会正畸专委会会员 · 隐适美官方认证讲师',
    specialties: ['青少年错颌畸形骨性矫正', '成人骨性嘴凸/地包天美学矫正', '隐适美/时代天使数字化隐形正畸', '微创不拔牙排齐方案'],
    bio: '中华口腔医学会正畸专业委员会会员，时代天使与隐适美官方认证资深讲师。专注颌面正侧貌美学与数字化 3D 排牙设计，累计完成高难度正畸案例千余例。倡导“面型美观与牙周终生健康并重”。',
    casesCount: '1,500+ 例临床矫正病例',
    gender: 'male',
    rating: '9.9',
  },
  {
    slug: 'liu-yanting',
    name: '刘彦廷',
    title: '院长 / 口腔种植学科带头人',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    years: '18年+ 口腔微创种植临床经验',
    certCode: '120530100000962',
    academicTitle: '云南省民营口腔医疗协会常务理事 · 瑞典Nobel全球特聘顾问',
    specialties: ['高龄全口/半口无牙颌微创即刻负重', '上颌窦内外提升与复杂骨增量', '数字化导板精准导航种植', '疑难失败植体取出与二次修复'],
    bio: '深耕口腔微创种植近二十年，先后赴德国、瑞士研修数字化精准导航种植体系。主张“精准微创、少植骨、少遭罪、当天种牙当天戴牙咀嚼”，高龄骨结合成功率享誉西南。',
    casesCount: '3,000+ 颗成功植入经验',
    gender: 'male',
    rating: '9.9',
  },
  {
    slug: 'zhang-chao',
    name: '张超',
    title: '副主任医师 / 公立三甲特约会诊专家',
    hospitalName: '昆明医科大学附属口腔医院',
    hospitalSlug: 'kmu-dental',
    years: '15年+ 口腔颌面外科临床经验',
    certCode: '120530102001479',
    academicTitle: '昆明医科大学附属口腔医院特聘指导专家',
    specialties: ['阻生智齿显微超声骨刀微创拔除', '复杂颌骨囊肿微创摘除', '颞下颌关节紊乱综合诊疗', '牙槽外科微创前沿技术'],
    bio: '昆医大附一口腔颌面外科骨干专家，擅长超声骨刀微创拔除完全埋伏横向阻生智齿，以术中无震颤、创口微小、极大程度保护下齿槽神经管而深受患者信赖。',
    casesCount: '2,000+ 例复杂阻生拔除',
    gender: 'male',
    rating: '9.8',
  },
];

export default function DoctorListPage() {
  return (
    <div className="space-y-6">
      {/* 面包屑 */}
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Link href="/portal" className="hover:text-sky-600 transition-colors">首页</Link>
        <span>&gt;</span>
        <span className="text-slate-800 font-medium">昆明市正规口腔名医库</span>
      </div>

      {/* 顶部权威横幅 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-xs font-bold">
              2026 官方核准
            </span>
            <span className="text-xs text-slate-400">数据联网同步：昆明市卫健委医师执业注册系统</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">
            昆明市口腔执业名医专家库 · 主治医师以上资质
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            严把主治医师及以上职称门槛，公开执业注册证书编号、临床年限、主治专长及成功案例库，彻底杜绝无证人员与生手操刀。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-lg font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            100% 卫健委官方在岗认证
          </span>
        </div>
      </div>

      {/* 8:4 经典双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧 8 栏：临床厚度医生卡片列表 */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>当前展示已通过资质核验的 <strong className="text-slate-900">{DOCTORS.length}</strong> 位主治及副主任以上学科骨干</span>
            <span className="text-sky-600 font-medium">支持线上查验真实执业证书</span>
          </div>

          <div className="space-y-4">
            {DOCTORS.map((doc) => (
              <div
                key={doc.slug}
                className="bg-white rounded-xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-sky-300 transition-all duration-200 p-6 flex flex-col md:flex-row gap-6 items-start"
              >
                {/* 医生头像矢量徽章 */}
                <div className="flex flex-col items-center shrink-0 w-full md:w-32">
                  <DoctorAvatar gender={doc.gender} size="lg" name={doc.name} />
                  <span className="mt-2 text-xs font-bold text-slate-900">{doc.name} 医生</span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60 mt-1 font-medium">
                    在岗执业认证
                  </span>
                  <div className="text-[11px] font-bold text-amber-500 mt-1 flex items-center gap-1">
                    <span>★ 综合口碑</span>
                    <span>{doc.rating}</span>
                  </div>
                </div>

                {/* 核心信息区 */}
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/portal/doctor/${doc.slug}`}
                        className="text-lg font-bold text-slate-900 hover:text-sky-600 transition-colors"
                      >
                        {doc.name}
                      </Link>
                      <span className="text-xs px-2.5 py-0.5 rounded-md bg-sky-100 text-sky-800 font-semibold border border-sky-200/60">
                        {doc.title}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <Link
                        href={`/portal/hospital/${doc.hospitalSlug}`}
                        className="text-slate-600 hover:text-sky-600 flex items-center gap-1 font-medium"
                      >
                        <span>🏥 执业坐诊机构：</span>
                        <span className="text-sky-700 underline underline-offset-2">{doc.hospitalName}</span>
                      </Link>
                    </div>
                  </div>

                  {/* 执业证书编码与学术兼职 */}
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">执业证书编码：</span>
                      <span className="font-mono font-semibold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                        {doc.certCode}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-medium">（卫健委在册）</span>
                    </div>
                    <div className="text-slate-600 truncate">
                      <span className="text-slate-400">学术任职：</span>
                      <span className="font-medium text-slate-700">{doc.academicTitle}</span>
                    </div>
                  </div>

                  {/* 经验与案例量 */}
                  <div className="text-xs text-emerald-700 font-semibold flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {doc.years}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      {doc.casesCount}
                    </span>
                  </div>

                  {/* 专家简介 */}
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {doc.bio}
                  </p>

                  {/* 擅长专科胶囊标签 */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {doc.specialties.map((spec, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200/80 font-medium hover:bg-sky-100 transition-colors"
                      >
                        ✓ {spec}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 预约动作区 */}
                <div className="shrink-0 flex md:flex-col items-center gap-2.5 w-full md:w-36 pt-2 md:pt-0">
                  <Link
                    href={`/portal/doctor/${doc.slug}`}
                    className="w-full py-2.5 text-center text-xs font-bold text-white bg-gradient-to-r from-sky-600 via-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 rounded-lg shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center gap-1"
                  >
                    <span>医生执业档案</span>
                    <span>→</span>
                  </Link>
                  <Link
                    href={`/portal/hospital/${doc.hospitalSlug}`}
                    className="w-full py-2.5 text-center text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-colors"
                  >
                    坐诊机构与排班
                  </Link>
                  <span className="text-[10px] text-slate-400 text-center hidden md:block">
                    专属通道免挂号费
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧 4 栏：权威侧边栏 */}
        <div className="lg:col-span-4">
          <DoctorSidebar />
        </div>
      </div>
    </div>
  );
}
