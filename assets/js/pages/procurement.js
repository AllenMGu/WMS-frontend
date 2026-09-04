/* 采购与收货：采购订单（制单→提交→质量审批）、收货验收（收货→抽样→独立验收→受控打印）
 * SPA 模块：window.PAGES['procurement'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '采购与收货';
    let _el = null;
    const content = () => _el;
    let tab = 'orders';
    let orders = [];
    let receipts = [];
    let suppliers = [];
    let goodsList = [];
    let warehouses = [];
    let locations = [];

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        await Promise.all([refGoods(), refPartners(), refWarehouses(), refLocations()]).then(([g, p, w, l]) => {
            goodsList = g; suppliers = p.filter(x => ['SUPPLIER', 'BOTH'].includes(x.partner_type) && x.status === 'APPROVED'); warehouses = w; locations = l;
        }).catch(() => {});
        render();
        await loadTab();
    }

    function render() {
        content().innerHTML = `
        <div class="tabs">
            <div class="tab ${tab === 'orders' ? 'active' : ''}" data-tab="orders"><i class="fa fa-shopping-cart mr-1"></i>采购订单</div>
            <div class="tab ${tab === 'receipts' ? 'active' : ''}" data-tab="receipts"><i class="fa fa-truck mr-1"></i>收货验收</div>
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
            if (tab === 'orders') { orders = await api('/gsp/procurement/orders'); await renderOrders(box); }
            else { receipts = await api('/gsp/receiving/receipts'); await renderReceipts(box); }
        } catch (e) { box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`; }
    }

    /* ---------------- 采购订单 ---------------- */
    async function renderOrders(box) {
        box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-shopping-cart mr-2" style="color:var(--primary)"></i>采购订单（GSP受控）</span>
                <button class="btn btn-primary" id="poNewBtn"><i class="fa fa-plus"></i> 新建采购订单</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>单号</th><th>供货方</th><th>仓库</th><th>下单日期</th><th>状态</th><th>明细</th><th class="actions">操作</th></tr></thead>
                    <tbody>${orders.map(o => `
                        <tr>
                            <td class="font-medium">${esc(o.order_no)}</td>
                            <td>${esc(suppliers.find(s => s.id === o.supplier_id)?.name || o.supplier_id)}</td>
                            <td>${esc(warehouses.find(w => w.id === o.warehouse_id)?.name || o.warehouse_id)}</td>
                            <td>${fmtD(o.ordered_on)}</td>
                            <td>${statusBadge(o.status)}</td>
                            <td style="white-space:normal">
                                ${(o.items || []).map(i => `<span class="text-xs text-gray-600">${esc(goodsList.find(g => g.id === i.goods_id)?.name || i.goods_id)} × ${fmtNum(i.ordered_quantity)}${esc(i.unit)}</span><br>`).join('')}
                            </td>
                            <td class="actions">
                                ${o.status === 'DRAFT' && hasAnyGspRole('PROCUREMENT') ? `<button class="btn btn-link btn-sm" onclick="PG('procurement').submitPO(${o.id})"><i class="fa fa-paper-plane"></i> 提交</button>` : ''}
                                ${o.status === 'DRAFT' && hasAnyGspRole('PROCUREMENT') ? `<button class="btn btn-link btn-sm" onclick="PG('procurement').cancelPO(${o.id})"><i class="fa fa-ban"></i> 取消</button>` : ''}
                                ${o.status === 'SUBMITTED' && hasAnyGspRole('QUALITY_MANAGER', 'QUALITY_REVIEWER') ? `<button class="btn btn-link btn-sm" onclick="PG('procurement').approvePO(${o.id})"><i class="fa fa-check"></i> 批准</button>` : ''}
                                ${o.status === 'SUBMITTED' && hasAnyGspRole('QUALITY_MANAGER', 'QUALITY_REVIEWER') ? `<button class="btn btn-link btn-sm" onclick="PG('procurement').rejectPO(${o.id})"><i class="fa fa-times"></i> 驳回</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无采购订单</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
        box.querySelector('#poNewBtn').addEventListener('click', openPOModal);
    }

    function openPOModal() {
        const modal = openModal({
            title: '新建采购订单',
            size: 'lg',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">订单号 *</label><input id="poNo" class="input-field" placeholder="如 PO20260821001"></div>
                <div class="form-group"><label class="form-label">供货方 *</label><select id="poSupplier" class="input-field">${optionHTML(suppliers, 'id', 'name', '请选择供货方')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">收货仓库 *</label><select id="poWh" class="input-field">${optionHTML(warehouses, 'id', 'name', '请选择仓库')}</select></div>
                <div class="form-group"><label class="form-label">下单日期 *</label><input type="date" id="poDate" class="input-field" value="${todayISO()}"></div>
            </div>
            <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-sm">订单明细</span>
                <button type="button" class="btn btn-secondary btn-sm" id="poAddItem"><i class="fa fa-plus"></i> 添加行</button>
            </div>
            <div class="alert alert-info mb-2" id="poScopeHint">请先选择供货方；产品清单只显示该供应商已独立批准且在有效期内的供货品种。</div>
            <div id="poItems"></div>
            <div class="form-group"><label class="form-label">制单原因 *（≥3字）</label><textarea id="poReason" class="input-field" rows="2"></textarea></div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="poSubmitBtn">保存草稿</button>`,
        });
        const itemsBox = modal.querySelector('#poItems');
        const supplierSelect = modal.querySelector('#poSupplier');
        let authorizedGoods = [];
        const addRow = (goodsId) => {
            if (!authorizedGoods.length) { showToast('该供应商没有有效的获准供货品种', 'warning'); return; }
            const row = document.createElement('div');
            row.className = 'flex gap-2 mb-2';
            row.innerHTML = `
            <select class="input-field po-goods" style="flex:2">${optionHTML(authorizedGoods, 'id', g => `${g.name}（${g.spec || ''}）`, '选择获准供货品种')}</select>
            <input class="input-field po-qty" type="number" step="0.001" min="0.001" placeholder="数量" style="flex:1">
            <input class="input-field po-unit" placeholder="单位" value="盒" style="flex:1">
            <button type="button" class="btn btn-danger btn-sm po-del"><i class="fa fa-trash"></i></button>`;
            if (goodsId) row.querySelector('.po-goods').value = goodsId;
            row.querySelector('.po-del').addEventListener('click', () => row.remove());
            itemsBox.appendChild(row);
        };
        const loadAuthorizedGoods = async () => {
            itemsBox.innerHTML = '';
            const supplierId = Number(supplierSelect.value);
            if (!supplierId) { authorizedGoods = []; modal.querySelector('#poScopeHint').textContent = '请先选择供货方；产品清单只显示该供应商已独立批准且在有效期内的供货品种。'; return; }
            try {
                const authorizations = await api(`/gsp/partners/${supplierId}/products?effective_only=true`);
                const allowed = new Set(authorizations.map(a => a.goods_id));
                authorizedGoods = goodsList.filter(g => allowed.has(g.id));
                modal.querySelector('#poScopeHint').textContent = authorizedGoods.length ? `当前供应商共有 ${authorizedGoods.length} 个有效获准供货品种。` : '当前供应商没有有效获准供货品种，不能建立采购订单。';
                if (authorizedGoods.length) addRow();
            } catch (e) { authorizedGoods = []; showToast(e.message, 'error'); }
        };
        supplierSelect.addEventListener('change', loadAuthorizedGoods);
        modal.querySelector('#poAddItem').addEventListener('click', () => addRow());
        modal.querySelector('#poSubmitBtn').addEventListener('click', async () => {
            const items = [...itemsBox.querySelectorAll('.po-goods')].map((sel, i) => ({
                goods_id: Number(sel.value),
                quantity: Number(itemsBox.querySelectorAll('.po-qty')[i].value),
                unit: itemsBox.querySelectorAll('.po-unit')[i].value.trim() || '盒',
            })).filter(i => i.goods_id && i.quantity > 0);
            const body = {
                order_no: modal.querySelector('#poNo').value.trim(),
                supplier_id: Number(modal.querySelector('#poSupplier').value),
                warehouse_id: Number(modal.querySelector('#poWh').value),
                ordered_on: modal.querySelector('#poDate').value,
                items,
                reason: modal.querySelector('#poReason').value.trim(),
            };
            if (!body.order_no || !body.supplier_id || !body.warehouse_id || !body.ordered_on || !items.length) { showToast('请完整填写订单信息', 'warning'); return; }
            if (body.reason.length < 3) { showToast('制单原因不能少于3个字', 'warning'); return; }
            try {
                await api('/gsp/procurement/orders', { method: 'POST', body });
                closeModal(modal);
                showToast('采购订单已保存为草稿', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function submitPO(id) {
        confirmModal('提交采购订单进行质量审批？', async () => {
            try {
                await api(`/gsp/procurement/orders/${id}/submit`, { method: 'POST', body: { reason: '提交采购订单进入质量审批流程' } });
                showToast('已提交', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        }, '提交');
    }

    function approvePO(id) {
        signAction(
            { action: 'PURCHASE_ORDER_APPROVE', entity_type: 'GspPurchaseOrder', entity_id: id, meaning: 'APPROVAL' },
            { path: `/gsp/procurement/orders/${id}/approve`, opts: { method: 'POST', body: { reason: '' } } },
            '批准采购订单'
        );
    }

    /* ---------------- 收货验收 ---------------- */
    async function renderReceipts(box) {
        const approvedPOs = orders.filter(o => o.status === 'APPROVED');
        box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-truck mr-2" style="color:var(--primary)"></i>收货与独立验收</span>
                <button class="btn btn-primary" id="rcNewBtn"><i class="fa fa-plus"></i> 按单收货</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>收货单号</th><th>采购订单</th><th>送货单号</th><th>到货时间</th><th>状态</th><th>明细</th><th class="actions">操作</th></tr></thead>
                    <tbody>${receipts.map(r => `
                        <tr>
                            <td class="font-medium">${esc(r.receipt_no)}</td>
                            <td>${esc((orders.find(o => o.id === r.purchase_order_id) || {}).order_no || r.purchase_order_id)}</td>
                            <td>${esc(r.delivery_document_no)}</td>
                            <td>${fmtDT(r.arrived_at)}</td>
                            <td>${statusBadge(r.status)}</td>
                            <td style="white-space:normal">
                                ${(r.items || []).map(i => `<span class="text-xs text-gray-600">${esc(i.batch_no)} 收${fmtNum(i.received_quantity)} / 验${fmtNum(i.accepted_quantity)} <span class="badge badge-${i.inspection_status === 'ACCEPTED' ? 'success' : i.inspection_status === 'REJECTED' ? 'danger' : 'warning'}">${esc(i.inspection_status)}</span></span><br>`).join('')}
                            </td>
                            <td class="actions">
                                ${(r.items || []).filter(i => i.inspection_status === 'PENDING' && !i.sampled_at).map(i => `<button class="btn btn-link btn-sm" onclick="PG('procurement').sampleItem(${r.id}, ${i.id})"><i class="fa fa-flask"></i> 抽样</button>`).join('')}
                                ${(r.items || []).filter(i => i.inspection_status === 'PENDING' && i.sampled_at).map(i => `<button class="btn btn-link btn-sm" onclick="PG('procurement').inspectItem(${r.id}, ${i.id})"><i class="fa fa-search"></i> 验收</button>`).join('')}
                                <button class="btn btn-link btn-sm" onclick="PG('procurement').printRecord(${r.id})"><i class="fa fa-print"></i> 受控打印</button>
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无收货记录</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
        box.querySelector('#rcNewBtn').addEventListener('click', () => openReceiptModal(approvedPOs));
    }

    function openReceiptModal(approvedPOs) {
        const modal = openModal({
            title: '按单收货（关联已批准采购订单）',
            size: 'lg',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">收货单号 *</label><input id="rcNo" class="input-field" placeholder="如 RC20260821001"></div>
                <div class="form-group"><label class="form-label">采购订单 *</label><select id="rcPO" class="input-field">${optionHTML(approvedPOs, 'id', o => o.order_no, '请选择已批准采购订单')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">送货单号 *</label><input id="rcDeliv" class="input-field"></div>
                <div class="form-group"><label class="form-label">到货时间 *</label><input type="datetime-local" id="rcArrived" class="input-field" value="${nowLocalISO()}"></div>
            </div>
            <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-sm">收货明细（按采购行登记批号）</span>
                <button type="button" class="btn btn-secondary btn-sm" id="rcAddItem"><i class="fa fa-plus"></i> 添加行</button>
            </div>
            <div id="rcItems"></div>
            <div class="form-group"><label class="form-label">收货原因 *（≥3字）</label><textarea id="rcReason" class="input-field" rows="2"></textarea></div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rcSubmitBtn">确认收货</button>`,
        });
        const itemsBox = modal.querySelector('#rcItems');
        const poSel = modal.querySelector('#rcPO');
        const refreshRows = () => {
            const po = approvedPOs.find(o => o.id === Number(poSel.value));
            itemsBox.innerHTML = '';
            if (!po) { itemsBox.innerHTML = '<div class="empty-state">请先选择采购订单</div>'; return; }
            po.items.forEach((it, idx) => {
                const row = document.createElement('div');
                row.className = 'card p-3 mb-2';
                row.innerHTML = `
                <div class="text-sm font-medium mb-2">${esc(goodsList.find(g => g.id === it.goods_id)?.name || it.goods_id)}（订单量 ${fmtNum(it.ordered_quantity)}${esc(it.unit)}）</div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">批号 *</label><input class="input-field rc-batch" placeholder="批号"></div>
                    <div class="form-group"><label class="form-label">生产日期 *</label><input type="date" class="input-field rc-prod"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">有效期 *</label><input type="date" class="input-field rc-exp"></div>
                    <div class="form-group"><label class="form-label">数量 *</label><input type="number" step="0.001" min="0.001" class="input-field rc-qty" value="${it.ordered_quantity}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">库位 *</label><select class="input-field rc-loc">${optionHTML(locations, 'id', l => `${l.location_code} - ${l.name || ''}`, '请选择库位')}</select></div>
                    <div class="form-group"><label class="form-label">检验报告编号</label><input class="input-field rc-insp" placeholder="可留空，验收前必填"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">追溯码</label><input class="input-field rc-trace"></div>
                    <div class="form-group"><label class="form-label">到货温度(℃)</label><input type="number" step="0.1" class="input-field rc-arrtemp"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">运输温度范围</label><div class="flex gap-1"><input type="number" step="0.1" class="input-field rc-tmin" placeholder="最低"><input type="number" step="0.1" class="input-field rc-tmax" placeholder="最高"></div></div>
                    <div class="form-group"><label class="form-label">温度记录引用</label><input class="input-field rc-tempref"></div>
                </div>`;
                itemsBox.appendChild(row);
            });
        };
        poSel.addEventListener('change', refreshRows);
        refreshRows();
        modal.querySelector('#rcSubmitBtn').addEventListener('click', async () => {
            const po = approvedPOs.find(o => o.id === Number(poSel.value));
            const items = (po ? po.items : []).map((it, i) => ({
                purchase_order_item_id: it.id,
                batch_no: itemsBox.querySelectorAll('.rc-batch')[i]?.value.trim(),
                production_date: itemsBox.querySelectorAll('.rc-prod')[i]?.value,
                expiry_date: itemsBox.querySelectorAll('.rc-exp')[i]?.value,
                quantity: Number(itemsBox.querySelectorAll('.rc-qty')[i]?.value),
                location_id: Number(itemsBox.querySelectorAll('.rc-loc')[i]?.value),
                inspection_report_no: itemsBox.querySelectorAll('.rc-insp')[i]?.value.trim() || null,
                traceability_code: itemsBox.querySelectorAll('.rc-trace')[i]?.value.trim() || null,
                arrival_temperature: itemsBox.querySelectorAll('.rc-arrtemp')[i]?.value === '' ? null : Number(itemsBox.querySelectorAll('.rc-arrtemp')[i]?.value),
                transport_temperature_min: itemsBox.querySelectorAll('.rc-tmin')[i]?.value === '' ? null : Number(itemsBox.querySelectorAll('.rc-tmin')[i]?.value),
                transport_temperature_max: itemsBox.querySelectorAll('.rc-tmax')[i]?.value === '' ? null : Number(itemsBox.querySelectorAll('.rc-tmax')[i]?.value),
                temperature_record_ref: itemsBox.querySelectorAll('.rc-tempref')[i]?.value.trim() || null,
            })).filter(it => it.batch_no && it.production_date && it.expiry_date && it.quantity > 0 && it.location_id);
            const body = {
                receipt_no: modal.querySelector('#rcNo').value.trim(),
                purchase_order_id: Number(poSel.value),
                delivery_document_no: modal.querySelector('#rcDeliv').value.trim(),
                arrived_at: modal.querySelector('#rcArrived').value,
                items,
                reason: modal.querySelector('#rcReason').value.trim(),
            };
            if (!body.receipt_no || !body.purchase_order_id || !body.delivery_document_no || !body.arrived_at || !items.length) { showToast('请完整填写收货信息（至少一行有效明细）', 'warning'); return; }
            if (body.reason.length < 3) { showToast('收货原因不能少于3个字', 'warning'); return; }
            try {
                await api('/gsp/receiving/receipts', { method: 'POST', body });
                closeModal(modal);
                showToast('收货成功，明细待抽样与独立验收', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function sampleItem(receiptId, itemId) {
        const modal = openModal({
            title: '登记抽样方案（验收前必须抽样）',
            size: 'md',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">抽样方案引用 *</label><input id="spPlan" class="input-field"></div>
                <div class="form-group"><label class="form-label">抽样方法 *</label><input id="spMethod" class="input-field" placeholder="如按批准方案随机抽样"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">抽样数量 *</label><input type="number" step="0.001" min="0.001" id="spQty" class="input-field"></div>
                <div class="form-group"><label class="form-label">抽样记录号 *</label><input id="spNo" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="spReason" class="input-field" rows="2"></textarea></div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="spSubmitBtn">保存</button>`,
        });
        modal.querySelector('#spSubmitBtn').addEventListener('click', async () => {
            const body = {
                sampling_plan_ref: modal.querySelector('#spPlan').value.trim(),
                sampling_method: modal.querySelector('#spMethod').value.trim(),
                sample_quantity: Number(modal.querySelector('#spQty').value),
                sampling_record_no: modal.querySelector('#spNo').value.trim(),
                reason: modal.querySelector('#spReason').value.trim(),
            };
            if (!body.sampling_plan_ref || !body.sampling_method || !body.sample_quantity || !body.sampling_record_no || body.reason.length < 3) { showToast('请完整填写抽样信息', 'warning'); return; }
            try {
                await api(`/gsp/receiving/receipts/${receiptId}/items/${itemId}/sample`, { method: 'POST', body });
                closeModal(modal);
                showToast('抽样方案已登记', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function inspectItem(receiptId, itemId) {
        const modal = openModal({
            title: '独立验收（需电子签名）',
            size: 'md',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">合格数量 *</label><input type="number" step="0.001" min="0" id="inAcc" class="input-field"></div>
                <div class="form-group"><label class="form-label">拒收数量 *</label><input type="number" step="0.001" min="0" id="inRej" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">验收结论 *（≥2字）</label><textarea id="inConc" class="input-field" rows="2" placeholder="如：包装完好、批号与检验报告一致，同意合格入库"></textarea></div>
            <div class="alert alert-info"><i class="fa fa-info-circle mr-2"></i>提交后将弹出电子签名确认（密码核验、写入签署审计链）</div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="inSubmitBtn">提交验收</button>`,
        });
        modal.querySelector('#inSubmitBtn').addEventListener('click', () => {
            const accepted = Number(modal.querySelector('#inAcc').value);
            const rejected = Number(modal.querySelector('#inRej').value);
            const conclusion = modal.querySelector('#inConc').value.trim();
            if (isNaN(accepted) || isNaN(rejected) || conclusion.length < 2) { showToast('请完整填写验收信息', 'warning'); return; }
            closeModal(modal);
            signAction(
                { action: 'RECEIPT_ITEM_INSPECT', entity_type: 'GspReceiptItem', entity_id: itemId, meaning: 'CONFIRMATION' },
                {
                    path: `/gsp/receiving/receipts/${receiptId}/items/${itemId}/inspect`,
                    opts: { method: 'POST', body: { accepted_quantity: accepted, rejected_quantity: rejected, conclusion, reason: conclusion } },
                    successMessage: rejected > 0 ? '验收已保存；拒收批次已自动建立质量锁定' : '验收已保存',
                },
                '独立验收收货明细'
            );
        });
    }

    function printRecord(receiptId) {
    const modal = openModal({
        title: '受控打印记录',
        size: 'md',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">模板版本 *</label><input id="prVer" class="input-field" value="v1.0"></div>
                <div class="form-group"><label class="form-label">份号 *</label><input id="prCopy" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">用途 *（≥3字）</label><textarea id="prPurpose" class="input-field" rows="2"></textarea></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="prReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="prSubmitBtn">登记</button>`,
    });
    modal.querySelector('#prSubmitBtn').addEventListener('click', async () => {
        const body = {
            template_version: modal.querySelector('#prVer').value.trim(),
            copy_no: modal.querySelector('#prCopy').value.trim(),
            purpose: modal.querySelector('#prPurpose').value.trim(),
            reason: modal.querySelector('#prReason').value.trim(),
        };
        if (!body.template_version || !body.copy_no || body.purpose.length < 3 || body.reason.length < 3) { showToast('请完整填写打印信息', 'warning'); return; }
        const printWindow = window.open('', '_blank', 'width=1000,height=800');
        if (!printWindow) {
            showToast('浏览器阻止了打印窗口，请允许本站弹出窗口后重试', 'warning');
            return;
        }
        printWindow.opener = null;
        printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>正在生成受控打印记录</title></head><body>正在生成受控打印记录…</body></html>');
        printWindow.document.close();
        try {
            const record = await api(`/gsp/receiving/receipts/${receiptId}/print-records`, { method: 'POST', body });
            renderControlledReceiptPrint(printWindow, record);
            closeModal(modal);
            showToast('受控副本已生成，正在打开打印对话框', 'success');
        } catch (e) {
            printWindow.close();
            showToast(e.message, 'error');
        }
    });
}

function renderControlledReceiptPrint(printWindow, record) {
    const receipt = record.snapshot_data;
    if (!receipt || !record.content_hash) {
        throw new ApiError('后端未返回不可变受控打印快照', 0, record);
    }
    const itemRows = (receipt.items || []).map(item => `
        <tr>
            <td>${esc(item.batch_no || item.batch_id || '-')}</td>
            <td>${fmtNum(item.received_quantity)}</td>
            <td>${fmtNum(item.accepted_quantity)}</td>
            <td>${fmtNum(item.rejected_quantity)}</td>
            <td>${esc(item.inspection_status || '-')}</td>
            <td>${esc(item.inspection_conclusion || '-')}</td>
        </tr>`).join('');
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <title>收货验收记录 - ${esc(receipt?.receipt_no || receipt?.id || '')}</title>
    <style>
        @page { size: A4; margin: 16mm; }
        body { color:#111827; font:14px/1.5 Arial,"Microsoft YaHei",sans-serif; }
        h1 { margin:0 0 4px; text-align:center; font-size:22px; }
        .subtitle { margin-bottom:20px; text-align:center; color:#4b5563; }
        .meta { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; margin-bottom:18px; }
        .meta div { border-bottom:1px solid #d1d5db; padding:5px 0; }
        table { width:100%; border-collapse:collapse; margin-top:12px; }
        th,td { border:1px solid #9ca3af; padding:7px; text-align:left; }
        th { background:#f3f4f6; }
        .control { margin-top:22px; border:2px solid #374151; padding:12px; }
        .footer { margin-top:22px; display:flex; justify-content:space-between; color:#4b5563; font-size:12px; }
    </style>
</head>
<body>
    <h1>药品收货验收记录</h1>
    <div class="subtitle">受控副本 · ${esc(record.copy_no)}</div>
    <div class="meta">
        <div>收货单号：${esc(receipt?.receipt_no || receipt?.id || '-')}</div>
        <div>采购订单：${esc(receipt.purchase_order_no || receipt.purchase_order_id || '-')}</div>
        <div>送货单号：${esc(receipt?.delivery_document_no || '-')}</div>
        <div>到货时间：${fmtDT(receipt?.arrived_at)}</div>
        <div>收货状态：${esc(receipt?.status || '-')}</div>
        <div>记录编号：${esc(record.id)}</div>
    </div>
    <table>
        <thead><tr><th>批号</th><th>收货数量</th><th>合格数量</th><th>拒收数量</th><th>验收状态</th><th>验收结论</th></tr></thead>
        <tbody>${itemRows || '<tr><td colspan="6">无收货明细</td></tr>'}</tbody>
    </table>
    <div class="control">
        <div>模板版本：${esc(record.template_version)}</div>
        <div>打印用途：${esc(record.purpose)}</div>
        <div>打印人员 ID：${esc(record.printed_by)}</div>
        <div>生成时间：${fmtDT(record.printed_at)}</div>
        <div>内容哈希：${esc(record.content_hash)}</div>
    </div>
    <div class="footer"><span>不可变受控副本 · 状态：${esc(record.status)}</span><span>份号：${esc(record.copy_no)}</span></div>
</body>
</html>`;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
}


    function cancelPO(id) {
        const modal = openModal({
            title: '取消采购订单（仅草稿可取消）',
            size: 'md',
            body: `
                <div class="form-group"><label class="form-label">取消原因 *（≥3字）</label><textarea id="poCancelReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-danger" id="poCancelOk">确认取消</button>`,
        });
        modal.querySelector('#poCancelOk').addEventListener('click', async () => {
            const reason = modal.querySelector('#poCancelReason').value.trim();
            if (reason.length < 3) { showToast('取消原因不能少于3个字', 'warning'); return; }
            try {
                await api(`/gsp/procurement/orders/${id}/cancel`, { method: 'POST', body: { reason } });
                closeModal(modal);
                showToast('采购订单已取消', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function rejectPO(id) {
        const modal = openModal({
            title: '质量驳回采购订单（需电子签名）',
            size: 'md',
            body: `
                <div class="form-group"><label class="form-label">驳回原因 *（≥3字）</label><textarea id="poRejectReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-danger" id="poRejectOk">驳回</button>`,
        });
        modal.querySelector('#poRejectOk').addEventListener('click', () => {
            const reason = modal.querySelector('#poRejectReason').value.trim();
            if (reason.length < 3) { showToast('驳回原因不能少于3个字', 'warning'); return; }
            closeModal(modal);
            signAction(
                { action: 'PURCHASE_ORDER_REJECT', entity_type: 'GspPurchaseOrder', entity_id: id, meaning: 'REJECTION' },
                { path: `/gsp/procurement/orders/${id}/reject`, opts: { method: 'POST', body: { reason } } },
                '驳回采购订单'
            );
        });
    }


    window.PAGES = window.PAGES || {};
    window.PAGES['procurement'] = {
        title: '采购与收货',
        icon: 'fa-arrow-down',
        desc: '采购收货、抽样、验收闭环',
        init: pageInit,
        fn: { submitPO, approvePO, cancelPO, rejectPO, sampleItem, inspectItem, printRecord },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 procurement.html
})();
