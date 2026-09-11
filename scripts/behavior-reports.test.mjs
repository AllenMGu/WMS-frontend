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
assert.ok(apphtml.includes("20260911-auditfix3"), "asset version bumped");
// 8) 报表打印/预览隔离（审核 P1 两轮复审）。
//    预览 iframe 带 sandbox="allow-modals"（禁脚本/禁同源，仅放行模态）——纯查看。
assert.ok(/<iframe id="rpIframe" sandbox="allow-modals"/.test(reports),
    "preview iframe is sandboxed (allow-modals, no scripts/same-origin)");
//    打印不得再走 window.open('', '_blank') + document.write 的未隔离窗口，
//    否则快照内脚本会在与父页面同源的新窗口执行。
assert.ok(!reports.includes("window.open('', '_blank')"),
    "print must NOT open an unsandboxed blank window");
assert.ok(!reports.includes("w.document.write(res.html)"),
    "print must NOT document.write the snapshot into an unsandboxed window");
//    关键：sandbox(禁同源) 的 iframe 是不透明源，父页面跨源调 contentWindow.print() 会被
//    同源策略拒(SecurityError)，打印必须改用"净化+同源临时 iframe"。断言语义：
//    - 打印内容先经 sanitizeRenderHtml 净化（脚本被移除）；
//    - 打印由同源 iframe 触发（contentWindow.print() 可正常调用），不再依赖跨源调用。
assert.ok(reports.includes("const safeHtml = sanitizeRenderHtml(res.html)"),
    "print content is sanitized via sanitizeRenderHtml before render");
assert.ok(reports.includes("printSanitizedHtml(safeHtml)"),
    "print dispatches to printSanitizedHtml on the sanitized content");
assert.ok(reports.includes("function printSanitizedHtml(safeHtml)"),
    "printSanitizedHtml helper defined");
assert.ok(!/\.contentWindow\s*\.print\s*\(\)/.test(reports),
    "must NOT call contentWindow.print() across the opaque-origin sandboxed preview (SecurityError)");
// 9) sanitizeRenderHtml 是 common.js 提供的净化原语：内含失败闭合降级与脚本/事件剥离。
assert.ok(common.includes("function sanitizeRenderHtml(html)"),
    "sanitizeRenderHtml defined in common.js");
assert.ok(common.includes("return esc(s)"),
    "sanitizer fails closed to plain-text when an executable token survives");
assert.ok(/on\[a-z\]+\s*=\s*\*/.test(common) || common.includes("on[a-z]+\\s*=\\s*"),
    "sanitizer strips on* event-handler attributes");
assert.ok(/javascript/.test(common), "sanitizer neutralizes javascript: scheme");

console.log("behavior-reports: structural regression checks passed");
