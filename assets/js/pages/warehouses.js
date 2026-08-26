/* 仓库与库位：仓库主数据（增改/停用启用）+ 库位管理（增改/删除），仅管理员可维护
 * SPA 模块：window.PAGES['warehouses'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '仓库与库位';
    let _el = null;
    const content = () => _el;
    let warehouses = [];
    let locations = [];
    let selectedWarehouseId = null;

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
                    <span class="card-title"><i class="fa fa-building mr-2" style="color:var(--primary)"></i>仓库（设施主数据）</span>
                    ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="whNewBtn"><i class="fa fa-plus"></i> 新增仓库</button>` : ''}
                </div>
                <div class="card-body p-0 table-wrap">
                    <table class="data-table">
                        <thead><tr><th>ID</th><th>编码</th><th>名称</th><th>地址</th><th>状态</th><th>库位数</th><th class="actions">操作</th></tr></thead>
                        <tbody id="whBody"></tbody>
                    </table>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <span class="card-title"><i class="fa fa-map-marker mr-2" style="color:var(--primary)"></i>库位 <span id="locWhLabel" class="text-sm" style="color:var(--gray-500)"></span></span>
                    ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="locNewBtn"><i class="fa fa-plus"></i> 新增库位</button>` : ''}
                </div>
                <div class="card-body p-0 table-wrap">
                    <table class="data-table">
                        <thead><tr><th>ID</th><th>库位编码</th><th>名称</th><th>状态</th><th>创建时间</th><th class="actions">操作</th></tr></thead>
                        <tbody id="locBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        document.getElementById('whNewBtn')?.addEventListener('click', openWarehouseModal);
        document.getElementById('locNewBtn')?.addEventListener('click', openLocationModal);
    }

    async function load() {
        try {
            warehouses = await api('/warehouses/');
            locations = await api('/locations/');
            if (!selectedWarehouseId && warehouses.length) selectedWarehouseId = warehouses[0].id;
            renderWarehouses();
            renderLocations();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function renderWarehouses() {
        const tbody = document.getElementById('whBody');
        if (!tbody) return;
        tbody.innerHTML = warehouses.map(w => {
            const locCount = locations.filter(l => l.warehouse_id === w.id).length;
            const active = w.is_active !== false;
            const actions = isAdmin() ? `
            <button class="btn btn-link btn-sm" onclick="PG('warehouses').openWarehouseModal(${w.id})"><i class="fa fa-pencil"></i> 编辑</button>
            <button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="PG('warehouses').toggleWarehouse(${w.id})"><i class="fa ${active ? 'fa-ban' : 'fa-play'}"></i> ${active ? '停用' : '启用'}</button>` : '';
            return `
        <tr class="wh-row ${selectedWarehouseId === w.id ? 'row-selected' : ''}" data-id="${w.id}" style="cursor:pointer">
            <td>${w.id}</td>
            <td class="font-medium">${esc(w.code)}</td>
            <td>${esc(w.name)}</td>
            <td>${esc(w.address || '-')}</td>
            <td>${active ? badge('启用', 'success') : badge('停用', 'danger')}</td>
            <td>${locCount}</td>
            <td class="actions">${actions}</td>
        </tr>`;
        }).join('') || '<tr><td colspan="7"><div class="empty-state">无数据</div></td></tr>';
        tbody.querySelectorAll('.wh-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                selectedWarehouseId = Number(row.dataset.id);
                renderWarehouses();
                renderLocations();
            });
        });
    }

    function renderLocations() {
        const tbody = document.getElementById('locBody');
        if (!tbody) return;
        const wh = warehouses.find(w => w.id === selectedWarehouseId);
        document.getElementById('locWhLabel').textContent = wh ? `（${wh.code} ${wh.name}）` : '（请选择仓库）';
        const rows = locations.filter(l => l.warehouse_id === selectedWarehouseId);
        tbody.innerHTML = rows.map(l => {
            const active = l.is_active !== false;
            const actions = isAdmin() ? `
            <button class="btn btn-link btn-sm" onclick="PG('warehouses').openLocationModal(${l.id})"><i class="fa fa-pencil"></i> 编辑</button>
            <button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="PG('warehouses').deleteLocation(${l.id})"><i class="fa fa-trash"></i> 删除</button>` : '';
            return `
        <tr>
            <td>${l.id}</td>
            <td class="font-medium">${esc(l.location_code)}</td>
            <td>${esc(l.name)}</td>
            <td>${active ? badge('启用', 'success') : badge('停用', 'danger')}</td>
            <td>${fmtDT(l.create_time)}</td>
            <td class="actions">${actions}</td>
        </tr>`;
        }).join('') || '<tr><td colspan="6"><div class="empty-state">该仓库暂无库位</div></td></tr>';
    }

    /* ------------------- 仓库 ------------------- */
    function openWarehouseModal(id) {
        const editing = id ? warehouses.find(w => w.id === id) : null;
        const modal = openModal({
            title: editing ? `编辑仓库：${editing.code}` : '新增仓库',
            size: 'sm',
            body: `
            <div class="form-group"><label class="form-label">仓库编码 *</label><input id="whCode" class="input-field" value="${esc(editing?.code || '')}" placeholder="如 WH-001"></div>
            <div class="form-group"><label class="form-label">仓库名称 *</label><input id="whName" class="input-field" value="${esc(editing?.name || '')}" placeholder="如 总部常温库"></div>
            <div class="form-group"><label class="form-label">地址</label><input id="whAddr" class="input-field" value="${esc(editing?.address || '')}" placeholder="仓库地址"></div>
            ${editing ? `<div class="form-group"><label class="form-label">状态</label><select id="whActive" class="input-field">${optionHTML([{ v: true, l: '启用' }, { v: false, l: '停用' }], 'v', 'l')}</select></div>` : ''}
            <div class="form-group"><label class="form-label">变更原因 *（≥3字）</label><textarea id="whReason" class="input-field" rows="2" placeholder="请输入批准依据或变更原因"></textarea></div>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="whSubmit">${editing ? '保存' : '新增'}</button>`,
        });
        if (editing) modal.querySelector('#whActive').value = String(editing.is_active !== false);
        modal.querySelector('#whSubmit').addEventListener('click', async () => {
            const code = modal.querySelector('#whCode').value.trim();
            const name = modal.querySelector('#whName').value.trim();
            const address = modal.querySelector('#whAddr').value.trim();
            const reason = modal.querySelector('#whReason').value.trim();
            if (!code || !name) { showToast('编码和名称必填', 'warning'); return; }
            if (reason.length < 3) { showToast('变更原因不能少于3个字', 'warning'); return; }
            try {
                if (editing) {
                    const body = { code, name, address };
                    if (editing.is_active !== false !== (modal.querySelector('#whActive').value === 'true')) {
                        body.is_active = modal.querySelector('#whActive').value === 'true';
                    }
                    await api(withReason(`/warehouses/${editing.id}`, reason), { method: 'PUT', body });
                } else {
                    await api(withReason('/warehouses/', reason), { method: 'POST', body: { code, name, address } });
                }
                closeModal(modal); showToast('仓库已保存', 'success'); await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function toggleWarehouse(id) {
        const warehouse = warehouses.find(item => item.id === id);
        if (!warehouse) return;
        const active = warehouse.is_active !== false;
        const modal = openModal({
            title: active ? '停用仓库' : '启用仓库',
            size: 'sm',
            body: `
            <div class="alert alert-warning mb-3"><i class="fa fa-exclamation-triangle mr-2"></i>
                确定${active ? '停用' : '启用'}仓库「${esc(warehouse.code)} ${esc(warehouse.name)}」吗？
            </div>
            <div class="form-group"><label class="form-label">变更原因 *（≥3字）</label><textarea id="twReason" class="input-field" rows="2"></textarea></div>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="twSubmit">${active ? '停用' : '启用'}</button>`,
        });
        modal.querySelector('#twSubmit').addEventListener('click', async () => {
            const reason = modal.querySelector('#twReason').value.trim();
            if (reason.length < 3) { showToast('变更原因不能少于3个字', 'warning'); return; }
            try {
                await api(withReason(`/warehouses/${id}`, reason), {
                    method: 'PUT',
                    body: { is_active: !active },
                });
                closeModal(modal);
                showToast('仓库状态已更新', 'success');
                await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }
    /* ------------------- 库位 ------------------- */
    function openLocationModal(id) {
        if (!selectedWarehouseId && !id) { showToast('请先选择仓库', 'warning'); return; }
        const editing = id ? locations.find(l => l.id === id) : null;
        const modal = openModal({
            title: editing ? `编辑库位：${editing.location_code}` : '新增库位',
            size: 'sm',
            body: `
            <div class="form-group"><label class="form-label">所属仓库</label>
                <select id="locWh" class="input-field" ${editing ? 'disabled' : ''}>${optionHTML(warehouses, 'id', w => `${w.code} ${w.name}`, '')}</select>
            </div>
            <div class="form-group"><label class="form-label">库位编码 *</label><input id="locCode" class="input-field" value="${esc(editing?.location_code || '')}" placeholder="如 A-01-01"></div>
            <div class="form-group"><label class="form-label">库位名称 *</label><input id="locName" class="input-field" value="${esc(editing?.name || '')}" placeholder="如 常温区A排1列"></div>
            ${editing ? `<div class="form-group"><label class="form-label">状态</label><select id="locActive" class="input-field">${optionHTML([{ v: true, l: '启用' }, { v: false, l: '停用' }], 'v', 'l')}</select></div>` : ''}`,
            <div class="form-group"><label class="form-label">变更原因 *（≥3字）</label><textarea id="locReason" class="input-field" rows="2" placeholder="请输入批准依据或变更原因"></textarea></div>
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="locSubmit">${editing ? '保存' : '新增'}</button>`,
        });
        modal.querySelector('#locWh').value = String(editing ? editing.warehouse_id : selectedWarehouseId);
        if (editing) modal.querySelector('#locActive').value = String(editing.is_active !== false);
        modal.querySelector('#locSubmit').addEventListener('click', async () => {
            const warehouse_id = Number(modal.querySelector('#locWh').value);
            const location_code = modal.querySelector('#locCode').value.trim();
            const name = modal.querySelector('#locName').value.trim();
            const reason = modal.querySelector('#locReason').value.trim();
            if (!warehouse_id || !location_code || !name) { showToast('请选择仓库并填写编码和名称', 'warning'); return; }
            if (reason.length < 3) { showToast('变更原因不能少于3个字', 'warning'); return; }
            try {
                if (editing) {
                    const body = { location_code, name };
                    if (editing.is_active !== false !== (modal.querySelector('#locActive').value === 'true')) {
                        body.is_active = modal.querySelector('#locActive').value === 'true';
                    }
                    await api(withReason(`/locations/${editing.id}`, reason), { method: 'PUT', body });
                } else {
                    await api(withReason('/locations/', reason), { method: 'POST', body: { warehouse_id, location_code, name } });
                }
                closeModal(modal); showToast('库位已保存', 'success'); await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function deleteLocation(id) {
        const location = locations.find(item => item.id === id);
        if (!location) return;
        const modal = openModal({
            title: '删除库位',
            size: 'sm',
            body: `
            <div class="alert alert-warning mb-3"><i class="fa fa-exclamation-triangle mr-2"></i>
                删除库位「${esc(location.location_code)} ${esc(location.name)}」后不可恢复；存在业务引用时后端会拒绝删除。
            </div>
            <div class="form-group"><label class="form-label">删除原因 *（≥3字）</label><textarea id="dlReason" class="input-field" rows="2"></textarea></div>`,
            footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-danger" id="dlSubmit">删除</button>',
        });
        modal.querySelector('#dlSubmit').addEventListener('click', async () => {
            const reason = modal.querySelector('#dlReason').value.trim();
            if (reason.length < 3) { showToast('删除原因不能少于3个字', 'warning'); return; }
            try {
                await api(withReason(`/locations/${id}`, reason), { method: 'DELETE' });
                closeModal(modal);
                showToast('库位已删除', 'success');
                await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }
    window.PAGES = window.PAGES || {};
    window.PAGES['warehouses'] = {
        title: '仓库与库位',
        icon: 'fa-building',
        desc: '仓库与库位设施主数据',
        init: pageInit,
        fn: { openWarehouseModal, toggleWarehouse, openLocationModal, deleteLocation },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 warehouses.html
})();
