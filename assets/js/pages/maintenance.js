/* 药品养护：养护计划（制定→提交→质量批准→逐项检查→完成复核）
 * SPA 模块：window.PAGES['maintenance'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '药品养护';
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
                <span class="card-title"><i class="fa fa-stethoscope mr-2" style="color:var(--primary)"></i>药品养护计划（SOP周期驱动，异常自动锁定）</span>
                <button class="btn btn-primary" id="mpNewBtn"><i class="fa fa-plus"></i> 新建养护计划</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>计划号</th><th>仓库</th><th>类型</th><th>计划周期</th><th>范围摘要</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody id="mpBody"></tbody>
                </table>
            </div>
        </div>`;
    document.getElementById('mpNewBtn').addEventListener('click', openPlanModal);
}

async function load() {
    try {
        plans = await apiAll('/gsp/maintenance/plans');
        renderTable();
    } catch (e) { showToast(e.message, 'error'); }
}

function renderTable() {
    const tbody = document.getElementById('mpBody');
    tbody.innerHTML = plans.map(p => `
        <tr>
            <td class="font-medium">${esc(p.plan_no)}</td>
            <td>${esc(warehouses.find(w => w.id === p.warehouse_id)?.name || p.warehouse_id)}</td>
            <td>${badge(p.plan_type === 'ROUTINE' ? '常规养护' : '重点品种', p.plan_type === 'ROUTINE' ? 'info' : 'warning')}</td>
            <td>${fmtD(p.scheduled_from)} ~ ${fmtD(p.scheduled_to)}</td>
            <td style="white-space:normal;max-width:260px">${esc(p.scope_summary)}</td>
            <td>${statusBadge(p.status)}</td>
            <td class="actions">
                ${p.status === 'DRAFT' ? `<button class="btn btn-link btn-sm" onclick="PG('maintenance').submitPlan(${p.id})"><i class="fa fa-paper-plane"></i> 提交</button>` : ''}
                ${p.status === 'SUBMITTED' ? `<button class="btn btn-link btn-sm" onclick="PG('maintenance').approvePlan(${p.id})"><i class="fa fa-check"></i> 批准</button>` : ''}
                ${p.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" onclick="PG('maintenance').viewItems(${p.id})"><i class="fa fa-search"></i> 检查</button>` : ''}
                ${p.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" onclick="PG('maintenance').completePlan(${p.id})"><i class="fa fa-flag-checkered"></i> 完成</button>` : ''}
            </td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无养护计划</div></td></tr>';
}

function openPlanModal() {
    const modal = openModal({
        title: '新建养护计划',
        size: 'lg',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">计划号 *</label><input id="mpNo" class="input-field" placeholder="如 MP20260821001"></div>
                <div class="form-group"><label class="form-label">仓库 *</label><select id="mpWh" class="input-field">${optionHTML(warehouses, 'id', 'name', '请选择仓库')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">计划类型 *</label>
                    <select id="mpType" class="input-field"><option value="ROUTINE">常规养护（ROUTINE）</option><option value="KEY">重点品种（KEY）</option></select>
                </div>
                <div class="form-group"><label class="form-label">计划周期 *</label>
                    <div class="flex gap-1"><input type="date" id="mpFrom" class="input-field"><input type="date" id="mpTo" class="input-field"></div>
                </div>
            </div>
            <div class="form-group"><label class="form-label">范围摘要 *（≥10字）</label><textarea id="mpScope" class="input-field" rows="2"></textarea></div>
            <div class="form-group">
                <label class="form-label">纳入养护的批号库存 *（多选）</label>
                <div class="max-h-64 overflow-y-auto border rounded p-2">
                    ${batchStock.map(s => `<label class="checkbox-label mb-1"><input type="checkbox" class="checkbox mp-stock" value="${s.id}"> ${esc(s.batch_no)} - ${esc(s.goods_name)}（${esc(s.location_code)}，${fmtNum(s.quantity)}）</label>`).join('') || '<div class="empty-state">暂无批号库存</div>'}
                </div>
            </div>
            <div class="form-group"><label class="form-label">制单原因 *（≥3字）</label><textarea id="mpReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="mpSubmitBtn">保存</button>`,
    });
    modal.querySelector('#mpSubmitBtn').addEventListener('click', async () => {
        const items = [...modal.querySelectorAll('.mp-stock:checked')].map(x => ({ stock_id: Number(x.value) }));
        const body = {
            plan_no: modal.querySelector('#mpNo').value.trim(),
            warehouse_id: Number(modal.querySelector('#mpWh').value),
            plan_type: modal.querySelector('#mpType').value,
            scheduled_from: modal.querySelector('#mpFrom').value,
            scheduled_to: modal.querySelector('#mpTo').value,
            scope_summary: modal.querySelector('#mpScope').value.trim(),
            items,
            reason: modal.querySelector('#mpReason').value.trim(),
        };
        if (!body.plan_no || !body.warehouse_id || !body.scheduled_from || !body.scheduled_to || body.scope_summary.length < 10 || !items.length) { showToast('请完整填写养护计划', 'warning'); return; }
        if (body.reason.length < 3) { showToast('制单原因不能少于3个字', 'warning'); return; }
        try {
            await api('/gsp/maintenance/plans', { method: 'POST', body });
            closeModal(modal);
            showToast('养护计划已创建（草稿）', 'success');
            await load();
        } catch (e) { showToast(e.message, 'error'); }
    });
}

function submitPlan(id) {
    confirmModal('提交养护计划进行质量审批？', async () => {
        try {
            await api(`/gsp/maintenance/plans/${id}/submit`, { method: 'POST', body: { reason: '提交养护计划进入质量审批' } });
            showToast('已提交', 'success'); await load();
        } catch (e) { showToast(e.message, 'error'); }
    }, '提交');
}
function approvePlan(id) {
    signAction(
        { action: 'MAINTENANCE_PLAN_APPROVE', entity_type: 'GspMaintenancePlan', entity_id: id, meaning: 'APPROVAL' },
        { path: `/gsp/maintenance/plans/${id}/approve`, opts: { method: 'POST', body: { reason: '' } } },
        '批准养护计划'
    );
}
function viewItems(planId) {
    const p = plans.find(x => x.id === planId);
    const modal = openModal({
        title: `养护检查 - ${p ? p.plan_no : planId}`,
        size: 'lg',
        body: `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>行</th><th>批号库存ID</th><th>批次</th><th>计划数量</th><th>状态</th><th>下次养护</th><th class="actions">操作</th></tr></thead>
                    <tbody>${(p.items || []).map(i => `
                        <tr>
                            <td>${i.line_no}</td>
                            <td>${i.stock_id}</td>
                            <td>批次#${i.batch_id}</td>
                            <td>${fmtNum(i.planned_quantity)}</td>
                            <td>${statusBadge(i.status)}</td>
                            <td>${fmtD(i.next_due_on)}</td>
                            <td class="actions">
                                ${['PENDING', 'DRAFT'].includes(i.status) ? `<button class="btn btn-link btn-sm" onclick="PG('maintenance').inspectItem(${planId}, ${i.id})"><i class="fa fa-stethoscope"></i> 检查</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">无明细</div></td></tr>'}</tbody>
                </table>
            </div>`,
    });
}
function inspectItem(planId, itemId) {
    const modal = openModal({
        title: '养护检查（外观/包装/储存/温湿度）',
        size: 'lg',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">检查结果 *</label>
                    <select id="miResult" class="input-field"><option value="NORMAL">正常</option><option value="ABNORMAL">异常</option></select>
                </div>
                <div class="form-group"><label class="form-label">下次养护日期 *</label><input type="date" id="miNext" class="input-field"></div>
            </div>
            <div class="form-row">
                <label class="checkbox-label"><input type="checkbox" id="miApp" class="checkbox" checked> 外观完好</label>
                <label class="checkbox-label"><input type="checkbox" id="miPkg" class="checkbox" checked> 包装完好</label>
                <label class="checkbox-label"><input type="checkbox" id="miSto" class="checkbox" checked> 储存条件符合</label>
                <label class="checkbox-label"><input type="checkbox" id="miTemp" class="checkbox" checked> 温湿度符合</label>
            </div>
            <div class="form-group"><label class="form-label">检查发现 *（≥3字）</label><textarea id="miFinding" class="input-field" rows="2"></textarea></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="miReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="miSubmitBtn">保存检查</button>`,
    });
    modal.querySelector('#miSubmitBtn').addEventListener('click', async () => {
        const result = modal.querySelector('#miResult').value;
        const body = {
            result,
            appearance_ok: modal.querySelector('#miApp').checked,
            package_ok: modal.querySelector('#miPkg').checked,
            storage_condition_ok: modal.querySelector('#miSto').checked,
            temperature_humidity_ok: modal.querySelector('#miTemp').checked,
            finding: modal.querySelector('#miFinding').value.trim(),
            next_due_on: modal.querySelector('#miNext').value,
            reason: modal.querySelector('#miReason').value.trim(),
        };
        if (body.finding.length < 3 || !body.next_due_on || body.reason.length < 3) { showToast('请完整填写检查信息', 'warning'); return; }
        try {
            await api(`/gsp/maintenance/plans/${planId}/items/${itemId}/inspect`, { method: 'POST', body });
            closeModal(modal);
            showToast(result === 'ABNORMAL' ? '检查异常：批次已自动锁定，等待质量复核' : '检查已保存', result === 'ABNORMAL' ? 'warning' : 'success');
            await load();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function completePlan(id) {
    const modal = openModal({
        title: '完成养护计划（独立质量复核）',
        size: 'md',
        body: `
            <div class="form-group"><label class="form-label">完成结论 *（≥10字）</label><textarea id="mcConc" class="input-field" rows="3"></textarea></div>
            <div class="alert alert-info"><i class="fa fa-info-circle mr-2"></i>需检查人之外的质量人员复核，将弹出电子签名确认</div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="mcSubmitBtn">完成</button>`,
    });
    modal.querySelector('#mcSubmitBtn').addEventListener('click', () => {
        const conclusion = modal.querySelector('#mcConc').value.trim();
        if (conclusion.length < 10) { showToast('完成结论不能少于10个字', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'MAINTENANCE_PLAN_COMPLETE', entity_type: 'GspMaintenancePlan', entity_id: id, meaning: 'REVIEW' },
            { path: `/gsp/maintenance/plans/${id}/complete`, opts: { method: 'POST', body: { conclusion, reason: conclusion } } },
            '完成养护计划'
        );
    });
}


    window.PAGES = window.PAGES || {};
    window.PAGES['maintenance'] = {
        title: '药品养护',
        icon: 'fa-stethoscope',
        desc: '药品养护计划与执行',
        init: pageInit,
        fn: { submitPlan, approvePlan, viewItems, inspectItem, completePlan },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 maintenance.html
})();
