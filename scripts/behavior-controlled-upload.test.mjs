// Behavioral regression tests for bindControlledFileInput (assets/js/common.js).
// Loads the real helper in a vm sandbox with a stubbed DOM + controllable
// fetch, covering the PR #13 round-3 findings:
//  1) cancel during an in-flight upload must abandon the created file and
//     never let the late response write the form;
//  2) a failing disable must surface an error and keep the reference;
//  3) the submit/file controls stay locked until the operation settles.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const code = readFileSync(join(root, "assets/js/common.js"), "utf8");

function element() {
    return {
        value: "",
        disabled: false,
        title: "",
        textContent: "",
        files: null,
        listeners: {},
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        fire(type, payload) { if (this.listeners[type]) this.listeners[type](payload); },
    };
}

function makeSandbox() {
    const sandbox = {
        console,
        window: {},
        document: { addEventListener() {}, getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: (k) => (k === 'access_token' ? 'tok' : k === 'user' ? '{}' : null), setItem() {}, removeItem() {} },
        sessionStorage: { getItem: () => null },
        setTimeout, clearTimeout,
        URLSearchParams,
        FormData: globalThis.FormData,
        Blob: globalThis.Blob,
        showToast: () => {},
        _elements: {},
        _fetchLog: [],
    };
    // fetch mock: uploads resolve through deferreds; disables resolve per flag
    sandbox.fetch = async (url, init = {}) => {
        const method = (init.method || "GET").toUpperCase();
        const body = typeof init.body === "string" ? init.body : "";
        const path = String(url);
        const isUpload = method === "POST" && path.includes("/gsp/files") && !path.includes("/disable");
        const isDisable = path.includes("/disable");
        const log = { path, method, isUpload, isDisable };
        if (isUpload) {
            const defer = {};
            defer.promise = new Promise((res, rej) => { defer.res = res; defer.rej = rej; });
            sandbox._pendingUploads.push(defer);
            sandbox._fetchLog.push({ ...log, kind: "upload" });
            const result = await defer.promise;
            return {
                ok: true, status: 201,
                text: async () => JSON.stringify(result),
            };
        }
        if (isDisable) {
            sandbox._fetchLog.push({ ...log, kind: "disable" });
            if (sandbox._disableShouldFail) {
                return { ok: false, status: 403, text: async () => JSON.stringify({ detail: "停用失败(模拟403)" }) };
            }
            return { ok: true, status: 200, text: async () => JSON.stringify({ status: "DISABLED" }) };
        }
        return { ok: true, status: 200, text: async () => "{}" };
    };
    sandbox._pendingUploads = [];
    sandbox._disableShouldFail = false;
    // make code's querySelector/id lookups work against a registry keyed by id
    const wrapQuery = (reg) => (sel) => {
        const id = String(sel).replace(/^#/, "");
        if (!reg[id]) reg[id] = element();
        return reg[id];
    };
    sandbox._toasts = [];
    sandbox.requestAnimationFrame = (cb) => cb();
    sandbox._removedModals = [];
    const closeBtn = () => {
        const b = element();
        return b;
    };
    sandbox.document.createElement = () => {
        const el = element();
        el._close = [closeBtn(), closeBtn()];
        el.querySelectorAll = (sel) => (sel === '[data-close]' ? el._close : []);
        el.appendChild = () => {};
        el.remove = () => { el._removed = true; sandbox._removedModals.push(el); };
        return el;
    };
    sandbox.document.body = { appendChild: () => {} };
    sandbox._makeRoot = () => {
        const reg = {};
        const root = { querySelector: wrapQuery(reg) };
        return { root, reg };
    };
    vm.createContext(sandbox);
    return sandbox;
}

const sandbox = makeSandbox();
vm.runInContext(code, sandbox);
// common.js defines its own DOM showToast; route it to a spy for assertions.
sandbox.showToast = (msg) => { sandbox._toasts.push(msg); };
const bindControlledFileInput = sandbox.bindControlledFileInput;
assert.equal(typeof bindControlledFileInput, "function", "helper must be loaded");

function setup() {
    sandbox._pendingUploads = [];
    sandbox._disableShouldFail = false;
    sandbox._fetchLog = [];
    const { root, reg } = sandbox._makeRoot();
    reg["upFile"] = element(); reg["upInfo"] = element(); reg["upRef"] = element();
    reg["upHash"] = element(); reg["upSize"] = element(); reg["upSubmit"] = element();
    const ctl = bindControlledFileInput(root, {
        fileSel: "#upFile", infoSel: "#upInfo", refSel: "#upRef",
        hashSel: "#upHash", sizeSel: "#upSize", purpose: "PARTNER_DOCUMENT",
        submitSel: "#upSubmit",
    });
    return { reg, ctl };
}
function selectFile(reg) {
    const blob = new Blob(["x"], { type: "application/pdf" });
    blob.name = "a.pdf";
    reg["upFile"].files = [blob];
    reg["upFile"].fire("change");
}

// 1) cancel during in-flight upload abandons the created file, never writes form
{
    const { reg, ctl } = setup();
    selectFile(reg);
    assert.equal(reg["upFile"].disabled, true, "file input locked during upload");
    assert.equal(reg["upSubmit"].disabled, true, "submit locked during upload");
    const done = ctl.cancel();          // cancel while upload pending
    assert.equal(reg["upSubmit"].disabled, true, "submit stays locked until cancel settles");
    const defer = sandbox._pendingUploads[0];
    defer.res({ ref: "gspf:" + "a".repeat(32), sha256: "b".repeat(64), size_bytes: 9, file_name: "a.pdf", content_type: "application/pdf" });
    await done;
    assert.equal(reg["upRef"].value, "", "late upload must not write the form");
    const disables = sandbox._fetchLog.filter(x => x.kind === "disable");
    assert.equal(disables.length, 1, "created file must be disabled once");
}

// 2) failing disable keeps the reference and surfaces an error
{
    const { reg, ctl } = setup();
    selectFile(reg);
    const defer = sandbox._pendingUploads[0];
    defer.res({ ref: "gspf:" + "c".repeat(32), sha256: "d".repeat(64), size_bytes: 9, file_name: "a.pdf", content_type: "application/pdf" });
    await new Promise(r => setTimeout(r, 0)); // let success path settle
    assert.equal(reg["upRef"].value, "gspf:" + "c".repeat(32), "ref filled after success");
    sandbox._disableShouldFail = true;
    await ctl.cancel();
    assert.equal(reg["upRef"].value, "gspf:" + "c".repeat(32), "ref kept when disable fails");
    assert.match(reg["upInfo"].textContent, /停用失败/, "failure surfaced to user");
    assert.equal(reg["upSubmit"].disabled, false, "controls usable again for retry");
}

// 3) normal upload fills the form and unlocks controls
{
    const { reg, ctl } = setup();
    selectFile(reg);
    const defer = sandbox._pendingUploads[0];
    defer.res({ ref: "gspf:" + "e".repeat(32), sha256: "f".repeat(64), size_bytes: 9, file_name: "a.pdf", content_type: "application/pdf" });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(reg["upRef"].value, "gspf:" + "e".repeat(32));
    assert.equal(reg["upSubmit"].disabled, false);
}

// 4) cancel during in-flight upload: disable failure keeps the created ref
{
    const { reg, ctl } = setup();
    selectFile(reg);
    const defer = sandbox._pendingUploads[0];
    sandbox._disableShouldFail = true;
    const done = ctl.cancel();
    defer.res({ ref: "gspf:" + "a".repeat(32), sha256: "h".repeat(64), size_bytes: 9, file_name: "a.pdf", content_type: "application/pdf" });
    await done;
    assert.equal(reg["upRef"].value, "gspf:" + "a".repeat(32), "failed abandon keeps created ref for retry");
    assert.match(reg["upInfo"].textContent, /取消失败|停用失败/, "failure surfaced");
    assert.equal(reg["upSubmit"].disabled, false, "controls reopened for retry");
}

// 5) replacement whose old-file disable fails keeps the old reference
{
    const { reg, ctl } = setup();
    selectFile(reg);
    let defer = sandbox._pendingUploads[0];
    defer.res({ ref: "gspf:" + "b".repeat(32), sha256: "j".repeat(64), size_bytes: 9, file_name: "a.pdf", content_type: "application/pdf" });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(reg["upRef"].value, "gspf:" + "b".repeat(32));
    sandbox._disableShouldFail = true;
    selectFile(reg);                     // choose a replacement file
    defer = sandbox._pendingUploads[1];
    defer.res({ ref: "gspf:" + "c".repeat(32), sha256: "l".repeat(64), size_bytes: 9, file_name: "b.pdf", content_type: "application/pdf" });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(reg["upRef"].value, "gspf:" + "b".repeat(32), "old ref kept when its disable fails");
    assert.match(reg["upInfo"].textContent, /更换失败/, "replacement failure surfaced");
    const disables = sandbox._fetchLog.filter(x => x.kind === "disable");
    assert.ok(disables.length >= 2, "old disable attempted and new object abandoned");
}

// 6) guarded close: user affordances (footer 取消 / × / 遮罩) run the cleanup
//    guard first and only then remove the modal.
for (const via of ["footer", "x", "mask"]) {
    const { reg, ctl } = setup();
    selectFile(reg);
    const defer = sandbox._pendingUploads[0];
    defer.res({ ref: "gspf:" + "d".repeat(32), sha256: "e".repeat(64), size_bytes: 9, file_name: "a.pdf", content_type: "application/pdf" });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(reg["upRef"].value, "gspf:" + "d".repeat(32), "uploaded before closing");
    const modal = sandbox.openModal({ title: "t", body: "<div id='body'></div>", footer: "<button data-close>取消</button>" });
    sandbox.registerControlledCloseGuard(modal, ctl);
    if (via === "footer") modal._close[1].fire("click");
    else if (via === "x") modal._close[0].fire("click");
    else modal.fire("click", { target: modal });  // mask click
    await new Promise(r => setTimeout(r, 250));    // closeModal animation delay
    assert.equal(modal._removed, true, `modal closed via ${via} after cleanup`);
    const disables = sandbox._fetchLog.filter(x => x.kind === "disable");
    assert.ok(disables.length >= 1, `unbound upload disabled before ${via} close`);
}

// 7) guarded close is blocked when the disable fails; error surfaced, modal kept
{
    const { reg, ctl } = setup();
    selectFile(reg);
    const defer = sandbox._pendingUploads[0];
    defer.res({ ref: "gspf:" + "a".repeat(32), sha256: "e".repeat(64), size_bytes: 9, file_name: "a.pdf", content_type: "application/pdf" });
    await new Promise(r => setTimeout(r, 0));
    sandbox._disableShouldFail = true;
    sandbox._toasts = [];
    const modal = sandbox.openModal({ title: "t", body: "", footer: "<button data-close>取消</button>" });
    sandbox.registerControlledCloseGuard(modal, ctl);
    modal._close[1].fire("click");
    await new Promise(r => setTimeout(r, 300));
    assert.notEqual(modal._removed, true, "modal stays open when cleanup fails");
    assert.equal(reg["upRef"].value, "gspf:" + "a".repeat(32), "retryable ref preserved");
    assert.ok(sandbox._toasts.length > 0, "error toast shown");
}

// 8) duplicate close while cleanup is pending: single-flight, one cleanup chain
for (const outcome of ["ok", "fail"]) {
    const { reg, ctl } = setup();
    selectFile(reg);                      // upload starts (pending)
    sandbox._toasts = [];
    const modal = sandbox.openModal({ title: "t", body: "", footer: "<button data-close>取消</button>" });
    sandbox.registerControlledCloseGuard(modal, ctl);
    modal._close[1].fire("click");        // footer cancel -> cleanup starts
    modal._close[0].fire("click");        // × while cleanup pending -> must be ignored
    modal.fire("click", { target: modal }); // mask while cleanup pending -> ignored
    if (outcome === "fail") sandbox._disableShouldFail = true;
    const defer = sandbox._pendingUploads[0];
    defer.res({ ref: "gspf:" + "b".repeat(32), sha256: "e".repeat(64), size_bytes: 9, file_name: "a.pdf", content_type: "application/pdf" });
    await new Promise(r => setTimeout(r, 300));
    const disables = sandbox._fetchLog.filter(x => x.kind === "disable");
    if (outcome === "ok") {
        assert.equal(modal._removed, true, "closed once after successful cleanup");
        assert.equal(disables.length, 1, "single cleanup chain on success");
    } else {
        assert.notEqual(modal._removed, true, "modal retained when cleanup fails");
        assert.equal(disables.length, 1, "single cleanup chain despite double triggers");
        assert.equal(reg["upRef"].value, "gspf:" + "b".repeat(32), "retryable ref preserved");
        assert.ok(sandbox._toasts.length > 0, "error toast shown");
        // failure clears the single-flight lock: retry may now succeed
        sandbox._disableShouldFail = false;
        sandbox._fetchLog.length = 0;
        modal._close[1].fire("click");
        await new Promise(r => setTimeout(r, 300));
        assert.equal(modal._removed, true, "retry after failure closes the modal");
        assert.equal(sandbox._fetchLog.filter(x => x.kind === "disable").length, 1, "retry cleanup chain runs once");
    }
}

console.log("behavior-controlled-upload: 9/9 scenarios passed");
