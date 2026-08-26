/* 批号库存盘点：盲盘计划（制定→提交→批准→实盘→差异复核→受控调整）
 * SPA 模块：window.PAGES['stocktaking'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '批号库存盘点';
    let _el = null;
    const content = () => _el;
let plans = [];
let batchStock = [];
let warehouses = [];

async function pageInit(el) { _el = el || document.getElementById('pageContent');
    await Promise.all([refWarehouses(), refBatchStock(true)]).then(([w, s]) => { warehouses = w; batchStock = s; }).catch(() => {});
    render();
    await load();
};

function render() {
    content().innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-list-alt mr-2" style="color:var(--primary)"></i>批号库存盲盘（实盘人员不可见账面数）</span>
                <button class="btn btn-primary" id="stNewBtn"><i class="fa fa-plus"></i> 新建盘点计划</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>计划号</th><th>仓库</th><th>范围</th><th>摘要</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody id="stBody"></tbody>
                </table>
            </div>
        </div>`;
    document.getElementById('stNewBtn').addEventListener('click', openPlanModal);
}

async function load() {
    try {
        plans = await api('/gsp/stocktaking/plans');
        renderTable();
    } catch (e) { showToast(e.message, 'error'); }
}

function renderTable() {
    const tbody = document.getElementById('stBody');
    tbody.innerHTML = plans.map(p => `
        <tr>
            <td class="font-medium">${esc(p.plan_no)}</td>
            <td>${esc(warehouses.find(w => w.id === p.warehouse_id)?.name || p.warehouse_id)}</td>
            <td>${badge({ FULL: '全盘', CYCLE: '循环', SAMPLE: '抽盘' }[p.scope_type] || p.scope_type, p.scope_type === 'FULL' ? 'danger' : 'info')}</td>
            <td style="white-space:normal;max-width:260px">${esc(p.scope_summary)}</td>
            <td>${statusBadge(p.status)}</td>
            <td class="actions">
                ${p.status === 'DRAFT' ? `<button class="btn btn-link btn-sm" onclick="PG('stocktaking').submitPlan(${p.id})"><i class="fa fa-paper-plane"></i> 提交</button>` : ''}
                ${p.status === 'SUBMITTED' ? `<button class="btn btn-link btn-sm" onclick="PG('stocktaking').approvePlan(${p.id})"><i class="fa fa-check"></i> 批准</button>` : ''}
                ${['APPROVED', 'REVIEWED'].includes(p.status) ? `<button class="btn btn-link btn-sm" onclick="PG('stocktaking').viewPlan(${p.id})"><i class="fa fa-eye"></i> 查看/实盘</button>` : ''}
                ${['APPROVED', 'REVIEWED'].includes(p.status) ? `<button class="btn btn-link btn-sm" onclick="PG('stocktaking').reviewPlan(${p.id})"><i class="fa fa-balance-scale"></i> 差异复核</button>` : ''}
                ${p.status === 'REVIEWED' ? `<button class="btn btn-link btn-sm" onclick="PG('stocktaking').applyAdjust(${p.id})"><i class="fa fa-wrench"></i> 执行调整</button>` : ''}
            </td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">暂无盘点计划</div></td></tr>';
}

function openPlanModal() {
    const modal = openModal({
        title: '新建批号盘点计划',
        size: 'lg',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">计划号 *</label><input id="stNo" class="input-field" placeholder="如 ST20260821001"></div>
                <div class="form-group"><label class="form-label">仓库 *</label><select id="stWh" class="input-field">${optionHTML(warehouses, 'id', 'name', '请选择仓库')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">盘点范围 *</label>
                    <select id="stScope" class="input-field"><option value="FULL">全盘（FULL）</option><option value="CYCLE">循环盘点（CYCLE）</option><option value="SAMPLE">抽盘（SAMPLE）</option></select>
                </div>
            </div>
            <div class="form-group"><label class="form-label">范围摘要 *（≥10字）</label><textarea id="stSummary" class="input-field" rows="2"></textarea></div>
            <div class="form-group">
                <label class="form-label">纳入盘点的批号库存 *（多选）</label>
                <div class="max-h-64 overflow-y-auto border rounded p-2">
                    ${batchStock.map(s => `<label class="checkbox-label mb-1"><input type="checkbox" class="checkbox st-stock" value="${s.id}"> ${esc(s.batch_no)} - ${esc(s.goods_name)}（${esc(s.location_code)}，账面 ${fmtNum(s.quantity)}）</label>`).join('') || '<div class="empty-state">暂无批号库存</div>'}
                </div>
            </div>
            <div class="form-group"><label class="form-label">制单原因 *（≥3字）</label><textarea id="stReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="stSubmitBtn">保存</button>`,
    });
    modal.querySelector('#stSubmitBtn').addEventListener('click', async () => {
        const body = {
            plan_no: modal.querySelector('#stNo').value.trim(),
            warehouse_id: Number(modal.querySelector('#stWh').value),
            scope_type: modal.querySelector('#stScope').value,
            scope_summary: modal.querySelector('#stSummary').value.trim(),
            stock_ids: [...modal.querySelectorAll('.st-stock:checked')].map(x => Number(x.value)),
            reason: modal.querySelector('#stReason').value.trim(),
        };
        if (!body.plan_no || !body.warehouse_id || body.scope_summary.length < 10 || !body.stock_ids.length) { showToast('请完整填写盘点计划', 'warning'); return; }
        if (body.reason.length < 3) { showToast('制单原因不能少于3个字', 'warning'); return; }
        try {
            await api('/gsp/stocktaking/plans', { method: 'POST', body });
            closeModal(modal);
            showToast('盘点计划已创建（草稿）', 'success');
            await load();
        } catch (e) { showToast(e.message, 'error'); }
    });
}

function submitPlan(id) {
    confirmModal('提交盘点计划进行质量批准？', async () => {
        try {
            await api(`/gsp/stocktaking/plans/${id}/submit`, { method: 'POST', body: { reason: '提交盘点计划进入质量批准' } });
            showToast('已提交', 'success'); await load();
        } catch (e) { showToast(e.message, 'error'); }
    }, '提交');
}
function approvePlan(id) {
    signAction(
        { action: 'STOCKTAKE_PLAN_APPROVE', entity_type: 'GspStocktakePlan', entity_id: id, meaning: 'APPROVAL' },
        { path: `/gsp/stocktaking/plans/${id}/approve`, opts: { method: 'POST', body: { reason: '' } } },
        '批准盘点计划'
    );
}
function viewPlan(planId) {
    const p = plans.find(x => x.id === planId);
    const modal = openModal({
        title: `盘点明细 - ${p ? p.plan_no : planId}`,
        size: 'lg',
        body: `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>行</th><th>库位</th><th>批次</th><th>账面数量</th><th>预留</th><th>实盘数量</th><th>差异</th><th>差异原因</th><th>轮次</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${(p.items || []).map(i => `
                        <tr>
                            <td>${i.line_no}</td>
                            <td>${esc(batchStock.find(s => s.id === i.stock_id)?.location_code || i.location_id)}</td>
                            <td>批次#${i.batch_id}</td>
                            <td>${i.book_quantity === null ? '<span class="text-gray-400">盲盘隐藏</span>' : fmtNum(i.book_quantity)}</td>
                            <td>${fmtNum(i.book_reserved_quantity)}</td>
                            <td>${i.counted_quantity === null ? '-' : fmtNum(i.counted_quantity)}</td>
                            <td>${i.difference_quantity === null ? '-' : fmtNum(i.difference_quantity)}</td>
                            <td style="white-space:normal;max-width:180px">${esc(i.discrepancy_reason || '-')}</td>
                            <td>${i.count_round}</td>
                            <td>${statusBadge(i.status)}</td>
                            <td class="actions">
                                ${['APPROVED', 'REVIEWED'].includes(p.status) && i.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="PG('stocktaking').countItem(${planId}, ${i.id}, ${i.count_round})"><i class="fa fa-pencil"></i> 实盘</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="11"><div class="empty-state">无明细</div></td></tr>'}</tbody>
                </table>
            </div>`,
    });
}
function countItem(planId, itemId, round) {
    const modal = openModal({
        title: `实盘录入（第${round || 1}轮，账面数量对盘点人员隐藏）`,
        size: 'md',
        body: `
            <div class="form-group"><label class="form-label">实盘数量 *</label><input type="number" step="0.001" min="0" id="ctQty" class="input-field"></div>
            <div class="form-group"><label class="form-label">差异原因（有差异必填，≥3字）</label><textarea id="ctReason" class="input-field" rows="2"></textarea></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="ctNote" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="ctSubmitBtn">保存实盘</button>`,
    });
    modal.querySelector('#ctSubmitBtn').addEventListener('click', async () => {
        const counted = Number(modal.querySelector('#ctQty').value);
        const discrepancy_reason = modal.querySelector('#ctReason').value.trim() || null;
        const note = modal.querySelector('#ctNote').value.trim();
        if (isNaN(counted) || counted < 0 || note.length < 3) { showToast('请填写实盘数量与原因', 'warning'); return; }
        try {
            await api(`/gsp/stocktaking/plans/${planId}/items/${itemId}/count`, { method: 'POST', body: { counted_quantity: counted, discrepancy_reason, reason: note } });
            closeModal(modal);
            showToast('实盘已保存', 'success');
            await load();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function reviewPlan(id) {
    const modal = openModal({
        title: '盘点差异质量复核',
        size: 'md',
        body: `
            <div class="form-group"><label class="form-label">决策 *</label>
                <select id="rvDecision" class="input-field"><option value="APPROVE">批准调整</option><option value="RECOUNT">要求复盘</option></select>
            </div>
            <div class="form-group"><label class="form-label">复核结论 *（≥10字）</label><textarea id="rvConc" class="input-field" rows="3"></textarea></div>
            <div class="alert alert-info"><i class="fa fa-info-circle mr-2"></i>实盘、差异批准与调整执行必须由不同人员承担；将弹出电子签名确认</div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rvSubmitBtn">提交复核</button>`,
    });
    modal.querySelector('#rvSubmitBtn').addEventListener('click', () => {
        const decision = modal.querySelector('#rvDecision').value;
        const conclusion = modal.querySelector('#rvConc').value.trim();
        if (conclusion.length < 10) { showToast('复核结论不能少于10个字', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'STOCKTAKE_RESULTS_REVIEW', entity_type: 'GspStocktakePlan', entity_id: id, meaning: 'REVIEW' },
            { path: `/gsp/stocktaking/plans/${id}/review`, opts: { method: 'POST', body: { decision, conclusion, reason: conclusion } } },
            '盘点差异复核'
        );
    });
}
function applyAdjust(id) {
    confirmModal('执行库存调整？系统将核对并发版本并原子调整账面数量，需电子签名。', async () => {
        signAction(
            { action: 'STOCKTAKE_ADJUSTMENTS_APPLY', entity_type: 'GspStocktakePlan', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/stocktaking/plans/${id}/apply-adjustments`, opts: { method: 'POST', body: { reason: '' } } },
            '执行盘点库存调整'
        );
    }, '继续');
}


    window.PAGES = window.PAGES || {};
    window.PAGES['stocktaking'] = {
        title: '批号库存盘点',
        icon: 'fa-list-alt',
        desc: '批号库存盘点与差异处理',
        init: pageInit,
        fn: { submitPlan, approvePlan, countItem, reviewPlan, viewPlan, applyAdjust },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 stocktaking.html
})();
