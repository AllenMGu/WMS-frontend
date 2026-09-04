/* 召回与演练：批次召回（启动→通知→进展→关闭→完成报告）、召回演练（启动→目标核验→完成）
 * SPA 模块：window.PAGES['recalls'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '召回与演练';
    let _el = null;
    const content = () => _el;
    let tab = 'recalls';
let recalls = [];
let drills = [];
let batches = [];

async function pageInit(el) { _el = el || document.getElementById('pageContent');
    try { batches = await refBatches(true); } catch (e) { batches = []; }
    render();
    await loadTab();
};

function render() {
    content().innerHTML = `
        <div class="tabs">
            <div class="tab ${tab === 'recalls' ? 'active' : ''}" data-tab="recalls"><i class="fa fa-bullhorn mr-1"></i>药品召回</div>
            <div class="tab ${tab === 'drills' ? 'active' : ''}" data-tab="drills"><i class="fa fa-flask mr-1"></i>召回演练</div>
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
        if (tab === 'recalls') { recalls = await apiAll('/gsp/recalls'); await renderRecalls(box); }
        else { drills = await apiAll('/gsp/recall-drills'); await renderDrills(box); }
    } catch (e) { box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`; }
}

/* ---------------- 召回 ---------------- */
async function renderRecalls(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-bullhorn mr-2" style="color:var(--primary)"></i>药品批次召回</span>
                <button class="btn btn-primary" id="rcNewBtn"><i class="fa fa-plus"></i> 新建召回</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>召回编号</th><th>级别</th><th>来源</th><th>状态</th><th>通知期限</th><th>下次进展报告</th><th>批次</th><th>目标数</th><th class="actions">操作</th></tr></thead>
                    <tbody>${recalls.map(r => `
                        <tr>
                            <td class="font-medium">${esc(r.recall_no)}</td>
                            <td>${badge(r.recall_level, { '1': 'danger', '2': 'warning', '3': 'info' }[r.recall_level] || 'gray')}</td>
                            <td>${esc(r.source)}</td>
                            <td>${statusBadge(r.status)}</td>
                            <td>${fmtDT(r.notification_due_at)}</td>
                            <td>${fmtDT(r.next_progress_report_due_at)}</td>
                            <td style="white-space:normal">${(r.batches || []).map(b => `<span class="text-xs text-gray-600">批次#${b.batch_id}（收${fmtNum(b.target_shipped_quantity)}/回${fmtNum(b.recovered_quantity)}）</span><br>`).join('')}</td>
                            <td>${(r.targets || []).length}</td>
                            <td class="actions">
                                ${r.status === 'DRAFT' ? `<button class="btn btn-link btn-sm" onclick="PG('recalls').activateRecall(${r.id})"><i class="fa fa-play"></i> 启动</button>` : ''}
                                ${['DRAFT', 'ACTIVE'].includes(r.status) ? `<button class="btn btn-link btn-sm" onclick="PG('recalls').progressRecall(${r.id})"><i class="fa fa-file-text-o"></i> 进展报告</button>` : ''}
                                ${r.status === 'ACTIVE' ? `<button class="btn btn-link btn-sm" onclick="PG('recalls').viewRecall(${r.id})"><i class="fa fa-bell"></i> 通知目标</button><button class="btn btn-link btn-sm" onclick="PG('recalls').closeRecall(${r.id})"><i class="fa fa-check"></i> 关闭</button>` : ''}
                                ${r.status === 'CLOSED' && !r.completion_report ? `<button class="btn btn-link btn-sm" onclick="PG('recalls').completionReport(${r.id})"><i class="fa fa-file-text"></i> 完成报告</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="10"><div class="empty-state">暂无召回记录</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#rcNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '新建批次召回（制单/审批分离）',
            size: 'md',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">召回编号 *</label><input id="rcNo" class="input-field" placeholder="如 RC20260821001"></div>
                    <div class="form-group"><label class="form-label">召回级别 *</label>
                        <select id="rcLevel" class="input-field"><option value="1">一级（1日通知）</option><option value="2">二级（3日通知）</option><option value="3">三级（7日通知）</option></select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">来源 *</label>
                        <select id="rcSource" class="input-field"><option value="REGULATORY">监管要求</option><option value="QUALITY">企业质量决定</option><option value="INCIDENT">不良反应事件</option><option value="OTHER">其他</option></select>
                    </div>
                    <div class="form-group"><label class="form-label">监管引用</label><input id="rcReg" class="input-field"></div>
                </div>
                <div class="form-group"><label class="form-label">涉及批次 *（多选）</label><div id="rcBatches" class="max-h-64 overflow-y-auto border rounded p-2">${batches.map(b => `<label class="checkbox-label mb-1"><input type="checkbox" class="checkbox rc-batch" value="${b.id}"> ${esc(b.batch_no)} - ${esc(b.goods_name)}</label>`).join('') || '<div class="empty-state">暂无批次</div>'}</div></div>
                <div class="form-group"><label class="form-label">制单原因 *（≥3字）</label><textarea id="rcReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rcSubmitBtn">保存</button>`,
        });
        modal.querySelector('#rcSubmitBtn').addEventListener('click', async () => {
            const body = {
                recall_no: modal.querySelector('#rcNo').value.trim(),
                recall_level: modal.querySelector('#rcLevel').value,
                source: modal.querySelector('#rcSource').value,
                regulatory_ref: modal.querySelector('#rcReg').value.trim() || null,
                batch_ids: [...modal.querySelectorAll('.rc-batch:checked')].map(x => Number(x.value)),
                reason: modal.querySelector('#rcReason').value.trim(),
            };
            if (!body.recall_no || !body.batch_ids.length || body.reason.length < 3) { showToast('请完整填写召回信息', 'warning'); return; }
            try {
                await api('/gsp/recalls', { method: 'POST', body });
                closeModal(modal);
                showToast('召回已创建（草稿），可启动执行', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}

function activateRecall(id) {
    signAction(
        { action: 'RECALL_ACTIVATE', entity_type: 'GspRecall', entity_id: id, meaning: 'RESPONSIBILITY' },
        { path: `/gsp/recalls/${id}/activate`, opts: { method: 'POST', body: { reason: '' } } },
        '启动召回'
    );
}
function progressRecall(id) {
    const modal = openModal({
        title: '提交召回进展报告',
        size: 'md',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">报告引用 *</label><input id="prRef" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">进展摘要 *（≥3字）</label><textarea id="prSummary" class="input-field" rows="3"></textarea></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="prReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="prSubmitBtn">提交</button>`,
    });
    modal.querySelector('#prSubmitBtn').addEventListener('click', async () => {
        const body = {
            report_ref: modal.querySelector('#prRef').value.trim(),
            summary: modal.querySelector('#prSummary').value.trim(),
            reason: modal.querySelector('#prReason').value.trim(),
        };
        if (!body.report_ref || body.summary.length < 3 || body.reason.length < 3) { showToast('请完整填写进展报告', 'warning'); return; }
        try {
            await api(`/gsp/recalls/${id}/progress`, { method: 'POST', body });
            closeModal(modal);
            showToast('进展报告已提交', 'success');
            await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function viewRecall(id) {
    const r = recalls.find(x => x.id === id);
    const modal = openModal({
        title: `召回通知与回收 - ${r ? r.recall_no : id}`,
        size: 'lg',
        body: `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>目标ID</th><th>发运单</th><th>购货方</th><th>发运数量</th><th>回收数量</th><th>通知状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${(r.targets || []).map(t => `
                        <tr>
                            <td>${t.id}</td>
                            <td>${t.shipment_id}</td>
                            <td>${t.customer_id}</td>
                            <td>${fmtNum(t.shipped_quantity)}</td>
                            <td>${fmtNum(t.recovered_quantity)}</td>
                            <td>${statusBadge(t.notification_status)}</td>
                            <td class="actions">
                                <button class="btn btn-link btn-sm" onclick="PG('recalls').notifyTarget(${id}, ${t.id})"><i class="fa fa-bell"></i> 记录通知</button>
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无目标，启动召回后自动识别受影响发运批次</div></td></tr>'}</tbody>
                </table>
            </div>`,
    });
}
function notifyTarget(recallId, targetId) {
    const modal = openModal({
        title: '记录购货方通知与回收核对',
        size: 'md',
        body: `
            <div class="form-group"><label class="form-label">通知状态 *</label>
                <select id="ntStatus" class="input-field"><option value="NOTIFIED">已通知</option><option value="PARTIAL">部分通知</option><option value="FAILED">通知失败</option><option value="CONFIRMED">已确认</option></select>
            </div>
            <div class="form-group"><label class="form-label">备注 *（≥3字）</label><textarea id="ntNotes" class="input-field" rows="2"></textarea></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="ntReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="ntSubmitBtn">保存</button>`,
    });
    modal.querySelector('#ntSubmitBtn').addEventListener('click', async () => {
        const body = {
            notification_status: modal.querySelector('#ntStatus').value,
            notes: modal.querySelector('#ntNotes').value.trim(),
            reason: modal.querySelector('#ntReason').value.trim(),
        };
        if (body.notes.length < 3 || body.reason.length < 3) { showToast('备注与原因不能少于3个字', 'warning'); return; }
        try {
            await api(`/gsp/recalls/${recallId}/targets/${targetId}/notify`, { method: 'POST', body });
            closeModal(modal);
            showToast('通知记录已保存', 'success');
            await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function closeRecall(id) {
    const modal = openModal({
        title: '关闭召回（独立复核）',
        size: 'md',
        body: `
            <div class="form-group"><label class="form-label">关闭结论 *（≥3字）</label><textarea id="clConc" class="input-field" rows="3"></textarea></div>
            <div class="alert alert-info"><i class="fa fa-info-circle mr-2"></i>关闭后质量锁定不会自动解除；将弹出电子签名确认</div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="clSubmitBtn">关闭</button>`,
    });
    modal.querySelector('#clSubmitBtn').addEventListener('click', () => {
        const conclusion = modal.querySelector('#clConc').value.trim();
        if (conclusion.length < 3) { showToast('关闭结论不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'RECALL_CLOSE', entity_type: 'GspRecall', entity_id: id, meaning: 'REVIEW' },
            { path: `/gsp/recalls/${id}/close`, opts: { method: 'POST', body: { conclusion, reason: conclusion } } },
            '关闭召回'
        );
    });
}
function completionReport(id) {
    const modal = openModal({
        title: '召回完成报告（10个工作日内）',
        size: 'lg',
        body: `
            <div class="form-group"><label class="form-label">报告引用 *</label><input id="crRef" class="input-field"></div>
            <div class="form-group"><label class="form-label">处理总结 *（≥10字）</label><textarea id="crSum" class="input-field" rows="3"></textarea></div>
            <div class="form-group"><label class="form-label">有效性评价 *（≥10字）</label><textarea id="crEval" class="input-field" rows="3"></textarea></div>
            <div class="form-group"><label class="form-label">监管报送引用 *</label><input id="crReg" class="input-field"></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="crReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="crSubmitBtn">提交</button>`,
    });
    modal.querySelector('#crSubmitBtn').addEventListener('click', async () => {
        const body = {
            report_ref: modal.querySelector('#crRef').value.trim(),
            treatment_summary: modal.querySelector('#crSum').value.trim(),
            effectiveness_evaluation: modal.querySelector('#crEval').value.trim(),
            regulatory_submission_ref: modal.querySelector('#crReg').value.trim(),
            reason: modal.querySelector('#crReason').value.trim(),
        };
        if (!body.report_ref || body.treatment_summary.length < 10 || body.effectiveness_evaluation.length < 10 || !body.regulatory_submission_ref || body.reason.length < 3) { showToast('请完整填写完成报告', 'warning'); return; }
        signAction(
            {
                action: 'RECALL_COMPLETION_REPORT',
                entity_type: 'GspRecall',
                entity_id: id,
                meaning: 'RESPONSIBILITY',
            },
            {
                path: `/gsp/recalls/${id}/completion-report`,
                opts: { method: 'POST', body },
                onSuccess: async () => {
                    closeModal(modal);
                    await loadTab();
                },
            },
            '提交召回完成报告'
        );
    });
}

/* ---------------- 召回演练 ---------------- */
async function renderDrills(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-flask mr-2" style="color:var(--primary)"></i>召回演练（真实发运链路追溯，不锁库存不实际通知）</span>
                <button class="btn btn-primary" id="drNewBtn"><i class="fa fa-plus"></i> 新建演练</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>演练编号</th><th>级别</th><th>场景</th><th>时限(分钟)</th><th>状态</th><th>目标数</th><th>结果</th><th class="actions">操作</th></tr></thead>
                    <tbody>${drills.map(d => `
                        <tr>
                            <td class="font-medium">${esc(d.drill_no)}</td>
                            <td>${badge(d.recall_level, { '1': 'danger', '2': 'warning', '3': 'info' }[d.recall_level] || 'gray')}</td>
                            <td style="white-space:normal;max-width:220px">${esc(d.scenario)}</td>
                            <td>${d.max_allowed_minutes}</td>
                            <td>${statusBadge(d.status)}</td>
                            <td>${(d.targets || []).length}</td>
                            <td>${d.result ? badge(d.result, d.result === 'PASS' ? 'success' : 'danger') : '-'}</td>
                            <td class="actions">
                                ${d.status === 'DRAFT' ? `<button class="btn btn-link btn-sm" onclick="PG('recalls').activateDrill(${d.id})"><i class="fa fa-play"></i> 启动</button>` : ''}
                                ${d.status === 'ACTIVATED' ? `<button class="btn btn-link btn-sm" onclick="PG('recalls').viewDrill(${d.id})"><i class="fa fa-search"></i> 核验目标</button><button class="btn btn-link btn-sm" onclick="PG('recalls').completeDrill(${d.id})"><i class="fa fa-check"></i> 完成</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无召回演练</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#drNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '新建召回演练',
            size: 'lg',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">演练编号 *</label><input id="drNo" class="input-field" placeholder="如 DR20260821001"></div>
                    <div class="form-group"><label class="form-label">召回级别 *</label>
                        <select id="drLevel" class="input-field"><option value="1">一级</option><option value="2">二级</option><option value="3">三级</option></select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">时限（分钟）*</label><input type="number" id="drMax" class="input-field" value="120"></div>
                </div>
                <div class="form-group"><label class="form-label">场景 *（≥10字）</label><textarea id="drScenario" class="input-field" rows="2"></textarea></div>
                <div class="form-group"><label class="form-label">目标 *（≥10字）</label><textarea id="drObjective" class="input-field" rows="2"></textarea></div>
                <div class="form-group"><label class="form-label">涉及批次 *</label><div class="max-h-64 overflow-y-auto border rounded p-2">${batches.map(b => `<label class="checkbox-label mb-1"><input type="checkbox" class="checkbox dr-batch" value="${b.id}"> ${esc(b.batch_no)} - ${esc(b.goods_name)}</label>`).join('') || '<div class="empty-state">暂无批次</div>'}</div></div>
                <div class="form-group"><label class="form-label">制单原因 *（≥3字）</label><textarea id="drReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="drSubmitBtn">保存</button>`,
        });
        modal.querySelector('#drSubmitBtn').addEventListener('click', async () => {
            const body = {
                drill_no: modal.querySelector('#drNo').value.trim(),
                recall_level: modal.querySelector('#drLevel').value,
                scenario: modal.querySelector('#drScenario').value.trim(),
                objective: modal.querySelector('#drObjective').value.trim(),
                max_allowed_minutes: Number(modal.querySelector('#drMax').value),
                batch_ids: [...modal.querySelectorAll('.dr-batch:checked')].map(x => Number(x.value)),
                reason: modal.querySelector('#drReason').value.trim(),
            };
            if (!body.drill_no || body.scenario.length < 10 || body.objective.length < 10 || !body.batch_ids.length || body.reason.length < 3) { showToast('请完整填写演练信息', 'warning'); return; }
            try {
                await api('/gsp/recall-drills', { method: 'POST', body });
                closeModal(modal);
                showToast('演练已创建（草稿）', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}

function activateDrill(id) {
    confirmModal('启动召回演练计时？', async () => {
        try {
            await api(`/gsp/recall-drills/${id}/activate`, { method: 'POST', body: { reason: '启动召回演练' } });
            showToast('演练已启动', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    }, '启动');
}
function viewDrill(id) {
    const d = drills.find(x => x.id === id);
    const modal = openModal({
        title: `演练目标核验 - ${d ? d.drill_no : id}`,
        size: 'lg',
        body: `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>目标ID</th><th>发运单</th><th>购货方</th><th>发运数量</th><th>核验状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${(d.targets || []).map(t => `
                        <tr>
                            <td>${t.id}</td>
                            <td>${t.shipment_id}</td>
                            <td>${t.customer_id}</td>
                            <td>${fmtNum(t.shipped_quantity)}</td>
                            <td>${statusBadge(t.verification_status)}</td>
                            <td class="actions">
                                <button class="btn btn-link btn-sm" onclick="PG('recalls').verifyDrillTarget(${id}, ${t.id})"><i class="fa fa-check-circle"></i> 核验</button>
                            </td>
                        </tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">暂无目标</div></td></tr>'}</tbody>
                </table>
            </div>`,
    });
}
function verifyDrillTarget(drillId, targetId) {
    const modal = openModal({
        title: '核验演练目标',
        size: 'md',
        body: `
            <div class="form-group"><label class="form-label">核验状态 *</label>
                <select id="dvStatus" class="input-field"><option value="LOCATED">已定位</option><option value="NOT_LOCATED">未定位</option><option value="PARTIAL">部分定位</option></select>
            </div>
            <div class="form-group"><label class="form-label">备注 *（≥3字）</label><textarea id="dvNotes" class="input-field" rows="2"></textarea></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="dvReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="dvSubmitBtn">保存</button>`,
    });
    modal.querySelector('#dvSubmitBtn').addEventListener('click', async () => {
        const body = {
            verification_status: modal.querySelector('#dvStatus').value,
            notes: modal.querySelector('#dvNotes').value.trim(),
            reason: modal.querySelector('#dvReason').value.trim(),
        };
        if (body.notes.length < 3 || body.reason.length < 3) { showToast('备注与原因不能少于3个字', 'warning'); return; }
        try {
            await api(`/gsp/recall-drills/${drillId}/targets/${targetId}/verify`, { method: 'POST', body });
            closeModal(modal);
            showToast('核验已保存', 'success');
            await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function completeDrill(id) {
    const modal = openModal({
        title: '完成召回演练（需电子签名）',
        size: 'lg',
        body: `
            <div class="form-group"><label class="form-label">完成总结 *（≥10字）</label><textarea id="dcSum" class="input-field" rows="3"></textarea></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">偏差说明</label><textarea id="dcDev" class="input-field" rows="2"></textarea></div>
                <div class="form-group"><label class="form-label">CAPA引用</label><input id="dcCapa" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="dcReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="dcSubmitBtn">完成</button>`,
    });
    modal.querySelector('#dcSubmitBtn').addEventListener('click', () => {
        const completion_summary = modal.querySelector('#dcSum').value.trim();
        const deviation_notes = modal.querySelector('#dcDev').value.trim() || null;
        const capa_ref = modal.querySelector('#dcCapa').value.trim() || null;
        const reason = modal.querySelector('#dcReason').value.trim();
        if (completion_summary.length < 10 || reason.length < 3) { showToast('请完整填写完成信息', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'RECALL_DRILL_COMPLETE', entity_type: 'GspRecallDrill', entity_id: id, meaning: 'REVIEW' },
            { path: `/gsp/recall-drills/${id}/complete`, opts: { method: 'POST', body: { completion_summary, deviation_notes, capa_ref, reason } } },
            '完成召回演练'
        );
    });
}

    window.PAGES = window.PAGES || {};
    window.PAGES['recalls'] = {
        title: '召回与演练',
        icon: 'fa-bullhorn',
        desc: '召回执行、进度与演练',
        init: pageInit,
        fn: { activateRecall, activateDrill, notifyTarget, progressRecall, closeRecall, completionReport, viewRecall, viewDrill, verifyDrillTarget, completeDrill },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 recalls.html
})();
