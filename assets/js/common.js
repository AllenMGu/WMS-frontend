/* ==========================================================================
 * 药品GSP仓储与质量管理系统 - 前端共享脚本
 * 认证 / 布局 / API（含电子签名门禁）/ 弹窗 / Toast / 表格 / 参考数据
 * ========================================================================== */
'use strict';

const API_BASE_URL = (window.WMS_CONFIG?.apiBaseUrl || '/api').replace(/\/+$/, '');
let currentUser = null;
let currentWarehouse = null;
let currentGspRoles = new Set();
let resolveAppShellReady;
window.appShellReady = new Promise((resolve) => { resolveAppShellReady = resolve; });

/*
 * 净化由后端返回、需注入 iframe 渲染/打印的 HTML（如报表受控打印快照 res.html）。
 *
 * 目标：在"父页面要能打印/查看该文档"的场景下，即使快照内被注入脚本，也绝不执行。
 * 说明：仅靠 sandbox 会让 iframe 变为不透明源，父页面将无法跨源调用其
 *       contentWindow.print()（同源策略，实测 SecurityError）。因此打印路径
 *       采用"先净化、再以同源文档渲染"：净化函数把可执行载体(<script>/<iframe>/<object>/
 *       <embed>/on* 事件属性/javascript: 等)全部移除，并对净化结果做失败闭合校验——
 *       若仍残留任何可执行 token，则整段降级为纯文本(esc)，宁可不可打印也不执行脚本。
 */
function sanitizeRenderHtml(html) {
    if (html === null || html === undefined) return '';
    let s = String(html);
    // 1) 移除 <script ...>...</script>（含开/闭标签各种属性/空格变体）。
    s = s.replace(/<\s*\/?\s*script[^>]*>/gi, '');
    // 2) 移除会注入/嵌入文档的标签：iframe/frame/frameset/object/embed/applet/base/meta。
    //    (保留 style/link 以免破坏受控打印排版)
    s = s.replace(/<\s*(iframe|frame|frameset|object|embed|applet|base|meta)\b[^>]*>/gi, '');
    s = s.replace(/<\s*\/\s*(iframe|frame|frameset|object|embed|applet|base|meta)\s*>/gi, '');
    // 3) 移除所有 on* 事件属性（onclick/onerror/onload...，引号/无引号/大小写变体）。
    s = s.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ');
    // 4) 中和可执行 URL scheme：javascript:/vbscript:/data:text/html。
    s = s.replace(/(javascript|vbscript)\s*:/gi, 'x-javascript:');
    s = s.replace(/data\s*:\s*text\/html/gi, 'data:text/plain');
    // 5) 失败闭合校验：若净化后仍残留脚本/嵌入标签/事件属性/javascript 载体，说明
    //    黑名单被绕过，整段降级为纯文本(esc)，绝不渲染可执行 HTML。
    if (/(<\s*script|<\s*(iframe|object|embed|applet)\b|on[a-z]+\s*=|\sjavascript\s*:)/i.test(s)) {
        return esc(s);
    }
    return s;
}
/* ----------------------------- 工具函数 ----------------------------- */
function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// HTML 转义后的纯文本格式器：这三个函数的结果通常被直接拼进 innerHTML。
// 对不可解析输入原样回退前先转义，防止攻击者控制的字符串（如由 API 返回的
// 异常字段值）在忘记包 esc() 的调用点形成 XSS —— 纵深防御。

/* ----------------------------- 动作/对象/含义 中文映射 ----------------------------- */
// action 英文词根字典：把 USER_ACCESS_REVOKED → “用户访问撤销”、BATCH_CREATED → “批次创建”
const ZH_WORD = {
    // 动作
    CREATED: '创建', UPDATED: '更新', DELETED: '删除', REVOKED: '撤销', APPROVED: '批准',
    REJECTED: '驳回', REJECTION: '驳回', SUBMITTED: '提交', SUSPENDED: '停用', SUSPEND: '停用',
    RELEASED: '解除', ACCEPTED: '验收', ACCEPTANCE: '验收', VERIFIED: '核验', VERIFY: '核验',
    RECONCILED: '核对', RESOLVED: '处理', CLOSED: '关闭', RAISED: '触发', APPLIED: '应用',
    IMPLEMENTED: '实施', GENERATED: '生成', ISSUED: '签发', HELD: '冻结', REQUIRED: '待处理',
    ADDED: '新增', ASSIGNED: '分配', UNASSIGNED: '解除分配', UNASSIGN: '解除分配', ASSIGN: '分配', RECONFIRMED: '再确认',
    REQUEUED: '重新入队', RECORDED: '记录', ACKNOWLEDGED: '确认', REVIEWED: '复核',
    APPROVAL: '批准', REVIEW: '复核', RESPONSIBILITY: '责任认定', CONFIRMATION: '确认',
    INSPECTED: '验收', DISPATCHED: '发运', RECEIVED: '收货', IMPORTED: '导入', RETIRED: '退休',
    OFFBOARDED: '离场', VERIFICATION: '核验', ACTIVATED: '激活',
    // 对象/主体
    USER: '用户', WAREHOUSE: '仓库', ACCESS: '访问', ROLE: '岗位', BATCH: '批次',
    DOCUMENT: '文档', RECORD: '记录', EQUIPMENT: '设备', ENVIRONMENT: '环境', DEVICE: '设备/仪器',
    ALARM: '报警', CARRIER: '承运商', PARTNER: '合作方', RECALL: '召回', EVENT: '事件',
    CAPA: '纠正措施', COMPLIANCE: '合规', CONTROLLED: '受控', FILES: '文件', UPLOADER: '上传人',
    ELECTRONIC: '电子', SIGNATURE: '签名', QUALITY: '质量', DISPOSITION: '处置',
    PURCHASE: '采购', SALES: '销售', RETURN: '退货', STOCKTAKE: '盘点', MAINTENANCE: '养护',
    TRANSPORT: '运输', DELIVERY: '发运', SECRET: '密钥', ROTATION: '轮换', BACKUP: '备份',
    RECOVERY: '恢复', DRILL: '演练', SCOPE: '范围', AUTHORIZATION: '授权', BINDING: '绑定',
    SETTING: '设置', CALENDAR: '日历', MESSAGE: '消息', INTEGRATION: '集成', EXPIRY: '效期',
    ALERT: '预警', PROFILE: '档案', DRUG: '药品', SUPPLIER: '供应商', PRODUCT: '品种',
    HOLD: '冻结', INSPECT: '验收', RECEIPT: '收货', SHIPMENT: '发运', ORDER: '订单',
    ITEM: '条目', BULK: '批量', IMPORT: '导入', EVIDENCE: '证据', ACTIVITY: '活动',
    COPY: '副本', EXCURSION: '偏差', REVIEWER: '复核', DISPATCH: '发运', DECISION: '决策',
    DESTROY: '销毁', SAMPLE: '取样', STOCK: '库存', LOCATION: '库位', GOODS: '货物',
    LICENSE: '证照', SCOPE_APPROVAL: '经营范围批准', REPORT: '报告', COMPLETION: '完成',
    TARGET: '对象', NOTIFICATION: '通知', LOGIN: '登录', PASSWORD: '密码', LOGOUT: '登出',
    // GSP 模型短名
    Gsp: '', Receipt: '收货单', SalesReturn: '销退', Nonconforming: '不合格', Quality: '质量',
    Transport: '运输', Maintenance: '养护', Stocktake: '盘点', Environment: '环境', Recall: '召回',
    Partner: '合作方', BusinessPartner: '业务伙伴', SupplierProductAuthorization: '供应品种授权',
    DrugProfile: '药品档案', DrugBatch: '药品批次', BatchStock: '批次库存', QualityHold: '质量冻结',
    Signature: '签名', Challenge: '签名挑战', AuditEvent: '审计事件', AuditVerification: '审计校验',
    IntegrationMessage: '集成消息', ControlledFile: '受控文件', SecretRotation: '密钥轮换',
    BackupEvidence: '备份证据', RecoveryDrill: '恢复演练', ComplianceSetting: '合规设置',
    RoleAssignment: '岗位授权', Carrier: '承运商', Vehicle: '车辆', Driver: '司机',
};
const ZH_ENTITY = {
    User: '用户', Warehouse: '仓库', UserWarehouse: '用户仓库', Location: '库位', Goods: '货物',
    GspRoleAssignment: 'GSP岗位授权', GspBusinessPartner: '合作方',
    GspSupplierProductAuthorization: '供应品种授权', GspDrugProfile: '药品档案',
    GspDrugBatch: '药品批次', GspBatchStock: '批次库存', GspQualityHold: '质量冻结',
    GspPartnerDocument: '合作方证照', GspAuditEvent: '审计事件', GspAuditVerification: '审计校验',
    GspSignatureChallenge: '签名挑战', GspElectronicSignature: '电子签名',
    GspComplianceSetting: '合规设置', GspCarrier: '承运商', GspTransportException: '运输异常',
    GspTransportTask: '运输任务', GspMaintenancePlan: '养护计划', GspEnvironmentDevice: '环境设备',
    GspEnvironmentAlarm: '环境报警', GspEnvironmentAssignment: '环境监测分配',
    GspRecall: '召回', GspRecallBatch: '召回批次', GspRecallTarget: '召回对象',
    GspNonconformingRecord: '不合格品记录', GspPurchaseOrder: '采购订单',
    GspPurchaseReturn: '购进退货', GspSalesOrder: '销售订单', GspShipment: '发运',
    GspStocktakePlan: '盘点计划', GspSecretRotation: '密钥轮换', GspBackupEvidence: '备份证据',
    GspRecoveryDrill: '恢复演练', GspIntegrationMessage: '集成消息', GspControlledFile: '受控文件',
    TestEntity: '测试实体', UserDirectoryItem: '用户目录',
};
function zhAction(code) {
    if (!code) return '';
    const words = code.split('_').map(w => ZH_WORD[w] || w);
    return words.join('');
}
function zhEntity(type) {
    if (!type) return '';
    return ZH_ENTITY[type] || type;
}
/* 英文含义码(meaning) → 中文 */
const ZH_MEANING = {
    APPROVAL: '批准', REVIEW: '复核', RELEASE: '解除', CONFIRMATION: '确认',
    RESPONSIBILITY: '责任认定', REJECTION: '驳回', CONFIRM: '确认', REVOKE: '撤销',
};
function zhMeaning(m) { return ZH_MEANING[m] || m; }

function fmtDT(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d)) return esc(String(value));
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtD(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d)) return esc(String(value));
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtNum(value) {
    if (value === null || value === undefined) return '-';
    const n = Number(value);
    if (isNaN(n)) return esc(String(value));
    return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
}
function debounce(fn, wait) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}
function todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function nowLocalISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ----------------------------- 认证 ----------------------------- */
function getStoredAuth() {
    const read = (s) => ({ token: s.getItem('access_token'), user: s.getItem('user'), expiry: s.getItem('token_expiry') });
    const complete = (a) => !!(a.token && a.user);
    const valid = (a) => !(a.expiry && new Date() >= new Date(a.expiry));
    const pick = (a, b) => (complete(a) && valid(a) ? a : complete(b) && valid(b) ? b : complete(a) ? a : complete(b) ? b : null);
    const own = pick(read(localStorage), read(sessionStorage));
    if (own) return own;
    const legacy = localStorage.getItem('token');
    if (legacy) {
        localStorage.setItem('access_token', legacy);
        localStorage.removeItem('token');
        return { token: legacy, user: localStorage.getItem('user'), expiry: localStorage.getItem('token_expiry') };
    }
    return null;
}
function storeAuth(data, remember) {
    // 会话时效以服务端 /token 返回的 expiry(JWT exp) 为权威，不再前端伪造 7 天更长期限，
    // 以缩小 token 泄露到 localStorage 后的可用窗口(P1-2 缓解)。
    const storage = remember ? localStorage : sessionStorage;
    storage.removeItem('access_token'); storage.removeItem('user'); storage.removeItem('token_expiry');
    if (!remember) { localStorage.removeItem('access_token'); localStorage.removeItem('user'); localStorage.removeItem('token_expiry'); }
    storage.setItem('access_token', data.access_token);
    storage.setItem('user', JSON.stringify(data.user));
    if (data.expiry) storage.setItem('token_expiry', data.expiry);
}
function logout() {
    localStorage.removeItem('access_token'); localStorage.removeItem('user'); localStorage.removeItem('token_expiry');
    sessionStorage.removeItem('access_token'); sessionStorage.removeItem('user'); sessionStorage.removeItem('token_expiry');
    window.location.href = 'index.html';
}
function getToken() {
    const a = getStoredAuth();
    return a ? a.token : null;
}
function getAuthHeaders(sigToken) {
    const h = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (sigToken) h['X-GSP-Signature-Token'] = sigToken;
    return h;
}

/* ----------------------------- API ----------------------------- */
class ApiError extends Error {
    constructor(message, status, detail) { super(message); this.status = status; this.detail = detail; }
}
function extractDetailMessage(detail) {
    if (!detail) return '请求失败';
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && detail.detail) return String(detail.detail);
    if (detail.message) {
        if (detail.findings && detail.findings.length) {
            return detail.message + '：' + detail.findings.map(f => `${f.code || ''}${f.message || ''}`).join('；');
        }
        return detail.message;
    }
    if (Array.isArray(detail)) return detail.map(d => d.msg || JSON.stringify(d)).join('；');
    return JSON.stringify(detail);
}
async function api(path, opts = {}) {
    const { method = 'GET', body = null, sigToken = null, form = false, logoutOn401 = true } = opts;
    const headers = sigToken ? getAuthHeaders(sigToken) : getAuthHeaders();
    const init = { method, headers };
    if (body !== null) {
        init.body = form ? new URLSearchParams(body).toString() : JSON.stringify(body);
        if (form) delete headers['Content-Type'], headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, init);
    } catch (e) {
        throw new ApiError('网络请求失败，请检查后端服务是否可用', 0, null);
    }
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
        if (res.status === 401 && logoutOn401) { logout(); throw new ApiError('登录已过期，请重新登录', 401, null); }
        throw new ApiError(extractDetailMessage(data), res.status, data);
    }
    return data;
}
/* 受控附件上传：POST /api/gsp/files（multipart），返回 {ref, sha256, size_bytes, ...} */
async function uploadControlledFile(file, purpose, note) {
    const token = getToken();
    if (!token) throw new ApiError('未登录', 401, null);
    const fd = new FormData();
    fd.append('file', file, file.name || 'evidence.bin');
    fd.append('purpose', purpose || 'OTHER');
    if (note) fd.append('note', String(note).slice(0, 500));
    let res;
    try {
        res = await fetch(`${API_BASE_URL}/gsp/files`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            body: fd,
        });
    } catch (e) {
        throw new ApiError('网络请求失败，请检查后端服务是否可用', 0, null);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
        if (res.status === 401) { logout(); throw new ApiError('登录已过期，请重新登录', 401, null); }
        throw new ApiError(extractDetailMessage(data), res.status, data);
    }
    return data; // ControlledFileOut
}

/* 受控附件输入框接线：选文件→上传→自动填 ref/hash/size
 * 状态机保证：
 * - 上传期间锁定文件框与保存按钮（不会把旧引用提交成功）；
 * - cancel() 使当前请求失效并等待在途上传结束：其创建的受控对象会被
 *   停用，绝不落表单，也不会在取消后又被回调反写；
 * - 被取代（stale）的上传响应同样先停用其创建的对象再丢弃；
 * - 停用失败不吞错：显式取消仅在服务端确认停用后才清空并提示；
 *   失败时保留引用并提示重试或联系质量人员。 */
async function disableControlledFile(ref) {
    const key = String(ref || '').replace(/^gspf:/, '');
    if (!/^[0-9a-f]{32}$/.test(key)) throw new Error('受控文件引用无效，无法停用');
    await api(`/gsp/files/${key}/disable`, { method: 'POST', body: { reason: '表单未提交/更换附件，停用未绑定对象' } });
}
async function quietDisableControlledFile(ref) {
    try { await disableControlledFile(ref); return true; } catch (e) { return false; }
}
function bindControlledFileInput(root, { fileSel, infoSel, refSel, hashSel = null, sizeSel = null, purpose, submitSel = null }) {
    const fileEl = root.querySelector(fileSel);
    const submitEl = submitSel ? root.querySelector(submitSel) : null;
    if (!fileEl) return null;
    const info = root.querySelector(infoSel);
    let seq = 0;
    let inFlight = null;      // promise of the current upload (if any)
    let lastRef = null;       // ref of the most recent completed upload for this form
    const setInfo = (text, error = false) => { if (info) { info.textContent = text; info.classList && info.classList.toggle('text-red-500', !!error); } };
    const setBusy = (busy) => {
        fileEl.disabled = busy;
        if (submitEl) submitEl.disabled = busy;
    };
    async function doUpload(file) {
        const my = ++seq;
        const task = uploadControlledFile(file, purpose);
        inFlight = task;
        setBusy(true);
        setInfo('受控附件上传中…');
        let up;
        try {
            up = await task;
        } catch (e) {
            if (my !== seq) return;
            inFlight = null;
            setBusy(false);
            fileEl.value = '';
            const msg = (e && e.message) || '上传失败，请重试';
            setInfo(msg, true);
            if (typeof showToast === 'function') showToast(msg, 'error');
            return;
        }
        if (my !== seq) {
            // Superseded by cancel(): cancel() owns abandoning the created
            // object and keeps the controls locked until it has settled.
            return;
        }
        inFlight = null;
        if (lastRef && lastRef !== up.ref) {
            // Replacing an existing upload: confirm the old object is retired
            // before the form switches to the new reference.
            try {
                await disableControlledFile(lastRef);
            } catch (e) {
                // Do not lose the old reference; retire the just-created object
                // best-effort and surface the failure.
                await quietDisableControlledFile(up.ref);
                setBusy(false);
                fileEl.value = '';
                const msg = `更换失败：${(e && e.message) || '未能停用旧附件，请重试或联系质量人员'}`;
                setInfo(msg, true);
                if (typeof showToast === 'function') showToast(msg, 'error');
                return;
            }
        }
        lastRef = up.ref;
        const refEl = root.querySelector(refSel);
        if (refEl) refEl.value = up.ref;
        if (hashSel && root.querySelector(hashSel)) root.querySelector(hashSel).value = up.sha256;
        if (sizeSel && root.querySelector(sizeSel)) root.querySelector(sizeSel).value = up.size_bytes;
        setInfo(`已上传 ${up.file_name}（${up.content_type}，${up.size_bytes} 字节）${up.ref}；可再次选择文件更换`);
        setBusy(false);
        fileEl.title = '再次选择可更换受控附件';
        if (typeof showToast === 'function') showToast('受控附件已上传并签发引用', 'success');
    }
    fileEl.addEventListener('change', () => {
        const file = fileEl.files && fileEl.files[0];
        if (file) doUpload(file);
    });
    return {
        uploading: () => fileEl.disabled,
        hasUpload: () => !!lastRef,
        lastRef: () => lastRef,
        cancel: async () => {
            seq += 1;                 // invalidate any in-flight upload
            const waitFor = inFlight;
            inFlight = null;
            if (waitFor) {
                setBusy(true);
                setInfo('正在停用未绑定附件…');
                try {
                    const created = await waitFor;   // let the old response settle
                    if (created && created.ref) {
                        try {
                            await disableControlledFile(created.ref);
                        } catch (e) {
                            // Disable failed: keep the created ref retryable and
                            // surface the error -- do not claim cancel success.
                            lastRef = created.ref;
                            const refEl = root.querySelector(refSel);
                            if (refEl) refEl.value = created.ref;
                            if (hashSel && root.querySelector(hashSel)) root.querySelector(hashSel).value = created.sha256 || '';
                            if (sizeSel && root.querySelector(sizeSel)) root.querySelector(sizeSel).value = created.size_bytes || '';
                            fileEl.value = '';
                            setBusy(false);
                            const msg = `取消失败：${(e && e.message) || '未能停用新上传的附件，请重试或联系质量人员'}`;
                            setInfo(msg, true);
                            if (typeof showToast === 'function') showToast(msg, 'error');
                            return false;
                        }
                    }
                } catch (e) { /* upload itself failed; nothing was created */ }
            }
            if (!lastRef) {
                fileEl.value = '';
                setBusy(false);
                setInfo('已取消；重新选择文件可再次上传');
                return true;
            }
            setBusy(true);
            setInfo('正在停用并取消…');
            try {
                await disableControlledFile(lastRef);   // throws when it fails
                lastRef = null;
                const refEl = root.querySelector(refSel);
                if (refEl) refEl.value = '';
                if (hashSel && root.querySelector(hashSel)) root.querySelector(hashSel).value = '';
                if (sizeSel && root.querySelector(sizeSel)) root.querySelector(sizeSel).value = '';
                fileEl.value = '';
                setBusy(false);
                setInfo('已取消并停用原附件；重新选择文件可再次上传');
                if (typeof showToast === 'function') showToast('已取消并停用原附件', 'success');
                return true;
            } catch (e) {
                setBusy(false);
                const msg = (e && e.message) || '停用失败，请重试或联系质量人员';
                setInfo(msg, true);
                if (typeof showToast === 'function') showToast(msg, 'error');
                return false;
            }
        },
    };
}

async function apiAll(path, pageSize = 100) {
    const items = [];
    let previousPageSignature = null;
    for (let offset = 0, pageNumber = 0; ; offset += pageSize, pageNumber += 1) {
        if (pageNumber >= 10000) throw new ApiError('分页接口返回页数异常', 0, { path, pageSize });
        const separator = path.includes('?') ? '&' : '?';
        const page = await api(`${path}${separator}limit=${pageSize}&offset=${offset}`);
        if (!Array.isArray(page)) throw new ApiError('分页接口返回格式无效', 0, page);
        const pageSignature = page.length
            ? JSON.stringify([page.length, page[0], page[page.length - 1]])
            : '[]';
        if (offset > 0 && pageSignature === previousPageSignature) {
            // 兼容尚未实现 limit/offset 的旧列表接口，避免无限重复第一页。
            return items;
        }
        items.push(...page);
        if (page.length < pageSize) return items;
        previousPageSignature = pageSignature;
    }
}

/* ----------------------------- 表格排序 / 翻页 ----------------------------- */
function tableSortValue(cell) {
    const raw = (cell?.dataset.sortValue || cell?.textContent || '').trim();
    if (!raw || raw === '-') return { type: 'empty', value: '' };
    const numeric = raw.replace(/,/g, '').replace(/%$/, '');
    if (/^-?\d+(\.\d+)?$/.test(numeric)) return { type: 'number', value: Number(numeric) };
    if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/.test(raw)) {
        const time = Date.parse(raw.replace(' ', 'T'));
        if (!Number.isNaN(time)) return { type: 'number', value: time };
    }
    return { type: 'text', value: raw };
}
function compareTableCells(a, b) {
    const left = tableSortValue(a);
    const right = tableSortValue(b);
    if (left.type === 'empty' || right.type === 'empty') {
        return left.type === right.type ? 0 : left.type === 'empty' ? 1 : -1;
    }
    if (left.type === 'number' && right.type === 'number') return left.value - right.value;
    return String(left.value).localeCompare(String(right.value), 'zh-CN', { numeric: true, sensitivity: 'base' });
}
function enhanceDataTable(table) {
    if (!table || table.dataset.tableEnhanced === 'true' || table.dataset.noPagination === 'true') return;
    const tbody = table.tBodies[0];
    const headers = Array.from(table.tHead?.rows[0]?.cells || []);
    if (!tbody || !headers.length) return;
    table.dataset.tableEnhanced = 'true';

    const state = { page: 1, pageSize: Number(table.dataset.pageSize) || 20, sortIndex: null, direction: 1, rows: [] };
    const pager = document.createElement('div');
    pager.className = 'filter-bar justify-between p-3';
    pager.dataset.tablePager = 'true';
    pager.innerHTML = `
        <span class="text-xs text-gray-500" data-page-summary></span>
        <div class="flex items-center gap-2">
            <select class="input-field" data-page-size aria-label="每页条数" style="min-width:88px">
                <option value="20">20 条/页</option><option value="50">50 条/页</option><option value="100">100 条/页</option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm" data-page-prev><i class="fa fa-chevron-left"></i> 上一页</button>
            <button type="button" class="btn btn-secondary btn-sm" data-page-next>下一页 <i class="fa fa-chevron-right"></i></button>
        </div>`;
    table.insertAdjacentElement('afterend', pager);
    const summary = pager.querySelector('[data-page-summary]');
    const sizeSelect = pager.querySelector('[data-page-size]');
    const prev = pager.querySelector('[data-page-prev]');
    const next = pager.querySelector('[data-page-next]');
    sizeSelect.value = String(state.pageSize);

    let bodyObserver;
    const renderPage = () => {
        bodyObserver.disconnect();
        const ordered = state.rows.slice();
        if (state.sortIndex !== null) {
            ordered.sort((a, b) => {
                const compared = compareTableCells(a.row.cells[state.sortIndex], b.row.cells[state.sortIndex]);
                return compared ? compared * state.direction : a.index - b.index;
            });
        }
        const total = ordered.length;
        const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
        state.page = Math.min(state.page, totalPages);
        const start = (state.page - 1) * state.pageSize;
        ordered.forEach(({ row }, index) => {
            tbody.appendChild(row);
            row.classList.toggle('hidden', index < start || index >= start + state.pageSize);
        });
        const hasEmptyState = total === 1 && ordered[0].row.cells.length === 1 && ordered[0].row.cells[0].colSpan > 1;
        // 非空表格始终显示总数和当前页；单页时仅禁用上一页/下一页。
        pager.classList.toggle('hidden', hasEmptyState);
        summary.textContent = `共 ${total} 条，第 ${state.page}/${totalPages} 页`;
        prev.disabled = state.page <= 1;
        next.disabled = state.page >= totalPages;
        bodyObserver.observe(tbody, { childList: true });
    };
    const captureRows = () => {
        state.rows = Array.from(tbody.rows).map((row, index) => ({ row, index }));
        state.page = 1;
        renderPage();
    };
    bodyObserver = new MutationObserver(captureRows);

    headers.forEach((header, index) => {
        if (header.classList.contains('actions') || header.colSpan > 1 || header.dataset.sortDisabled === 'true' || !header.textContent.trim()) return;
        header.tabIndex = 0;
        header.setAttribute('role', 'button');
        header.setAttribute('aria-sort', 'none');
        header.title = '点击排序';
        const icon = document.createElement('i');
        icon.className = 'fa fa-sort ml-1';
        icon.dataset.sortIcon = 'true';
        icon.setAttribute('aria-hidden', 'true');
        header.appendChild(icon);
        const sort = () => {
            state.direction = state.sortIndex === index ? -state.direction : 1;
            state.sortIndex = index;
            state.page = 1;
            headers.forEach(item => {
                item.setAttribute('aria-sort', 'none');
                const itemIcon = item.querySelector('[data-sort-icon]');
                if (itemIcon) itemIcon.className = 'fa fa-sort ml-1';
            });
            header.setAttribute('aria-sort', state.direction === 1 ? 'ascending' : 'descending');
            icon.className = `fa ${state.direction === 1 ? 'fa-sort-asc' : 'fa-sort-desc'} ml-1`;
            renderPage();
        };
        header.addEventListener('click', sort);
        header.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sort(); }
        });
    });
    sizeSelect.addEventListener('change', () => { state.pageSize = Number(sizeSelect.value); state.page = 1; renderPage(); });
    prev.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; renderPage(); } });
    next.addEventListener('click', () => {
        if (state.page * state.pageSize < state.rows.length) { state.page += 1; renderPage(); }
    });
    captureRows();
}
function installTableEnhancements(root = document) {
    const scan = node => {
        if (node.matches?.('table.data-table')) enhanceDataTable(node);
        node.querySelectorAll?.('table.data-table').forEach(enhanceDataTable);
    };
    scan(root);
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }));
    });
    observer.observe(root, { childList: true, subtree: true });
    return observer;
}
function withReason(path, reason) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}reason=${encodeURIComponent(String(reason || '').trim())}`;
}

/* ----------------------------- 电子签名 ----------------------------- */
async function createSignatureChallenge({ action, entity_type, entity_id, meaning, payload, reason, password }) {
    return api('/gsp/electronic-signatures/challenges', {
        method: 'POST',
        body: { action, entity_type, entity_id, meaning, payload: payload || {}, reason, password },
        logoutOn401: false,
    });
}
async function signAndCall(path, opts, sigSpec, reason, password, sigPayload) {
    const challenge = await createSignatureChallenge({
        action: sigSpec.action,
        entity_type: sigSpec.entity_type,
        entity_id: String(sigSpec.entity_id),
        meaning: sigSpec.meaning,
        payload: sigPayload || opts.body || {},
        reason,
        password,
    });
    return api(path, { ...opts, sigToken: challenge.signature_token });
}
/* 打开电子签名确认弹窗：reason + password，然后执行 signedCall(reason, password)。
   返回 Promise：签署成功 resolve(true)；用户取消/关闭 resolve(false)（失败可重试，不 resolve）。 */
function openSignatureModal(title, signedCall) {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (val) => { if (!settled) { settled = true; resolve(val); } };
        const modal = openModal({
            title: title || '电子签名确认',
            size: 'sm',
            body: `
            <div class="form-group">
                <label class="form-label">变更原因（≥3字，将写入审计链与签名记录）</label>
                <textarea id="sigReason" class="input-field" rows="2" placeholder="请输入操作原因"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">登录密码（用于本人电子签名核验）</label>
                <input type="password" id="sigPassword" class="input-field" placeholder="请输入当前用户密码">
            </div>
        `,
            footer: `
            <button class="btn btn-secondary" data-close>取消</button>
            <button class="btn btn-primary" id="sigConfirmBtn"><i class="fa fa-pencil"></i> 确认签署</button>
        `,
        });
        const reasonEl = modal.querySelector('#sigReason');
        const passEl = modal.querySelector('#sigPassword');
        const btn = modal.querySelector('#sigConfirmBtn');
        // 弹窗被关闭（取消/遮罩/×）视为用户放弃本次签名
        const observer = new MutationObserver(() => {
            if (!document.body.contains(modal)) { observer.disconnect(); settle(false); }
        });
        observer.observe(document.body, { childList: true });
        const doSign = async () => {
            const reason = reasonEl.value.trim();
            const password = passEl.value;
            if (reason.length < 3) { showToast('变更原因不能少于3个字', 'warning'); return; }
            if (!password) { showToast('请输入登录密码', 'warning'); return; }
            btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> 签署中...';
            try {
                await signedCall(reason, password);
                settle(true);
                closeModal(modal);
            } catch (e) {
                showToast(e.message || '电子签名或操作失败', 'error');
                btn.disabled = false; btn.innerHTML = '<i class="fa fa-pencil"></i> 确认签署';
            }
        };
        btn.addEventListener('click', doSign);
        reasonEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSign(); });
        setTimeout(() => passEl.focus(), 100);
    });
}
/* 便捷封装：页面只需提供 sigSpec + 业务调用 + 可选 sigPayload（签名哈希需覆盖的业务参数）。
   sigPayload 与业务接口 consume 端构造的规范化 payload 必须完全一致。
   返回 Promise：签名成功 resolve(true)，取消 resolve(false)。 */
function signAction(sigSpec, businessCall, title, sigPayload) {
    return openSignatureModal(title || `${sigSpec.action} - 需要电子签名`, async (reason, password) => {
        const opts = businessCall.opts || {};
        // 业务请求体中的 reason 若为空，则复用签名弹窗填写的变更原因（接口要求 ≥3 字）
        let body = opts.body;
        if (body && typeof body === 'object' && !Array.isArray(body)) {
            body = { ...body };
            if (body.reason === undefined || body.reason === null || body.reason === '') {
                body.reason = reason;
            }
        }
        const data = await signAndCall(businessCall.path, { ...opts, body }, sigSpec, reason, password, sigPayload);
        showToast(businessCall.successMessage || '操作成功', 'success');
        if (businessCall.onSuccess) {
            await businessCall.onSuccess(data);
        } else if (typeof window.pageInit === 'function') {
            await window.pageInit(document.getElementById('pageContent'));
        }
    });
}

/* ----------------------------- Toast ----------------------------- */
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) { container = document.createElement('div'); container.id = 'toastContainer'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i><span>${esc(message)}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 350); }, 3200);
}

/* ----------------------------- 模态框 ----------------------------- */
function openModal({ title = '', body = '', footer = '', size = 'md' }) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content modal-${size}">
            <div class="modal-header">
                <div class="modal-title">${esc(title)}</div>
                <button type="button" class="modal-close" data-close>&times;</button>
            </div>
            <div class="modal-body">${body}</div>
            ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal) requestModalClose(modal); });
    // 绑定所有 data-close 元素（标题栏 × 与底部“取消”按钮），避免只绑到第一个
    modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => requestModalClose(modal)));
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
    return modal;
}
function requestModalClose(modal) {
    // User-initiated close (footer 取消 / 标题栏 × / 遮罩). Single-flight: the
    // optional awaitable cleanup guard runs at most once per attempt; repeated
    // triggers while a cleanup is pending are ignored, so a second trigger can
    // never bypass an in-flight guard. On failure the pending state is cleared
    // so the user can retry; on success the modal is removed exactly once.
    if (!modal) return;
    if (modal.__closing) return;                 // cleanup already in progress
    if (!modal.__guardedClose) { closeModal(modal); return; }
    modal.__closing = true;
    Promise.resolve(modal.__guardedClose()).then(
        () => { modal.__closing = false; closeModal(modal); },
        (err) => {
            modal.__closing = false;
            const msg = (err && err.message) || '存在未处置的受控附件，关闭已阻止：请重试或联系质量人员';
            if (typeof showToast === 'function') showToast(msg, 'error');
        }
    );
}
function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 200);
}
function registerControlledCloseGuard(modal, ctl) {
    // Awaitable before-close cleanup for controlled-upload modals: retires any
    // uploaded-but-unbound attachment before the modal may close; a failed
    // disable throws so the close is blocked and the reference stays retryable.
    modal.__guardedClose = async () => {
        if (!ctl || (!ctl.uploading() && !ctl.hasUpload())) return;
        const ok = await ctl.cancel();
        if (!ok) throw new Error('未能停用已上传的受控附件，关闭已阻止：请重试或联系质量人员');
    };
}
function confirmModal(message, onOk, okText = '确认') {
    const modal = openModal({
        title: '操作确认',
        size: 'sm',
        body: `<div class="alert alert-warning"><i class="fa fa-exclamation-triangle mr-2"></i>${esc(message)}</div>`,
        footer: `
            <button class="btn btn-secondary" data-close>取消</button>
            <button class="btn btn-primary" id="confirmOkBtn">${esc(okText)}</button>
        `,
    });
    modal.querySelector('#confirmOkBtn').addEventListener('click', async () => {
        try { await onOk(); closeModal(modal); } catch (e) { showToast(e.message || '操作失败', 'error'); }
    });
    return modal;
}

/* ----------------------------- 徽章 / 状态映射 ----------------------------- */
function badge(text, cls) {
    return `<span class="badge badge-${cls || 'gray'}">${esc(text)}</span>`;
}
/* 资质文件类型：后端存储为英文代码（GSP审计代码化），前端统一显示中文 */
const DOC_LABELS = {
    // 合作方资质
    BUSINESS_LICENSE: '营业执照',
    DRUG_LICENSE: '药品经营许可证',
    QUALITY_AGREEMENT: '质量保证协议',
    SALES_AUTHORIZATION: '销售授权书',
    PROCUREMENT_AUTHORIZATION: '采购授权书',
    // 承运方资质
    TRANSPORT_LICENSE: '运输许可证',
    ROAD_TRANSPORT_CERT: '道路运输证',
    OTHER: '其他',
};
function docTypeLabel(code) {
    return DOC_LABELS[code] || code || '-';
}
const STATUS_LABELS = {
    DRAFT: ['草稿', 'gray'], PENDING: ['待审批', 'warning'], PENDING_INSPECTION: ['待验收', 'warning'],
    PENDING_APPROVAL: ['待批准', 'warning'], PENDING_QUALITY: ['待质量处理', 'warning'],
    SUBMITTED: ['已提交', 'info'], APPROVED: ['已批准', 'success'], RELEASED: ['已放行', 'success'],
    ACTIVE: ['进行中', 'info'], OPEN: ['开启', 'danger'], ACKNOWLEDGED: ['已确认', 'warning'],
    RESOLVED: ['已解决', 'success'], CLOSED: ['已关闭', 'gray'], CANCELLED: ['已取消', 'gray'],
    SUSPENDED: ['已暂停', 'danger'], ALLOCATED: ['已分配', 'info'], PICKED: ['已拣货', 'info'],
    PREPARED: ['已备货', 'warning'], REVIEWED: ['已复核', 'success'], DISPATCHED: ['已发运', 'success'],
    IN_TRANSIT: ['在途', 'info'], EXCEPTION: ['异常', 'danger'], DELIVERED: ['已送达', 'success'],
    RECEIVED: ['已收货', 'info'], SAMPLED: ['已抽样', 'info'], INSPECTED: ['已验收', 'success'],
    COMPLETED: ['已完成', 'success'], REQUESTED: ['已申请', 'warning'], IMPLEMENTED: ['已实施', 'success'],
    VERIFIED: ['已核验', 'success'], RECORDED: ['已登记', 'info'], REVIEWED_: ['已复核', 'success'],
    ACCEPTED: ['已接受', 'success'], REJECTED: ['已拒绝', 'danger'], FAILED: ['失败', 'danger'],
    AVAILABLE: ['可用', 'success'], HOLD: ['锁定', 'danger'], SUCCESS: ['成功', 'success'],
    RETRY: ['重试中', 'warning'], ACTIVATED: ['已启动', 'info'], EXPIRED: ['已过期', 'danger'],
    CREATED: ['已创建', 'gray'], PENDING_REVIEW: ['待复核', 'warning'], DRAFTED: ['草稿', 'gray'],
};
function statusBadge(status) {
    const key = String(status || '').toUpperCase();
    if (STATUS_LABELS[key]) return badge(STATUS_LABELS[key][0], STATUS_LABELS[key][1]);
    return badge(status || '-', 'gray');
}
function boolBadge(v, yes = '是', no = '否') {
    return v ? badge(yes, 'success') : badge(no, 'gray');
}

/* ----------------------------- 岗位感知 ----------------------------- */
const PAGE_ROLE_ACCESS = {
    'users.html': ['QUALITY_MANAGER'],
    'ldap.html': ['SYSTEM_ADMIN', 'QUALITY_MANAGER'],
    'environment.html': ['ENVIRONMENT_MONITOR', 'QUALITY_MANAGER', 'QUALITY_REVIEWER'],
    'audit.html': ['AUDITOR', 'QUALITY_MANAGER', 'QUALITY_REVIEWER'],
    'operations.html': ['SYSTEM_ADMIN', 'AUDITOR', 'QUALITY_MANAGER', 'QUALITY_REVIEWER'],
    'qms.html': ['GSP_ROLE_ONLY', 'AUDITOR', 'QUALITY_MANAGER', 'QUALITY_REVIEWER'],
    'my-training.html': ['ANY_GSP_ROLE'],
    'reports.html': ['ANY_GSP_ROLE'],
    'legacy-archive.html': ['SYSTEM_ADMIN', 'AUDITOR', 'QUALITY_MANAGER', 'QUALITY_REVIEWER'],
};
async function loadCurrentGspRoles() {
    const data = await api('/gsp/roles/me');
    currentGspRoles = new Set(data?.roles || []);
}
function hasAnyGspRole(...roles) {
    if (roles.includes('ANY_GSP_ROLE')) return currentGspRoles.size > 0;
    // 授权判定完全以服务端 /gsp/roles/me 返回的有效岗位为准，
    // 绝不信任 localStorage 中可被篡改的 currentUser.role。
    return roles.some(role => currentGspRoles.has(role));
}
function canAccessPage(page) {
    const required = PAGE_ROLE_ACCESS[page];
    return !required || hasAnyGspRole(...required);
}

/* ----------------------------- 布局 ----------------------------- */
const NAV_GROUPS = [
    { title: '总览', items: [
        { page: 'all', icon: 'fa-th-large', label: '全部功能' },
        { page: 'dashboard.html', icon: 'fa-dashboard', label: '合规概览' },
    ]},
    { title: '基础档案 · 首营', items: [
        { page: 'goods.html', icon: 'fa-barcode', label: '货物管理' },
        { page: 'warehouses.html', icon: 'fa-building', label: '仓库与库位' },
        { page: 'partners.html', icon: 'fa-handshake-o', label: '合作方管理' },
        { page: 'products.html', icon: 'fa-cubes', label: '药品与批次' },
    ]},
    { title: '购进与储存', items: [
        { page: 'procurement.html', icon: 'fa-arrow-down', label: '采购与收货' },
        { page: 'maintenance.html', icon: 'fa-stethoscope', label: '药品养护' },
        { page: 'environment.html', icon: 'fa-thermometer-half', label: '温湿度监测' },
        { page: 'stocktaking.html', icon: 'fa-list-alt', label: '批号库存盘点' },
    ]},
    { title: '销售与物流', items: [
        { page: 'sales.html', icon: 'fa-arrow-up', label: '销售与发运' },
        { page: 'transport.html', icon: 'fa-truck', label: '运输与签收' },
    ]},
    { title: '质量与售后', items: [
        { page: 'my-training.html', icon: 'fa-tasks', label: '我的质量任务' },
        { page: 'qms.html', icon: 'fa-check-square-o', label: '质量体系管理' },
        { page: 'returns.html', icon: 'fa-undo', label: '销后退回' },
        { page: 'disposition.html', icon: 'fa-exclamation-triangle', label: '不合格品处置' },
        { page: 'recalls.html', icon: 'fa-bullhorn', label: '召回与演练' },
        { page: 'trace.html', icon: 'fa-search', label: '批号追溯' },
    ]},
    { title: '系统与合规', items: [
        { page: 'users.html', icon: 'fa-users', label: '用户与岗位' },
        { page: 'ldap.html', icon: 'fa-server', label: 'LDAP配置' },
        { page: 'signatures.html', icon: 'fa-pencil-square-o', label: '电子签名台账' },
        { page: 'audit.html', icon: 'fa-shield', label: '审计追踪' },
        { page: 'operations.html', icon: 'fa-gears', label: '运维合规' },
        { page: 'reports.html', icon: 'fa-print', label: '业务报表' },
        { page: 'legacy-archive.html', icon: 'fa-archive', label: '老 GSP 历史归档' },
    ]},
];
/* 顶层 const 不会挂到 window，显式导出供 SPA 框架（app.js）引用 */
window.NAV_GROUPS = NAV_GROUPS;
function renderShell(activePage, pageTitle) {
    const shell = document.getElementById('appShell');
    if (!shell) return;
    // iframe 嵌入模式（总目录页内加载子页面）：只渲染内容区，不渲染侧边栏/顶栏
    let inIframe = false;
    try { inIframe = window.self !== window.top; } catch (e) { inIframe = true; }
    if (inIframe) {
        shell.innerHTML = '<main class="page-content" id="pageContent"></main>';
        return;
    }
    const sidebar = NAV_GROUPS.map(g => {
        const visibleItems = g.items.filter(it => canAccessPage(it.page));
        if (!visibleItems.length) return '';
        return `
        <div class="nav-group" data-group="${esc(g.title)}">
            <button type="button" class="nav-group-title" aria-expanded="true">
                <span>${esc(g.title)}</span><i class="fa fa-chevron-down group-chev" aria-hidden="true"></i>
            </button>
            <div class="nav-group-items">${visibleItems.map(it => `
                <a href="${it.page === 'all' ? 'app.html' : it.page}" class="nav-item ${activePage === it.page ? 'active' : ''}" data-route="${it.page}" title="${esc(it.label)}">
                    <i class="fa ${it.icon}" aria-hidden="true"></i><span>${esc(it.label)}</span>
                </a>`).join('')}
            </div>
        </div>`;
    }).join('');
    const initials = currentUser ? (currentUser.full_name || currentUser.username || 'U').charAt(0).toUpperCase() : 'U';
    const userName = currentUser ? (currentUser.full_name || currentUser.username) : '加载中...';
    shell.innerHTML = `
        <aside class="sidebar" id="appSidebar">
            <div class="p-4 flex items-center gap-2 border-b sidebar-head">
                <div class="user-avatar sidebar-avatar">${esc(initials)}</div>
                <div class="sidebar-brand">
                    <div class="font-semibold" style="font-size:13px">药品GSP仓储</div>
                    <div class="text-xs text-gray-500">质量管理系统</div>
                </div>
                <button type="button" class="sidebar-toggle" id="sidebarToggle" title="折叠菜单" aria-label="折叠/展开菜单">
                    <i class="fa fa-angle-left" aria-hidden="true"></i>
                </button>
            </div>
            <nav class="sidebar-nav">${sidebar}</nav>
        </aside>
        <div class="main-area">
            <header class="topbar">
                <div class="page-title">${esc(pageTitle || '')}</div>
                <div class="flex items-center gap-3">
                    <div class="relative" id="userMenuWrap">
                        <button class="flex items-center gap-2" id="userMenuBtn" style="background:none;border:none">
                            <div class="user-avatar">${esc(initials)}</div>
                            <span class="text-sm font-medium text-gray-700">${esc(userName)}</span>
                            <i class="fa fa-chevron-down text-xs text-gray-500"></i>
                        </button>
                        <div id="userDropdown" class="dropdown hidden">
                            <div class="px-4 py-2 border-b" style="font-size:12px;color:var(--gray-500)">
                                角色：<span id="userRoleText">-</span><br>仓库：<span id="userWarehouseText">-</span>
                            </div>
                            <a href="#" id="logoutButton" class="dropdown-item"><i class="fa fa-sign-out mr-2"></i>退出登录</a>
                        </div>
                    </div>
                </div>
            </header>
            <main class="page-content" id="pageContent"></main>
        </div>`;
    const menuBtn = shell.querySelector('#userMenuBtn');
    const dropdown = shell.querySelector('#userDropdown');
    menuBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('hidden'); });
    document.addEventListener('click', () => dropdown.classList.add('hidden'));
    shell.querySelector('#logoutButton').addEventListener('click', (e) => { e.preventDefault(); logout(); });
    // 菜单栏折叠：224px ↔ 56px，状态记忆到 localStorage
    const sidebarEl = shell.querySelector('#appSidebar');
    const toggleBtn = shell.querySelector('#sidebarToggle');
    const applyCollapsed = (collapsed) => {
        sidebarEl.classList.toggle('collapsed', collapsed);
        toggleBtn.innerHTML = collapsed
            ? '<i class="fa fa-angle-right" aria-hidden="true"></i>'
            : '<i class="fa fa-angle-left" aria-hidden="true"></i>';
        toggleBtn.title = collapsed ? '展开菜单' : '折叠菜单';
    };
    applyCollapsed(localStorage.getItem('wms_sidebar_collapsed') === '1');
    toggleBtn.addEventListener('click', () => {
        const collapsed = !sidebarEl.classList.contains('collapsed');
        applyCollapsed(collapsed);
        try { localStorage.setItem('wms_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) { /* 忽略 */ }
    });
    // 导航栏分类折叠：分组标题可点击展开/折叠。首次进入默认只展开"当前激活页所在组"，
    // 其余分组折叠以缩短菜单；用户手动展开/折叠的偏好记忆在 localStorage。
    (function initGroupCollapse() {
        const groups = Array.from(sidebarEl.querySelectorAll('.nav-group'));
        if (!groups.length) return;
        // 首次默认折叠：仅保留含激活项的组
        const defaultCollapsed = groups
            .filter(gEl => !gEl.querySelector('.nav-item.active'))
            .map(gEl => gEl.getAttribute('data-group'));
        let collapsedSet;
        try {
            const raw = localStorage.getItem('wms_collapsed_groups');
            collapsedSet = new Set(raw === null ? defaultCollapsed : JSON.parse(raw));
        } catch (e) { collapsedSet = new Set(defaultCollapsed); }
        const persist = () => {
            try { localStorage.setItem('wms_collapsed_groups', JSON.stringify([...collapsedSet])); } catch (e) { /* 忽略 */ }
        };
        const applyOne = (gEl) => {
            const name = gEl.getAttribute('data-group');
            const collapsed = collapsedSet.has(name);
            gEl.classList.toggle('collapsed', collapsed);
            const chev = gEl.querySelector('.group-chev');
            if (chev) chev.className = 'fa ' + (collapsed ? 'fa-chevron-right' : 'fa-chevron-down') + ' group-chev';
            const btn = gEl.querySelector('.nav-group-title');
            if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
        };
        groups.forEach((gEl) => {
            applyOne(gEl);
            gEl.querySelector('.nav-group-title').addEventListener('click', (ev) => {
                ev.preventDefault();
                const name = gEl.getAttribute('data-group');
                if (collapsedSet.has(name)) collapsedSet.delete(name); else collapsedSet.add(name);
                persist();
                applyOne(gEl);
            });
        });
    })();
    if (currentUser) {
        shell.querySelector('#userRoleText').textContent = (currentUser.role || 'operator');
        shell.querySelector('#userWarehouseText').textContent = currentUser.current_warehouse_name || '未指定';
    }
}

/* ----------------------------- 参考数据（带缓存） ----------------------------- */
const refCache = {};
async function refWarehouses(force) {
    if (!force && refCache.warehouses) return refCache.warehouses;
    refCache.warehouses = await apiAll('/warehouses/');
    return refCache.warehouses;
}
async function refLocations(force) {
    if (!force && refCache.locations) return refCache.locations;
    refCache.locations = await apiAll('/locations/');
    return refCache.locations;
}
async function refGoods(force) {
    if (!force && refCache.goods) return refCache.goods;
    refCache.goods = await apiAll('/goods/');
    return refCache.goods;
}
async function refUsers(force) {
    if (!force && refCache.users) return refCache.users;
    refCache.users = await apiAll('/users/');
    return refCache.users;
}
async function refQualityUsers(force) {
    if (!force && refCache.qualityUsers) return refCache.qualityUsers;
    refCache.qualityUsers = await apiAll('/gsp/reference/users');
    return refCache.qualityUsers;
}
/* 全量用户（含停用）id→显示名 映射：审计/签名台账把 User 实体/操作人解析成用户名 */
let userLabelMap = null;
async function refAllUsers(force) {
    if (!force && refCache.allUsers) return refCache.allUsers;
    refCache.allUsers = await api('/gsp/reference/users?active_only=false', { logoutOn401: false });
    return refCache.allUsers;
}
async function ensureUserLabelMap(force) {
    if (userLabelMap && !force) return userLabelMap;
    userLabelMap = {};
    try {
        const rows = await refAllUsers(force);
        (Array.isArray(rows) ? rows : []).forEach((u) => {
            if (u && u.id != null) userLabelMap[u.id] = { full_name: u.full_name, username: u.username };
        });
    } catch (e) { userLabelMap = {}; /* 无权限等：回落显示 #id */ }
    return userLabelMap;
}
function userNameFromId(id) {
    const n = Number(id);
    if (!userLabelMap || !userLabelMap[n]) return null;
    const u = userLabelMap[n];
    // 真实数据 full_name 是真名,与 username 不同 → 显示全名(更友好)
    // 测试/占位数据 full_name 与 username 相同(如"目标操作员"+"目标操作员-abc")→ 显示 username(带后缀以区分)
    if (u.full_name && u.username && u.full_name !== u.username) return u.full_name;
    return u.username || u.full_name || ('#' + id);
}
/* User 实体解析：entity_id 可能是 user_id 或 "user_id:warehouse_id" */
function entityUserLabel(entity_type, entity_id) {
    if (entity_type !== 'User' && entity_type !== 'UserWarehouse') return null;
    const s = String(entity_id == null ? '' : entity_id);
    const uid = s.includes(':') ? Number(s.split(':')[0]) : Number(s);
    return userNameFromId(uid);
}
async function refPartners(force) {
    if (!force && refCache.partners) return refCache.partners;
    refCache.partners = await apiAll('/gsp/partners');
    return refCache.partners;
}
async function refProfiles(force) {
    if (!force && refCache.profiles) return refCache.profiles;
    refCache.profiles = await apiAll('/gsp/products');
    return refCache.profiles;
}
async function refBatches(force) {
    if (!force && refCache.batches) return refCache.batches;
    refCache.batches = await apiAll('/gsp/batches');
    return refCache.batches;
}
async function refBatchStock(force) {
    if (!force && refCache.batchStock) return refCache.batchStock;
    refCache.batchStock = await apiAll('/gsp/batch-stock');
    return refCache.batchStock;
}
async function refHolds(force) {
    if (!force && refCache.holds) return refCache.holds;
    refCache.holds = await apiAll('/gsp/quality-holds');
    return refCache.holds;
}
async function refCarriers(force) {
    if (!force && refCache.carriers) return refCache.carriers;
    refCache.carriers = await apiAll('/gsp/transport/carriers');
    return refCache.carriers;
}
function optionHTML(items, valueKey, labelKey, placeholder) {
    const opts = [placeholder ? `<option value="">${esc(placeholder)}</option>` : ''];
    for (const it of items || []) {
        const label = typeof labelKey === 'function' ? labelKey(it) : it[labelKey];
        opts.push(`<option value="${esc(it[valueKey])}">${esc(label)}</option>`);
    }
    return opts.join('');
}

/* ----------------------------- SPA 模块 ----------------------------- */
/* 命名空间：PAGES[key] = { title, icon, desc, init, fn }，PG(key) 取模块的 fn（供内联调用） */
function PG(key) {
    return (window.PAGES && window.PAGES[key] && window.PAGES[key].fn) || {};
}

/* 事件委托：替代内联 onclick。按钮形如 data-action="module.method"
   + data-arg1/data-arg2/...（数字或 null），由 document 级委托统一分发，
   天然覆盖 innerHTML 动态生成的按钮，从而允许 CSP 去掉 script-src 'unsafe-inline'。 */
document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'window.print') { window.print(); return; }
    const dot = action.indexOf('.');
    if (dot < 0) return;
    const mod = action.slice(0, dot);
    const method = action.slice(dot + 1);
    const page = (window.PAGES && window.PAGES[mod] && window.PAGES[mod].fn) || {};
    const fn = page[method];
    if (typeof fn !== 'function') return;
    const args = [];
    for (let i = 1; i <= 5; i++) {
        const k = 'arg' + i;
        if (el.dataset[k] === undefined) break;
        const v = el.dataset[k];
        args.push(v === 'null' ? null : Number(v));
    }
    fn.apply(null, args);
});

/* ----------------------------- 页面引导 ----------------------------- */
document.addEventListener('DOMContentLoaded', async function () {
    const auth = getStoredAuth();
    if (!auth) {
        resolveAppShellReady(false);
        window.location.href = 'index.html';
        return;
    }
    try {
        currentUser = JSON.parse(auth.user);
    } catch (e) {
        resolveAppShellReady(false);
        logout();
        return;
    }
    const page = (window.location.pathname.split('/').pop() || 'index.html');
    if (page === 'index.html') {
        resolveAppShellReady(false);
        window.location.href = 'app.html';
        return;
    }
    try {
        await loadCurrentGspRoles();
    } catch (e) {
        showToast(e.message || '当前岗位加载失败', 'error');
        resolveAppShellReady(false);
        return;
    }
    renderShell(page, window.PAGE_TITLE || '');
    resolveAppShellReady(true);
    if (page !== 'app.html' && !canAccessPage(page)) {
        const pageContent = document.getElementById('pageContent');
        if (pageContent) pageContent.innerHTML = '<div class="alert alert-error"><i class="fa fa-lock mr-2"></i>当前账号没有访问该 GSP 模块的有效岗位。</div>';
        return;
    }
    if (typeof window.pageInit === 'function') {
        try { await window.pageInit(); } catch (e) {
            console.error('pageInit error:', e);
            showToast(e.message || '页面初始化失败', 'error');
        }
    }
});
