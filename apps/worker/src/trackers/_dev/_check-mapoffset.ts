/** D76 自检:mapOffset 差一位。用 agent 实测复现的那个例子。 */
import { scanBrandMentions } from '@geo/geo-core';
const vocab = [{ id: 'v1', term: '昆明松鼠口腔', term_type: 'brand' as const, aliases: [] }];
const text = '参考 16 篇资料 昆明松鼠口腔医院是二级专科';
const r = scanBrandMentions(text, vocab);
const m = r.mentions[0];
if (!m) { console.error('FAIL: 没扫到'); process.exit(1); }
console.log(`offset=${m.offset}  matched_span="${m.matched_span}"`);
if (m.matched_span.startsWith(' ')) { console.error('🔴 FAIL: span 仍以空格开头,差一位没修好'); process.exit(1); }
if (m.matched_span !== '昆明松鼠口腔') { console.error(`🔴 FAIL: span 应为「昆明松鼠口腔」,实际「${m.matched_span}」`); process.exit(1); }
console.log('✅ 自检通过:span 正确切在首字');
