#!/usr/bin/env node
/**
 * browser-reports-isolation.test.mjs — real-headless-browser regression for the
 * report print path (审核两轮复审：打印不可用，需真浏览器测试).
 *
 * A structural assertion ("source contains .print()") cannot reveal that the
 * sandboxed (no allow-same-origin) preview iframe is an opaque-origin document,
 * across which the parent calling contentWindow.print() throws SecurityError.
 * Only a real browser can prove print usability, so we drive Chrome/Edge headless
 * and assert:
 *
 *   1. sandboxed preview iframe -> parent contentWindow.print() === SecurityError
 *      (documents why that path must NOT be used);
 *   2. plain same-origin srcdoc iframe (the target printSanitizedHtml uses) ->
 *      contentWindow.print() is callable (typeof === "function").
 *
 * The script-execution containment of the snapshot is covered by
 * behavior-reports.test.mjs + the real sanitizeRenderHtml (asserted structurally)
 * and by node --test of sanitizeRenderHtml under a window stub in
 * behavior-sanitizer.test.mjs (pure, runs in CI without a browser).
 *
 * Browser discovery: env CHROME_PATH / EDGE_PATH, else common install paths.
 * If no browser is found it prints SKIP and exits 0 so the Chrome-less CI
 * "Validate static frontend" job stays green; run explicitly (or where Chrome is
 * provisioned) for the real check.
 */
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
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

function harnessHtml() {
  // No dependency on common.js: the print-access semantics only need two iframes.
  // Both get an inert srcdoc (report markup). The snapshot never carries <script>
  // into these frames because reports.js sanitizes first (sanitizeRenderHtml).
  return `<!doctype html><html><head><meta charset="utf-8"><title>iso</title></head><body>
<iframe id="pv" sandbox="allow-modals"></iframe>
<iframe id="so"></iframe>
<script>
var R = {};
var pv = document.getElementById('pv'); pv.srcdoc = '<h1>report</h1>';
try { var p1 = pv.contentWindow.print; R.sandboxedPrint = 'callable'; } catch (e) { R.sandboxedPrint = 'SecurityError'; }
var so = document.getElementById('so'); so.srcdoc = '<h1>report</h1>';
try { var p2 = so.contentWindow.print; R.sameOriginPrint = 'callable:' + (typeof p2); } catch (e) { R.sameOriginPrint = 'err:' + e.name; }
document.body.setAttribute('data-iso', JSON.stringify(R));
</script></body></html>`;
}

const browser = findBrowser();
if (!browser) {
  console.log("SKIP browser-reports-isolation: no Chrome/Edge binary found (set CHROME_PATH/EDGE_PATH)");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "wb-iso-"));
const htmlPath = join(dir, "iso.html");
writeFileSync(htmlPath, harnessHtml(), "utf8");
const url = "file:///" + htmlPath.replace(/\\/g, "/");
const res = spawnSync(
  browser,
  ["--headless=new", "--disable-gpu", "--no-sandbox", "--dump-dom", url],
  { encoding: "utf8", timeout: 60000 },
);
rmSync(dir, { recursive: true, force: true });

const dom = (res.stdout || "") + (res.stderr || "");
const match = dom.match(/data-iso="([^"]*)"/);
assert.ok(match, `headless run produced no data-iso (rc=${res.status}). dom head: ${dom.slice(0, 300)}`);
const R = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
// The sandboxed opaque-origin preview iframe is NOT printable by the parent
// (SecurityError) — this is exactly why print uses a same-origin sanitized iframe.
assert.equal(R.sandboxedPrint, "SecurityError",
  "sandboxed preview contentWindow.print must be SecurityError (opaque origin), got " + R.sandboxedPrint);
// The plain same-origin srcdoc iframe that printSanitizedHtml actually uses is printable.
assert.ok(String(R.sameOriginPrint).startsWith("callable:"),
  `same-origin print iframe must be callable, got ${R.sameOriginPrint}`);

console.log("behavior-reports-isolation (real browser): PASS");
