#!/usr/bin/env node
/**
 * check-xss.mjs — heuristic scan for unescaped interpolation in HTML sinks.
 *
 * Flags `${...}` interpolations of API-provided free-text fields that flow
 * into innerHTML / outerHTML / insertAdjacentHTML without an escaping helper.
 *
 * Field-level safety analysis (firstUnescapedField):
 *   a field access like `u.name` is reported ONLY when it is not wrapped by an
 *   escaping helper (esc/escV/badge/statusBadge/fmtDT/fmtD/fmtNum/...),
 *   is not inside an optionHTML(...) call (escapes labels & values), and is
 *   not an identity/numeric field (id, *_id, counts, page, ...).
 *
 * Precise suppression (per interpolation, never per whole sink):
 *   // xss-safe:TOKEN    on the same / adjacent line -> skips interpolations
 *                       whose expression contains TOKEN;
 *   // xss-safe          (bare) on the line directly above the sink line ->
 *                       skips interpolations of that sink only.
 *
 * Structural limits (documented): sinks built by concatenating many template
 * fragments across statements are only followed for the simple single
 * variable pattern (const html = `...`; el.innerHTML = html).  Run
 * `--selftest` to pin behaviour with positive/negative fixtures.
 *
 * Usage:
 *   node scripts/check-xss.mjs             # scan assets/js, report, exit 0
 *   node scripts/check-xss.mjs --strict    # exit 1 when candidates exist (CI)
 *   node scripts/check-xss.mjs --selftest  # run fixtures (exit 1 on failure)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELFTEST = process.argv.includes('--selftest');
const STRICT = process.argv.includes('--strict');
const EXPLICIT = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// Free-text fields (matched as property access `.field` so HTML tags like
// `<code>` are never flagged).  Controlled enums rendered through label
// mappers (document_type via docTypeLabel, status via statusBadge, ...) are
// intentionally excluded.
const TEXT_FIELD =
  /\.(?:name|remark|note|reason|desc|description|address|spec|unit|goods_name|goods_spec|supplier_name|partner_name|customer_name|recipient|vehicle_no|vehicle_type|driver_name|batch_no|full_name|approval_ref|signature_ref|content|message|title|url|file_name|filename|code|version_no|generic_name|manufacturer|scope_description|source_system|source_instance|mapping_version|record_hash|search_text|payload)\b/;
const ID_FIELD = /\b(?:id|_id|user_id|actor_user_id|warehouse_id|goods_id|supplier_id|partner_id|document_id|count|total|page|size|limit|offset|quantity|ordered_quantity|price|created_by|updated_by|approved_by|expected_record_count|imported_record_count|duplicate_record_count|review_year|initial_rpn|owner_id|risk_id|target_rto_minutes|target_rpo_minutes|actual_rpo_minutes|max_allowed_minutes|checked_signature_count|snapshot|total|key|icon|label|year|month|day|vehicle_id|shipment_id|batch_id|goods_id|entity_type)\b/;
const SINK = /innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Extract balanced `${...}` interpolation bodies (handles nested `${}`). */
function interpolations(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const s = text.indexOf('${', i);
    if (s < 0) break;
    let depth = 1;
    let j = s + 2;
    while (j < text.length && depth > 0) {
      const c = text[j];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      j += 1;
    }
    out.push({ expr: text.slice(s + 2, j - 1), pos: s });
    i = j;
  }
  return out;
}

/** [start,end) spans of top-level optionHTML(...) calls in a string. */
function optionHTMLSpans(str) {
  const spans = [];
  const re = /\boptionHTML\s*\(/g;
  let m;
  while ((m = re.exec(str))) {
    const open = m.index + m[0].length - 1;
    let depth = 1;
    let close = -1;
    for (let k = open + 1; k < str.length; k++) {
      if (str[k] === '(') depth += 1;
      else if (str[k] === ')') {
        depth -= 1;
        if (depth === 0) { close = k; break; }
      }
    }
    if (close > 0) spans.push([m.index, close + 1]);
  }
  return spans;
}

const HELPER_OPEN = /\b(?:esc|escV|badge|statusBadge|fmtDT|fmtD|fmtNum|encodeURIComponent)\s*\(/g;

function isWrappedByHelper(expr, pos) {
  // any helper whose call opens before pos and closes after pos
  const re = new RegExp(HELPER_OPEN.source, 'g');
  let m;
  while ((m = re.exec(expr))) {
    if (m.index >= pos) continue;
    const open = m.index + m[0].length - 1;
    let depth = 1;
    for (let k = open + 1; k < expr.length; k++) {
      if (expr[k] === '(') depth += 1;
      else if (expr[k] === ')') {
        depth -= 1;
        if (depth === 0) {
          if (k > pos) return true;
          break;
        }
      }
    }
  }
  return false;
}

/** Return the first unescaped free-text field of an interpolation, or null. */
function firstUnescapedField(expr, spans) {
  let m;
  const re = new RegExp(TEXT_FIELD.source, 'g');
  while ((m = re.exec(expr))) {
    const pos = m.index;
    const field = m[0];
    if (ID_FIELD.test(field)) continue;
    if (spans.some(([s, e]) => pos > s && pos < e)) continue; // optionHTML escapes
    if (isWrappedByHelper(expr, pos)) continue;
    return field;
  }
  return null;
}

function suppressions(lines) {
  const map = {};
  for (let i = 0; i < lines.length; i++) {
    const toks = [];
    const re = /\/\/\s*xss-safe(?::|\s+)([\w.$[\]]+)/g;
    let m;
    while ((m = re.exec(lines[i]))) toks.push(m[1]);
    if (/\/\/\s*xss-safe\s*$/.test(lines[i])) toks.push('*');
    if (toks.length) map[i + 1] = toks;
  }
  return map;
}

function scan(source) {
  const lines = source.split('\n');
  const supp = suppressions(lines);
  const findings = [];

  const directSinks = [];
  for (let i = 0; i < lines.length; i++) if (SINK.test(lines[i])) directSinks.push(i);

  // simple indirect pattern: const html = `...`; el.innerHTML = html
  const tplByVar = {};
  const assignRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(`(?:[^`]|\\`)*`)/g;
  for (const line of lines) {
    let m;
    while ((m = assignRe.exec(line))) {
      if (!SINK.test(line)) tplByVar[m[1]] = m[2];
    }
  }

  function analyseTemplate(tpl, baseLine, out) {
    const spans = optionHTMLSpans(tpl);
    for (const { expr, pos } of interpolations(tpl)) {
      const clean = expr.trim();
      if (!clean) continue;
      const inSpan = spans.some(([s, e]) => pos > s && pos < e);
      if (inSpan || /^optionHTML\s*\(/.test(clean)) continue;
      const unescaped = firstUnescapedField(clean, spans);
      if (unescaped === null) continue;
      const absLine = baseLine + 1;
      const fromAbove = supp[absLine - 1] || [];
      const sameLine = supp[absLine] || [];
      const fromBelow = supp[absLine + 1] || [];
      if (fromAbove.includes('*') || sameLine.includes('*')) continue;
      const toks = fromAbove.concat(sameLine, fromBelow);
      if (toks.some((t) => t !== '*' && clean.includes(t))) continue;
      out.push({ line: absLine, field: unescaped, expr: clean.slice(0, 120) });
    }
  }

  for (let idx = 0; idx < directSinks.length; idx++) {
    const i = directSinks[idx];
    const line = lines[i];

    const ind = line.match(/(?:innerHTML|outerHTML)\s*=\s*([A-Za-z_$][\w$]*)\s*;?\s*$/);
    if (ind && tplByVar[ind[1]]) {
      const start = line.search(tplByVar[ind[1]].slice(0, 20)); // heuristic col ignore
      void start;
      // reconstruct: scan from where the var was defined is complex; analyse tpl alone
      const tpl = tplByVar[ind[1]];
      const base = i;
      const spans = optionHTMLSpans(tpl);
      for (const { expr } of interpolations(tpl)) {
        const clean = expr.trim();
        if (!clean) continue;
        if (/^optionHTML\s*\(/.test(clean)) continue;
        const unescaped = firstUnescapedField(clean, spans);
        if (unescaped === null) continue;
        if ((supp[base + 1] || []).includes('*') || (supp[base] || []).includes('*')) continue;
        findings.push({ line: base + 1, field: unescaped, expr: clean.slice(0, 120) });
      }
      continue;
    }

    // direct: consume the template literal opened on/after this line
    let acc = line;
    let backticks = (acc.match(/(?<!\\)`/g) || []).length;
    let end = i;
    while (backticks % 2 === 1 && end + 1 < lines.length) {
      end += 1;
      acc += '\n' + lines[end];
      backticks += (lines[end].match(/(?<!\\)`/g) || []).length;
    }
    // analyse each source line's slice of the block so reported line numbers
    // point at the interpolation, not the sink opener
    const blockLines = acc.split('\n');
    for (let k = 0; k < blockLines.length; k++) {
      const spans = optionHTMLSpans(blockLines[k]);
      for (const { expr, pos } of interpolations(blockLines[k])) {
        const clean = expr.trim();
        if (!clean) continue;
        const inSpan = spans.some(([s, e]) => pos > s && pos < e);
        if (inSpan || /^optionHTML\s*\(/.test(clean)) continue;
        const unescaped = firstUnescapedField(clean, spans);
        if (unescaped === null) continue;
        const absLine = i + k + 1;
        const fromAbove = supp[absLine - 1] || [];
        const sameLine = supp[absLine] || [];
        const fromBelow = supp[absLine + 1] || [];
        if (fromAbove.includes('*') || sameLine.includes('*')) continue;
        const toks = fromAbove.concat(sameLine, fromBelow);
        if (toks.some((t) => t !== '*' && clean.includes(t))) continue;
        findings.push({ line: absLine, field: unescaped, expr: clean.slice(0, 120) });
      }
    }
    while (idx + 1 < directSinks.length && directSinks[idx + 1] <= end) idx += 1;
  }
  return findings;
}

function selftest() {
  const cases = [
    ['el.innerHTML = `<td>${esc(u.name)}</td>`;', false],
    ['el.innerHTML = `<td>${u.name}</td>`;', true],
    ['el.innerHTML = `<td>${u.id}</td>`;', false],
    ['el.innerHTML = `<td>${u.remark || esc(u.name)}</td>`;', true],
    ['el.innerHTML = `<select>${optionHTML(list, "id", x => `${x.name}（${x.spec}）`)}</select>`;', false],
    ['el.innerHTML = `${optionHTML(list, "id", x => `${x.name}`)}`;', false],
    ['const html = `<td>${u.name}</td>`; box.innerHTML = html;', true],
    ['const html = `<td>${esc(u.name)}</td>`; box.innerHTML = html;', false],
    ['// xss-safe:u.name\nbox.innerHTML = `<td>${u.name}</td>`;', false],
    ['// xss-safe\nbox.innerHTML = `<td>${u.remark}</td>`;\nbox.innerHTML = `<td>${u.name}</td>`;', true],
    ['el.innerHTML = `<td>${fmtDT(u.created_at)}</td>`;', false],
    ['el.innerHTML = `<td>${u.status}</td>`;', false],
  ];
  let failed = 0;
  for (const [src, expectFinding] of cases) {
    const hits = scan(src);
    const got = hits.length > 0;
    if (got !== expectFinding) {
      failed += 1;
      console.error(`selftest FAIL: ${JSON.stringify(src.slice(0, 90))} expected ${expectFinding ? 'finding' : 'clean'} got ${hits.length}`);
    }
  }
  console.log(`check-xss selftest: ${cases.length - failed}/${cases.length} passed`);
  return failed;
}

if (SELFTEST) process.exit(selftest());

const files = EXPLICIT.length ? EXPLICIT : walk(join(ROOT, 'assets/js'));
let total = 0;
for (const f of files) {
  if (!f.endsWith('.js')) continue;
  const rel = f.startsWith(ROOT) ? f.slice(ROOT.length) : f;
  const hits = scan(readFileSync(f, 'utf-8'));
  if (!hits.length) continue;
  console.log(`== ${rel}`);
  for (const h of hits) {
    console.log(`   L${h.line}  field=${h.field}  $${'{'}${h.expr}${'}'}`);
    total += 1;
  }
}
console.log(`check-xss: scanned ${files.length} file(s), ${total} candidate(s) for review.`);
if (STRICT && total > 0) process.exit(1);
process.exit(0);
