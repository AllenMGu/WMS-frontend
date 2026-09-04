/* 销后退回：隔离收货（关联原发运分配）→ 独立质量检验 → 合格回库/拒收处置
 * SPA 模块：window.PAGES['returns'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '销后退回';
    let _el = null;
    const content = () => _el;
    let returns = [];
    let orders = [];
    let shipments = [];
    let locations = [];
    let customers = [];

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        await Promise.all([refPartners(), refLocations()]).then(([p, l]) => {
            customers = p.filter(x => ['CUSTOMER', 'BOTH'].includes(x.partner_type)); locations = l;
        }).catch(() => {});
        try { [orders, shipments] = await Promise.all([api('/gsp/sales/orders'), api('/gsp/shipping/shipments')]); } catch (e) { /* ignore */ }
        render();
        await load();
    }

    function render() {
        content().innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-undo mr-2" style="color:var(--primary)"></i>销后退回（隔离收货 → 独立检验 → 回库/拒收）</span>
                <button class="btn btn-primary" id="rtNewBtn"><i class="fa fa-plus"></i> 登记退回</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>退回单号</th><th>原发运</th><th>购货方</th><th>收货时间</th><th>状态</th><th>明细</th><th class="actions">操作</th></tr></thead>
                    <tbody id="rtBody"></tbody>
                </table>
            </div>
        </div>`;
        document.getElementById('rtNewBtn').addEventListener('click', openReturnModal);
    }

    async function load() {
        try {
            returns = await api('/gsp/returns/sales');
            renderTable();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function renderTable() {
        const tbody = document.getElementById('rtBody');
        tbody.innerHTML = returns.map(r => `
        <tr>
            <td class="font-medium">${esc(r.return_no)}</td>
            <td>${esc(shipments.find(s => s.id === r.shipment_id)?.shipment_no || r.shipment_id)}</td>
            <td>${esc(customers.find(c => c.id === r.customer_id)?.name || r.customer_id)}</td>
            <td>${fmtDT(r.received_at)}</td>
            <td>${statusBadge(r.status)}</td>
            <td style="white-space:normal">
                ${(r.items || []).map(i => `<span class="text-xs text-gray-600">批次#${i.batch_id} 收${fmtNum(i.received_quantity)} / 验${fmtNum(i.accepted_quantity)} / 拒${fmtNum(i.rejected_quantity)} <span class="badge badge-${i.inspection_status === 'ACCEPTED' ? 'success' : i.inspection_status === 'REJECTED' ? 'danger' : 'warning'}">${esc(i.inspection_status)}</span></span><br>`).join('')}
            </td>
            <td class="actions">
                ${r.status === 'PENDING_INSPECTION' ? `<button class="btn btn-link btn-sm" onclick="PG('returns').cancelReturn(${r.id})"><i class="fa fa-ban"></i> 取消</button>` : ''}
                ${(r.items || []).filter(i => i.inspection_status === 'PENDING').map(i => `<button class="btn btn-link btn-sm" onclick="PG('returns').inspectReturnItem(${r.id}, ${i.id})"><i class="fa fa-search"></i> 检验</button>`).join('')}
            </td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无销后退回记录</div></td></tr>';
    }

    function openReturnModal() {
        const dispatched = orders.filter(o => o.status === 'DISPATCHED');
        const modal = openModal({
            title: '登记销后退回（原发运批次隔离收货）',
            size: 'lg',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">退回单号 *</label><input id="rtNo" class="input-field" placeholder="如 RT20260821001"></div>
                <div class="form-group"><label class="form-label">原发运单 *</label><select id="rtShipment" class="input-field">${optionHTML(shipments.filter(s => s.status === 'DISPATCHED'), 'id', s => s.shipment_no, '请选择已发运的发运单')}</select></div>
            </div>
            <div class="form-group"><label class="form-label">收货时间 *</label><input type="datetime-local" id="rtArrived" class="input-field" value="${nowLocalISO()}"></div>
            <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-sm">退回明细（关联原批次分配）</span>
                <button type="button" class="btn btn-secondary btn-sm" id="rtAddItem"><i class="fa fa-plus"></i> 添加行</button>
            </div>
            <div id="rtItems"></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="rtReason" class="input-field" rows="2"></textarea></div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rtSubmitBtn">登记退回</button>`,
        });
        const itemsBox = modal.querySelector('#rtItems');
        const shipSel = modal.querySelector('#rtShipment');
        const allocationsFor = (shipmentId) => {
            const order = orders.find(o => o.id === (shipments.find(s => s.id === Number(shipmentId)) || {}).sales_order_id);
            return (order ? order.allocations || [] : []).filter(a => a.status === 'SHIPPED' || a.status === 'ALLOCATED' || a.status === 'PICKED');
        };
        const addRow = () => {
            const row = document.createElement('div');
            row.className = 'card p-3 mb-2';
            row.innerHTML = `
            <div class="form-row">
                <div class="form-group" style="flex:2"><label class="form-label">原批次分配 *</label><select class="input-field rt-alloc">${optionHTML(allocationsFor(shipSel.value), 'id', a => `批次#${a.batch_id} 数量${fmtNum(a.quantity)}`, '请选择分配记录')}</select></div>
                <div class="form-group"><label class="form-label">退回数量 *</label><input type="number" step="0.001" min="0.001" class="input-field rt-qty"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">原因代码 *</label>
                    <select class="input-field rt-code">
                        <option value="QUALITY">QUALITY 质量原因</option>
                        <option value="CUSTOMER_REJECT">CUSTOMER_REJECT 购货方拒收</option>
                        <option value="OVER_DELIVERY">OVER_DELIVERY 多送</option>
                        <option value="OTHER">OTHER 其他</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">追溯码</label><input class="input-field rt-trace"></div>
            </div>
            <div class="form-group"><label class="form-label">状况说明 *（≥3字）</label><input class="input-field rt-notes" placeholder="如：外包装完好，客户要求退货"></div>
            <div class="form-group"><label class="form-label">温度记录引用（冷链必填）</label><input class="input-field rt-tempref"></div>
            <button type="button" class="btn btn-danger btn-sm rt-del"><i class="fa fa-trash"></i> 删除本行</button>`;
            row.querySelector('.rt-del').addEventListener('click', () => row.remove());
            itemsBox.appendChild(row);
        };
        shipSel.addEventListener('change', () => { itemsBox.innerHTML = ''; addRow(); });
        modal.querySelector('#rtAddItem').addEventListener('click', addRow);
        addRow();
        modal.querySelector('#rtSubmitBtn').addEventListener('click', async () => {
            const rows = [...itemsBox.querySelectorAll('.rt-alloc')];
            const items = rows.map((sel, i) => ({
                stock_allocation_id: Number(sel.value),
                quantity: Number(itemsBox.querySelectorAll('.rt-qty')[i].value),
                reason_code: itemsBox.querySelectorAll('.rt-code')[i].value,
                condition_notes: itemsBox.querySelectorAll('.rt-notes')[i].value.trim(),
                traceability_code: itemsBox.querySelectorAll('.rt-trace')[i].value.trim() || null,
                temperature_record_ref: itemsBox.querySelectorAll('.rt-tempref')[i].value.trim() || null,
            })).filter(it => it.stock_allocation_id && it.quantity > 0 && it.condition_notes.length >= 3);
            const body = {
                return_no: modal.querySelector('#rtNo').value.trim(),
                shipment_id: Number(shipSel.value),
                received_at: modal.querySelector('#rtArrived').value,
                items,
                reason: modal.querySelector('#rtReason').value.trim(),
            };
            if (!body.return_no || !body.shipment_id || !body.received_at || !items.length) { showToast('请完整填写退回信息', 'warning'); return; }
            if (body.reason.length < 3) { showToast('登记原因不能少于3个字', 'warning'); return; }
            try {
                await api('/gsp/returns/sales', { method: 'POST', body });
                closeModal(modal);
                showToast('退回已登记（隔离待检）', 'success');
                await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function inspectReturnItem(returnId, itemId) {
        const modal = openModal({
            title: '退回质量检验（需电子签名）',
            size: 'lg',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">合格数量 *</label><input type="number" step="0.001" min="0" id="riAcc" class="input-field"></div>
                <div class="form-group"><label class="form-label">拒收数量 *</label><input type="number" step="0.001" min="0" id="riRej" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">合格回库库位 *</label><select id="riLoc" class="input-field">${optionHTML(locations, 'id', l => `${l.location_code} - ${l.name || ''}`, '请选择库位')}</select></div>
                <div class="form-group"><label class="form-label">拒收处置方向</label>
                    <select id="riDisp" class="input-field"><option value="">请选择</option><option value="DESTROY">监督销毁</option><option value="RETURN_SUPPLIER">退回供货方</option><option value="ISOLATION">继续隔离</option></select>
                </div>
            </div>
            <div class="form-row">
                <label class="checkbox-label"><input type="checkbox" id="riPkg" class="checkbox"> 包装完好</label>
                <label class="checkbox-label"><input type="checkbox" id="riStorage" class="checkbox"> 储存条件符合</label>
                <label class="checkbox-label"><input type="checkbox" id="riTrace" class="checkbox"> 追溯信息核验通过</label>
            </div>
            <div class="form-group"><label class="form-label">检验结论 *（≥3字）</label><textarea id="riConc" class="input-field" rows="2"></textarea></div>
            <div class="alert alert-info"><i class="fa fa-info-circle mr-2"></i>提交后将弹出电子签名确认</div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="riSubmitBtn">提交检验</button>`,
        });
        modal.querySelector('#riSubmitBtn').addEventListener('click', () => {
            const accepted = Number(modal.querySelector('#riAcc').value);
            const rejected = Number(modal.querySelector('#riRej').value);
            const conclusion = modal.querySelector('#riConc').value.trim();
            const accepted_location_id = Number(modal.querySelector('#riLoc').value) || null;
            const rejection_disposition = modal.querySelector('#riDisp').value || null;
            if (isNaN(accepted) || isNaN(rejected) || conclusion.length < 3) { showToast('请完整填写检验信息', 'warning'); return; }
            closeModal(modal);
            signAction(
                { action: 'SALES_RETURN_ITEM_INSPECT', entity_type: 'GspSalesReturnItem', entity_id: itemId, meaning: 'APPROVAL' },
                {
                    path: `/gsp/returns/sales/${returnId}/items/${itemId}/inspect`,
                    opts: { method: 'POST', body: {
                        accepted_quantity: accepted, rejected_quantity: rejected, conclusion,
                        accepted_location_id, rejection_disposition,
                        package_intact: modal.querySelector('#riPkg').checked,
                        storage_conditions_confirmed: modal.querySelector('#riStorage').checked,
                        traceability_verified: modal.querySelector('#riTrace').checked,
                        reason: conclusion,
                    } },
                    successMessage: rejected > 0 ? '退回检验已保存；不合格批次已自动建立质量锁定' : '退回检验已保存',
                },
                '退回质量检验'
            );
        });
    }


    function cancelReturn(id) {
        const modal = openModal({
            title: '取消销后退回单（仅尚未开始检验时可用）',
            size: 'md',
            body: `
                <div class="form-group"><label class="form-label">取消原因 *（≥3字）</label><textarea id="rtCancelReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-danger" id="rtCancelOk">确认取消</button>`,
        });
        modal.querySelector('#rtCancelOk').addEventListener('click', async () => {
            const reason = modal.querySelector('#rtCancelReason').value.trim();
            if (reason.length < 3) { showToast('取消原因不能少于3个字', 'warning'); return; }
            try {
                await api(`/gsp/returns/sales/${id}/cancel`, { method: 'POST', body: { reason } });
                closeModal(modal);
                showToast('销后退回单已取消', 'success');
                await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }


    window.PAGES = window.PAGES || {};
    window.PAGES['returns'] = {
        title: '销后退回',
        icon: 'fa-undo',
        desc: '销后退回隔离与检验',
        init: pageInit,
        fn: { cancelReturn, inspectReturnItem },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 returns.html
})();
