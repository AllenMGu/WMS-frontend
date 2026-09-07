#!/usr/bin/env node
/**
 * behavior-sanitizer.test.mjs — unit test of the REAL sanitizeRenderHtml shipped
 * in assets/js/common.js. Runs in Node (no browser needed), so CI always checks
 * the snapshot script/event/javascript: containment that protects the report
 * preview + print path.
 *
 * The two functions are self-contained (sanitizeRenderHtml + esc), so we extract
 * them by balanced-brace matching and eval them in isolation — no full app env.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const common = readFileSync(join(root, "assets/js/common.js"), "utf8");

/** Extract the source of `function name(...) { ... }` using balanced-brace counting. */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `function ${name} not found in common.js`);
  const brace = src.indexOf("{", start);
  assert.ok(brace !== -1, `no body brace for ${name}`);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

const sanitizer = extractFn(common, "sanitizeRenderHtml");
const escFn = extractFn(common, "esc");
// eval in this module scope so the two functions see each other.
// eslint-disable-next-line no-eval
const load = (code) => (0, eval)(code);
load(escFn);
load(sanitizer);

const cases = [
  {
    name: "inline <script> tag removed",
    input: "<div>a</div><script>alert(1)</script><script src='//x'></script><div>b</div>",
    mustNot: [/<script/i, /<\/script/i],   // no script ELEMENT remains; body text is inert
    mustContain: ["<div>a</div>", "<div>b</div>"],
  },
  {
    name: "event handlers removed",
    input: `<img src=x onerror="alert(1)"><a href="y" onclick='evil()'>z</a><div onmouseover=o()>w</div>`,
    mustNot: [/onerror/i, /onclick/i, /onmouseover/i],
  },
  {
    name: "embedding tags removed",
    input: `<iframe srcdoc="x"></iframe><object data="x"></object><embed src="y"><applet></applet>`,
    mustNot: [/<iframe/i, /<object/i, /<embed/i, /<applet/i],
  },
  {
    name: "javascript: URL neutralized (never a bare executable scheme)",
    input: `<a href="javascript:alert(1)">go</a><a href='  javascript:window.x=1'>x</a>`,
    mustNot: [/"javascript:/, /'javascript:/, /\sjavascript:/i],  // no bare scheme remains
    mustContain: ["x-javascript:"],  // neutralized prefix is inert
  },
  {
    name: "data:text/html src neutralized",
    input: `<a href="data:text/html,<script>1</script>">d</a>`,
    mustNot: [/data:text\/html/i],
  },
  {
    name: "legit report markup preserved",
    input: `<h1>库存报表</h1><table><tr><td>批号 20260901</td></tr></table><style>.w{color:red}</style>`,
    mustNot: [],
    mustContain: ["库存报表", "20260901", "<style>"],
  },
  {
    name: "case/space variations of script stripped",
    input: `<SCRiPT >x</SCRIPT><script\ttype="text/javascript">y</script>`,
    mustNot: [/script/i],
  },
];

let passed = 0;
for (const c of cases) {
  const out = sanitizeRenderHtml(c.input);
  for (const re of c.mustNot || []) {
    assert.ok(!re.test(out), `${c.name}: output still matches ${re} -> ${out}`);
  }
  for (const needle of c.mustContain || []) {
    assert.ok(out.includes(needle), `${c.name}: output missing ${needle} -> ${out}`);
  }
  passed++;
}

// fail-closed: a browser-coded obfuscated vector that evades the blacklist must
// still be downgraded to plain text (esc) rather than executed. Inject a raw
// newline-split attribute that could slip a handler — sanitizer must catch on\w+.
const tricky = `<img\nonerror\n=alert(1)>`;
const trickyOut = sanitizeRenderHtml(tricky);
assert.ok(!/onerror/.test(trickyOut), `fail-closed: output still has onerror -> ${trickyOut}`);

console.log(`behavior-sanitizer: ${passed} cases + fail-closed PASS`);
