/* 用户与岗位：用户清单 + GSP岗位授权（授予→复核→撤销） */
'use strict';
window.PAGE_TITLE = '用户与岗位';
const content = () => document.getElementById('pageContent');
let users = [];
let roles = [];

window.pageInit = async function () {
    render();
    await load();
};

function render() {
    content().innerHTML = `
        <div class="grid grid-2 gap-4">
            <div class="card">
                <div class="card-header"><span class="card-title"><i class="fa fa-users mr-2" style="color:var(--primary)"></i>系统用户</span></div>
                <div class="card-body p-0 table-wrap">
                    <table class="data-table">
                        <thead><tr><th>ID</th><th>用户名</th><th>姓名</th><th>系统角色</th><th>来源</th><th>状态</th></tr></thead>
                        <tbody id="usBody"></tbody>
                    </table>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <span class="card-title"><i class="fa fa-id-badge mr-2" style="color:var(--primary)"></i>GSP岗位授权（最小权限）</span>
                    <button class="btn btn-primary btn-sm" id="rlGrantBtn"><i class="fa fa-plus"></i> 授予岗位</button>
                </div>
                <div class="card-body p-0 table-wrap">
                    <table class="data-table">
                        <thead><tr><th>ID</th><th>用户</th><th>岗位</th><th>审批引用</th><th>复核期限</th><th>状态</th><th class="actions">操作</th></tr></thead>
                        <tbody id="rlBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
    document.getElementById('rlGrantBtn').addEventListener('click', openGrantModal);
}

async function load() {
    try {
        users = await api('/users/');
        roles = await api('/gsp/roles');
        renderTables();
    } catch (e) {
        showToast(e.message || '加载失败（用户列表需管理员权限）', 'error');
        try { roles = await api('/gsp/roles'); renderTables(); } catch (e2) { /* ignore */ }
    }
}

function renderTables() {
    const ub = document.getElementById('usBody');
    ub.innerHTML = users.map(u => `
        <tr>
            <td>${u.id}</td>
            <td class="font-medium">${esc(u.username)}</td>
            <td>${esc(u.full_name || '-')}</td>
            <td>${badge(u.role, u.role === 'admin' ? 'purple' : 'info')}</td>
            <td>${u.is_ldap_user ? badge('AD/LDAP', 'info') : badge('本地', 'gray')}</td>
            <td>${u.is_active === false ? badge('停用', 'danger') : badge('启用', 'success')}</td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">无数据</div></td></tr>';

    const rb = document.getElementById('rlBody');
    rb.innerHTML = roles.map(r => `
        <tr>
            <td>${r.id}</td>
            <td>${esc(users.find(u => u.id === r.user_id)?.username || r.user_id)}</td>
            <td>${badge(r.role, r.role === 'QUALITY_MANAGER' ? 'purple' : 'warning')}</td>
            <td class="text-xs">${esc(r.approval_ref)}</td>
            <td>${fmtDT(r.review_due_at)}</td>
            <td>${r.is_active ? badge('有效', 'success') : badge('已撤销', 'gray')}</td>
            <td class="actions">
                ${r.is_active ? `<button class="btn btn-link btn-sm" onclick="reviewRole(${r.id})"><i class="fa fa-refresh"></i> 复核</button><button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="revokeRole(${r.id})"><i class="fa fa-ban"></i> 撤销</button>` : ''}
            </td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无岗位授权（首次需先授予 QUALITY_MANAGER）</div></td></tr>';
}

function openGrantModal() {
    const modal = openModal({
        title: '授予GSP岗位', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">用户 *</label><select id="grUser" class="input-field">${optionHTML(users, 'id', u => `${u.username}（${u.full_name || ''}）`, '请选择用户')}</select></div>
            <div class="form-group"><label class="form-label">岗位 *</label>
                <select id="grRole" class="input-field">
                    <option value="QUALITY_MANAGER">QUALITY_MANAGER 质量负责人</option>
                    <option value="QUALITY_REVIEWER">QUALITY_REVIEWER 质量复核</option>
                    <option value="PROCUREMENT">PROCUREMENT 采购</option>
                    <option value="RECEIVER">RECEIVER 收货员</option>
                    <option value="INSPECTOR">INSPECTOR 验收员</option>
                    <option value="WAREHOUSE_CUSTODIAN">WAREHOUSE_CUSTODIAN 仓管员</option>
                    <option value="SALES">SALES 销售</option>
                    <option value="DISPATCHER">DISPATCHER 发运员</option>
                    <option value="OUTBOUND_REVIEWER">OUTBOUND_REVIEWER 出库复核</option>
                    <option value="MAINTENANCE">MAINTENANCE 养护员</option>
                    <option value="TRANSPORT_COORDINATOR">TRANSPORT_COORDINATOR 运输调度</option>
                    <option value="AUDITOR">AUDITOR 审计</option>
                </select>
            </div>
            <div class="form-group"><label class="form-label">批准依据引用 *（≥3字）</label><input id="grRef" class="input-field" placeholder="如岗位任命书/审批单号"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">复核期限 *</label><input type="datetime-local" id="grDue" class="input-field"></div>
                <div class="form-group"><label class="form-label">到期时间（可选）</label><input type="datetime-local" id="grExp" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">授权原因 *（≥3字）</label><textarea id="grReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="grSubmit">授予</button>`,
    });
    modal.querySelector('#grSubmit').addEventListener('click', async () => {
        const body = {
            user_id: Number(modal.querySelector('#grUser').value),
            role: modal.querySelector('#grRole').value,
            approval_ref: modal.querySelector('#grRef').value.trim(),
            review_due_at: modal.querySelector('#grDue').value,
            expires_at: modal.querySelector('#grExp').value || null,
            reason: modal.querySelector('#grReason').value.trim(),
        };
        if (!body.user_id || !body.approval_ref || !body.review_due_at || body.reason.length < 3) { showToast('请完整填写授权信息', 'warning'); return; }
        try {
            await api('/gsp/roles', { method: 'POST', body });
            closeModal(modal); showToast('岗位已授予', 'success'); await load();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function reviewRole(id) {
    const modal = openModal({
        title: '岗位复核', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">复核决策 *</label><select id="rvDecision" class="input-field"><option value="RETAIN">保留</option><option value="REVOKE">撤销</option></select></div>
            <div class="form-group"><label class="form-label">下次复核期限</label><input type="datetime-local" id="rvDue" class="input-field"></div>
            <div class="form-group"><label class="form-label">复核原因 *（≥3字）</label><textarea id="rvReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rvSubmit">提交</button>`,
    });
    modal.querySelector('#rvSubmit').addEventListener('click', () => {
        const body = {
            decision: modal.querySelector('#rvDecision').value,
            next_review_due_at: modal.querySelector('#rvDue').value || null,
            reason: modal.querySelector('#rvReason').value.trim(),
        };
        if (body.reason.length < 3) { showToast('复核原因不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'ROLE_ASSIGNMENT_REVIEW', entity_type: 'GspRoleAssignment', entity_id: id, meaning: 'REVIEW' },
            { path: `/gsp/roles/${id}/review`, opts: { method: 'POST', body } }, '岗位复核');
    });
}
function revokeRole(id) {
    const modal = openModal({
        title: '撤销岗位', size: 'sm',
        body: `<div class="form-group"><label class="form-label">撤销原因 *（≥3字）</label><textarea id="vkReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="vkSubmit">撤销</button>`,
    });
    modal.querySelector('#vkSubmit').addEventListener('click', () => {
        const reason = modal.querySelector('#vkReason').value.trim();
        if (reason.length < 3) { showToast('撤销原因不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'ROLE_ASSIGNMENT_REVOKE', entity_type: 'GspRoleAssignment', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/roles/${id}/revoke`, opts: { method: 'POST', body: { reason } } }, '撤销岗位授权');
    });
}
