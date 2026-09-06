#!/usr/bin/env node
/**
 * check-xss.mjs — heuristic scan for unescaped interpolation in HTML sinks.
 *
 * Finds template literals that flow into innerHTML / outerHTML /
 * insertAdjacentHTML and flags `${...}` interpolations of API-provided
 * free-text fields (name / remark / code / spec / ...) that are NOT wrapped
 * in an escaping/safe-rendering helper.
 *
 * Safe contexts recognised (no report):
 *   - ${esc(expr)}, ${escV(expr)} — explicit HTML escaping;
 *   - ${badge(expr, ...)}, ${statusBadge(expr)}, ${fmtDT/fmtD/fmtNum(expr)}
 *     — these helpers escape their label;
 *   - ${optionHTML(list, key, x => `...${x.field}...`, ...)} — optionHTML
 *     escapes every option label and value internally, so interpolations
 *     inside its label callback are safe;
 *   - numeric/identity fields (id, *_id, counts) — server integers.
 *
 * This is a heuristic: output is a human-review checklist, not a verdict.
 *
 * Usage:
 *   node scripts/check-xss.mjs            # scan assets/js, report, exit 0
 *   node scripts/check-xss.mjs --strict   # exit 1 when candidates exist (CI)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STRICT = process.argv.includes('--strict');
const EXPLICIT = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// Free-text fields that can carry attacker-controlled markup.
const TEXT_FIELD =
  /\b(?:name|remark|note|reason|desc|description|address|spec|unit|goods_name|goods_spec|supplier_name|partner_name|customer_name|recipient|vehicle_no|vehicle_type|driver_name|batch_no|full_name|approval_ref|signature_ref|content|message|title|url|file_name|filename|code|version_no|generic_name|manufacturer|scope_description)\b/;
// Numeric / identity fields — safe, never reported.
const ID_FIELD = /\b(?:id|_id|user_id|actor_user_id|warehouse_id|goods_id|supplier_id|partner_id|document_id|count|total|page|size|limit|offset|quantity|ordered_quantity|price|created_by|updated_by|approved_by|expected_record_count|imported_record_count|duplicate_record_count|review_year|initial_rpn|owner_id|risk_id|target_rto_minutes|target_rpo_minutes|actual_rpo_minutes|max_allowed_minutes|checked_signature_count|snapshot|total|key|icon|label|year|month|day)\b/;
// Helpers that escape their argument.
const SAFE_HELPER =
  /\b(?:esc|escV|badge|statusBadge|fmtDT|fmtD|fmtNum|JSON\.stringify|encodeURIComponent)\s*\(/;
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

/**
 * Given a template-literal accumulator (possibly multi-line) and the starting
 * source index, decide whether the given expression at column `col` is inside
 * an optionHTML label callback — i.e. within `optionHTML(...)` up to its
 * matching close paren.  We approximate by locating the nearest enclosing
 * `optionHTML(` before the match and checking the match lies before its
 * balanced close.
 */
function insideOptionHTML(acc, idx) {
  // scan backwards for the nearest 'optionHTML(' whose open paren is unbalanced
  const upto = acc.slice(0, idx);
  let depth = 0;
  // walk forward from 0 to idx tracking paren balance and last optionHTML open
  let inOpt = false;
  for (let i = 0; i < idx; i++) {
    const ch = acc[i];
    if (ch === '(') {
      // detect optionHTML( immediately before
      const pre = acc.slice(Math.max(0, i - 12), i);
      if (pre.endsWith('optionHTML')) { inOpt = true; depth = 1; i++; continue; }
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth <= 0) inOpt = false;
    }
  }
  return inOpt;
}

function scan(source) {
  const lines = source.split('\n');
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    if (!SINK.test(lines[i])) continue;
    // A `// xss-safe` suppression on the sink line (or the line above) marks a
    // human-reviewed safe sink (e.g. optionHTML label callbacks, nested esc).
    const prev = i > 0 ? lines[i - 1] : '';
    if (/\/\/\s*xss-safe/.test(lines[i] + prev)) { continue; }
    // Consume template literal(s) opened on/after this line.
    let acc = lines[i];
    let backticks = (acc.match(/(?<!\\)`/g) || []).length;
    let end = i;
    while (backticks % 2 === 1 && end + 1 < lines.length) {
      end += 1;
      acc += '\n' + lines[end];
      backticks += (lines[end].match(/(?<!\\)`/g) || []).length;
    }
    for (const m of acc.matchAll(/\$\{([^}]*)\}/g)) {
      const expr = m[1].trim();
      if (!expr) continue;
      if (ID_FIELD.test(expr) && !TEXT_FIELD.test(expr)) continue; // identity/numeric only
      if (!TEXT_FIELD.test(expr)) continue;
      if (SAFE_HELPER.test(expr)) continue;
      if (insideOptionHTML(acc, m.index)) continue;
      findings.push({ line: i + 1, expr, sample: acc.split('\n')[0].trim().slice(0, 70) });
    }
    i = end;
  }
  return findings;
}

const files = EXPLICIT.length ? EXPLICIT : walk(join(ROOT, 'assets/js'));
let total = 0;
for (const f of files) {
  if (!f.endsWith('.js')) continue;
  const rel = f.startsWith(ROOT) ? f.slice(ROOT.length) : f;
  const hits = scan(readFileSync(f, 'utf-8'));
  if (!hits.length) continue;
  console.log(`== ${rel}`);
  for (const h of hits) {
    console.log(`   L${h.line}  $${'{'}${h.expr}${'}'}   | ${h.sample}`);
    total += 1;
  }
}
console.log(`check-xss: scanned ${files.length} file(s), ${total} candidate(s) for review.`);
if (STRICT && total > 0) process.exit(1);
process.exit(0);
