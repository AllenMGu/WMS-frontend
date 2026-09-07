#!/usr/bin/env node
/**
 * browser-reports-isolation.test.mjs — real-headless-browser regression for the
 * report print path. Both sandboxed-print-availability AND print-timing/content
 * readiness are checked against a real Chrome/Edge instance.
 *
 *   1. SANDBOX PRINT-AVAILABILITY: a sandboxed (no allow-same-origin) preview
 *      iframe is an opaque-origin document; the parent calling its
 *      contentWindow.print() must throw SecurityError. This documents why the
 *      print path must NOT use the sandboxed preview.
 *
 *   2. PRINT-TIMING + CONTENT-READY: the real reports.js#printSanitizedHtml is
 *      loaded into a bare harness with a stub showToast. A same-origin srcdoc
 *      iframe whose <script> wraps window.print to record the body innerText
 *      at the moment of the print call receives a report payload. The test
 *      asserts the recorded content is the report body (not "" / not "about:blank"),
 *      and that the iframe is removed after the print (no leftover node).
 *
 * Browser discovery: env CHROME_PATH / EDGE_PATH, else common install paths.
 * If no browser is found the test prints "SKIP" and exits 0 so the Chrome-less
 * CI "Validate static frontend" job stays green. Provide CHROME_PATH to enable.
 */
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    process.env.EDGE_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const r = spawnSync(p, ["--version"], { encoding: "utf8", timeout: 10000 });
      if (r.status === 0 && r.stdout) return p;
    } catch { /* keep probing */ }
  }
  return null;
}

/** Extract a function by balanced-brace counting. */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

function harnessHtml() {
  // Inline extractFn for the same function the harness builds. We do not load
  // reports.js directly (it sits in an IIFE, depends on api/openModal/etc.).
  // Instead, the Node runner embeds the function source via a token, after
  // reading reports.js. That way we test the EXACT shipped code.
  return `<!doctype html><html><head><meta charset="utf-8"><title>iso</title></head><body>
<iframe id="pv" sandbox="allow-modals"></iframe>
<iframe id="so"></iframe>
<script>
var R = {};
var pv = document.getElementById('pv'); pv.srcdoc = '<h1>report</h1>';
try { var p1 = pv.contentWindow.print; R.sandboxedPrint = 'callable'; } catch (e) { R.sandboxedPrint = 'SecurityError'; }
var so = document.getElementById('so'); so.srcdoc = '<h1>report</h1>';
try { var p2 = so.contentWindow.print; R.sameOriginPrint = 'callable:' + (typeof p2); } catch (e) { R.sameOriginPrint = 'err:' + e.name; }

// === Real printSanitizedHtml from reports.js (loaded by the Node runner) ===
__EMBEDDED__
var showToast = function(){ /* noop */ };
// Child srcdoc wraps window.print to record what is on the page at print time
// and to publish the captured body to window.parent so the harness can read it
// even after the print iframe is removed from the DOM.
function runPrintScenario() {
  var REPORT = '<!doctype html><html><body><h1 id="rpt-title">REPORT-2026-09-07</h1><table><tr><td>批号 ABC-001</td></tr></table></body></html>';
  var WRAPPER = '<!doctype html><html><head><script>'
    + 'window.__printed = false;'
    + 'var _orig = window.print.bind(window);'
    + 'window.print = function(){ '
    + '  window.__printed = true; '
    + '  try { window.parent.__testBody = document.body && document.body.innerText; } catch(e){} '
    + '  try { window.parent.__testDone = true; } catch(e){} '
    + '  try { _orig(); } catch(e){} '
    + '};'
    + '<' + '/script></head><body>' + REPORT + '</body></html>';

  window.__testBody = null;
  window.__testDone = false;

  // === Run the REAL printSanitizedHtml ===
  printSanitizedHtml(WRAPPER);

  // Poll for window.__testDone (set by the print wrapper inside the child).
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (window.__testDone) {
      clearInterval(iv);
      R.print = {
        capturedBody: window.__testBody || '',
        containsReport: !!(window.__testBody && window.__testBody.indexOf('REPORT-2026-09-07') !== -1),
        containsBatch: !!(window.__testBody && window.__testBody.indexOf('批号 ABC-001') !== -1),
        frameRemoved: !document.querySelector('iframe[aria-hidden="true"]'),
      };
      document.body.setAttribute('data-iso', JSON.stringify(R));
      document.title = 'ISO:'+JSON.stringify(R);
      return;
    }
    if (tries > 400) { clearInterval(iv);
      R.print = { capturedBody: 'NEVER_CALLED', containsReport:false, containsBatch:false, frameRemoved:!document.querySelector('iframe[aria-hidden="true"]') };
      document.body.setAttribute('data-iso', JSON.stringify(R));
    }
  }, 5);
}
runPrintScenario();
</script></body></html>`;
}

const requireBrowser = process.argv.includes("--require-browser")
  || process.env.REQUIRE_BROWSER === "1";
const browser = findBrowser();
if (!browser) {
  // By default we SKIP so a Chrome-less local run / non-browser CI job stays green;
  // pass --require-browser (or REQUIRE_BROWSER=1) to FAIL when no browser exists so
  // the dedicated browser job proves the assertions actually ran.
  const msg = "browser-reports-isolation: no Chrome/Edge binary found (set CHROME_PATH/EDGE_PATH)";
  if (requireBrowser) {
    console.error("FAIL " + msg);
    process.exit(1);
  }
  console.log("SKIP " + msg);
  process.exit(0);
}

const reports = readFileSync(join(root, "assets/js/pages/reports.js"), "utf8");
const printFn = extractFn(reports, "printSanitizedHtml");
const html = harnessHtml().replace("__EMBEDDED__", printFn);

const dir = mkdtempSync(join(tmpdir(), "wb-iso-"));
const htmlPath = join(dir, "iso.html");
writeFileSync(htmlPath, html, "utf8");
const url = "file:///" + htmlPath.replace(/\\/g, "/");

// Single dump-dom pass with virtual-time-budget so async setInterval polls
// complete before the DOM is serialized.
const res = spawnSync(
  browser,
  ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=3000", "--dump-dom", url],
  { encoding: "utf8", timeout: 60000 },
);
rmSync(dir, { recursive: true, force: true });

const dom = (res.stdout || "") + (res.stderr || "");
const match = dom.match(/data-iso="([^"]*)"/);
if (!match) throw new Error(`no data-iso found (rc=${res.status}). dom head: ${dom.slice(0, 400)}`);
const R = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

// === Assertion 1: sandboxed preview is NOT printable ===
assert.equal(R.sandboxedPrint, "SecurityError",
  "sandboxed preview contentWindow.print must be SecurityError (opaque origin), got " + R.sandboxedPrint);

// === Assertion 2: same-origin srcdoc iframe is printable ===
assert.ok(String(R.sameOriginPrint).startsWith("callable:"),
  `same-origin print iframe must be callable, got ${R.sameOriginPrint}`);

// === Assertion 3: real printSanitizedHtml actually fired and captured content ===
assert.notEqual(R.print.capturedBody, "NEVER_CALLED", "print() was never called inside the print iframe");
assert.notEqual(R.print.capturedBody, "", "print() captured empty body (race: about:blank printed before srcdoc loaded?)");
assert.equal(R.print.containsReport, true,
  `print() did not capture the report body; got ${JSON.stringify(R.print.capturedBody).slice(0, 200)}`);
assert.equal(R.print.containsBatch, true,
  `print() captured body missing report data; got ${JSON.stringify(R.print.capturedBody).slice(0, 200)}`);
assert.equal(R.print.frameRemoved, true, "print iframe was not removed after print (cleanup leak)");

console.log("behavior-reports-isolation (real browser): PASS");
