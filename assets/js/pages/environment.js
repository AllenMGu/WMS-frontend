/* 温湿度监测：监测设备（审批/校准/暂停）、监测点位（审批/读数/关闭）、实时告警（确认/决策） */
'use strict';
window.PAGE_TITLE = '温湿度监测';
const content = () => document.getElementById('pageContent');
let tab = 'devices';
let devices = [];
let assignments = [];
let alarms = [];
let warehouses = [];
let locations = [];

window.pageInit = async function () {
    try { [warehouses, locations] = await Promise.all([refWarehouses(), refLocations()]); } catch (e) { /* ignore */ }
    render();
    await loadTab();
};

function render() {
    content().innerHTML = `
        <div class="tabs">
            <div class="tab ${tab === 'devices' ? 'active' : ''}" data-tab="devices"><i class="fa fa-tachometer mr-1"></i>监测设备</div>
            <div class="tab ${tab === 'assignments' ? 'active' : ''}" data-tab="assignments"><i class="fa fa-map-marker mr-1"></i>监测点位</div>
            <div class="tab ${tab === 'alarms' ? 'active' : ''}" data-tab="alarms"><i class="fa fa-bell mr-1"></i>实时告警</div>
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
        if (tab === 'devices') { devices = await api('/gsp/environment/devices'); await renderDevices(box); }
        else if (tab === 'assignments') { assignments = await api('/gsp/environment/assignments'); await renderAssignments(box); }
        else { alarms = await api('/gsp/environment/alarms'); await renderAlarms(box); }
    } catch (e) { box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`; }
}

/* ---------------- 设备 ---------------- */
async function renderDevices(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-tachometer mr-2" style="color:var(--primary)"></i>温湿度监测设备</span>
                <button class="btn btn-primary" id="dvNewBtn"><i class="fa fa-plus"></i> 登记设备</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>设备编码</th><th>名称</th><th>型号</th><th>测量范围</th><th>校准有效期</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${devices.map(d => `
                        <tr>
                            <td class="font-medium">${esc(d.device_code)}</td>
                            <td>${esc(d.name)}</td>
                            <td>${esc(d.model_no)}</td>
                            <td>${badge(d.measurement_scope === 'TEMPERATURE_HUMIDITY' ? '温湿度' : '温度', 'info')}</td>
                            <td>${fmtD(d.calibration_valid_to)} ${d.calibration_valid_to && new Date(d.calibration_valid_to) < new Date() ? badge('已过期', 'danger') : ''}</td>
                            <td>${statusBadge(d.status)}</td>
                            <td class="actions">
                                ${d.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="decideDevice(${d.id})"><i class="fa fa-gavel"></i> 审批</button>` : ''}
                                ${d.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" onclick="recalibrateDevice(${d.id})"><i class="fa fa-wrench"></i> 校准</button><button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="suspendDevice(${d.id})"><i class="fa fa-pause"></i> 停用</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无监测设备</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#dvNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '登记监测设备', size: 'lg',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">设备编码 *</label><input id="deCode" class="input-field"></div>
                    <div class="form-group"><label class="form-label">名称 *</label><input id="deName" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">生产企业 *</label><input id="deMfr" class="input-field"></div>
                    <div class="form-group"><label class="form-label">型号 *</label><input id="deModel" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">序列号 *</label><input id="deSerial" class="input-field"></div>
                    <div class="form-group"><label class="form-label">测量范围 *</label>
                        <select id="deScope" class="input-field"><option value="TEMPERATURE_HUMIDITY">温度+湿度</option><option value="TEMPERATURE">仅温度</option></select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">校准引用 *</label><input id="deCal" class="input-field"></div>
                    <div class="form-group"><label class="form-label">校准有效期至 *</label><input type="date" id="deCalTo" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">温度精度(℃) *</label><input type="number" step="0.001" id="deTacc" class="input-field"></div>
                    <div class="form-group"><label class="form-label">湿度精度(%)</label><input type="number" step="0.001" id="deHacc" class="input-field"></div>
                </div>
                <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="deReason" class="input-field" rows="2"></textarea></div>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="deSubmit">保存</button>`,
        });
        modal.querySelector('#deSubmit').addEventListener('click', async () => {
            const body = {
                device_code: modal.querySelector('#deCode').value.trim(),
                name: modal.querySelector('#deName').value.trim(),
                manufacturer: modal.querySelector('#deMfr').value.trim(),
                model_no: modal.querySelector('#deModel').value.trim(),
                serial_no: modal.querySelector('#deSerial').value.trim(),
                measurement_scope: modal.querySelector('#deScope').value,
                calibration_ref: modal.querySelector('#deCal').value.trim(),
                calibration_valid_to: modal.querySelector('#deCalTo').value,
                temperature_accuracy: Number(modal.querySelector('#deTacc').value),
                humidity_accuracy: modal.querySelector('#deHacc').value === '' ? null : Number(modal.querySelector('#deHacc').value),
                reason: modal.querySelector('#deReason').value.trim(),
            };
            if (!body.device_code || !body.name || !body.manufacturer || !body.model_no || !body.serial_no || !body.calibration_ref || !body.calibration_valid_to || !body.temperature_accuracy || body.reason.length < 3) { showToast('请完整填写设备信息', 'warning'); return; }
            try {
                await api('/gsp/environment/devices', { method: 'POST', body });
                closeModal(modal); showToast('设备已登记，待审批', 'success'); await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}
function decideDevice(id) {
    const modal = openModal({
        title: '设备审批', size: 'sm',
        body: `<div class="form-group"><label class="form-label">决策 *</label><select id="ddDecision" class="input-field"><option value="APPROVE">批准</option><option value="REJECT">拒绝</option></select></div>
               <div class="form-group"><label class="form-label">审批原因 *（≥3字）</label><textarea id="ddReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="ddSubmit">提交</button>`,
    });
    modal.querySelector('#ddSubmit').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#ddDecision').value, reason: modal.querySelector('#ddReason').value.trim() };
        if (body.reason.length < 3) { showToast('审批原因不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'ENVIRONMENT_DEVICE_DECISION', entity_type: 'GspEnvironmentDevice', entity_id: id, meaning: 'APPROVAL' },
            { path: `/gsp/environment/devices/${id}/decision`, opts: { method: 'POST', body } }, '设备审批');
    });
}
function recalibrateDevice(id) {
    const modal = openModal({
        title: '设备校准', size: 'md',
        body: `
            <div class="form-row"><div class="form-group"><label class="form-label">校准引用 *</label><input id="rcRef" class="input-field"></div><div class="form-group"><label class="form-label">校准有效期至 *</label><input type="date" id="rcTo" class="input-field"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">温度精度 *</label><input type="number" step="0.001" id="rcTacc" class="input-field"></div><div class="form-group"><label class="form-label">湿度精度</label><input type="number" step="0.001" id="rcHacc" class="input-field"></div></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="rcReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rcSubmit">保存</button>`,
    });
    modal.querySelector('#rcSubmit').addEventListener('click', async () => {
        const body = {
            calibration_ref: modal.querySelector('#rcRef').value.trim(),
            calibration_valid_to: modal.querySelector('#rcTo').value,
            temperature_accuracy: Number(modal.querySelector('#rcTacc').value),
            humidity_accuracy: modal.querySelector('#rcHacc').value === '' ? null : Number(modal.querySelector('#rcHacc').value),
            reason: modal.querySelector('#rcReason').value.trim(),
        };
        if (!body.calibration_ref || !body.calibration_valid_to || !body.temperature_accuracy || body.reason.length < 3) { showToast('请完整填写校准信息', 'warning'); return; }
        try {
            await api(`/gsp/environment/devices/${id}/recalibrate`, { method: 'POST', body });
            closeModal(modal); showToast('校准已更新', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
function suspendDevice(id) {
    const modal = openModal({
        title: '停用设备', size: 'sm',
        body: `<div class="form-group"><label class="form-label">停用原因 *（≥3字）</label><textarea id="dsReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="dsSubmit">停用</button>`,
    });
    modal.querySelector('#dsSubmit').addEventListener('click', () => {
        const reason = modal.querySelector('#dsReason').value.trim();
        if (reason.length < 3) { showToast('停用原因不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'ENVIRONMENT_DEVICE_SUSPEND', entity_type: 'GspEnvironmentDevice', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/environment/devices/${id}/suspend`, opts: { method: 'POST', body: { reason } } }, '停用设备');
    });
}

/* ---------------- 点位 ---------------- */
async function renderAssignments(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-map-marker mr-2" style="color:var(--primary)"></i>监测点位（设备-环境绑定与阈值）</span>
                <button class="btn btn-primary" id="asNewBtn"><i class="fa fa-plus"></i> 新建监测点位</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>点位编号</th><th>设备</th><th>场景</th><th>温度阈值</th><th>湿度阈值</th><th>最近读数</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${assignments.map(a => `
                        <tr>
                            <td class="font-medium">${esc(a.assignment_no)}</td>
                            <td>${esc(devices.find(d => d.id === a.device_id)?.device_code || a.device_id)}</td>
                            <td>${badge(a.context_type === 'WAREHOUSE' ? '仓库' : '运输', 'info')}</td>
                            <td>${esc(a.temperature_min)} ~ ${esc(a.temperature_max)}℃</td>
                            <td>${a.humidity_min === null ? '-' : `${esc(a.humidity_min)} ~ ${esc(a.humidity_max)}%`}</td>
                            <td>${fmtDT(a.last_reading_at)}</td>
                            <td>${statusBadge(a.status)}</td>
                            <td class="actions">
                                ${a.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="decideAssignment(${a.id})"><i class="fa fa-gavel"></i> 审批</button>` : ''}
                                ${a.status === 'ACTIVE' ? `<button class="btn btn-link btn-sm" onclick="addReading(${a.id})"><i class="fa fa-plus-circle"></i> 录入读数</button><button class="btn btn-link btn-sm" onclick="viewReadings(${a.id})"><i class="fa fa-table"></i> 读数</button><button class="btn btn-link btn-sm" onclick="verifyReadingChain(${a.id})"><i class="fa fa-link"></i> 核验链</button><button class="btn btn-link btn-sm" onclick="closeAssignment(${a.id})"><i class="fa fa-times"></i> 关闭</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无监测点位</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#asNewBtn').addEventListener('click', () => {
        const approved = devices.filter(d => d.status === 'APPROVED');
        const modal = openModal({
            title: '新建监测点位', size: 'lg',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">点位编号 *</label><input id="anNo" class="input-field"></div>
                    <div class="form-group"><label class="form-label">设备 *</label><select id="anDevice" class="input-field">${optionHTML(approved, 'id', d => `${d.device_code} - ${d.name}`, '请选择已批准设备')}</select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">场景类型 *</label>
                        <select id="anCtx" class="input-field"><option value="WAREHOUSE">仓库</option><option value="TRANSPORT">运输</option></select></div>
                    <div class="form-group"><label class="form-label">仓库</label><select id="anWh" class="input-field">${optionHTML(warehouses, 'id', 'name', '请选择仓库')}</select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">库位</label><select id="anLoc" class="input-field">${optionHTML(locations, 'id', l => `${l.location_code}`, '请选择库位')}</select></div>
                    <div class="form-group"><label class="form-label">采样间隔(秒) *</label><input type="number" id="anInterval" class="input-field" value="300"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">正常温度范围 *</label><div class="flex gap-1"><input type="number" step="0.001" id="anTmin" class="input-field" placeholder="最低"><input type="number" step="0.001" id="anTmax" class="input-field" placeholder="最高"></div></div>
                    <div class="form-group"><label class="form-label">关键温度范围 *</label><div class="flex gap-1"><input type="number" step="0.001" id="anCtmin" class="input-field" placeholder="最低"><input type="number" step="0.001" id="anCtmax" class="input-field" placeholder="最高"></div></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">正常湿度范围</label><div class="flex gap-1"><input type="number" id="anHmin" class="input-field" placeholder="最低"><input type="number" id="anHmax" class="input-field" placeholder="最高"></div></div>
                    <div class="form-group"><label class="form-label">关键湿度范围</label><div class="flex gap-1"><input type="number" id="anChmin" class="input-field" placeholder="最低"><input type="number" id="anChmax" class="input-field" placeholder="最高"></div></div>
                </div>
                <div class="form-group"><label class="form-label">离线判定(秒) *</label><input type="number" id="anOffline" class="input-field" value="1800"></div>
                <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="anReason" class="input-field" rows="2"></textarea></div>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="anSubmit">保存</button>`,
        });
        modal.querySelector('#anSubmit').addEventListener('click', async () => {
            const body = {
                assignment_no: modal.querySelector('#anNo').value.trim(),
                device_id: Number(modal.querySelector('#anDevice').value),
                context_type: modal.querySelector('#anCtx').value,
                warehouse_id: modal.querySelector('#anWh').value ? Number(modal.querySelector('#anWh').value) : null,
                location_id: modal.querySelector('#anLoc').value ? Number(modal.querySelector('#anLoc').value) : null,
                temperature_min: Number(modal.querySelector('#anTmin').value),
                temperature_max: Number(modal.querySelector('#anTmax').value),
                critical_temperature_min: Number(modal.querySelector('#anCtmin').value),
                critical_temperature_max: Number(modal.querySelector('#anCtmax').value),
                humidity_min: modal.querySelector('#anHmin').value === '' ? null : Number(modal.querySelector('#anHmin').value),
                humidity_max: modal.querySelector('#anHmax').value === '' ? null : Number(modal.querySelector('#anHmax').value),
                critical_humidity_min: modal.querySelector('#anChmin').value === '' ? null : Number(modal.querySelector('#anChmin').value),
                critical_humidity_max: modal.querySelector('#anChmax').value === '' ? null : Number(modal.querySelector('#anChmax').value),
                sampling_interval_seconds: Number(modal.querySelector('#anInterval').value),
                offline_after_seconds: Number(modal.querySelector('#anOffline').value),
                reason: modal.querySelector('#anReason').value.trim(),
            };
            if (!body.assignment_no || !body.device_id || body.temperature_min === undefined || body.temperature_max === undefined || body.reason.length < 3) { showToast('请完整填写点位信息', 'warning'); return; }
            try {
                await api('/gsp/environment/assignments', { method: 'POST', body });
                closeModal(modal); showToast('监测点位已创建，待审批', 'success'); await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}
function decideAssignment(id) {
    const modal = openModal({
        title: '点位审批', size: 'sm',
        body: `<div class="form-group"><label class="form-label">决策 *</label><select id="adDecision" class="input-field"><option value="APPROVE">批准</option><option value="REJECT">拒绝</option></select></div>
               <div class="form-group"><label class="form-label">审批原因 *（≥3字）</label><textarea id="adReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="adSubmit">提交</button>`,
    });
    modal.querySelector('#adSubmit').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#adDecision').value, reason: modal.querySelector('#adReason').value.trim() };
        if (body.reason.length < 3) { showToast('审批原因不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'ENVIRONMENT_ASSIGNMENT_DECISION', entity_type: 'GspEnvironmentAssignment', entity_id: id, meaning: 'APPROVAL' },
            { path: `/gsp/environment/assignments/${id}/decision`, opts: { method: 'POST', body } }, '点位审批');
    });
}
function addReading(assignmentId) {
    const modal = openModal({
        title: '录入监测读数（外部设备上报）', size: 'md',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">外部读数ID *</label><input id="rdId" class="input-field"></div>
                <div class="form-group"><label class="form-label">观测时间 *</label><input type="datetime-local" id="rdAt" class="input-field" value="${nowLocalISO()}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">温度(℃) *</label><input type="number" step="0.001" id="rdT" class="input-field"></div>
                <div class="form-group"><label class="form-label">湿度(%)</label><input type="number" step="0.01" id="rdH" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">电量(%)</label><input type="number" step="0.01" id="rdBat" class="input-field"></div>
                <div class="form-group"><label class="form-label">信号强度</label><input type="number" id="rdSig" class="input-field"></div>
            </div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rdSubmit">保存</button>`,
    });
    modal.querySelector('#rdSubmit').addEventListener('click', async () => {
        const body = {
            external_reading_id: modal.querySelector('#rdId').value.trim(),
            observed_at: modal.querySelector('#rdAt').value,
            temperature: Number(modal.querySelector('#rdT').value),
            humidity: modal.querySelector('#rdH').value === '' ? null : Number(modal.querySelector('#rdH').value),
            battery_percent: modal.querySelector('#rdBat').value === '' ? null : Number(modal.querySelector('#rdBat').value),
            signal_strength: modal.querySelector('#rdSig').value === '' ? null : Number(modal.querySelector('#rdSig').value),
        };
        if (!body.external_reading_id || body.temperature === undefined) { showToast('请填写读数ID与温度', 'warning'); return; }
        try {
            await api(`/gsp/environment/assignments/${assignmentId}/readings`, { method: 'POST', body });
            closeModal(modal); showToast('读数已录入并写入哈希链', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
async function viewReadings(assignmentId) {
    let readings = [];
    try {
        readings = await api(`/gsp/environment/assignments/${assignmentId}/readings`);
    } catch (e) {
        openModal({
            title: '监测读数记录',
            size: 'sm',
            body: `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>读数加载失败：${esc(e.message)}</div>`,
        });
        return;
    }
    openModal({
        title: `监测读数记录（${readings.length} 条）`, size: 'lg',
        body: `
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>观测时间</th><th>温度</th><th>湿度</th><th>电量</th><th>评估</th><th>哈希</th></tr></thead>
                <tbody>${readings.slice(-100).reverse().map(r => `<tr><td>${fmtDT(r.observed_at)}</td><td>${esc(r.temperature)}</td><td>${esc(r.humidity ?? '-')}</td><td>${esc(r.battery_percent ?? '-')}</td><td>${badge(r.evaluation, r.evaluation === 'NORMAL' ? 'success' : 'danger')}</td><td class="text-xs" style="max-width:120px">${esc((r.record_hash || '').slice(0, 16))}…</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">无读数</div></td></tr>'}</tbody>
            </table></div>`,
    });
}

async function verifyReadingChain(assignmentId) {
    try {
        const result = await api(`/gsp/environment/assignments/${assignmentId}/verify-chain`);
        openModal({
            title: '监测读数链核验结果',
            size: 'sm',
            body: result.valid
                ? '<div class="alert alert-success"><i class="fa fa-check-circle mr-2"></i>读数链完整，未发现篡改或断链。</div>'
                : `<div class="alert alert-error"><i class="fa fa-exclamation-triangle mr-2"></i>读数链核验失败，异常读数 ID：${esc(result.broken_reading_id ?? '未知')}</div>`,
        });
    } catch (e) {
        openModal({
            title: '监测读数链核验结果',
            size: 'sm',
            body: `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>核验请求失败：${esc(e.message)}</div>`,
        });
    }
}

function closeAssignment(id) {
    const modal = openModal({
        title: '关闭监测点位', size: 'sm',
        body: `<div class="form-group"><label class="form-label">关闭原因 *（≥3字）</label><textarea id="acReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="acSubmit">关闭</button>`,
    });
    modal.querySelector('#acSubmit').addEventListener('click', () => {
        const reason = modal.querySelector('#acReason').value.trim();
        if (reason.length < 3) { showToast('关闭原因不能少于3个字', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'ENVIRONMENT_ASSIGNMENT_CLOSE', entity_type: 'GspEnvironmentAssignment', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/environment/assignments/${id}/close`, opts: { method: 'POST', body: { reason } } }, '关闭监测点位');
    });
}

/* ---------------- 告警 ---------------- */
async function renderAlarms(box) {
    const open = alarms.filter(a => ['OPEN', 'ACKNOWLEDGED'].includes(a.status));
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-bell mr-2" style="color:var(--red-500)"></i>温湿度告警（${open.length} 条未处理）</span>
                <button class="btn btn-secondary btn-sm" id="scanOfflineBtn"><i class="fa fa-search"></i> 扫描离线点位</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>告警号</th><th>类型</th><th>级别</th><th>观测值/阈值</th><th>说明</th><th>开启时间</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${alarms.map(a => `
                        <tr>
                            <td class="font-medium">${esc(a.alarm_no)}</td>
                            <td>${esc(a.alarm_type)}</td>
                            <td>${badge(a.severity, a.severity === 'CRITICAL' ? 'danger' : a.severity === 'HIGH' ? 'warning' : 'info')}</td>
                            <td>${esc(a.observed_value)} / ${esc(a.threshold_value)}</td>
                            <td style="white-space:normal;max-width:200px">${esc(a.detail)}</td>
                            <td>${fmtDT(a.opened_at)}</td>
                            <td>${statusBadge(a.status)}</td>
                            <td class="actions">
                                ${a.status === 'OPEN' ? `<button class="btn btn-link btn-sm" onclick="ackAlarm(${a.id})"><i class="fa fa-check"></i> 确认</button>` : ''}
                                ${['OPEN', 'ACKNOWLEDGED'].includes(a.status) ? `<button class="btn btn-link btn-sm" onclick="decideAlarm(${a.id})"><i class="fa fa-gavel"></i> 决策</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无告警记录</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#scanOfflineBtn').addEventListener('click', scanOfflineAssignments);
}

function scanOfflineAssignments() {
    confirmModal('扫描全部有效监测点位，并为超时未上报的点位生成离线告警？', async () => {
        try {
            const created = await api('/gsp/environment/alarms/scan-offline', { method: 'POST' });
            showToast(created.length ? `已生成 ${created.length} 条离线告警` : '扫描完成，未发现新增离线告警', 'success');
            await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    }, '开始扫描');
}

function ackAlarm(id) {
    confirmModal('确认该告警？确认后需继续质量决策处置。', async () => {
        try {
            await api(`/gsp/environment/alarms/${id}/acknowledge`, { method: 'POST', body: { reason: '确认收到告警' } });
            showToast('已确认', 'success'); await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    }, '确认');
}
function decideAlarm(id) {
    const modal = openModal({
        title: '告警质量决策', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">决策 *</label>
                <select id="alDecision" class="input-field"><option value="CONTINUE">继续放行</option><option value="HOLD">隔离留观</option><option value="RETURN">退回处理</option><option value="REJECT">拒收/报废</option></select></div>
            <div class="form-group"><label class="form-label">偏差引用 *</label><input id="alRef" class="input-field"></div>
            <div class="form-group"><label class="form-label">CAPA引用</label><input id="alCapa" class="input-field"></div>
            <div class="form-group"><label class="form-label">处置证据引用 *</label><input id="alEv" class="input-field"></div>
            <div class="form-group"><label class="form-label">决策原因 *（≥3字）</label><textarea id="alReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="alSubmit">提交</button>`,
    });
    modal.querySelector('#alSubmit').addEventListener('click', () => {
        const body = {
            decision: modal.querySelector('#alDecision').value,
            deviation_ref: modal.querySelector('#alRef').value.trim(),
            capa_ref: modal.querySelector('#alCapa').value.trim() || null,
            resolution_evidence_ref: modal.querySelector('#alEv').value.trim(),
            reason: modal.querySelector('#alReason').value.trim(),
        };
        if (!body.deviation_ref || !body.resolution_evidence_ref || body.reason.length < 3) { showToast('请完整填写决策信息', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'ENVIRONMENT_ALARM_DECISION', entity_type: 'GspEnvironmentAlarm', entity_id: id, meaning: 'APPROVAL' },
            { path: `/gsp/environment/alarms/${id}/decision`, opts: { method: 'POST', body } }, '告警质量决策');
    });
}
