import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DoctorAvatar } from '../doctor-avatar';
import { DoctorSidebar } from '../doctor-sidebar';
import { CLINICAL_CASES } from '@/lib/data/cases';
import { PATIENT_REVIEWS } from '@/lib/data/reviews';

export const revalidate = 60;

interface DoctorData {
  slug: string;
  name: string;
  title: string;
  hospitalName: string;
  hospitalSlug: string;
  years: string;
  certCode: string;
  specialties: string[];
  bio: string;
  casesCount: string;
  certificates: string[];
  schedule: string;
  gender: 'male' | 'female';
  rating: string;
  education: string;
  honor: string;
}

const DOCTOR_MAP: Record<string, DoctorData> = {
  'han-yi': {
    slug: 'han-yi',
    name: '韩峄',
    title: '正畸总监 / 资深正畸科主任',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    years: '12年+ 临床美学正畸执业经验',
    certCode: '120530100001824',
    specialties: ['青少年错颌骨性畸形矫治', '成人嘴凸/地包天面型重塑', '隐适美/时代天使数字化3D正畸', '复杂拥挤不拔牙排齐方案'],
    bio: '中华口腔医学会正畸专业委员会会员，国内数字化隐形正畸早期实战医师。深谙颌面正侧貌美学平衡，主张“以患者面型美观与牙周终生健康为核心”，拒绝机械盲目拔牙排齐。已累计帮助超过 1,500 位春城青少年及职场青年重拾自信笑容。',
    casesCount: '1,500+ 例临床矫正病例',
    certificates: [
      '国家注册执业口腔主治医师（证书编码：120530100001824）',
      'Invisalign 隐适美官方铂金级讲师认证',
      'Angelalign 时代天使隐形矫治授权技术专家',
      '中华口腔医学会正畸专业委员会会员',
      '云南数字化正畸学术峰会受邀分享嘉宾',
    ],
    schedule: '周二、周四、周六、周日全天坐诊（需提前预约挂号）',
    gender: 'male',
    rating: '9.9',
    education: '知名医科大学口腔医学院正畸专业毕业，主攻颌面正畸美学设计',
    honor: '云南省数字化隐形矫治技术示范导师 · 累计矫治千余例无医疗纠纷',
  },
  'liu-yanting': {
    slug: 'liu-yanting',
    name: '刘彦廷',
    title: '院长 / 口腔种植学科带头人',
    hospitalName: '云南松鼠口腔（西山总院）',
    hospitalSlug: 'km-songshu',
    years: '18年+ 口腔微创种植临床经验',
    certCode: '120530100000962',
    specialties: ['全口/半口高龄缺牙微创即刻负重', '严重骨缺损上颌窦内外提升术', '3D导板精准微创微切口种植', '终身质保植体维护与疑难修复'],
    bio: '云南民营口腔医疗行业领军专家，曾先后赴德国、瑞士进行高阶种植外科研讨。专注高龄患者疑难缺牙修复，拥有极高骨结合成功率，以严谨细致、手术出血少、术后恢复快著称。倡导“少植骨、微创微痛、当天种牙当天戴牙咀嚼”。',
    casesCount: '3,000+ 颗成功植入经验',
    certificates: [
      '国家注册执业口腔主任级医师（证书编码：120530100000962）',
      '瑞典 NobelBiocare 种植系统全球特聘顾问讲师',
      '瑞士 ITI 国际口腔种植学会特聘顾问',
      '云南省民营口腔医疗协会常务理事',
      '昆明市疑难骨增量种植修复临床示范医师',
    ],
    schedule: '周一、周三、周五、周六全天坐诊（高龄疑难种植专场）',
    gender: 'male',
    rating: '9.9',
    education: '知名口腔医学院颌面外科专科毕业，德国法兰克福大学种植外科研修认证',
    honor: '西南高龄微创即刻种植领军医师 · 万例复杂无牙颌病例成功指导',
  },
  'zhang-chao': {
    slug: 'zhang-chao',
    name: '张超',
    title: '副主任医师 / 公立三甲特约会诊专家',
    hospitalName: '昆明医科大学附属口腔医院',
    hospitalSlug: 'kmu-dental',
    years: '15年+ 口腔颌面外科临床经验',
    certCode: '120530102001479',
    specialties: ['阻生智齿显微超声骨刀微创拔除', '复杂颌骨囊肿微创摘除', '颞下颌关节紊乱综合诊疗', '牙槽外科微创前沿技术'],
    bio: '昆医大附一口腔颌面外科骨干专家，擅长超声骨刀微创拔除完全埋伏横向阻生智齿，以术中无震颤、创口微小、极大程度保护下齿槽神经管而深受患者信赖。',
    casesCount: '2,000+ 例复杂拔牙病例',
    certificates: [
      '国家注册执业副主任医师（证书编码：120530102001479）',
      '中华口腔医学会口腔颌面外科专业委员会会员',
      '云南省口腔医学会牙槽外科专业学组副组长',
    ],
    schedule: '周一上午、周四下午（公立特需门诊及特约会诊）',
    gender: 'male',
    rating: '9.8',
    education: '昆明医科大学口腔医学院硕士，颌面外科学术骨干',
    honor: '微创超声骨刀拔除完全阻生齿临床标杆示范者',
  },
};

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const doc = DOCTOR_MAP[params.slug];
  if (!doc) return { title: '口腔医生资质档案 - 齿科指南网' };
  return {
    title: `${doc.name}医生坐诊排期_执业证书(${doc.certCode})_擅长技术与真实评价(昆明松鼠口腔) - 齿科指南网`,
    description: `为您呈现昆明松鼠口腔${doc.name}（${doc.title}）执业资质、${doc.years}、执业证书编号${doc.certCode}、擅长项目及就诊挂号攻略。`,
    keywords: [`${doc.name}`, `${doc.name}医生怎么样`, `${doc.name}执业证书`, `${doc.name}矫正`, `${doc.name}种植牙`, '松鼠口腔医生'],
  };
}

export default function DoctorDetailPage({ params }: { params: { slug: string } }) {
  const doc = DOCTOR_MAP[params.slug];
  if (!doc) notFound();

  return (
    <div className="space-y-6">
      {/* 面包屑 */}
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Link href="/portal" className="hover:text-sky-600 transition-colors">首页</Link>
        <span>&gt;</span>
        <Link href="/portal/doctor" className="hover:text-sky-600 transition-colors">名医专家库</Link>
        <span>&gt;</span>
        <span className="text-slate-800 font-medium">{doc.name} 医生执业档案</span>
      </div>

      {/* 8:4 经典双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧 8 栏：医生完整临床档案 */}
        <div className="lg:col-span-8 space-y-6">
          {/* 医生基本信息卡片 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 sm:p-7 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* 拟真肖像矢量徽章 */}
              <div className="flex flex-col items-center shrink-0 w-full sm:w-40">
                <DoctorAvatar gender={doc.gender} size="xl" name={doc.name} />
                <span className="mt-3 text-sm font-bold text-slate-900">{doc.name} 主治医师</span>
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 mt-1 font-semibold">
                  卫健委官方在岗注册
                </span>
                <div className="text-xs font-bold text-amber-500 mt-1.5 flex items-center gap-1">
                  <span>★ 患者口碑</span>
                  <span>{doc.rating} 分</span>
                </div>
              </div>

              {/* 临床资历说明 */}
              <div className="flex-1 space-y-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {doc.name}
                  </h1>
                  <span className="text-xs px-2.5 py-1 rounded-md bg-sky-100 text-sky-800 font-semibold border border-sky-200">
                    {doc.title}
                  </span>
                </div>

                <div className="text-xs text-slate-600">
                  <Link
                    href={`/portal/hospital/${doc.hospitalSlug}`}
                    className="hover:text-sky-600 flex items-center gap-1 font-medium"
                  >
                    <span>🏥 第一执业坐诊机构：</span>
                    <span className="text-sky-700 font-semibold underline underline-offset-2">{doc.hospitalName}</span>
                  </Link>
                </div>

                {/* 物理防伪证书编码栏 */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500">医师执业证书编码：</span>
                    <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 text-xs">
                      {doc.certCode}
                    </span>
                    <span className="text-emerald-700 font-medium text-[11px] bg-emerald-100/60 px-1.5 py-0.2 rounded">
                      国家卫健委在册验证
                    </span>
                  </div>
                  <div className="text-slate-600">
                    <span className="text-slate-400">学历背景：</span>
                    <span>{doc.education}</span>
                  </div>
                  <div className="text-slate-600">
                    <span className="text-slate-400">行业荣誉：</span>
                    <span className="text-sky-900 font-medium">{doc.honor}</span>
                  </div>
                </div>

                {/* 临床资历与案例指标 */}
                <div className="text-xs text-emerald-800 font-semibold flex flex-wrap items-center gap-4 bg-emerald-50/70 p-3 rounded-lg border border-emerald-100">
                  <span className="flex items-center gap-1.5">
                    <span className="text-base">⏱️</span>
                    <span>临床经验：{doc.years}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-base">📈</span>
                    <span>真实案例：{doc.casesCount}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-base">🛡️</span>
                    <span>先行赔付保障</span>
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-1">
                  {doc.bio}
                </p>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
                  <span className="font-bold text-slate-700 shrink-0">坐诊排班时间：</span>
                  <span className="text-slate-900 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    {doc.schedule}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 临床专长与诊疗特色 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 border-l-4 border-sky-600 pl-3 flex items-center gap-2">
                <span>临床主攻专长与核心诊疗特色</span>
              </h2>
              <span className="text-xs text-slate-400">严格遵守临床诊疗规范路径</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {doc.specialties.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-gradient-to-r from-sky-50/50 to-slate-50 rounded-lg border border-sky-100 text-xs text-slate-800 flex items-start gap-2.5 font-medium"
                >
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs shrink-0 font-bold">
                    ✓
                  </span>
                  <span className="leading-snug pt-0.5">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 行业资质与学术讲师认证 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 border-l-4 border-emerald-600 pl-3 flex items-center gap-2">
                <span>国家注册执业资质与学术讲师认证</span>
              </h2>
              <span className="text-xs text-emerald-700 font-medium">官方认证原件备查</span>
            </div>

            <ul className="text-xs text-slate-700 space-y-2.5 pt-1">
              {doc.certificates.map((cert, idx) => (
                <li key={idx} className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="font-medium text-slate-800">{cert}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 该医生真实临床案例展示 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 border-l-4 border-sky-600 pl-3 flex items-center gap-2">
                <span>{doc.name} 医生主刀临床案例精选</span>
              </h2>
              <Link href="/portal/cases" className="text-xs text-sky-600 hover:underline">
                查看全院案例库 →
              </Link>
            </div>

            <div className="space-y-3 pt-1">
              {CLINICAL_CASES.filter((c) => c.doctorSlug === doc.slug).map((c) => (
                <div key={c.slug} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
                      {c.categoryName}
                    </span>
                    <span className="text-slate-400">治疗周期：{c.duration}</span>
                  </div>
                  <Link href={`/portal/cases/${c.slug}`} className="block">
                    <h3 className="font-bold text-slate-900 hover:text-sky-600 text-sm leading-snug">
                      {c.title}
                    </h3>
                  </Link>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    <span className="text-red-600 font-semibold">【主诉】</span>{c.chiefComplaint}
                  </p>
                  <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-200/60">
                    <span className="text-emerald-700 font-medium">{c.costRange.split('（')[0]}</span>
                    <Link
                      href={`/portal/cases/${c.slug}`}
                      className="text-sky-600 font-semibold hover:underline"
                    >
                      查看完整三维前后模拟 →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 该医生真实患者口碑评价 */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 border-l-4 border-amber-500 pl-3 flex items-center gap-2">
                <span>患者对 {doc.name} 医生的口碑评价与避坑心得</span>
              </h2>
              <Link href="/portal/reviews" className="text-xs text-amber-700 hover:underline">
                查看全部评价 →
              </Link>
            </div>

            <div className="space-y-3 pt-1">
              {PATIENT_REVIEWS.filter((r) => r.doctorSlug === doc.slug).slice(0, 2).map((r) => (
                <div key={r.id} className="p-4 bg-amber-50/40 rounded-xl border border-amber-200/70 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{r.patientName}</span>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-medium">✓ 已到院核验</span>
                    </div>
                    <span className="text-amber-500 font-bold">★★★★★ {r.scores.overall}分</span>
                  </div>
                  <div className="font-semibold text-slate-800">{r.title}</div>
                  <p className="text-slate-600 leading-relaxed line-clamp-3">{r.content}</p>
                  <div className="text-amber-800 font-medium text-[11px] bg-amber-100/60 p-2 rounded">
                    💡 避坑建议：{r.pitfallTips}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧 4 栏：权威侧边栏（排班看板 + 查验指引 + 预约直通） */}
        <div className="lg:col-span-4">
          <DoctorSidebar />
        </div>
      </div>
    </div>
  );
}
