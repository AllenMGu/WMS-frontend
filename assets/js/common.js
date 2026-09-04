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

/* ----------------------------- 工具函数 ----------------------------- */
function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDT(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d)) return String(value);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtD(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d)) return String(value);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtNum(value) {
    if (value === null || value === undefined) return '-';
    const n = Number(value);
    if (isNaN(n)) return String(value);
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
    const storage = remember ? localStorage : sessionStorage;
    storage.removeItem('access_token'); storage.removeItem('user'); storage.removeItem('token_expiry');
    if (!remember) { localStorage.removeItem('access_token'); localStorage.removeItem('user'); localStorage.removeItem('token_expiry'); }
    storage.setItem('access_token', data.access_token);
    storage.setItem('user', JSON.stringify(data.user));
    if (data.expiry) storage.setItem('token_expiry', data.expiry);
    else if (remember) {
        const d = new Date(); d.setDate(d.getDate() + 7);
        storage.setItem('token_expiry', d.toISOString());
    }
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
async function signAndCall(path, opts, sigSpec, reason, password) {
    const challenge = await createSignatureChallenge({
        action: sigSpec.action,
        entity_type: sigSpec.entity_type,
        entity_id: String(sigSpec.entity_id),
        meaning: sigSpec.meaning,
        payload: opts.body || {},
        reason,
        password,
    });
    return api(path, { ...opts, sigToken: challenge.signature_token });
}
/* 打开电子签名确认弹窗：reason + password，然后执行 signedCall(reason, password) */
function openSignatureModal(title, signedCall) {
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
    const doSign = async () => {
        const reason = reasonEl.value.trim();
        const password = passEl.value;
        if (reason.length < 3) { showToast('变更原因不能少于3个字', 'warning'); return; }
        if (!password) { showToast('请输入登录密码', 'warning'); return; }
        btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> 签署中...';
        try {
            await signedCall(reason, password);
            closeModal(modal);
        } catch (e) {
            showToast(e.message || '电子签名或操作失败', 'error');
        } finally {
            btn.disabled = false; btn.innerHTML = '<i class="fa fa-pencil"></i> 确认签署';
        }
    };
    btn.addEventListener('click', doSign);
    modal.querySelector('[data-close]').addEventListener('click', () => closeModal(modal));
    reasonEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSign(); });
    setTimeout(() => passEl.focus(), 100);
    return modal;
}
/* 便捷封装：页面只需提供 sigSpec + 业务调用 */
function signAction(sigSpec, businessCall, title) {
    openSignatureModal(title || `${sigSpec.action} - 需要电子签名`, async (reason, password) => {
        const opts = businessCall.opts || {};
        // 业务请求体中的 reason 若为空，则复用签名弹窗填写的变更原因（接口要求 ≥3 字）
        let body = opts.body;
        if (body && typeof body === 'object' && !Array.isArray(body)) {
            body = { ...body };
            if (body.reason === undefined || body.reason === null || body.reason === '') {
                body.reason = reason;
            }
        }
        const data = await signAndCall(businessCall.path, { ...opts, body }, sigSpec, reason, password);
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
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
    // 绑定所有 data-close 元素（标题栏 × 与底部“取消”按钮），避免只绑到第一个
    modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => closeModal(modal)));
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
    return modal;
}
function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 200);
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
    'legacy-archive.html': ['SYSTEM_ADMIN', 'AUDITOR', 'QUALITY_MANAGER', 'QUALITY_REVIEWER'],
};
async function loadCurrentGspRoles() {
    const data = await api('/gsp/roles/me');
    currentGspRoles = new Set(data?.roles || []);
}
function hasAnyGspRole(...roles) {
    if (roles.includes('ANY_GSP_ROLE')) return currentGspRoles.size > 0;
    const gspOnly = roles.includes('GSP_ROLE_ONLY');
    const legacyRole = String(currentUser?.role?.value || currentUser?.role || '').toLowerCase();
    if (!gspOnly && legacyRole === 'admin') return true;
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
        <div class="nav-group">
            <div class="nav-group-title">${esc(g.title)}</div>
            ${visibleItems.map(it => `
                <a href="${it.page === 'all' ? 'app.html' : it.page}" class="nav-item ${activePage === it.page ? 'active' : ''}" data-route="${it.page}">
                    <i class="fa ${it.icon}"></i><span>${esc(it.label)}</span>
                </a>`).join('')}
        </div>`;
    }).join('');
    const initials = currentUser ? (currentUser.full_name || currentUser.username || 'U').charAt(0).toUpperCase() : 'U';
    const userName = currentUser ? (currentUser.full_name || currentUser.username) : '加载中...';
    shell.innerHTML = `
        <aside class="sidebar">
            <div class="p-4 flex items-center gap-2 border-b">
                <div class="user-avatar">${esc(initials)}</div>
                <div>
                    <div class="font-semibold" style="font-size:13px">药品GSP仓储</div>
                    <div class="text-xs text-gray-500">质量管理系统</div>
                </div>
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
/* 命名空间：PAGES[key] = { title, icon, desc, init, fn }，PG(key) 取模块的 fn（供 onclick 内联调用） */
function PG(key) {
    return (window.PAGES && window.PAGES[key] && window.PAGES[key].fn) || {};
}

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
