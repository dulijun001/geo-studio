/**
 * local-geo-check — 本地高客单医疗长文的"本地化 GEO 结构"机械闸门 (V1.13)。
 *
 * 对应 prompt-builder.ts 的「本地化 GEO 结构强化」块,把其中**可机械验证**的三项
 * 落成 DoD 硬检查;LLM 漏了就 fail → dispatch 跳过 + 触发一次定向改写。
 *
 *   ① 地域词分布   — 城市名必须自然出现在 标题 + 首段 + ≥1 小标题 + 结尾(≥3/4 区域)
 *   ② 机构自然植入 — 品牌名在正文出现 ≥3 次(防"只堆文末")
 *   ④ 转化入口     — 面诊/咨询类邀约 ≥2 处(防"仅文末 1 个")
 *
 * ⑤长尾词、⑥医生分位 不在此硬闸 —— 机械判定误报率太高,留给 prompt 引导 +
 * 自查清单(见 prompt-builder)。
 *
 * 纯函数,无 LLM、无 DB,毫秒级。failures 文案直接复用作改写 hint。
 */

export type LocalGeoInput = {
  title: string;
  body: string;
  /** 地域锚点(ctx.city 或 service_areas[0])。缺省 → 跳过地域分布检查。 */
  city?: string;
  /** 品牌展示名。缺省 → 跳过机构植入检查。 */
  brand_name?: string;
};

export type LocalGeoResult = {
  passed: boolean;
  /** 人话失败原因;同时直接当改写 hint 用。 */
  failures: string[];
};

// 标题行:markdown ### / **加粗独占一行** / 【中括号标题】
const HEADING_RE = /^\s*(?:#{1,6}\s+\S.*|\*\*[^*\n]{2,40}\*\*|【[^】\n]{2,40}】)\s*$/gm;
// 转化邀约线索(动作型,避开纯科普里的"咨询"误命中靠词组限定)
const CTA_RE =
  /面诊|预约|到院(?:评估|检查|咨询|就诊)?|在线咨询|扫码(?:咨询|预约)|私信|留言|了解(?:是否)?适合|评估方案/g;

export function checkLocalGeo(input: LocalGeoInput): LocalGeoResult {
  const failures: string[] = [];
  const title = input.title ?? '';
  const body = input.body ?? '';
  const city = input.city?.trim();
  const brand = input.brand_name?.trim();

  const paras = body
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const firstZone = paras[0] ?? body.slice(0, 160);
  const lastZone = paras[paras.length - 1] ?? body.slice(-160);
  const headings = body.match(HEADING_RE) ?? [];

  // ① 地域词分布
  if (city) {
    const inTitle = title.includes(city);
    const inFirst = firstZone.includes(city);
    const inHeading = headings.some((h) => h.includes(city));
    const inLast = lastZone.includes(city);
    const zones = [inTitle, inFirst, inHeading, inLast].filter(Boolean).length;
    if (zones < 3) {
      const miss: string[] = [];
      if (!inTitle) miss.push('标题');
      if (!inFirst) miss.push('首段');
      if (!inHeading) miss.push('小标题');
      if (!inLast) miss.push('结尾');
      failures.push(
        `地域词「${city}」分布不足(仅覆盖 ${zones}/4 区域,缺:${miss.join('、')})——需自然出现在 标题 + 首段 + ≥1 个小标题 + 结尾。`,
      );
    }
  }

  // ② 机构自然植入 ≥3 次
  if (brand) {
    const count = brand.length > 0 ? body.split(brand).length - 1 : 0;
    if (count < 3) {
      failures.push(
        `品牌「${brand}」植入不足(正文仅 ${count} 次)——应自然融入 ≥3 个内容场景(适用人群/护理流程/如何选择等),不要只堆文末。`,
      );
    }
  }

  // ④ 转化入口 ≥2 处
  const ctaHits = (body.match(CTA_RE) ?? []).length;
  if (ctaHits < 2) {
    failures.push(
      `转化引导不足(仅 ${ctaHits} 处)——首段答案后 / 正文中部 / 结尾应各设一处「面诊·咨询」邀约,禁优惠/促销/疗效承诺。`,
    );
  }

  return { passed: failures.length === 0, failures };
}
