/**
 * Slice extractor — D21 / ADR 009 P1.
 *
 * 把 AI 生成的 markdown body 切成 typed slices,服务 llms.txt / AI Feed /
 * Schema JSON-LD / 追踪 query matcher。
 *
 * 设计原则:
 *   1. **纯启发式**,不调 LLM。毫秒级。LLM 增强留给 P2。
 *   2. 抽取不到的字段**不写入** slices(不要塞空字符串占坑)
 *   3. 跟 scorer-l2 共享同一套识别 regex,行为一致
 *   4. 完全幂等,同一 body 抽两次结果完全一样
 *
 * extractor 跑完后,调用方应该把返回值 merge 到 content_items.slices。
 *
 * See docs/07-geo-article-spec.md §十一.
 */

export type FaqPair = { q: string; a: string };
export type ComparisonPoint = { label: string; detail: string };
export type EntitySnapshot = {
  brand_name?: string;
  city?: string;
  reviewed_by?: string;
};
export type TrustBlockSlice = {
  applicable_to?: string;
  not_replace?: string;
  seek_care_if?: string;
  reviewed_by?: string;
  updated_at?: string;
  institution?: string;
  region?: string;
};

export type ExtractedSlices = {
  version: 1;
  extracted_at: string;
  direct_answer?: string;
  summary_1?: string;
  summary_3?: string;
  myth_busting_block?: string;
  when_to_seek_care?: string;
  faq_pairs?: FaqPair[];
  comparison_points?: ComparisonPoint[];
  entity_snapshot?: EntitySnapshot;
  trust_block?: TrustBlockSlice;
};

export type ExtractSlicesInput = {
  body: string;
  /** Optional hints from content_contract / brand row to verify entity slice. */
  ctx?: {
    brand_name?: string;
    city?: string;
  };
};

export function extractSlices(input: ExtractSlicesInput): ExtractedSlices {
  const { body, ctx = {} } = input;
  const out: ExtractedSlices = {
    version: 1,
    extracted_at: new Date().toISOString(),
  };

  const direct = extractDirectAnswer(body);
  if (direct) out.direct_answer = direct;

  const myth = extractMythBusting(body);
  if (myth) out.myth_busting_block = myth;

  const seek = extractWhenToSeekCare(body);
  if (seek) out.when_to_seek_care = seek;

  const faqs = extractFaqPairs(body);
  if (faqs.length > 0) out.faq_pairs = faqs;

  const trust = extractTrustBlock(body);
  if (Object.keys(trust).length > 0) out.trust_block = trust;

  const entity = extractEntitySnapshot(body, ctx);
  if (Object.keys(entity).length > 0) out.entity_snapshot = entity;

  const summaries = extractSummaries(body, direct);
  if (summaries.summary_1) out.summary_1 = summaries.summary_1;
  if (summaries.summary_3) out.summary_3 = summaries.summary_3;

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// direct_answer — first ≤120-char sentence that conclusively answers
// ─────────────────────────────────────────────────────────────────────────

function extractDirectAnswer(body: string): string | undefined {
  // 优先取开头的"结论:"或"一句话(回答|说):"
  const labelled = body.match(
    /(?:结论[:：]|一句话(?:回答|说)[:：]|直接说[:：]|先说结论[:：])\s*([^\n。!?]{8,120}[。!?]?)/,
  );
  if (labelled?.[1]) return labelled[1].trim().slice(0, 120);

  // 退化:取开头第一句话(过滤掉纯标题行 / 元数据)
  const stripped = body
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t.length === 0) return false;
      if (t.startsWith('#')) return false; // markdown header
      if (/^[*-]\s/.test(t)) return false; // bullet
      return true;
    })
    .slice(0, 3)
    .join(' ');
  // 6-char minimum (vs 12 chars before) — "洗牙不会让牙缝变大" is 9 chars
  // and must qualify. 6 still filters out trivial fragments like "首先" / "其次".
  const firstSentence = stripped.split(/[。!?]/).find((s) => s.trim().length >= 6);
  if (firstSentence && firstSentence.length <= 120) {
    return firstSentence.trim();
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// myth_busting_block — 含"误解 / 不是 / 其实 / 并不"反转的段落
// ─────────────────────────────────────────────────────────────────────────

function extractMythBusting(body: string): string | undefined {
  const paragraphs = body.split(/\n\n+/);
  for (const p of paragraphs) {
    const t = p.trim();
    if (t.length < 30 || t.length > 600) continue;
    if (/(误以为|其实|不是|并不|真正的|很多人(?:以为)|看似|实际上|常被误解)/.test(t)) {
      return t.slice(0, 500);
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// when_to_seek_care — 风险边界段
// ─────────────────────────────────────────────────────────────────────────

function extractWhenToSeekCare(body: string): string | undefined {
  // 优先抓含明确就医提示的段落
  const paragraphs = body.split(/\n\n+/);
  for (const p of paragraphs) {
    const t = p.trim();
    if (t.length < 20 || t.length > 500) continue;
    if (/(建议尽快就诊|建议立即就诊|尽快线下检查|何时就诊|出现.{0,8}建议(?:就诊|看医生|检查))/.test(t)) {
      return t.slice(0, 400);
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// faq_pairs — Q/A 段落对
// ─────────────────────────────────────────────────────────────────────────

function extractFaqPairs(body: string): FaqPair[] {
  const pairs: FaqPair[] = [];

  // 模式 1: Q1: ... A: ... / 问: ... 答: ...(Q 和 A 分两行)
  const m1 = body.matchAll(
    /(?:^|\n)\s*(?:Q\d*[:：.]\s*|问\d*[:：.]\s*|\*\*Q\d*\*\*\s*[:：.]?\s*)([^\n]{5,150})\s*\n+\s*(?:A\d*[:：.]\s*|答\d*[:：.]\s*|\*\*A\d*\*\*\s*[:：.]?\s*)([^\n]{10,400})/gi,
  );
  for (const m of m1) {
    const q = m[1]?.trim();
    const a = m[2]?.trim();
    if (q && a) pairs.push({ q, a });
  }
  if (pairs.length > 0) return dedupeFaq(pairs);

  // 模式 1b (D21 batch path 实测格式): 同一行 inline `- 问:Q?答:A` /
  // `* 问:Q?答:A` — LLM 在压缩输出时常常一行写完 Q+A. 关键标志: 同行内
  // 先 "问" / Q,后 "答" / A,中间夹问号.
  const m1b = body.matchAll(
    /(?:^|\n)\s*(?:[-*•]\s*)?(?:Q\d*[:：.]|问\d*[:：.]|\*\*问\d*\*\*[:：.]?)\s*([^?？\n]{4,150}[?？])\s*(?:A[:：.]?|答[:：.]?|\*\*答\*\*[:：.]?)\s*([^\n]{10,400})/gi,
  );
  for (const m of m1b) {
    const q = m[1]?.trim();
    const a = m[2]?.trim();
    if (q && a) pairs.push({ q, a });
  }
  if (pairs.length > 0) return dedupeFaq(pairs);

  // 模式 1c: dash + bold Q + newline + A (D21 thinking-model 实测格式)
  //   - **Q:种植牙是什么?**
  //   A:种植牙是...
  // Q 行有 `**Q:` 或 `**问:` 前缀,A 行紧跟下一行(无 `**` 包).
  const m1c = body.matchAll(
    /(?:^|\n)\s*(?:[-*•]\s*)?\*{1,3}\s*(?:Q\d*|问\d*)\s*[:：.]?\s*([^?？\n*]{4,150}[?？])\s*\*{1,3}\s*\n+\s*(?:A\d*|答\d*)\s*[:：.]?\s*([^\n]{10,500})/gi,
  );
  for (const m of m1c) {
    const q = m[1]?.trim();
    const a = m[2]?.trim();
    if (q && a) pairs.push({ q, a });
  }
  if (pairs.length > 0) return dedupeFaq(pairs);

  // 模式 2: ### 编号 标题(?) ... 答案段
  const m2 = body.matchAll(
    /(?:^|\n)#{2,4}\s*\d+[\\.、]?\s*([^\n]{5,80}[?？])\s*\n+([^#\n][^\n]{20,500})/g,
  );
  for (const m of m2) {
    const q = m[1]?.trim();
    const a = m[2]?.trim();
    if (q && a) pairs.push({ q, a });
  }
  if (pairs.length > 0) return dedupeFaq(pairs);

  // 模式 3: 数字编号 + ? 结尾行 + 接下来非空行
  // 允许 `?` 后跟 markdown 修饰(** / __ / ` / 空白),实测 LLM 输出常写
  // `1. **洗牙会损伤牙齿吗?**` 而不是裸 `?` 结尾.
  const lines = body.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const q = lines[i]?.trim() ?? '';
    if (/^\d+[\\.、]\s*\*{0,3}[^\n]+[?？]\*{0,3}[`_\s]*$/.test(q)) {
      // 找下一个非空行作为 A
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const a = lines[j]?.trim();
        if (a && a.length >= 10 && !/^\d+[\\.、]/.test(a)) {
          // 清理 Q 的前缀编号 + bold 修饰
          const cleanQ = q
            .replace(/^\d+[\\.、]\s*/, '')
            .replace(/^\*{2,3}\s*/, '')
            .replace(/\s*\*{2,3}$/, '')
            .trim();
          pairs.push({ q: cleanQ, a });
          break;
        }
      }
    }
  }
  return dedupeFaq(pairs);
}

function dedupeFaq(pairs: FaqPair[]): FaqPair[] {
  const seen = new Set<string>();
  const out: FaqPair[] = [];
  for (const p of pairs) {
    const key = p.q.slice(0, 30);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// trust_block — 文末独立段落 7 字段
// ─────────────────────────────────────────────────────────────────────────

function extractTrustBlock(body: string): TrustBlockSlice {
  const out: TrustBlockSlice = {};
  // 通常在文末; 取最后 1500 字符里搜
  const tail = body.slice(-1500);

  const grab = (re: RegExp) => {
    const m = tail.match(re);
    return m?.[1]?.trim();
  };

  out.applicable_to = grab(/(?:本文适用于|适用对象|适用人群)[:：]?\s*([^\n。]{4,120})/);
  out.not_replace = grab(/(?:本文不替代|不替代面诊|不能替代)[:：]?\s*([^\n。]{4,80})/);
  out.seek_care_if = grab(/(?:出现以下情况建议尽快就诊|出现.{0,5}建议(?:就诊|看医生)|何时就诊)[:：]?\s*([^\n。]{6,200})/);
  out.reviewed_by = grab(/(?:审核|本文经)[:：]?\s*([^\n。]{3,60})/);
  out.updated_at = grab(/(?:更新|最近更新|更新时间|更新于)[:：]?\s*((?:20\d{2})[^\n。]{0,15})/);
  out.institution = grab(/(?:机构信息|机构|本院)[:：]?\s*([^\n。]{3,60})/);
  out.region = grab(/(?:地域|本地|本市)[:：]?\s*([^\n。]{2,40})/);

  // 删空字段
  for (const k of Object.keys(out) as Array<keyof TrustBlockSlice>) {
    if (!out[k]) delete out[k];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// entity_snapshot — brand + city + reviewer 自动定位
// ─────────────────────────────────────────────────────────────────────────

function extractEntitySnapshot(body: string, ctx: { brand_name?: string; city?: string }): EntitySnapshot {
  const out: EntitySnapshot = {};

  if (ctx.brand_name && body.includes(ctx.brand_name)) {
    out.brand_name = ctx.brand_name;
  } else {
    const m = body.match(/((?:[一-龥]{2,8})(?:口腔|医院|诊所|门诊))/);
    if (m?.[1]) out.brand_name = m[1];
  }

  if (ctx.city && body.includes(ctx.city)) {
    out.city = ctx.city;
  } else {
    const m = body.match(
      /(北京|上海|广州|深圳|杭州|南京|武汉|成都|重庆|昆明|青岛|苏州|西安|济南|天津|大连|长沙|郑州|合肥|福州|厦门|宁波)/,
    );
    if (m?.[1]) out.city = m[1];
  }

  // 审核者:本文经 XX 医生 / 审核: XX
  const r = body.match(/(?:本文(?:经|由)|审核[:：])\s*([^。\n,,]{2,30})/);
  if (r?.[1]) out.reviewed_by = r[1].trim();

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// summaries — 1 句话 / 3 句话摘要(简单启发式)
// ─────────────────────────────────────────────────────────────────────────

function extractSummaries(
  body: string,
  directAnswer?: string,
): { summary_1?: string; summary_3?: string } {
  const out: { summary_1?: string; summary_3?: string } = {};
  if (directAnswer) {
    out.summary_1 = directAnswer.slice(0, 90);
  } else {
    const first = body.split(/[。!?]/).find((s) => s.trim().length >= 15);
    if (first) out.summary_1 = first.trim().slice(0, 90);
  }

  // summary_3:取开头 3 个独立结论句(过滤掉 header/bullet)
  const stripped = body
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('#') && !/^[*-]\s/.test(t);
    })
    .slice(0, 8)
    .join(' ');
  const sentences = stripped
    .split(/[。!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15 && s.length <= 120);
  if (sentences.length >= 1) {
    out.summary_3 = sentences.slice(0, 3).join('。') + (sentences.length > 0 ? '。' : '');
  }
  return out;
}
