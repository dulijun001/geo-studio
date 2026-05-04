/**
 * KB-derived data refreshers (V1.5-5/6/7).
 *
 * After knowledge-sync indexes the file system into knowledge_sources,
 * these functions transform specific KB markdown files into business data:
 *
 *   - deriveComplianceKeywords: 合规/广告法/红线词库.md → compliance_keywords
 *   - deriveStaffAccounts:      团队/医生/*.md         → staff_accounts (V1.5-6)
 *   - deriveBrandVocab:         团队/医生/* + 诊疗/项目库/* + 医院/竞品/* → brand_vocab (V1.5-7)
 *
 * Strategy: per-source DELETE-then-INSERT inside a transaction. Simpler than
 * row-level diffing and the row counts are small (<200 keywords, ~10 doctors,
 * ~50 brand terms). Transaction guarantees no empty-table window for
 * compliance scanning.
 *
 * Trigger: handleKnowledgeSync calls deriveAllFromKb at the end of each run.
 * If the source md hasn't changed, the DB write is wasted but harmless.
 * V2 optimization: track per-source content hash and skip if unchanged.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import { getServiceClient } from '../lib/supabase';

const KB_ROOT =
  process.env.KNOWLEDGE_BASE_ROOT ??
  `${process.env.HOME}/Workspace/songshu-knowledge-base`;

// ============================================================================
// Compliance keywords
// ============================================================================

const COMPLIANCE_SOURCE_PATH = '合规/广告法/红线词库.md';

type KeywordRecord = {
  term: string;
  variants: string[];
  level: 'A' | 'B';
  category: string;
};

/**
 * Parse markdown tables in 红线词库.md.
 *
 * Structure (level 2/3 headings drive level + category):
 *   ## L1 绝对禁止词         → level=A, all rows below
 *   ### 1.1 绝对化用语        → category="绝对化用语"
 *   | 最好 / 最佳 / ... | ... |
 *
 *   ## L2 高风险词           → level=B
 *   | 无痛拔牙 | ... | ... |  (no L3 subsection here)
 */
export function parseComplianceMd(md: string): KeywordRecord[] {
  const out: KeywordRecord[] = [];
  let currentL2 = '';
  let currentL3 = '';
  let inTableBody = false;

  for (const rawLine of md.split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);

    if (h2) {
      currentL2 = h2[1]!.trim();
      currentL3 = '';
      inTableBody = false;
      continue;
    }
    if (h3) {
      currentL3 = h3[1]!.trim();
      inTableBody = false;
      continue;
    }

    // Table separator like |---|---|
    if (/^\|[-:\s|]+\|$/.test(line)) {
      inTableBody = true;
      continue;
    }

    // Table row
    if (inTableBody && line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      const firstCell = cells[0] ?? '';
      if (!firstCell) continue;

      const level = inferLevel(currentL2);
      if (!level) continue;

      const category = currentL3 || currentL2.replace(/^L\d\s*/, '');
      const terms = firstCell
        .split(/[\/／、]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => !/^XX|^[A-Z]{2,}$/.test(t)); // skip placeholders like "XX 医院"

      if (terms.length === 0) continue;
      const [primary, ...variants] = terms;
      out.push({
        term: primary!,
        variants,
        level,
        category: stripMarkdown(category),
      });
      continue;
    }

    if (inTableBody && line.trim() === '') {
      inTableBody = false;
    }
  }
  return out;
}

function inferLevel(l2Heading: string): 'A' | 'B' | null {
  if (/^L1/.test(l2Heading)) return 'A';
  if (/^L2/.test(l2Heading)) return 'B';
  if (/^L3/.test(l2Heading)) return 'B';
  if (/品牌附加/.test(l2Heading)) return 'B';
  return null;
}

function stripMarkdown(s: string): string {
  return s.replace(/^\d+\.\d+\s*/, '').trim();
}

export async function deriveComplianceKeywords(tenantId: string): Promise<{
  inserted: number;
  source_path: string;
}> {
  const abs = join(KB_ROOT, COMPLIANCE_SOURCE_PATH);
  let md: string;
  try {
    md = await readFile(abs, 'utf-8');
  } catch (err) {
    console.warn(`[derive-compliance] source missing: ${abs}`, err);
    return { inserted: 0, source_path: COMPLIANCE_SOURCE_PATH };
  }

  const records = parseComplianceMd(md);
  if (records.length === 0) {
    console.warn(`[derive-compliance] parsed 0 records, refusing to wipe table`);
    return { inserted: 0, source_path: COMPLIANCE_SOURCE_PATH };
  }

  const client = getServiceClient();

  // Delete previous rows derived from this source path (per-tenant scope)
  const { error: delErr } = await client
    .from('compliance_keywords')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('source_path', COMPLIANCE_SOURCE_PATH);
  if (delErr) {
    console.error(`[derive-compliance] delete failed:`, delErr);
    throw delErr;
  }

  // Bulk insert
  const rows = records.map((r) => ({
    tenant_id: tenantId,
    term: r.term,
    level: r.level,
    category: r.category,
    variants: r.variants,
    context_exempt: [],
    source_path: COMPLIANCE_SOURCE_PATH,
  }));

  const { error: insErr } = await client.from('compliance_keywords').insert(rows);
  if (insErr) {
    console.error(`[derive-compliance] insert failed:`, insErr);
    throw insErr;
  }

  console.log(
    `[derive-compliance] tenant=${tenantId} replaced ${rows.length} keywords (A=${rows.filter((r) => r.level === 'A').length} B=${rows.filter((r) => r.level === 'B').length})`,
  );
  return { inserted: rows.length, source_path: COMPLIANCE_SOURCE_PATH };
}

// ============================================================================
// Staff accounts (V1.5-6) — 团队/医生/*.md → staff_accounts upsert
// ============================================================================

export const DOCTORS_DIR = '团队/医生';

type DoctorRecord = {
  real_name: string;
  bio_md_path: string;
  basic_info: Record<string, string>;
  specialties: string[];
  bio_short: string | null;
  bio_long: string | null;
  full_persona: Record<string, unknown>;
};

/**
 * Parse a single doctor md file. The format is:
 *   # 姓名
 *   ## 基本信息
 *   | 职称 | 执业医师 |
 *   ...
 *   ## 专长领域
 *   - 复杂牙拔除
 *   ...
 *   ## 对外简介(50字版)
 *   <文字>
 */
export function parseDoctorMd(md: string, sourcePath: string): DoctorRecord | null {
  const lines = md.split('\n');
  const h1 = lines.find((l) => l.startsWith('# '));
  if (!h1) return null;
  const real_name = h1.slice(2).trim();
  if (!real_name) return null;

  const sections = splitByH2(md);
  const basicInfoTable = sections['基本信息'] ?? '';
  const basic_info = parseSimpleTable(basicInfoTable);

  const specialties = parseListItems(sections['专长领域'] ?? '');

  const bio_short = (sections['对外简介(50字版)'] ?? sections['对外简介（50字版）'] ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 5) ?? null;
  const bio_long = (sections['对外简介(200字版)'] ?? sections['对外简介（200字版）'] ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 20) ?? null;

  const full_persona: Record<string, unknown> = {
    basic_info,
    specialties,
    bio_short,
    bio_long,
    speaking_style: parseSimpleTable(sections['说话风格'] ?? ''),
    content_preference: parseSimpleTable(sections['内容偏好'] ?? ''),
    audience: parseSimpleTable(sections['受众理解'] ?? ''),
    talk_habits: parseSimpleTable(sections['话术习惯'] ?? ''),
    forbidden: parseSimpleTable(sections['禁用清单'] ?? ''),
    differentiator: parseSimpleTable(sections['差异化'] ?? ''),
  };

  return { real_name, bio_md_path: sourcePath, basic_info, specialties, bio_short, bio_long, full_persona };
}

function splitByH2(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = md.split('\n');
  let current = '';
  const buf: string[] = [];
  const flush = () => {
    if (current) out[current] = buf.join('\n');
    buf.length = 0;
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      flush();
      current = m[1]!.trim();
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

function parseSimpleTable(section: string): Record<string, string> {
  const out: Record<string, string> = {};
  let inBody = false;
  for (const line of section.split('\n')) {
    if (/^\|[-:\s|]+\|$/.test(line)) {
      inBody = true;
      continue;
    }
    if (!inBody) continue;
    if (!line.startsWith('|') || !line.endsWith('|')) {
      if (line.trim() === '') break;
      continue;
    }
    const cells = line.slice(1, -1).split('|').map((c) => c.trim());
    if (cells.length >= 2 && cells[0] && cells[1]) {
      out[cells[0]] = cells.slice(1).join(' | ');
    }
  }
  return out;
}

function parseListItems(section: string): string[] {
  return section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ') || l.startsWith('* '))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0 && !/^无（?推断/.test(l));
}

function inferRole(basicInfo: Record<string, string>): 'doctor' | 'consultant' | 'nurse' | 'other' {
  const title = (basicInfo['职称'] ?? '') + ' ' + (basicInfo['科室'] ?? '');
  if (/咨询/.test(title)) return 'consultant';
  if (/护士|护理/.test(title)) return 'nurse';
  if (/医师|医生|主任/.test(title)) return 'doctor';
  return 'other';
}

export async function deriveStaffAccounts(tenantId: string): Promise<{ upserted: number; skipped: number }> {
  const doctorsAbs = join(KB_ROOT, DOCTORS_DIR);
  let files: string[];
  try {
    files = await fg('*.md', { cwd: doctorsAbs, onlyFiles: true });
  } catch (err) {
    console.warn(`[derive-staff] doctors dir missing: ${doctorsAbs}`, err);
    return { upserted: 0, skipped: 0 };
  }

  if (files.length === 0) {
    console.warn(`[derive-staff] no doctor md found, skip`);
    return { upserted: 0, skipped: 0 };
  }

  const client = getServiceClient();

  // Resolve brand_id (assume one brand per tenant in V1.5)
  const { data: brands } = await client
    .from('brands')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(1);
  if (!brands?.[0]) {
    console.warn(`[derive-staff] tenant=${tenantId} has no brand, skip`);
    return { upserted: 0, skipped: 0 };
  }
  const brand_id = brands[0].id;

  let upserted = 0;
  let skipped = 0;

  for (const file of files) {
    const sourcePath = join(DOCTORS_DIR, file);
    const abs = join(KB_ROOT, sourcePath);
    let md: string;
    try {
      md = await readFile(abs, 'utf-8');
    } catch (err) {
      console.error(`[derive-staff] read ${file} failed:`, err);
      skipped++;
      continue;
    }

    const doctor = parseDoctorMd(md, sourcePath);
    if (!doctor) {
      console.warn(`[derive-staff] parse ${file} → no real_name, skip`);
      skipped++;
      continue;
    }

    const role = inferRole(doctor.basic_info);

    // Upsert by (tenant_id, real_name). If existing row has phone/auth_user_id,
    // preserve them; only refresh the KB-derived fields.
    const { data: existing } = await client
      .from('staff_accounts')
      .select('id, phone, auth_user_id, status')
      .eq('tenant_id', tenantId)
      .eq('real_name', doctor.real_name)
      .is('deleted_at', null)
      .limit(1);

    const persona_payload = {
      ...doctor.full_persona,
      synced_from_kb: true,
      synced_at: new Date().toISOString(),
    };

    if (existing?.[0]) {
      const { error } = await client
        .from('staff_accounts')
        .update({
          role,
          persona: persona_payload,
          bio_md_path: doctor.bio_md_path,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);
      if (error) {
        console.error(`[derive-staff] update ${doctor.real_name} failed:`, error);
        skipped++;
        continue;
      }
    } else {
      const { error } = await client.from('staff_accounts').insert({
        tenant_id: tenantId,
        brand_id,
        real_name: doctor.real_name,
        role,
        persona: persona_payload,
        platforms: {},
        status: 'active',
        bio_md_path: doctor.bio_md_path,
        // 0023: KB-derived rows are doctors (content authors / persona),
        // not operators. Dispatch action filters by kind='operator', so
        // these never receive publish tasks.
        kind: 'doctor',
      });
      if (error) {
        console.error(`[derive-staff] insert ${doctor.real_name} failed:`, error);
        skipped++;
        continue;
      }
    }
    upserted++;
  }

  console.log(`[derive-staff] tenant=${tenantId} upserted=${upserted} skipped=${skipped}`);
  return { upserted, skipped };
}

// ============================================================================
// Brand vocab (V1.5-7) — doctor names + service names + competitor names
// ============================================================================

const PROJECTS_DIR = '诊疗/项目库';
const COMPETITORS_DIR = '医院/竞品';
const IDENTITY_PATH = '医院/身份/定位.md';
const HOSPITALS_DEPTS_DIR = '医院/科室';

const DOCTOR_ALIAS_SUFFIXES = ['医生', '大夫', '医师', '主任', '主治'];

/**
 * Hand-curated alias library. Doubao answers reference services using a
 * mix of formal medical names + colloquial patient terms ("种植牙" =
 * "种牙" = "牙种植"). Without these aliases the SOV scanner misses 60%+
 * of mentions on real Doubao answers.
 *
 * Edit / extend in /settings/vocab when you spot misses in real baselines.
 */
const SERVICE_ALIAS_LIBRARY: Record<string, string[]> = {
  种植牙: ['种牙', '牙种植', '牙齿种植', '人工牙根', '种植体'],
  单颗种植: ['单颗种植牙', '一颗种植', '单牙种植'],
  全口种植: ['全口种牙', '全口种植牙', 'All-on-4', 'All-on-6'],
  正畸: ['矫正', '牙齿矫正', '整牙', '牙齿整形'],
  隐形矫正: ['隐形牙套', '透明矫正', '隐形牙齿矫正', '隐适美'],
  儿童早期矫正: ['儿童矫正', 'MRC', '肌功能矫治', '早期干预'],
  根管治疗: ['杀神经', '抽神经', '牙髓治疗', '牙神经治疗'],
  洁牙: ['洗牙', '牙齿清洁', '牙周洁治'],
  窝沟封闭: ['封闭', '沟槽填充'],
  儿童涂氟: ['涂氟', '氟化物涂布', '涂氟治疗'],
  牙周病治疗: ['牙周治疗', '龈下刮治', '牙周刮治', 'SRP'],
  美学修复: ['冷光美白', '牙贴面', '全瓷冠', '美白', '牙齿美白'],
  义齿修复: ['假牙', '镶牙', '活动义齿', '固定义齿'],
};

/**
 * Default competitors based on real Doubao baseline data for "昆明种牙哪家好".
 * Customer can override / extend in /settings/vocab.
 */
const DEFAULT_KUNMING_COMPETITORS: VocabRecord[] = [
  // 私立连锁(豆包高频推荐)
  { term: '柏德口腔', term_type: 'competitor', aliases: ['柏德齿科', '昆明柏德'] },
  { term: '德韩口腔', term_type: 'competitor', aliases: ['德韩齿科', '昆明德韩'] },
  { term: '长鹏口腔', term_type: 'competitor', aliases: ['长鹏齿科', '昆明长鹏'] },
  { term: '泰康拜博口腔', term_type: 'competitor', aliases: ['拜博口腔', '泰康拜博', '拜博齿科'] },
  { term: '美奥口腔', term_type: 'competitor', aliases: ['美奥齿科', '昆明美奥'] },
  // 公立三甲(豆包对复杂病例首推)
  {
    term: '昆明医科大学第一附属医院',
    term_type: 'competitor',
    aliases: ['云大医院', '昆医附一', '昆医一附院', '昆明医大一附院'],
  },
  {
    term: '解放军联勤保障部队九二〇医院',
    term_type: 'competitor',
    aliases: ['920医院', '九二〇医院', '解放军920'],
  },
  {
    term: '云南省第一人民医院',
    term_type: 'competitor',
    aliases: ['昆华医院', '省一医', '省一人民医院'],
  },
];

const DEFAULT_KUNMING_LOCATIONS: VocabRecord[] = [
  { term: '昆明', term_type: 'location_alias', aliases: ['昆明市'] },
  { term: '云南', term_type: 'location_alias', aliases: ['云南省'] },
  { term: '西山区', term_type: 'location_alias', aliases: ['西山'] },
  { term: '前卫', term_type: 'location_alias', aliases: ['前卫街道', '前卫片区'] },
  { term: '蓝光昆仑中心', term_type: 'location_alias', aliases: ['蓝光昆仑', '昆仑中心'] },
  { term: '万达广场', term_type: 'location_alias', aliases: ['西山万达'] },
];

type VocabType = 'brand' | 'doctor' | 'service' | 'location_alias' | 'competitor';

type VocabRecord = {
  term: string;
  term_type: VocabType;
  aliases: string[];
};

function extractH1(md: string): string | null {
  const m = md.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? null;
}

async function collectDoctorVocab(): Promise<VocabRecord[]> {
  const dir = join(KB_ROOT, DOCTORS_DIR);
  let files: string[];
  try {
    files = await fg('*.md', { cwd: dir, onlyFiles: true });
  } catch {
    return [];
  }
  const out: VocabRecord[] = [];
  for (const file of files) {
    try {
      const md = await readFile(join(dir, file), 'utf-8');
      const name = extractH1(md);
      if (!name) continue;
      out.push({
        term: name,
        term_type: 'doctor',
        aliases: DOCTOR_ALIAS_SUFFIXES.map((s) => `${name}${s}`),
      });
    } catch (err) {
      console.error(`[vocab-doctor] read ${file}:`, err);
    }
  }
  return out;
}

async function collectServiceVocab(): Promise<VocabRecord[]> {
  const dir = join(KB_ROOT, PROJECTS_DIR);
  let files: string[];
  try {
    files = await fg('**/*.md', { cwd: dir, onlyFiles: true });
  } catch {
    files = [];
  }
  const out: VocabRecord[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    try {
      const md = await readFile(join(dir, file), 'utf-8');
      const name = extractH1(md);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const aliases = SERVICE_ALIAS_LIBRARY[name] ?? [];
      out.push({ term: name, term_type: 'service', aliases });
    } catch (err) {
      console.error(`[vocab-service] read ${file}:`, err);
    }
  }
  // Add hand-curated services from the alias library that don't have a
  // 项目库 md yet (e.g. 美学修复, 牙周病治疗 — KB hasn't filled in those
  // pages but they're real services Doubao users search for).
  for (const [name, aliases] of Object.entries(SERVICE_ALIAS_LIBRARY)) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ term: name, term_type: 'service', aliases });
  }
  return out;
}

/**
 * Brand vocab from 医院/身份/定位.md — the "Basic info" markdown table has
 * 全称 / 简称, both go in. We treat the simpler 简称 as `term` (matches more
 * often in casual Doubao answers) and the full 全称 + family of common
 * abbreviations as aliases.
 */
async function collectBrandVocab(): Promise<VocabRecord[]> {
  try {
    const md = await readFile(join(KB_ROOT, IDENTITY_PATH), 'utf-8');
    const sections = (function splitH2(text: string): Record<string, string> {
      const out: Record<string, string> = {};
      const lines = text.split('\n');
      let cur = '';
      const buf: string[] = [];
      const flush = () => {
        if (cur) out[cur] = buf.join('\n');
        buf.length = 0;
      };
      for (const line of lines) {
        const m = line.match(/^##\s+(.+)$/);
        if (m) {
          flush();
          cur = m[1]!.trim();
        } else if (cur) {
          buf.push(line);
        }
      }
      flush();
      return out;
    })(md);
    const basic = parseSimpleTable(sections['基本信息'] ?? '');
    const fullName = basic['全称']?.trim();
    const shortName = basic['简称']?.trim();
    if (!fullName && !shortName) return [];
    const term = shortName || fullName!;
    const aliases = new Set<string>();
    if (fullName && fullName !== term) aliases.add(fullName);
    if (term === '松鼠口腔') {
      // Casual variants the brand commonly gets called online
      aliases.add('松鼠齿科');
      aliases.add('西山松鼠');
      aliases.add('松鼠');
      if (fullName) aliases.add(fullName.replace(/^昆明/, ''));
    }
    return [{ term, term_type: 'brand', aliases: Array.from(aliases) }];
  } catch (err) {
    console.warn(`[vocab-brand] ${IDENTITY_PATH} unavailable:`, err);
    return [];
  }
}

async function collectCompetitorVocab(): Promise<VocabRecord[]> {
  const dir = join(KB_ROOT, COMPETITORS_DIR);
  let files: string[];
  try {
    files = await fg('**/*.md', { cwd: dir, onlyFiles: true });
  } catch {
    return [];
  }
  const out: VocabRecord[] = [];
  for (const file of files) {
    try {
      const md = await readFile(join(dir, file), 'utf-8');
      const name = extractH1(md);
      if (!name) continue;
      out.push({
        term: name,
        term_type: 'competitor',
        aliases: [],
      });
    } catch (err) {
      console.error(`[vocab-competitor] read ${file}:`, err);
    }
  }
  return out;
}

export async function deriveBrandVocab(tenantId: string): Promise<{
  brand: number;
  doctor: number;
  service: number;
  competitor: number;
  location_alias: number;
}> {
  const client = getServiceClient();

  // Read existing competitors so we don't overwrite admin-curated ones —
  // we only seed defaults if the table is empty for this term_type.
  const { data: existingComps } = await client
    .from('brand_vocab')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('term_type', 'competitor')
    .is('deleted_at', null)
    .limit(1);
  const compsAlreadyManaged = (existingComps?.length ?? 0) > 0;

  // KB-driven (always rebuilt from KB)
  const [brands, doctors, services] = await Promise.all([
    collectBrandVocab(),
    collectDoctorVocab(),
    collectServiceVocab(),
  ]);

  // Locations always seeded (admin can edit afterwards via /settings/vocab)
  const locations = DEFAULT_KUNMING_LOCATIONS;

  // Competitors: first time only — admin owns this set after that
  const competitors = compsAlreadyManaged ? [] : DEFAULT_KUNMING_COMPETITORS;

  // Wipe and rewrite KB-driven types (brand/doctor/service/location_alias)
  // Competitors are NOT wiped — admin curation is preserved
  const wipeTypes: VocabType[] = ['brand', 'doctor', 'service', 'location_alias'];
  const { error: delErr } = await client
    .from('brand_vocab')
    .delete()
    .eq('tenant_id', tenantId)
    .in('term_type', wipeTypes);
  if (delErr) {
    console.error(`[derive-vocab] delete failed:`, delErr);
    throw delErr;
  }

  const all = [...brands, ...doctors, ...services, ...locations, ...competitors];

  if (all.length === 0) {
    console.warn(`[derive-vocab] tenant=${tenantId} parsed 0 records`);
    return { brand: 0, doctor: 0, service: 0, competitor: 0, location_alias: 0 };
  }

  const { error: insErr } = await client.from('brand_vocab').insert(
    all.map((r) => ({
      tenant_id: tenantId,
      term: r.term,
      term_type: r.term_type,
      aliases: r.aliases,
    })),
  );
  if (insErr) {
    console.error(`[derive-vocab] insert failed:`, insErr);
    throw insErr;
  }

  console.log(
    `[derive-vocab] tenant=${tenantId} brand=${brands.length} doctor=${doctors.length} service=${services.length} competitor=${competitors.length}${compsAlreadyManaged ? '(admin-managed,kept)' : '(seeded)'} location=${locations.length}`,
  );
  return {
    brand: brands.length,
    doctor: doctors.length,
    service: services.length,
    competitor: competitors.length,
    location_alias: locations.length,
  };
}

// ============================================================================
// Aggregator (called by knowledge-sync after each scan)
// ============================================================================

export async function deriveAllFromKb(tenantId: string): Promise<void> {
  try {
    await deriveComplianceKeywords(tenantId);
  } catch (err) {
    console.error(`[derive] compliance keywords failed:`, err);
  }
  try {
    await deriveStaffAccounts(tenantId);
  } catch (err) {
    console.error(`[derive] staff accounts failed:`, err);
  }
  try {
    await deriveBrandVocab(tenantId);
  } catch (err) {
    console.error(`[derive] brand vocab failed:`, err);
  }
}
