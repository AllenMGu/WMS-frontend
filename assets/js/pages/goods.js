/* 货物管理：WMS 货物主数据（条码/名称/规格/单位/单价），支持搜索、新增、编辑、删除与 Excel 导入
 * SPA 模块：window.PAGES['goods'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '货物管理';
    let _el = null;
    const content = () => _el;
    let goods = [];

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        render();
        await load();
    }

    function render() {
        content().innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-barcode mr-2" style="color:var(--primary)"></i>货物主数据（GSP 药品档案需挂在已有货物上）</span>
                <div class="flex gap-2">
                    <button class="btn btn-secondary btn-sm" id="gdImportBtn"><i class="fa fa-upload"></i> Excel导入</button>
                    <button class="btn btn-primary" id="gdNewBtn"><i class="fa fa-plus"></i> 新增货物</button>
                </div>
            </div>
            <div class="card-body">
                <div class="filter-bar mb-4">
                    <input id="gdSearch" class="input-field" placeholder="搜索名称/条码/规格" style="min-width:240px">
                    <button class="btn btn-secondary btn-sm" id="gdSearchBtn"><i class="fa fa-search"></i> 查询</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>ID</th><th>条码</th><th>名称</th><th>规格</th><th>单位</th><th>单价(元)</th><th>创建时间</th><th class="actions">操作</th></tr></thead>
                        <tbody id="gdBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        document.getElementById('gdNewBtn').addEventListener('click', openGoodsModal);
        document.getElementById('gdImportBtn').addEventListener('click', openImportModal);
        document.getElementById('gdSearchBtn').addEventListener('click', () => load());
        document.getElementById('gdSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
    }

    async function load() {
        try {
            const kw = document.getElementById('gdSearch').value.trim();
            const q = kw ? '?keyword=' + encodeURIComponent(kw) : '';
            goods = await api('/goods/' + q);
            renderTable();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function renderTable() {
        const tbody = document.getElementById('gdBody');
        tbody.innerHTML = goods.map(g => `
        <tr>
            <td>${g.id}</td>
            <td class="font-medium">${esc(g.barcode)}</td>
            <td>${esc(g.name)}</td>
            <td>${esc(g.spec || '-')}</td>
            <td>${esc(g.unit || '-')}</td>
            <td>${esc(g.price ?? '-')}</td>
            <td>${fmtDT(g.create_time)}</td>
            <td class="actions">
                <button class="btn btn-link btn-sm" onclick="PG('goods').openGoodsModal(${g.id})"><i class="fa fa-edit"></i> 编辑</button>
                <button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="PG('goods').deleteGoods(${g.id})"><i class="fa fa-trash"></i> 删除</button>
            </td>
        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无货物，点击右上角新增或 Excel 导入</div></td></tr>';
    }

    function openGoodsModal(goodsId) {
        const g = goodsId ? goods.find(x => x.id === goodsId) : null;
        const modal = openModal({
            title: g ? '编辑货物' : '新增货物',
            size: 'sm',
            body: `
            <div class="form-group"><label class="form-label">条码 *（唯一）</label><input id="gdBarcode" class="input-field" placeholder="如 6900000000004"></div>
            <div class="form-group"><label class="form-label">名称 *</label><input id="gdName" class="input-field" placeholder="如 维生素C片"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">规格</label><input id="gdSpec" class="input-field" placeholder="如 0.1g*100片"></div>
                <div class="form-group"><label class="form-label">单位</label><input id="gdUnit" class="input-field" value="盒"></div>
            </div>
            <div class="form-group"><label class="form-label">单价(元)</label><input type="number" step="0.01" min="0" id="gdPrice" class="input-field"></div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="gdSubmitBtn">保存</button>`,
        });
        if (g) {
            modal.querySelector('#gdBarcode').value = g.barcode || '';
            modal.querySelector('#gdName').value = g.name || '';
            modal.querySelector('#gdSpec').value = g.spec || '';
            modal.querySelector('#gdUnit').value = g.unit || '盒';
            modal.querySelector('#gdPrice').value = g.price ?? '';
        }
        modal.querySelector('#gdSubmitBtn').addEventListener('click', async () => {
            const body = {
                barcode: modal.querySelector('#gdBarcode').value.trim(),
                name: modal.querySelector('#gdName').value.trim(),
                spec: modal.querySelector('#gdSpec').value.trim() || '',
                unit: modal.querySelector('#gdUnit').value.trim() || '盒',
                price: modal.querySelector('#gdPrice').value === '' ? 0 : Number(modal.querySelector('#gdPrice').value),
            };
            if (!body.barcode || !body.name) { showToast('请填写条码与名称', 'warning'); return; }
            try {
                if (g) {
                    await api(`/goods/${g.id}`, { method: 'PUT', body });
                    showToast('货物已更新', 'success');
                } else {
                    await api('/goods/', { method: 'POST', body });
                    showToast('货物已新增', 'success');
                }
                closeModal(modal);
                await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function deleteGoods(id) {
        const g = goods.find(x => x.id === id);
        confirmModal(`确认删除货物「${g ? g.name : id}」？删除后其关联的GSP档案可能失效。`, async () => {
            try {
                await api(`/goods/${id}`, { method: 'DELETE' });
                showToast('已删除', 'success');
                await load();
            } catch (e) { showToast(e.message, 'error'); }
        }, '删除');
    }

    function openImportModal() {
        const modal = openModal({
            title: 'Excel 导入货物（需系统管理员）',
            size: 'md',
            body: `
            <div class="alert alert-info"><i class="fa fa-info-circle mr-2"></i>Excel 需包含列：<b>条码、货物名称、规格型号、单位、单价</b>（.xlsx）</div>
            <input type="file" id="gdFile" class="input-field" accept=".xlsx,.xls">
            <div id="gdImportResult" class="mt-3"></div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="gdImportBtn2"><i class="fa fa-upload"></i> 开始导入</button>`,
        });
        modal.querySelector('#gdImportBtn2').addEventListener('click', async () => {
            const file = modal.querySelector('#gdFile').files[0];
            if (!file) { showToast('请选择 Excel 文件', 'warning'); return; }
            const fd = new FormData();
            fd.append('file', file);
            const btn = modal.querySelector('#gdImportBtn2');
            btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> 导入中...';
            try {
                const res = await fetch(API_BASE_URL + '/goods/import', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + getToken() },
                    body: fd,
                });
                const text = await res.text();
                let data = null;
                try { data = JSON.parse(text); } catch (e) { data = text; }
                if (!res.ok) throw new Error(typeof data === 'string' ? data : (data.detail || '导入失败'));
                modal.querySelector('#gdImportResult').innerHTML = `<div class="alert alert-success"><i class="fa fa-check-circle mr-2"></i>${esc(JSON.stringify(data))}</div>`;
                showToast('导入完成', 'success');
                await load();
            } catch (e) {
                modal.querySelector('#gdImportResult').innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`;
            } finally {
                btn.disabled = false; btn.innerHTML = '<i class="fa fa-upload"></i> 开始导入';
            }
        });
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['goods'] = {
        title: '货物管理',
        icon: 'fa-barcode',
        desc: 'WMS 货物主数据',
        init: pageInit,
        fn: { openGoodsModal, deleteGoods },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 goods.html
})();
