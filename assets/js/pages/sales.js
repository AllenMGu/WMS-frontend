/* 销售与发运：销售订单（制单→审批→FEFO分配→拣货→取消）、发运（备货→独立复核→发运） */
'use strict';
window.PAGE_TITLE = '销售与发运';
const content = () => document.getElementById('pageContent');
let tab = 'orders';
let orders = [];
let shipments = [];
let customers = [];
let goodsList = [];
let warehouses = [];
let carriers = [];   // {id, name, vehicles:[], drivers:[]}

window.pageInit = async function () {
    await Promise.all([refGoods(), refPartners(), refWarehouses()]).then(([g, p, w]) => {
        goodsList = g; customers = p.filter(x => ['CUSTOMER', 'BOTH'].includes(x.partner_type)); warehouses = w;
    });
    try { carriers = await loadCarriers(); } catch (e) { carriers = []; showToast(`承运方加载失败：${e.message}`, 'error'); }
    render();
    await loadTab();
};

async function loadCarriers() {
    const list = await api('/gsp/transport/carriers');
    const out = [];
    for (const c of list.filter(x => x.status === 'APPROVED')) {
        try {
            const [vehicles, drivers] = await Promise.all([
                api(`/gsp/transport/carriers/${c.id}/vehicles`),
                api(`/gsp/transport/carriers/${c.id}/drivers`),
            ]);
            out.push({ ...c, vehicles, drivers });
        } catch (e) { out.push({ ...c, vehicles: [], drivers: [] }); }
    }
    return out;
}

function render() {
    content().innerHTML = `
        <div class="tabs">
            <div class="tab ${tab === 'orders' ? 'active' : ''}" data-tab="orders"><i class="fa fa-shopping-bag mr-1"></i>销售订单</div>
            <div class="tab ${tab === 'shipments' ? 'active' : ''}" data-tab="shipments"><i class="fa fa-truck mr-1"></i>发运管理</div>
        </div>
        <div id="tabContent"></div>`;
    content().querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
        tab = t.dataset.tab;
        content().querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
        loadTab();
    }));
}

async function loadTab() {
    const box = document.getElementById('tabContent');
    box.innerHTML = '<div class="card p-6 text-center"><span class="loading"></span></div>';
    try {
        if (tab === 'orders') { orders = await api('/gsp/sales/orders'); await renderOrders(box); }
        else { shipments = await api('/gsp/shipping/shipments'); await renderShipments(box); }
    } catch (e) { box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`; }
}

const SO_STATUS_ORDER = { DRAFT: 0, SUBMITTED: 1, APPROVED: 2, ALLOCATED: 3, PICKED: 4, PREPARED: 5, REVIEWED: 6, DISPATCHED: 7, CANCELLED: 8 };

async function renderOrders(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-shopping-bag mr-2" style="color:var(--primary)"></i>销售订单（购货方资质复核 + FEFO）</span>
                <button class="btn btn-primary" id="soNewBtn"><i class="fa fa-plus"></i> 新建销售订单</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>单号</th><th>购货方</th><th>仓库</th><th>下单日期</th><th>状态</th><th>明细</th><th class="actions">操作</th></tr></thead>
                    <tbody>${orders.map(o => `
                        <tr>
                            <td class="font-medium">${esc(o.order_no)}</td>
                            <td>${esc(customers.find(c => c.id === o.customer_id)?.name || o.customer_id)}</td>
                            <td>${esc(warehouses.find(w => w.id === o.warehouse_id)?.name || o.warehouse_id)}</td>
                            <td>${fmtD(o.ordered_on)}</td>
                            <td>${statusBadge(o.status)}</td>
                            <td style="white-space:normal">
                                ${(o.items || []).map(i => `<span class="text-xs text-gray-600">${esc(goodsList.find(g => g.id === i.goods_id)?.name || i.goods_id)} × ${fmtNum(i.ordered_quantity)}${esc(i.unit)}${i.minimum_remaining_days ? `（≥${i.minimum_remaining_days}天效期）` : ''}</span><br>`).join('')}
                                ${(o.allocations || []).filter(a => a.status !== 'CANCELLED').map(a => `<span class="text-xs text-blue-600"><i class="fa fa-link"></i> 分配${fmtNum(a.quantity)}（批次#${a.batch_id}）</span><br>`).join('')}
                            </td>
                            <td class="actions">
                                ${o.status === 'DRAFT' ? `<button class="btn btn-link btn-sm" onclick="submitSO(${o.id})"><i class="fa fa-paper-plane"></i> 提交</button>` : ''}
                                ${o.status === 'SUBMITTED' ? `<button class="btn btn-link btn-sm" onclick="approveSO(${o.id})"><i class="fa fa-check"></i> 批准</button>` : ''}
                                ${o.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" onclick="allocateSO(${o.id})"><i class="fa fa-link"></i> FEFO分配</button>` : ''}
                                ${o.status === 'ALLOCATED' ? `<button class="btn btn-link btn-sm" onclick="pickSO(${o.id})"><i class="fa fa-hand-rock-o"></i> 拣货</button>` : ''}
                                ${o.status === 'PICKED' ? `<button class="btn btn-link btn-sm" onclick="prepareShipment(${o.id})"><i class="fa fa-truck"></i> 备货发运</button>` : ''}
                                ${['DRAFT', 'SUBMITTED'].includes(o.status) ? `<button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="cancelSO(${o.id})"><i class="fa fa-times"></i> 取消</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无销售订单</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#soNewBtn').addEventListener('click', openSOModal);
}

function openSOModal() {
    const modal = openModal({
        title: '新建销售订单',
        size: 'lg',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">订单号 *</label><input id="soNo" class="input-field" placeholder="如 SO20260821001"></div>
                <div class="form-group"><label class="form-label">购货方 *</label><select id="soCust" class="input-field">${optionHTML(customers, 'id', 'name', '请选择购货方')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">发货仓库 *</label><select id="soWh" class="input-field">${optionHTML(warehouses, 'id', 'name', '请选择仓库')}</select></div>
                <div class="form-group"><label class="form-label">下单日期 *</label><input type="date" id="soDate" class="input-field" value="${todayISO()}"></div>
            </div>
            <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-sm">销售明细</span>
                <button type="button" class="btn btn-secondary btn-sm" id="soAddItem"><i class="fa fa-plus"></i> 添加行</button>
            </div>
            <div id="soItems"></div>
            <div class="form-group"><label class="form-label">制单原因 *（≥3字）</label><textarea id="soReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="soSubmitBtn">保存草稿</button>`,
    });
    const itemsBox = modal.querySelector('#soItems');
    const addRow = () => {
        const row = document.createElement('div');
        row.className = 'flex gap-2 mb-2';
        row.innerHTML = `
            <select class="input-field so-goods" style="flex:2">${optionHTML(goodsList, 'id', g => `${g.name}（${g.spec || ''}）`, '选择货物')}</select>
            <input class="input-field so-qty" type="number" step="0.001" min="0.001" placeholder="数量" style="flex:1">
            <input class="input-field so-unit" placeholder="单位" value="盒" style="flex:0.8">
            <input class="input-field so-days" type="number" min="0" placeholder="最低效期(天)" style="flex:1">
            <button type="button" class="btn btn-danger btn-sm so-del"><i class="fa fa-trash"></i></button>`;
        row.querySelector('.so-del').addEventListener('click', () => row.remove());
        itemsBox.appendChild(row);
    };
    addRow();
    modal.querySelector('#soAddItem').addEventListener('click', addRow);
    modal.querySelector('#soSubmitBtn').addEventListener('click', async () => {
        const sels = itemsBox.querySelectorAll('.so-goods');
        const items = [...sels].map((sel, i) => ({
            goods_id: Number(sel.value),
            quantity: Number(itemsBox.querySelectorAll('.so-qty')[i].value),
            unit: itemsBox.querySelectorAll('.so-unit')[i].value.trim() || '盒',
            minimum_remaining_days: Number(itemsBox.querySelectorAll('.so-days')[i].value || 0),
        })).filter(i => i.goods_id && i.quantity > 0);
        const body = {
            order_no: modal.querySelector('#soNo').value.trim(),
            customer_id: Number(modal.querySelector('#soCust').value),
            warehouse_id: Number(modal.querySelector('#soWh').value),
            ordered_on: modal.querySelector('#soDate').value,
            items,
            reason: modal.querySelector('#soReason').value.trim(),
        };
        if (!body.order_no || !body.customer_id || !body.warehouse_id || !body.ordered_on || !items.length) { showToast('请完整填写订单信息', 'warning'); return; }
        if (body.reason.length < 3) { showToast('制单原因不能少于3个字', 'warning'); return; }
        try {
            await api('/gsp/sales/orders', { method: 'POST', body });
            closeModal(modal);
            showToast('销售订单已保存为草稿', 'success');
            await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}

function submitSO(id) {
    confirmModal('提交销售订单进入质量审批？', async () => {
        try {
            await api(`/gsp/sales/orders/${id}/submit`, { method: 'POST', body: { reason: '提交销售订单进入质量审批流程' } });
            showToast('已提交', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    }, '提交');
}
function approveSO(id) {
    signAction(
        { action: 'SALES_ORDER_APPROVE', entity_type: 'GspSalesOrder', entity_id: id, meaning: 'APPROVAL' },
        { path: `/gsp/sales/orders/${id}/approve`, opts: { method: 'POST', body: { reason: '' } } },
        '批准销售订单'
    );
}
function allocateSO(id) {
    confirmModal('按近效期先出（FEFO）跨批号分配库存？库存不足将整体失败。', async () => {
        try {
            await api(`/gsp/sales/orders/${id}/allocate`, { method: 'POST', body: { reason: '执行FEFO库存分配' } });
            showToast('分配完成', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    }, '分配');
}
function pickSO(id) {
    confirmModal('确认完成拣货？拣货人与出库复核人必须分离。', async () => {
        try {
            await api(`/gsp/sales/orders/${id}/pick`, { method: 'POST', body: { reason: '完成拣货作业' } });
            showToast('拣货完成', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    }, '拣货完成');
}
function cancelSO(id) {
    confirmModal('取消该销售订单？将释放已分配库存。', async () => {
        try {
            await api(`/gsp/sales/orders/${id}/cancel`, { method: 'POST', body: { reason: '取消销售订单并释放预留' } });
            showToast('已取消', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    }, '取消订单');
}

function prepareShipment(orderId) {
    const modal = openModal({
        title: '备货发运（创建发运单与运输任务）',
        size: 'lg',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">发运单号 *</label><input id="shNo" class="input-field" placeholder="如 SH20260821001"></div>
                <div class="form-group"><label class="form-label">承运方 *</label><select id="shCarrier" class="input-field">${optionHTML(carriers, 'id', 'name', '请选择合格承运方')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">车辆 *</label><select id="shVehicle" class="input-field"><option value="">先选择承运方</option></select></div>
                <div class="form-group"><label class="form-label">驾驶员 *</label><select id="shDriver" class="input-field"><option value="">先选择承运方</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">运输模式 *</label>
                    <select id="shMode" class="input-field"><option value="NORMAL">常温</option><option value="COLD">冷藏</option><option value="FROZEN">冷冻</option></select>
                </div>
                <div class="form-group"><label class="form-label">预计到达时间 *</label><input type="datetime-local" id="shArrive" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">路线计划引用 *</label><input id="shRoute" class="input-field"></div>
                <div class="form-group"><label class="form-label">交接单号 *</label><input id="shHandover" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">温度记录引用</label><input id="shTempRef" class="input-field"></div>
            <div class="form-group"><label class="form-label">备货原因 *（≥3字）</label><textarea id="shReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="shSubmitBtn">创建发运单</button>`,
    });
    const carrierSel = modal.querySelector('#shCarrier');
    const vehicleSel = modal.querySelector('#shVehicle');
    const driverSel = modal.querySelector('#shDriver');
    carrierSel.addEventListener('change', () => {
        const c = carriers.find(x => x.id === Number(carrierSel.value));
        vehicleSel.innerHTML = optionHTML(c ? c.vehicles.filter(v => v.status === 'APPROVED') : [], 'id', v => `${v.vehicle_no}（${v.vehicle_type}）`, '请选择车辆');
        driverSel.innerHTML = optionHTML(c ? c.drivers.filter(d => d.status === 'APPROVED') : [], 'id', 'name', '请选择驾驶员');
    });
    modal.querySelector('#shSubmitBtn').addEventListener('click', async () => {
        const body = {
            shipment_no: modal.querySelector('#shNo').value.trim(),
            carrier_id: Number(carrierSel.value),
            vehicle_id: Number(vehicleSel.value),
            driver_id: Number(driverSel.value),
            transport_mode: modal.querySelector('#shMode').value,
            temperature_record_ref: modal.querySelector('#shTempRef').value.trim() || null,
            route_plan_ref: modal.querySelector('#shRoute').value.trim(),
            handover_document_no: modal.querySelector('#shHandover').value.trim(),
            expected_arrival_at: modal.querySelector('#shArrive').value,
            reason: modal.querySelector('#shReason').value.trim(),
        };
        if (!body.shipment_no || !body.carrier_id || !body.vehicle_id || !body.driver_id || !body.route_plan_ref || !body.handover_document_no || !body.expected_arrival_at) { showToast('请完整填写发运信息', 'warning'); return; }
        if (body.reason.length < 3) { showToast('备货原因不能少于3个字', 'warning'); return; }
        try {
            await api(`/gsp/shipping/orders/${orderId}/prepare`, { method: 'POST', body });
            closeModal(modal);
            showToast('发运单已创建（含运输任务），待独立复核', 'success');
            await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}

async function renderShipments(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-truck mr-2" style="color:var(--primary)"></i>发运管理（准备 → 独立复核 → 发运）</span>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>发运单号</th><th>销售订单</th><th>承运方</th><th>车牌</th><th>驾驶员</th><th>模式</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${shipments.map(s => `
                        <tr>
                            <td class="font-medium">${esc(s.shipment_no)}</td>
                            <td>${esc(orders.find(o => o.id === s.sales_order_id)?.order_no || s.sales_order_id)}</td>
                            <td>${esc(s.carrier_name)}</td>
                            <td>${esc(s.vehicle_no || '-')}</td>
                            <td>${esc(s.driver_name || '-')}</td>
                            <td>${badge({ NORMAL: '常温', COLD: '冷藏', FROZEN: '冷冻' }[s.transport_mode] || s.transport_mode, s.transport_mode === 'NORMAL' ? 'info' : 'warning')}</td>
                            <td>${statusBadge(s.status)}</td>
                            <td class="actions">
                                ${s.status === 'PREPARED' ? `<button class="btn btn-link btn-sm" onclick="reviewShipment(${s.id})"><i class="fa fa-check-circle"></i> 复核</button>` : ''}
                                ${s.status === 'REVIEWED' ? `<button class="btn btn-link btn-sm" onclick="dispatchShipment(${s.id})"><i class="fa fa-paper-plane"></i> 发运</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无发运单</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
}

function reviewShipment(id) {
    signAction(
        { action: 'SHIPMENT_REVIEW', entity_type: 'GspShipment', entity_id: id, meaning: 'REVIEW' },
        { path: `/gsp/shipping/shipments/${id}/review`, opts: { method: 'POST', body: { reason: '' } } },
        '独立复核发运单'
    );
}
function dispatchShipment(id) {
    signAction(
        { action: 'SHIPMENT_DISPATCH', entity_type: 'GspShipment', entity_id: id, meaning: 'RESPONSIBILITY' },
        { path: `/gsp/shipping/shipments/${id}/dispatch`, opts: { method: 'POST', body: { reason: '' } } },
        '确认发运'
    );
}
