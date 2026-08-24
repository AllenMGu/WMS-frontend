/* 运输与签收：承运方（资质/车辆/驾驶员）、运输任务（事件/异常/签收/关闭） */
'use strict';
window.PAGE_TITLE = '运输与签收';
const content = () => document.getElementById('pageContent');
let tab = 'carriers';
let carriers = [];
let tasks = [];

window.pageInit = async function () {
    render();
    await loadTab();
};

function render() {
    content().innerHTML = `
        <div class="tabs">
            <div class="tab ${tab === 'carriers' ? 'active' : ''}" data-tab="carriers"><i class="fa fa-building mr-1"></i>承运方管理</div>
            <div class="tab ${tab === 'tasks' ? 'active' : ''}" data-tab="tasks"><i class="fa fa-truck mr-1"></i>运输任务</div>
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
        if (tab === 'carriers') { carriers = await api('/gsp/transport/carriers'); await renderCarriers(box); }
        else { tasks = await api('/gsp/transport/tasks'); await renderTasks(box); }
    } catch (e) { box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`; }
}

/* ---------------- 承运方 ---------------- */
async function renderCarriers(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-building mr-2" style="color:var(--primary)"></i>承运方资质台账</span>
                <button class="btn btn-primary" id="cvNewBtn"><i class="fa fa-plus"></i> 新建承运方</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>编码</th><th>名称</th><th>信用代码</th><th>许可证有效期</th><th>服务模式</th><th>质量协议至</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${carriers.map(c => `
                        <tr>
                            <td class="font-medium">${esc(c.code)}</td>
                            <td>${esc(c.name)}</td>
                            <td>${esc(c.unified_social_credit_code)}</td>
                            <td>${fmtD(c.license_valid_to)}</td>
                            <td>${(c.service_modes || []).map(m => badge({ NORMAL: '常温', COLD: '冷藏', FROZEN: '冷冻' }[m] || m, m === 'NORMAL' ? 'info' : 'warning')).join(' ')}</td>
                            <td>${fmtD(c.quality_agreement_valid_to)}</td>
                            <td>${statusBadge(c.status)}</td>
                            <td class="actions">
                                <button class="btn btn-link btn-sm" onclick="viewCarrier(${c.id})"><i class="fa fa-folder-open-o"></i> 详情</button>
                                ${c.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="decideCarrier(${c.id})"><i class="fa fa-gavel"></i> 审批</button>` : ''}
                                ${c.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="suspendCarrier(${c.id})"><i class="fa fa-pause"></i> 暂停</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无承运方</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#cvNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '新建承运方',
            size: 'md',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">编码 *</label><input id="cvCode" class="input-field"></div>
                    <div class="form-group"><label class="form-label">名称 *</label><input id="cvName" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">统一社会信用代码 *</label><input id="cvCredit" class="input-field"></div>
                    <div class="form-group"><label class="form-label">许可证号 *</label><input id="cvLic" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">许可证有效期至 *</label><input type="date" id="cvLicTo" class="input-field"></div>
                    <div class="form-group"><label class="form-label">质量协议有效期至 *</label><input type="date" id="cvAgree" class="input-field"></div>
                </div>
                <div class="form-group"><label class="form-label">服务模式 *（可多选）</label>
                    <div class="flex gap-3"><label class="checkbox-label"><input type="checkbox" class="checkbox cv-mode" value="NORMAL" checked> 常温</label><label class="checkbox-label"><input type="checkbox" class="checkbox cv-mode" value="COLD"> 冷藏</label><label class="checkbox-label"><input type="checkbox" class="checkbox cv-mode" value="FROZEN"> 冷冻</label></div>
                </div>
                <div class="form-group"><label class="form-label">建档原因 *（≥3字）</label><textarea id="cvReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="cvSubmitBtn">保存</button>`,
        });
        modal.querySelector('#cvSubmitBtn').addEventListener('click', async () => {
            const body = {
                code: modal.querySelector('#cvCode').value.trim(),
                name: modal.querySelector('#cvName').value.trim(),
                unified_social_credit_code: modal.querySelector('#cvCredit').value.trim(),
                license_no: modal.querySelector('#cvLic').value.trim(),
                license_valid_to: modal.querySelector('#cvLicTo').value,
                service_modes: [...modal.querySelectorAll('.cv-mode:checked')].map(x => x.value),
                quality_agreement_valid_to: modal.querySelector('#cvAgree').value,
                reason: modal.querySelector('#cvReason').value.trim(),
            };
            if (!body.code || !body.name || !body.unified_social_credit_code || !body.license_no || !body.license_valid_to || !body.service_modes.length || !body.quality_agreement_valid_to) { showToast('请完整填写承运方信息', 'warning'); return; }
            if (body.reason.length < 3) { showToast('建档原因不能少于3个字', 'warning'); return; }
            try {
                await api('/gsp/transport/carriers', { method: 'POST', body });
                closeModal(modal);
                showToast('承运方已建档，待审批', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}
function decideCarrier(id) {
    const modal = openModal({
        title: '承运方审批',
        size: 'sm',
        body: `
            <div class="form-group"><label class="form-label">决策 *</label>
                <select id="cdDecision" class="input-field"><option value="APPROVE">批准</option><option value="REJECT">拒绝</option></select>
            </div>
            <div class="form-group"><label class="form-label">审批原因 *（≥3字）</label><textarea id="cdReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="cdSubmitBtn">提交</button>`,
    });
    modal.querySelector('#cdSubmitBtn').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#cdDecision').value, reason: modal.querySelector('#cdReason').value.trim() };
        if (body.reason.length < 3) { showToast('审批原因不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'CARRIER_DECISION', entity_type: 'GspCarrier', entity_id: id, meaning: 'APPROVAL' },
            { path: `/gsp/transport/carriers/${id}/decision`, opts: { method: 'POST', body } },
            '承运方审批'
        );
    });
}
function suspendCarrier(id) {
    const modal = openModal({
        title: '暂停承运方',
        size: 'sm',
        body: `<div class="form-group"><label class="form-label">暂停原因 *（≥3字）</label><textarea id="csReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="csSubmitBtn">暂停</button>`,
    });
    modal.querySelector('#csSubmitBtn').addEventListener('click', async () => {
        const reason = modal.querySelector('#csReason').value.trim();
        if (reason.length < 3) { showToast('暂停原因不能少于3个字', 'warning'); return; }
        try {
            await api(`/gsp/transport/carriers/${id}/suspend`, { method: 'POST', body: { reason } });
            closeModal(modal);
            showToast('承运方已暂停', 'success');
            await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
async function viewCarrier(id) {
    const c = carriers.find(x => x.id === id);
    let docs = [], vehicles = [], drivers = [];
    try { [docs, vehicles, drivers] = await Promise.all([
        api(`/gsp/transport/carriers/${id}/documents`),
        api(`/gsp/transport/carriers/${id}/vehicles`),
        api(`/gsp/transport/carriers/${id}/drivers`),
    ]); } catch (e) { /* ignore */ }
    const modal = openModal({
        title: `承运方详情 - ${c ? c.name : id}`,
        size: 'lg',
        body: `
            <div class="flex gap-2 mb-3">
                <button class="btn btn-secondary btn-sm" id="vDocBtn"><i class="fa fa-file-text-o"></i> 资质文件</button>
                <button class="btn btn-secondary btn-sm" id="vVehBtn"><i class="fa fa-car"></i> 车辆</button>
                <button class="btn btn-secondary btn-sm" id="vDrvBtn"><i class="fa fa-user"></i> 驾驶员</button>
            </div>
            <div id="vPanel"></div>`,
    });
    const panel = modal.querySelector('#vPanel');
    const renderDocs = () => {
        panel.innerHTML = `
            <div class="flex items-center justify-between mb-2"><span class="font-semibold text-sm">资质文件</span>
            <button class="btn btn-primary btn-sm" id="vAddDoc"><i class="fa fa-plus"></i> 新增</button></div>
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>类型</th><th>编号</th><th>有效期</th><th>状态</th><th class="actions">操作</th></tr></thead>
                <tbody>${docs.map(d => `<tr><td>${docTypeLabel(d.document_type)}</td><td>${esc(d.document_no)}</td><td>${fmtD(d.valid_to)}</td><td>${statusBadge(d.status)}</td><td class="actions">${d.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="decideDoc(${id}, ${d.id})"><i class="fa fa-gavel"></i> 审批</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">无文件</div></td></tr>'}</tbody></table></div>`;
        panel.querySelector('#vAddDoc').addEventListener('click', () => {
            const m2 = openModal({
                title: '新增承运方资质文件', size: 'md',
                body: `
                    <div class="form-row"><div class="form-group"><label class="form-label">类型 *</label><select id="ddType" class="input-field"><option value="TRANSPORT_LICENSE">运输许可证</option><option value="ROAD_TRANSPORT_CERT">道路运输证</option><option value="QUALITY_AGREEMENT">质量协议</option><option value="OTHER">其他</option></select></div><div class="form-group"><label class="form-label">编号 *</label><input id="ddNo" class="input-field"></div></div>
                    <div class="form-row"><div class="form-group"><label class="form-label">有效期至 *</label><input type="date" id="ddTo" class="input-field"></div><div class="form-group"><label class="form-label">文件引用 *</label><input id="ddRef" class="input-field"></div></div>
                    <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="ddReason" class="input-field" rows="2"></textarea></div>`,
                footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="ddSubmit">保存</button>`,
            });
            m2.querySelector('#ddSubmit').addEventListener('click', async () => {
                const body = {
                    document_type: m2.querySelector('#ddType').value,
                    document_no: m2.querySelector('#ddNo').value.trim(),
                    valid_to: m2.querySelector('#ddTo').value,
                    file_ref: m2.querySelector('#ddRef').value.trim(),
                    reason: m2.querySelector('#ddReason').value.trim(),
                };
                if (!body.document_no || !body.valid_to || !body.file_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
                try {
                    await api(`/gsp/transport/carriers/${id}/documents`, { method: 'POST', body });
                    closeModal(m2); closeModal(modal); showToast('已新增', 'success'); await viewCarrier(id);
                } catch (e) { showToast(e.message, 'error'); }
            });
        });
    };
    const renderVehicles = () => {
        panel.innerHTML = `
            <div class="flex items-center justify-between mb-2"><span class="font-semibold text-sm">车辆</span>
            <button class="btn btn-primary btn-sm" id="vAddVeh"><i class="fa fa-plus"></i> 新增</button></div>
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>车牌</th><th>类型</th><th>资质引用</th><th>资质有效期</th><th>状态</th><th class="actions">操作</th></tr></thead>
                <tbody>${vehicles.map(v => `<tr><td>${esc(v.vehicle_no)}</td><td>${esc(v.vehicle_type)}</td><td>${esc(v.qualification_ref)}</td><td>${fmtD(v.qualification_valid_to)}</td><td>${statusBadge(v.status)}</td><td class="actions">${v.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="decideVehicle(${v.id})"><i class="fa fa-gavel"></i> 审批</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">无车辆</div></td></tr>'}</tbody></table></div>`;
        panel.querySelector('#vAddVeh').addEventListener('click', () => {
            const m2 = openModal({
                title: '新增车辆', size: 'md',
                body: `
                    <div class="form-row"><div class="form-group"><label class="form-label">车牌号 *</label><input id="veNo" class="input-field"></div><div class="form-group"><label class="form-label">类型 *</label><select id="veType" class="input-field"><option value="NORMAL">常温</option><option value="REFRIGERATED">冷藏</option><option value="FROZEN">冷冻</option></select></div></div>
                    <div class="form-row"><div class="form-group"><label class="form-label">资质引用 *</label><input id="veRef" class="input-field"></div><div class="form-group"><label class="form-label">资质有效期 *</label><input type="date" id="veTo" class="input-field"></div></div>
                    <div class="form-row"><div class="form-group"><label class="form-label">校准引用</label><input id="veCal" class="input-field"></div><div class="form-group"><label class="form-label">校准有效期</label><input type="date" id="veCalTo" class="input-field"></div></div>
                    <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="veReason" class="input-field" rows="2"></textarea></div>`,
                footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="veSubmit">保存</button>`,
            });
            m2.querySelector('#veSubmit').addEventListener('click', async () => {
                const body = {
                    vehicle_no: m2.querySelector('#veNo').value.trim(),
                    vehicle_type: m2.querySelector('#veType').value,
                    qualification_ref: m2.querySelector('#veRef').value.trim(),
                    qualification_valid_to: m2.querySelector('#veTo').value,
                    calibration_ref: m2.querySelector('#veCal').value.trim() || null,
                    calibration_valid_to: m2.querySelector('#veCalTo').value || null,
                    reason: m2.querySelector('#veReason').value.trim(),
                };
                if (!body.vehicle_no || !body.qualification_ref || !body.qualification_valid_to || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
                try {
                    await api(`/gsp/transport/carriers/${id}/vehicles`, { method: 'POST', body });
                    closeModal(m2); closeModal(modal); showToast('已新增', 'success'); await viewCarrier(id);
                } catch (e) { showToast(e.message, 'error'); }
            });
        });
    };
    const renderDrivers = () => {
        panel.innerHTML = `
            <div class="flex items-center justify-between mb-2"><span class="font-semibold text-sm">驾驶员</span>
            <button class="btn btn-primary btn-sm" id="vAddDrv"><i class="fa fa-plus"></i> 新增</button></div>
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>姓名</th><th>人员编码</th><th>资质引用</th><th>授权有效期</th><th>状态</th><th class="actions">操作</th></tr></thead>
                <tbody>${drivers.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.personnel_code)}</td><td>${esc(d.qualification_ref)}</td><td>${fmtD(d.authorization_valid_to)}</td><td>${statusBadge(d.status)}</td><td class="actions">${d.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="decideDriver(${d.id})"><i class="fa fa-gavel"></i> 审批</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">无驾驶员</div></td></tr>'}</tbody></table></div>`;
        panel.querySelector('#vAddDrv').addEventListener('click', () => {
            const m2 = openModal({
                title: '新增驾驶员', size: 'md',
                body: `
                    <div class="form-row"><div class="form-group"><label class="form-label">姓名 *</label><input id="drName" class="input-field"></div><div class="form-group"><label class="form-label">人员编码 *</label><input id="drCode" class="input-field"></div></div>
                    <div class="form-row"><div class="form-group"><label class="form-label">资质引用 *</label><input id="drRef" class="input-field"></div><div class="form-group"><label class="form-label">授权有效期 *</label><input type="date" id="drTo" class="input-field"></div></div>
                    <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="drReason" class="input-field" rows="2"></textarea></div>`,
                footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="drSubmit">保存</button>`,
            });
            m2.querySelector('#drSubmit').addEventListener('click', async () => {
                const body = {
                    name: m2.querySelector('#drName').value.trim(),
                    personnel_code: m2.querySelector('#drCode').value.trim(),
                    qualification_ref: m2.querySelector('#drRef').value.trim(),
                    authorization_valid_to: m2.querySelector('#drTo').value,
                    reason: m2.querySelector('#drReason').value.trim(),
                };
                if (!body.name || !body.personnel_code || !body.qualification_ref || !body.authorization_valid_to || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
                try {
                    await api(`/gsp/transport/carriers/${id}/drivers`, { method: 'POST', body });
                    closeModal(m2); closeModal(modal); showToast('已新增', 'success'); await viewCarrier(id);
                } catch (e) { showToast(e.message, 'error'); }
            });
        });
    };
    modal.querySelector('#vDocBtn').addEventListener('click', renderDocs);
    modal.querySelector('#vVehBtn').addEventListener('click', renderVehicles);
    modal.querySelector('#vDrvBtn').addEventListener('click', renderDrivers);
    renderDocs();
}
function decideDoc(carrierId, docId) {
    decisionModal('CARRIER_DOCUMENT_DECISION', 'GspCarrierDocument', docId, `/gsp/transport/documents/${docId}/decision`, '资质文件审批');
}
function decideVehicle(vehicleId) {
    decisionModal('CARRIER_VEHICLE_DECISION', 'GspCarrierVehicle', vehicleId, `/gsp/transport/vehicles/${vehicleId}/decision`, '车辆审批');
}
function decideDriver(driverId) {
    decisionModal('CARRIER_DRIVER_DECISION', 'GspCarrierDriver', driverId, `/gsp/transport/drivers/${driverId}/decision`, '驾驶员审批');
}
function decisionModal(action, entityType, entityId, path, title) {
    const modal = openModal({
        title, size: 'sm',
        body: `
            <div class="form-group"><label class="form-label">决策 *</label>
                <select id="dmDecision" class="input-field"><option value="APPROVE">批准</option><option value="REJECT">拒绝</option></select></div>
            <div class="form-group"><label class="form-label">审批原因 *（≥3字）</label><textarea id="dmReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="dmSubmit">提交</button>`,
    });
    modal.querySelector('#dmSubmit').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#dmDecision').value, reason: modal.querySelector('#dmReason').value.trim() };
        if (body.reason.length < 3) { showToast('审批原因不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction({ action, entity_type: entityType, entity_id: entityId, meaning: 'APPROVAL' }, { path, opts: { method: 'POST', body } }, title);
    });
}

/* ---------------- 运输任务 ---------------- */
async function renderTasks(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-truck mr-2" style="color:var(--primary)"></i>运输任务（在途事件 / 异常 / 签收 / 关闭）</span>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>任务号</th><th>发运单</th><th>承运方</th><th>车牌</th><th>模式</th><th>预计到达</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${tasks.map(t => `
                        <tr>
                            <td class="font-medium">${esc(t.task_no)}</td>
                            <td>${t.shipment_id}</td>
                            <td>${esc(carriers.find(c => c.id === t.carrier_id)?.name || t.carrier_id)}</td>
                            <td>${t.vehicle_id}</td>
                            <td>${badge({ NORMAL: '常温', COLD: '冷藏', FROZEN: '冷冻' }[t.transport_mode] || t.transport_mode, t.transport_mode === 'NORMAL' ? 'info' : 'warning')}</td>
                            <td>${fmtDT(t.expected_arrival_at)}</td>
                            <td>${statusBadge(t.status)}</td>
                            <td class="actions">
                                <button class="btn btn-link btn-sm" onclick="viewTask(${t.id})"><i class="fa fa-eye"></i> 详情</button>
                                ${['IN_TRANSIT', 'EXCEPTION'].includes(t.status) ? `<button class="btn btn-link btn-sm" onclick="addEvent(${t.id})"><i class="fa fa-map-marker"></i> 事件</button><button class="btn btn-link btn-sm" onclick="reportException(${t.id})"><i class="fa fa-exclamation-circle"></i> 异常</button>` : ''}
                                ${['IN_TRANSIT', 'EXCEPTION'].includes(t.status) ? `<button class="btn btn-link btn-sm" onclick="recordDelivery(${t.id})"><i class="fa fa-sign-in"></i> 签收</button>` : ''}
                                ${t.status === 'DELIVERED' ? `<button class="btn btn-link btn-sm" onclick="closeTask(${t.id})"><i class="fa fa-check"></i> 关闭</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无运输任务（备货发运后自动创建）</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
}
async function viewTask(id) {
    const t = tasks.find(x => x.id === id);
    let events = [], exceptions = [];
    try { [events, exceptions] = await Promise.all([api(`/gsp/transport/tasks/${id}/events`), api(`/gsp/transport/tasks/${id}/exceptions`)]); } catch (e) { /* ignore */ }
    openModal({
        title: `运输任务详情 - ${t ? t.task_no : id}`,
        size: 'lg',
        body: `
            <div class="detail-grid mb-3">
                <div class="kv"><span class="kv-label">任务号</span><span>${esc(t.task_no)}</span></div>
                <div class="kv"><span class="kv-label">状态</span><span>${statusBadge(t.status)}</span></div>
                <div class="kv"><span class="kv-label">路线计划</span><span>${esc(t.route_plan_ref)}</span></div>
                <div class="kv"><span class="kv-label">交接单</span><span>${esc(t.handover_document_no)}</span></div>
                ${t.delivered_at ? `<div class="kv"><span class="kv-label">签收时间</span><span>${fmtDT(t.delivered_at)}</span></div><div class="kv"><span class="kv-label">签收人</span><span>${esc(t.recipient_name)}（${esc(t.recipient_organization)}）</span></div><div class="kv"><span class="kv-label">包装/数量</span><span>${esc(t.package_condition)} / ${esc(t.quantity_conclusion)}</span></div>` : ''}
            </div>
            <div class="font-semibold text-sm mb-2">在途事件</div>
            <div class="table-wrap mb-3"><table class="data-table">
                <thead><tr><th>时间</th><th>类型</th><th>地点</th><th>详情</th></tr></thead>
                <tbody>${events.map(e => `<tr><td>${fmtDT(e.occurred_at)}</td><td>${esc(e.event_type)}</td><td>${esc(e.location)}</td><td style="white-space:normal;max-width:260px">${esc(e.detail)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state">无事件</div></td></tr>'}</tbody></table></div>
            <div class="font-semibold text-sm mb-2">异常记录</div>
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>分类</th><th>级别</th><th>描述</th><th>状态</th><th>决策</th><th class="actions">操作</th></tr></thead>
                <tbody>${exceptions.map(x => `<tr><td>${esc(x.category)}</td><td>${badge(x.severity, x.severity === 'CRITICAL' || x.severity === 'HIGH' ? 'danger' : 'warning')}</td><td style="white-space:normal;max-width:220px">${esc(x.description)}</td><td>${statusBadge(x.status)}</td><td>${esc(x.decision || '-')}</td><td class="actions">${x.status === 'PENDING_QUALITY' ? `<button class="btn btn-link btn-sm" onclick="decideException(${x.id})"><i class="fa fa-gavel"></i> 决策</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">无异常</div></td></tr>'}</tbody></table></div>`,
    });
}
function addEvent(taskId) {
    const modal = openModal({
        title: '记录在途事件', size: 'md',
        body: `
            <div class="form-row"><div class="form-group"><label class="form-label">事件类型 *</label>
                <select id="evType" class="input-field"><option value="LOCATION_UPDATE">位置更新</option><option value="ARRIVED_HUB">到达中转</option><option value="DEPARTED_HUB">离开中转</option></select></div>
                <div class="form-group"><label class="form-label">发生时间 *</label><input type="datetime-local" id="evAt" class="input-field" value="${nowLocalISO()}"></div></div>
            <div class="form-group"><label class="form-label">地点 *</label><input id="evLoc" class="input-field"></div>
            <div class="form-group"><label class="form-label">详情 *（≥3字）</label><textarea id="evDetail" class="input-field" rows="2"></textarea></div>
            <div class="form-group"><label class="form-label">证据引用</label><input id="evRef" class="input-field"></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="evSubmit">保存</button>`,
    });
    modal.querySelector('#evSubmit').addEventListener('click', async () => {
        const body = {
            event_type: modal.querySelector('#evType').value,
            occurred_at: modal.querySelector('#evAt').value,
            location: modal.querySelector('#evLoc').value.trim(),
            detail: modal.querySelector('#evDetail').value.trim(),
            evidence_ref: modal.querySelector('#evRef').value.trim() || null,
        };
        if (!body.location || body.detail.length < 3) { showToast('请完整填写事件信息', 'warning'); return; }
        try {
            await api(`/gsp/transport/tasks/${taskId}/events`, { method: 'POST', body });
            closeModal(modal); showToast('事件已记录', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function reportException(taskId) {
    const modal = openModal({
        title: '上报运输异常', size: 'lg',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">分类 *</label>
                    <select id="exCat" class="input-field">
                        <option value="DELAY">延误</option><option value="ROUTE_DEVIATION">路线偏离</option><option value="VEHICLE_BREAKDOWN">车辆故障</option>
                        <option value="PACKAGE_DAMAGE">包装破损</option><option value="QUANTITY_MISMATCH">数量不符</option><option value="CUSTODY_BREAK">交接链断裂</option><option value="OTHER">其他</option>
                    </select></div>
                <div class="form-group"><label class="form-label">级别 *</label>
                    <select id="exSev" class="input-field"><option value="LOW">低</option><option value="MEDIUM">中</option><option value="HIGH">高</option><option value="CRITICAL">严重</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">发生时间 *</label><input type="datetime-local" id="exAt" class="input-field" value="${nowLocalISO()}"></div>
                <div class="form-group"><label class="form-label">地点 *</label><input id="exLoc" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">描述 *（≥3字）</label><textarea id="exDesc" class="input-field" rows="2"></textarea></div>
            <div class="form-group"><label class="form-label">证据引用 *</label><input id="exRef" class="input-field"></div>
            <label class="checkbox-label mb-2"><input type="checkbox" id="exImpact" class="checkbox" checked> 影响药品质量</label>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="exSubmit">上报</button>`,
    });
    modal.querySelector('#exSubmit').addEventListener('click', async () => {
        const body = {
            category: modal.querySelector('#exCat').value,
            severity: modal.querySelector('#exSev').value,
            quality_impact: modal.querySelector('#exImpact').checked,
            occurred_at: modal.querySelector('#exAt').value,
            location: modal.querySelector('#exLoc').value.trim(),
            description: modal.querySelector('#exDesc').value.trim(),
            evidence_ref: modal.querySelector('#exRef').value.trim(),
        };
        if (!body.location || body.description.length < 3 || !body.evidence_ref) { showToast('请完整填写异常信息', 'warning'); return; }
        try {
            await api(`/gsp/transport/tasks/${taskId}/exceptions`, { method: 'POST', body });
            closeModal(modal); showToast('异常已上报，待质量决策', 'warning'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function decideException(exceptionId) {
    const modal = openModal({
        title: '运输异常质量决策', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">决策 *</label>
                <select id="xdDecision" class="input-field"><option value="CONTINUE">继续运输</option><option value="RETURN">退回仓库</option><option value="REJECT_DELIVERY">拒收交付</option></select></div>
            <div class="form-group"><label class="form-label">偏差引用 *</label><input id="xdRef" class="input-field"></div>
            <div class="form-group"><label class="form-label">CAPA引用</label><input id="xdCapa" class="input-field"></div>
            <div class="form-group"><label class="form-label">决策原因 *（≥3字）</label><textarea id="xdReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="xdSubmit">提交</button>`,
    });
    modal.querySelector('#xdSubmit').addEventListener('click', () => {
        const body = {
            decision: modal.querySelector('#xdDecision').value,
            deviation_ref: modal.querySelector('#xdRef').value.trim(),
            capa_ref: modal.querySelector('#xdCapa').value.trim() || null,
            reason: modal.querySelector('#xdReason').value.trim(),
        };
        if (!body.deviation_ref || body.reason.length < 3) { showToast('请完整填写决策信息', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'TRANSPORT_EXCEPTION_DECISION', entity_type: 'GspTransportException', entity_id: exceptionId, meaning: 'APPROVAL' },
            { path: `/gsp/transport/exceptions/${exceptionId}/decision`, opts: { method: 'POST', body } },
            '运输异常决策'
        );
    });
}
function recordDelivery(taskId) {
    const modal = openModal({
        title: '记录签收（需电子签名）', size: 'lg',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">签收时间 *</label><input type="datetime-local" id="dlAt" class="input-field" value="${nowLocalISO()}"></div>
                <div class="form-group"><label class="form-label">交付地点 *</label><input id="dlLoc" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">签收人姓名 *</label><input id="dlName" class="input-field"></div>
                <div class="form-group"><label class="form-label">签收单位 *</label><input id="dlOrg" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">签收凭证引用 *</label><input id="dlRef" class="input-field"></div>
                <div class="form-group"><label class="form-label">包装状况 *</label>
                    <select id="dlPkg" class="input-field"><option value="INTACT">完好</option><option value="DAMAGED">破损</option></select></div>
            </div>
            <div class="form-group"><label class="form-label">数量核对 *</label>
                <select id="dlQty" class="input-field"><option value="MATCHED">一致</option><option value="SHORT">短缺</option><option value="OVER">多出</option></select></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="dlReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="dlSubmit">提交</button>`,
    });
    modal.querySelector('#dlSubmit').addEventListener('click', () => {
        const body = {
            received_at: modal.querySelector('#dlAt').value,
            delivery_location: modal.querySelector('#dlLoc').value.trim(),
            recipient_name: modal.querySelector('#dlName').value.trim(),
            recipient_organization: modal.querySelector('#dlOrg').value.trim(),
            delivery_proof_ref: modal.querySelector('#dlRef').value.trim(),
            package_condition: modal.querySelector('#dlPkg').value,
            quantity_conclusion: modal.querySelector('#dlQty').value,
            reason: modal.querySelector('#dlReason').value.trim(),
        };
        if (!body.delivery_location || !body.recipient_name || !body.recipient_organization || !body.delivery_proof_ref || body.reason.length < 3) { showToast('请完整填写签收信息', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'TRANSPORT_DELIVERY', entity_type: 'GspTransportTask', entity_id: taskId, meaning: 'CONFIRMATION' },
            { path: `/gsp/transport/tasks/${taskId}/delivery`, opts: { method: 'POST', body } },
            '记录运输签收'
        );
    });
}
function closeTask(taskId) {
    const modal = openModal({
        title: '关闭运输任务（归档证据）', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">归档证据引用 *</label><input id="tcRef" class="input-field"></div>
            <div class="form-group"><label class="form-label">关闭原因 *（≥3字）</label><textarea id="tcReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="tcSubmit">关闭</button>`,
    });
    modal.querySelector('#tcSubmit').addEventListener('click', () => {
        const body = { evidence_ref: modal.querySelector('#tcRef').value.trim(), reason: modal.querySelector('#tcReason').value.trim() };
        if (!body.evidence_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
        closeModal(modal);
        signAction(
            { action: 'TRANSPORT_CLOSE', entity_type: 'GspTransportTask', entity_id: taskId, meaning: 'REVIEW' },
            { path: `/gsp/transport/tasks/${taskId}/close`, opts: { method: 'POST', body } },
            '关闭运输任务'
        );
    });
}
