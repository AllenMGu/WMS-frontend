/* 不合格品与购进退出：登记→独立处置批准→监督销毁/退供→购进退出闭环
 * SPA 模块：window.PAGES['disposition'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '不合格品处置';
    let _el = null;
    const content = () => _el;
    let tab = 'nc';
let records = [];
let returns = [];
let batchStock = [];
let users = [];

async function pageInit(el) { _el = el || document.getElementById('pageContent');
    await Promise.all([refBatchStock(true), refUsers()]).then(([s, u]) => { batchStock = s; users = u; }).catch(() => {});
    render();
    await loadTab();
};

function render() {
    content().innerHTML = `
        <div class="tabs">
            <div class="tab ${tab === 'nc' ? 'active' : ''}" data-tab="nc"><i class="fa fa-exclamation-triangle mr-1"></i>不合格品记录</div>
            <div class="tab ${tab === 'pr' ? 'active' : ''}" data-tab="pr"><i class="fa fa-reply mr-1"></i>购进退出</div>
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
        if (tab === 'nc') { records = await api('/gsp/quality/nonconforming'); await renderNC(box); }
        else { returns = await api('/gsp/procurement/returns'); await renderReturns(box); }
    } catch (e) { box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`; }
}

/* ---------------- 不合格品 ---------------- */
async function renderNC(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-exclamation-triangle mr-2" style="color:var(--red-500)"></i>不合格品登记与处置</span>
                <button class="btn btn-primary" id="ncNewBtn"><i class="fa fa-plus"></i> 登记不合格品</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>记录号</th><th>来源</th><th>批次</th><th>仓库</th><th>数量</th><th>原因代码</th><th>建议处置</th><th>批准处置</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${records.map(r => `
                        <tr>
                            <td class="font-medium">${esc(r.record_no)}</td>
                            <td>${esc(r.source_type)}</td>
                            <td>批次#${r.batch_id}</td>
                            <td>${r.warehouse_id}</td>
                            <td>${fmtNum(r.quantity)}</td>
                            <td>${esc(r.reason_code)}</td>
                            <td>${esc(r.proposed_disposition || '-')}</td>
                            <td>${esc(r.approved_disposition || '-')}</td>
                            <td>${statusBadge(r.status)}</td>
                            <td class="actions">
                                ${r.status === 'PENDING_APPROVAL' ? `<button class="btn btn-link btn-sm" onclick="PG('disposition').approveNC(${r.id})"><i class="fa fa-gavel"></i> 批准处置</button>` : ''}
                                ${r.status === 'APPROVED' && r.approved_disposition === 'DESTROY' ? `<button class="btn btn-link btn-sm" onclick="PG('disposition').destroyNC(${r.id})"><i class="fa fa-fire"></i> 监督销毁</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="10"><div class="empty-state">暂无不合格品记录</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#ncNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '登记不合格品（自动锁定批次）',
            size: 'md',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">记录号 *</label><input id="ncNo" class="input-field" placeholder="如 NC20260821001"></div>
                    <div class="form-group"><label class="form-label">来源批号库存 *</label><select id="ncStock" class="input-field">${optionHTML(batchStock, 'id', s => `${s.batch_no} - ${s.goods_name}（${esc(s.location_code)}，${fmtNum(s.quantity)}）`, '请选择库存')}</select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">数量 *</label><input type="number" step="0.001" min="0.001" id="ncQty" class="input-field"></div>
                    <div class="form-group"><label class="form-label">原因代码 *</label>
                        <select id="ncCode" class="input-field"><option value="QUALITY_FAIL">QUALITY_FAIL 质量不合格</option><option value="DAMAGE">DAMAGE 破损</option><option value="EXPIRED">EXPIRED 过期</option><option value="LABEL_ERROR">LABEL_ERROR 标签不符</option><option value="OTHER">OTHER 其他</option></select>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">情况描述 *（≥3字）</label><textarea id="ncDesc" class="input-field" rows="2"></textarea></div>
                <div class="form-group"><label class="form-label">建议处置方向</label>
                    <select id="ncDisp" class="input-field"><option value="DESTROY">监督销毁</option><option value="RETURN_SUPPLIER">退回供货方</option><option value="">暂不指定</option></select>
                </div>
                <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="ncReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="ncSubmitBtn">登记</button>`,
        });
        modal.querySelector('#ncSubmitBtn').addEventListener('click', async () => {
            const body = {
                record_no: modal.querySelector('#ncNo').value.trim(),
                stock_id: Number(modal.querySelector('#ncStock').value),
                quantity: Number(modal.querySelector('#ncQty').value),
                reason_code: modal.querySelector('#ncCode').value,
                description: modal.querySelector('#ncDesc').value.trim(),
                proposed_disposition: modal.querySelector('#ncDisp').value || null,
                reason: modal.querySelector('#ncReason').value.trim(),
            };
            if (!body.record_no || !body.stock_id || !body.quantity || body.description.length < 3 || body.reason.length < 3) { showToast('请完整填写登记信息', 'warning'); return; }
            try {
                await api('/gsp/quality/nonconforming', { method: 'POST', body });
                closeModal(modal);
                showToast('不合格品已登记，批次已质量锁定', 'warning');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}

function approveNC(id) {
    const modal = openModal({
        title: '独立处置批准',
        size: 'md',
        body: `
            <div class="form-group"><label class="form-label">最终处置 *</label>
                <select id="ndDisp" class="input-field"><option value="DESTROY">监督销毁</option><option value="RETURN_SUPPLIER">退回供货方</option></select>
            </div>
            <div class="alert alert-info"><i class="fa fa-info-circle mr-2"></i>登记人与批准人必须分离；将弹出电子签名确认</div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="ndSubmitBtn">批准</button>`,
    });
    modal.querySelector('#ndSubmitBtn').addEventListener('click', () => {
        const disposition = modal.querySelector('#ndDisp').value;
        closeModal(modal);
        signAction(
            { action: 'NONCONFORMING_DISPOSITION_APPROVE', entity_type: 'GspNonconformingRecord', entity_id: id, meaning: 'APPROVAL' },
            { path: `/gsp/quality/nonconforming/${id}/approve`, opts: { method: 'POST', body: { disposition, reason: `批准最终处置：${disposition}` } } },
            '批准不合格品处置'
        );
    });
}
function destroyNC(id) {
    const modal = openModal({
        title: '监督销毁（独立执行人 + 独立见证人）',
        size: 'md',
        body: `
            <div class="form-group"><label class="form-label">独立见证人 *（需与执行人不同）</label><select id="dwWitness" class="input-field">${optionHTML(users, 'id', u => u.full_name || u.username, '请选择见证人')}</select></div>
            <div class="form-group"><label class="form-label">监督机构 *</label><input id="dwOrg" class="input-field"></div>
            <div class="form-group"><label class="form-label">销毁证明引用 *</label><input id="dwRef" class="input-field"></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="dwReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="dwSubmitBtn">执行销毁</button>`,
    });
    modal.querySelector('#dwSubmitBtn').addEventListener('click', () => {
        const body = {
            witnessed_by: Number(modal.querySelector('#dwWitness').value),
            supervision_organization: modal.querySelector('#dwOrg').value.trim(),
            execution_document_ref: modal.querySelector('#dwRef').value.trim(),
            reason: modal.querySelector('#dwReason').value.trim(),
        };
        if (!body.witnessed_by || !body.supervision_organization || !body.execution_document_ref || body.reason.length < 3) { showToast('请完整填写销毁信息', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'NONCONFORMING_DESTROY', entity_type: 'GspNonconformingRecord', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/quality/nonconforming/${id}/destroy`, opts: { method: 'POST', body } },
            '执行监督销毁'
        );
    });
}

/* ---------------- 购进退出 ---------------- */
async function renderReturns(box) {
    const approvable = records.filter(r => r.status === 'APPROVED' && r.approved_disposition === 'RETURN_SUPPLIER');
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-reply mr-2" style="color:var(--primary)"></i>购进退出（关联已批准退供的不合格品）</span>
                <button class="btn btn-primary" id="prNewBtn"><i class="fa fa-plus"></i> 新建购进退出</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>退出单号</th><th>供货方</th><th>仓库</th><th>状态</th><th>出库单号</th><th>承运方</th><th class="actions">操作</th></tr></thead>
                    <tbody>${returns.map(r => `
                        <tr>
                            <td class="font-medium">${esc(r.return_no)}</td>
                            <td>${r.supplier_id}</td>
                            <td>${r.warehouse_id}</td>
                            <td>${statusBadge(r.status)}</td>
                            <td>${esc(r.outbound_document_no || '-')}</td>
                            <td>${esc(r.carrier_name || '-')}</td>
                            <td class="actions">
                                ${r.status === 'DRAFT' ? `<button class="btn btn-link btn-sm" onclick="PG('disposition').submitPR(${r.id})"><i class="fa fa-paper-plane"></i> 提交</button>` : ''}
                                ${r.status === 'SUBMITTED' ? `<button class="btn btn-link btn-sm" onclick="PG('disposition').approvePR(${r.id})"><i class="fa fa-check"></i> 批准</button>` : ''}
                                ${r.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" onclick="PG('disposition').dispatchPR(${r.id})"><i class="fa fa-truck"></i> 退供发运</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无购进退出</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#prNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '新建购进退出单',
            size: 'md',
            body: `
                <div class="form-group"><label class="form-label">退出单号 *</label><input id="prNo" class="input-field" placeholder="如 PR20260821001"></div>
                <div class="form-group"><label class="form-label">关联不合格品记录 *（已批准退供）</label><div class="max-h-64 overflow-y-auto border rounded p-2">${approvable.map(r => `<label class="checkbox-label mb-1"><input type="checkbox" class="checkbox pr-nc" value="${r.id}"> ${esc(r.record_no)} - 批次#${r.batch_id} × ${fmtNum(r.quantity)}</label>`).join('') || '<div class="empty-state">暂无已批准退供的不合格品</div>'}</div></div>
                <div class="form-group"><label class="form-label">制单原因 *（≥3字）</label><textarea id="prReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="prSubmitBtn">保存</button>`,
        });
        modal.querySelector('#prSubmitBtn').addEventListener('click', async () => {
            const body = {
                return_no: modal.querySelector('#prNo').value.trim(),
                nonconforming_record_ids: [...modal.querySelectorAll('.pr-nc:checked')].map(x => Number(x.value)),
                reason: modal.querySelector('#prReason').value.trim(),
            };
            if (!body.return_no || !body.nonconforming_record_ids.length || body.reason.length < 3) { showToast('请完整填写退出单', 'warning'); return; }
            try {
                await api('/gsp/procurement/returns', { method: 'POST', body });
                closeModal(modal);
                showToast('购进退出单已创建', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}
function submitPR(id) {
    confirmModal('提交购进退出单进行质量批准？', async () => {
        try {
            await api(`/gsp/procurement/returns/${id}/submit`, { method: 'POST', body: { reason: '提交购进退出单进入质量批准' } });
            showToast('已提交', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    }, '提交');
}
function approvePR(id) {
    signAction(
        { action: 'PURCHASE_RETURN_APPROVE', entity_type: 'GspPurchaseReturn', entity_id: id, meaning: 'APPROVAL' },
        { path: `/gsp/procurement/returns/${id}/approve`, opts: { method: 'POST', body: { reason: '' } } },
        '批准购进退出'
    );
}
function dispatchPR(id) {
    const modal = openModal({
        title: '退供发运',
        size: 'md',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">出库单号 *</label><input id="pdNo" class="input-field"></div>
                <div class="form-group"><label class="form-label">承运方名称 *</label><input id="pdCarrier" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="pdReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="pdSubmitBtn">发运</button>`,
    });
    modal.querySelector('#pdSubmitBtn').addEventListener('click', () => {
        const body = {
            outbound_document_no: modal.querySelector('#pdNo').value.trim(),
            carrier_name: modal.querySelector('#pdCarrier').value.trim(),
            reason: modal.querySelector('#pdReason').value.trim(),
        };
        if (!body.outbound_document_no || !body.carrier_name || body.reason.length < 3) { showToast('请完整填写发运信息', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'PURCHASE_RETURN_DISPATCH', entity_type: 'GspPurchaseReturn', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/procurement/returns/${id}/dispatch`, opts: { method: 'POST', body } },
            '购进退出发运'
        );
    });
}

    window.PAGES = window.PAGES || {};
    window.PAGES['disposition'] = {
        title: '不合格品处置',
        icon: 'fa-exclamation-triangle',
        desc: '不合格品登记、批准与处置',
        init: pageInit,
        fn: { approveNC, destroyNC, submitPR, approvePR, dispatchPR },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 disposition.html
})();
