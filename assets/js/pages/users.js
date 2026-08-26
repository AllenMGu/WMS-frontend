/* 用户与岗位：用户清单（新增/停用/仓库分配）+ GSP岗位授权（授予→复核→撤销）
 * SPA 模块：window.PAGES['users'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '用户与岗位';
    let _el = null;
    const content = () => _el;
    let users = [];
    let roles = [];

    const isAdmin = () => !!(currentUser && currentUser.role === 'admin');

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        render();
        await load();
    }

    function render() {
        content().innerHTML = `
        <div class="grid grid-2 gap-4">
            <div class="card">
                <div class="card-header">
                    <span class="card-title"><i class="fa fa-users mr-2" style="color:var(--primary)"></i>系统用户</span>
                    ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="usrNewBtn"><i class="fa fa-plus"></i> 新增用户</button>` : ''}
                </div>
                <div class="card-body p-0 table-wrap">
                    <table class="data-table">
                        <thead><tr><th>ID</th><th>用户名</th><th>姓名</th><th>系统角色</th><th>来源</th><th>状态</th>${isAdmin() ? '<th class="actions">操作</th>' : ''}</tr></thead>
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
        document.getElementById('usrNewBtn')?.addEventListener('click', openCreateUserModal);
        document.getElementById('rlGrantBtn').addEventListener('click', openGrantModal);
    }

    async function load() {
        try {
            users = await api('/users/');
            roles = await api('/gsp/roles');
            renderTables();
        } catch (e) {
            showToast(e.message || '加载失败（用户列表需管理员权限）', 'error');
            try { roles = await api('/gsp/roles'); renderTables(); } catch (e2) { showToast(e2.message || '岗位列表加载失败', 'error'); }
        }
    }

    function renderTables() {
        const ub = document.getElementById('usBody');
        ub.innerHTML = users.map(u => {
            const active = u.is_active !== false;
            const actions = isAdmin() ? `
            ${active ? `<button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="PG('users').disableUser(${u.id})"><i class="fa fa-ban"></i> 停用</button>` : badge('需审批启用', 'warning')}
            ${u.role !== 'admin' ? `<button class="btn btn-link btn-sm" onclick="PG('users').openAssignWarehouses(${u.id})"><i class="fa fa-building"></i> 分配仓库</button>` : ''}` : '';
            return `
        <tr>
            <td>${u.id}</td>
            <td class="font-medium">${esc(u.username)}</td>
            <td>${esc(u.full_name || '-')}</td>
            <td>${badge(u.role, u.role === 'admin' ? 'purple' : 'info')}</td>
            <td>${u.is_ldap_user ? badge('AD/LDAP', 'info') : badge('本地', 'gray')}</td>
            <td>${active ? badge('启用', 'success') : badge('停用', 'danger')}</td>
            ${isAdmin() ? `<td class="actions">${actions}</td>` : ''}
        </tr>`;
        }).join('') || '<tr><td colspan="7"><div class="empty-state">无数据</div></td></tr>';

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
                ${r.is_active ? `<button class="btn btn-link btn-sm" onclick="PG('users').reviewRole(${r.id})"><i class="fa fa-refresh"></i> 复核</button><button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="PG('users').revokeRole(${r.id})"><i class="fa fa-ban"></i> 撤销</button>` : ''}
            </td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无岗位授权（首次需先授予 QUALITY_MANAGER）</div></td></tr>';
    }

    /* ------------------- 新增用户 ------------------- */
    async function openCreateUserModal() {
        let warehouses = [];
        try { warehouses = await refWarehouses(true); } catch (e) { /* 无仓库也可建用户 */ }
        const modal = openModal({
            title: '新增用户', size: 'md',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">用户名 *</label><input id="cuUsername" class="input-field" placeholder="登录账号"></div>
                <div class="form-group"><label class="form-label">姓名 *</label><input id="cuFullName" class="input-field" placeholder="真实姓名"></div>
            </div>
            <div class="form-group"><label class="form-label">初始密码 *</label><input type="password" id="cuPassword" class="input-field" placeholder="由管理员设定，首次登录后建议修改"></div>
            <div class="form-group"><label class="form-label">系统角色 *</label>
                <select id="cuRole" class="input-field">
                    <option value="operator">operator 操作员</option>
                    <option value="admin">admin 管理员</option>
                </select>
            </div>
            <div id="cuWhWrap" class="form-group">
                <label class="form-label">分配仓库（操作员必选，管理员自动拥有全部仓库）</label>
                <div id="cuWhList" class="checkbox-grid">${whCheckboxes(warehouses, [])}</div>
            </div>`,
            <div class="form-group"><label class="form-label">创建原因 *（≥3字）</label><textarea id="cuReason" class="input-field" rows="2" placeholder="请输入批准依据或创建原因"></textarea></div>
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="cuSubmit">创建</button>`,
        });
        modal.querySelector('#cuRole').addEventListener('change', (e) => {
            modal.querySelector('#cuWhWrap').style.display = e.target.value === 'admin' ? 'none' : '';
        });
        modal.querySelector('#cuSubmit').addEventListener('click', async () => {
            const role = modal.querySelector('#cuRole').value;
            const reason = modal.querySelector('#cuReason').value.trim();
            const body = {
                username: modal.querySelector('#cuUsername').value.trim(),
                full_name: modal.querySelector('#cuFullName').value.trim(),
                password: modal.querySelector('#cuPassword').value,
                role,
                warehouse_ids: role === 'admin' ? [] : checkedWarehouseIds(modal),
            };
            if (!body.username || !body.full_name || !body.password) { showToast('请填写用户名、姓名和密码', 'warning'); return; }
            if (body.role === 'operator' && !body.warehouse_ids.length) { showToast('操作员必须至少分配一个仓库', 'warning'); return; }
            if (reason.length < 3) { showToast('创建原因不能少于3个字', 'warning'); return; }
            try {
                await api(withReason('/users/', reason), { method: 'POST', body });
                closeModal(modal); showToast('用户已创建（GSP岗位需另行授予）', 'success'); await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function whCheckboxes(warehouses, assignedIds) {
        if (!warehouses.length) return '<div class="empty-state" style="padding:8px">暂无仓库，请先在"仓库与库位"中维护</div>';
        return warehouses.map(w => `
        <label class="checkbox-label">
            <input type="checkbox" class="wh-cb" value="${w.id}" ${assignedIds.includes(w.id) ? 'checked' : ''}>
            ${esc(w.code)} ${esc(w.name)}${w.is_active === false ? '（停用）' : ''}
        </label>`).join('');
    }
    function checkedWarehouseIds(modal) {
        return Array.from(modal.querySelectorAll('.wh-cb:checked')).map(cb => Number(cb.value));
    }

    /* ------------------- 停用用户 ------------------- */
    function disableUser(id) {
        const u = users.find(x => x.id === id);
        if (!u) return;
        const modal = openModal({
            title: `停用用户：${u.username}`, size: 'sm',
            body: `
            <div class="alert alert-warning mb-3"><i class="fa fa-exclamation-triangle mr-2"></i>停用将同步撤销该用户的全部 GSP 岗位与仓库权限，并写入审计链；重新启用须重新审批，不能直接恢复。</div>
            <div class="form-group"><label class="form-label">停用原因 *（≥3字，将写入审计链）</label><textarea id="duReason" class="input-field" rows="2"></textarea></div>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-danger" id="duSubmit">确认停用</button>`,
        });
        modal.querySelector('#duSubmit').addEventListener('click', async () => {
            const reason = modal.querySelector('#duReason').value.trim();
            if (reason.length < 3) { showToast('停用原因不能少于3个字', 'warning'); return; }
            try {
                await api(`/users/${id}`, { method: 'PUT', body: { is_active: false, access_change_reason: reason } });
                closeModal(modal); showToast('用户已停用', 'success'); await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    /* ------------------- 分配仓库 ------------------- */
    async function openAssignWarehouses(id) {
        const u = users.find(x => x.id === id);
        if (!u) return;
        let allWh = [], curWh = [];
        try { allWh = await refWarehouses(true); } catch (e) { showToast(e.message, 'error'); return; }
        try { curWh = await api(`/users/${id}/warehouses`); } catch (e) { showToast(e.message, 'error'); return; }
        const curIds = curWh.map(w => w.id);
        const modal = openModal({
            title: `分配仓库：${u.username}`, size: 'md',
            body: `
            <div class="form-group">
                <label class="form-label">勾选该操作员可访问的仓库（取消勾选即解除分配）</label>
                <div id="awList" class="checkbox-grid">${whCheckboxes(allWh, curIds)}</div>
            </div>
            <div class="text-xs" style="color:var(--gray-500)">当前默认仓库：${esc(curWh.find(w => w.is_default)?.name || '无')}</div>`,
            <div class="form-group mt-3"><label class="form-label">权限变更原因 *（≥3字）</label><textarea id="awReason" class="input-field" rows="2"></textarea></div>
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="awSubmit">保存</button>`,
        });
        modal.querySelector('#awSubmit').addEventListener('click', async () => {
            const reason = modal.querySelector('#awReason').value.trim();
            if (reason.length < 3) { showToast('权限变更原因不能少于3个字', 'warning'); return; }
            const wanted = new Set(checkedWarehouseIds(modal));
            const curSet = new Set(curIds);
            const adds = allWh.filter(w => wanted.has(w.id) && !curSet.has(w.id));
            const removes = curWh.filter(w => !wanted.has(w.id));
            if (!adds.length && !removes.length) { closeModal(modal); showToast('没有变更', 'info'); return; }
            try {
                for (const w of adds) await api(withReason(`/users/${id}/assign-warehouse?warehouse_id=${w.id}`, reason), { method: 'POST' });
                for (const w of removes) await api(withReason(`/users/${id}/unassign-warehouse?warehouse_id=${w.id}`, reason), { method: 'DELETE' });
                closeModal(modal); showToast(`已分配 ${adds.length} 个、解除 ${removes.length} 个仓库`, 'success'); await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
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
                    <option value="WAREHOUSE_MANAGER">WAREHOUSE_MANAGER 仓储负责人</option>
                    <option value="WAREHOUSE_CUSTODIAN">WAREHOUSE_CUSTODIAN 仓管员</option>
                    <option value="PICKER">PICKER 拣货员</option>
                    <option value="STOCKTAKE">STOCKTAKE 盘点员</option>
                    <option value="SALES">SALES 销售</option>
                    <option value="DISPATCHER">DISPATCHER 发运员</option>
                    <option value="OUTBOUND_REVIEWER">OUTBOUND_REVIEWER 出库复核</option>
                    <option value="RETURNS_RECEIVER">RETURNS_RECEIVER 退货收货员</option>
                    <option value="MAINTENANCE">MAINTENANCE 养护员</option>
                    <option value="ENVIRONMENT_MONITOR">ENVIRONMENT_MONITOR 环境监测员</option>
                    <option value="TRANSPORT_COORDINATOR">TRANSPORT_COORDINATOR 运输调度</option>
                    <option value="AUDITOR">AUDITOR 审计</option>
                    <option value="SYSTEM_ADMIN">SYSTEM_ADMIN 系统管理员</option>
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

    window.PAGES = window.PAGES || {};
    window.PAGES['users'] = {
        title: '用户与岗位',
        icon: 'fa-users',
        desc: '系统用户、GSP 岗位授权与仓库分配',
        init: pageInit,
        fn: { disableUser, openAssignWarehouses, reviewRole, revokeRole },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 users.html
})();
