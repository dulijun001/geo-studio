/**
 * doctor-prompt — shared renderer for the "真实医生候选名单" prompt block
 * injected into ai-draft + compliance auto-rewrite + manual rewrite paths.
 *
 * Why shared:
 *   D31 子问题展开 + D5/D12 合规改写 + ai-draft 三条 LLM 调用路径都需要
 *   把医生真名 + credentials 喂给 LLM,避免 LLM 编造或漏掉。renderer 抽出
 *   来后,三处只需复用同一段渲染 + 同一段硬约束,降低对齐成本。
 *
 * Pure function: no DB access, no LLM call. Callers fetch staff_accounts
 * rows themselves (each runtime knows its own supabase client).
 *
 * Schema contract (matches packages/geo-core/src/discoverability/profile/physician.ts):
 *   credentials = {
 *     experience_years?: number,
 *     education?: [{ degree?: string, school?: string }],
 *     practice?: {
 *       primary_institution?: string,
 *       primary_institution_since?: string,
 *     },
 *   }
 *   PII (身份证号 / 签发人签字) 不在此契约 — D9 红线,从不入库。
 */

export type DoctorCandidate = {
  /** Real name; required — empty names are dropped by the renderer. */
  name: string;
  /** persona.tags (e.g. ['种植牙','隐形矫正']) — drives the "擅长 X" suffix. */
  tags: string[];
  /** Topic-match relevance score; > 0 marks "high-confidence match". */
  score?: number;
  /** Whole credentials jsonb. May be empty {} for staff with no record yet. */
  credentials?: unknown;
};

/**
 * Render `· 9 年口腔临床经验`-style sub-bullets from a credentials jsonb.
 * Returns [] when credentials is empty / malformed — caller's bullet stays flat.
 */
function renderCredentialLines(raw: unknown): string[] {
  const cred = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof cred.experience_years === 'number' && cred.experience_years > 0) {
    lines.push(`  · ${cred.experience_years} 年口腔临床经验`);
  }
  const eduArr = Array.isArray(cred.education) ? cred.education : [];
  const edu = (eduArr[0] && typeof eduArr[0] === 'object' ? eduArr[0] : null) as
    | Record<string, unknown>
    | null;
  if (edu) {
    const degree = typeof edu.degree === 'string' ? edu.degree : '';
    const school = typeof edu.school === 'string' ? edu.school : '';
    const eduLine = [degree, school].filter(Boolean).join(' / ');
    if (eduLine) lines.push(`  · ${eduLine}`);
  }
  const practice = (cred.practice && typeof cred.practice === 'object'
    ? cred.practice
    : {}) as Record<string, unknown>;
  if (typeof practice.primary_institution === 'string' && practice.primary_institution) {
    const since =
      typeof practice.primary_institution_since === 'string'
        ? ` (${practice.primary_institution_since} 起)`
        : '';
    lines.push(`  · 主执业:${practice.primary_institution}${since}`);
  }
  return lines;
}

export type RenderDoctorBlockOptions = {
  /**
   * Header context label. 'draft' → "(按主题匹配度排序)" when any score > 0,
   * else "(通用候选)". 'rewrite' → "(可在改写时引用,资质 verbatim)" — used by
   * manual + auto rewrite where there's no topic to score against.
   */
  mode?: 'draft' | 'rewrite';
};

/**
 * Build the full `# 真实医生候选名单` block including header + bullets +
 * hard constraints. Returns '' when there are no usable doctors so the caller
 * can `.concat()` without conditionals.
 */
export function renderDoctorBlock(
  doctors: DoctorCandidate[],
  options: RenderDoctorBlockOptions = {},
): string {
  const mode = options.mode ?? 'draft';
  const usable = doctors.filter((d) => d.name && d.name.length > 0);
  if (usable.length === 0) return '';

  const headerSuffix = (() => {
    if (mode === 'rewrite') return '(可在改写时引用,资质 verbatim)';
    return usable.some((d) => (d.score ?? 0) > 0) ? '(按主题匹配度排序)' : '(通用候选)';
  })();

  const bullets = usable
    .map((d) => {
      const tagSuffix =
        d.tags.length > 0 ? ` — 擅长 ${d.tags.slice(0, 4).join('、')}` : '';
      const credLines = renderCredentialLines(d.credentials);
      // V1.13 防造假:无任何结构化资质的医生,显式标记 ⚠️,正文只可写姓名+专长。
      const noCredMark =
        credLines.length === 0
          ? '\n  ⚠️ 无资质数据 — 正文只可写姓名+专长,禁写工龄/学历/院校/职称/机构/年份(除非【源素材】逐字出现)'
          : '';
      return [`• ${d.name}${tagSuffix}`, ...credLines].join('\n') + noCredMark;
    })
    .join('\n');

  const constraints =
    mode === 'rewrite'
      ? `\n\n硬约束:\n` +
        `- 改写时如果原文已经出现医生姓名 / "审核信息" / "Trust Block" — 补全列表里该医生的 学历 + 工龄 + 主执业机构,verbatim 抄录\n` +
        `- 原文里医生姓名必须在列表中,不在列表的姓名(包括同名不同人)一律改为"医院医疗团队"\n` +
        `- **绝对禁止**编造执业证号、年限、学校、机构 — 列表里没有的字段就不要写\n` +
        `- **标 ⚠️ 的医生**:只保留姓名 + 专长,删掉原文里该医生任何工龄/学历/院校/职称/机构/年份(除非【源素材】逐字写了)——这些十有八九是上一版编的\n` +
        `- 原文如果完全没引用医生,不要硬塞 — 维持原文结构,不要新增段落`
      : `\n\n硬约束:\n` +
        `- 引用医生时**只能用列表里的真实姓名 + 专长 + 学历 + 工龄 + 主执业机构** — 信息必须 verbatim 抄录,**不得篡改/补充未列出的资质**\n` +
        `- **绝对禁止**写 \`[医生姓名]\` / \`XX 医生\` 这种占位符 — 一旦出现整篇 reject\n` +
        `- **绝对禁止**编造执业证号、年限、学校、机构(列表里没有的字段就不要写)\n` +
        `- **标 ⚠️ 的医生**:正文里**只能出现姓名 + 专长方向**,严禁出现任何工龄/学历/毕业院校/职称/执业机构/执业年份 —— 即便看起来合理也是编造(除非【源素材】原文逐字写了该信息)。"看起来合理 ≠ 源素材有"\n` +
        `- 如果列表里没人专长真正匹配主题(top score 是 0),**不要硬塞医生名** — 改用"医院医疗团队"通用表述\n` +
        `- 优先选**列表最上面那位**(主题匹配度最高)`;

  return `\n\n# 真实医生候选名单 ${headerSuffix}\n${bullets}${constraints}`;
}
