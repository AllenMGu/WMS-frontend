// Regression checks for the reports centre page (PR #14 review items).
// Executable structural assertions over the real page/nav sources.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(join(root, f), "utf8");
const reports = read("assets/js/pages/reports.js");
const common = read("assets/js/common.js");
const appjs = read("assets/js/app.js");
const apphtml = read("app.html");

// 1) preview reports must not offer the controlled-print button
assert.match(reports, /\$\{current\.production_ready \? '<button class="btn btn-primary btn-sm" id="rbPrint"/);
assert.match(reports, /: '<button class="btn btn-warning btn-sm" id="rbPreview"/);
assert.ok(!/^\s*<button class="btn btn-primary btn-sm" id="rbPrint"><\/button>\s*$/m.test(reports), "no unconditional rbPrint");
// 2) preview payload uses the current page
assert.ok(reports.includes("const body = { reason, limit: page.limit, offset: page.offset, preview };"), "payload keeps current page");
// 3) prints ledger server pagination (offset/total/has_more + controls)
assert.ok(reports.includes("offset=${printsPage.offset}"), "ledger server offset");
assert.ok(reports.includes("printsPage.total") && reports.includes("printsPage.hasMore"), "ledger totals");
assert.ok(reports.includes('id="rptPrv"') && reports.includes('id="rptNext"'), "ledger pager controls");
// 4) server-managed tables skip the global client pager
assert.ok((reports.match(/data-no-pagination="true"/g) || []).length >= 2, "server-managed tables");
// 5) front-end role gate + hub description
assert.ok(common.includes("'reports.html': ['ANY_GSP_ROLE']"), "PAGE_ROLE_ACCESS reports");
assert.ok(appjs.includes("'reports.html': '业务报表"), "HUB_DESCS reports");
// 6) wording keeps previews non-controlled
assert.ok(reports.includes("打印记录台账（正式受控 / 开发预览）"), "ledger heading");
assert.ok(reports.includes("校验通过：预览记录内容与后端快照一致"), "preview verify wording");
// 7) cache-busted assets so the new nav entry is not served stale
assert.ok(apphtml.includes("20260906-reports"), "asset version bumped");

console.log("behavior-reports: structural regression checks passed");
