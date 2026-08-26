/* 运维合规：秘密轮换（申请→批准→实施→核验）、备份证据（登记→复核）、恢复演练（申请→批准→执行→核验）
 * SPA 模块：window.PAGES['operations'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '运维合规';
    let _el = null;
    const content = () => _el;
    let tab = 'rotations';
let rotations = [];
let backups = [];
let drills = [];

async function pageInit(el) { _el = el || document.getElementById('pageContent');
    render();
    await loadTab();
};

function render() {
    content().innerHTML = `
        <div class="tabs">
            <div class="tab ${tab === 'rotations' ? 'active' : ''}" data-tab="rotations"><i class="fa fa-key mr-1"></i>秘密轮换</div>
            <div class="tab ${tab === 'backups' ? 'active' : ''}" data-tab="backups"><i class="fa fa-database mr-1"></i>备份证据</div>
            <div class="tab ${tab === 'drills' ? 'active' : ''}" data-tab="drills"><i class="fa fa-life-bouy mr-1"></i>恢复演练</div>
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
        if (tab === 'rotations') { rotations = await api('/gsp/operations/secret-rotations'); await renderRotations(box); }
        else if (tab === 'backups') { backups = await api('/gsp/operations/backups'); await renderBackups(box); }
        else { drills = await api('/gsp/operations/recovery-drills'); await renderDrills(box); }
    } catch (e) { box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`; }
}

/* ---------------- 秘密轮换 ---------------- */
async function renderRotations(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-key mr-2" style="color:var(--primary)"></i>秘密轮换（申请→双人批准→实施→核验）</span>
                <button class="btn btn-primary" id="rtNewBtn"><i class="fa fa-plus"></i> 申请轮换</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>秘密名称</th><th>提供方</th><th>变更引用</th><th>新版本引用</th><th>下次轮换</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${rotations.map(r => `
                        <tr>
                            <td>${r.id}</td>
                            <td class="font-medium">${esc(r.secret_name)}</td>
                            <td>${esc(r.provider)}</td>
                            <td>${esc(r.change_ref)}</td>
                            <td>${esc(r.proposed_version_ref)}</td>
                            <td>${fmtDT(r.next_rotation_due_at)}</td>
                            <td>${statusBadge(r.status)}</td>
                            <td class="actions">
                                ${r.status === 'REQUESTED' ? `<button class="btn btn-link btn-sm" onclick="PG('operations').decideRotation(${r.id}, 'SECRET_ROTATION_DECISION', 'GspSecretRotation', '/gsp/operations/secret-rotations/' + ${r.id} + '/decision')"><i class="fa fa-gavel"></i> 批准</button>` : ''}
                                ${r.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" onclick="PG('operations').implementRotation(${r.id})"><i class="fa fa-wrench"></i> 实施</button>` : ''}
                                ${r.status === 'IMPLEMENTED' ? `<button class="btn btn-link btn-sm" onclick="PG('operations').verifyRotation(${r.id})"><i class="fa fa-check-circle"></i> 核验</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无轮换申请</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#rtNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '申请秘密轮换', size: 'md',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">秘密名称 *</label><input id="roName" class="input-field"></div>
                    <div class="form-group"><label class="form-label">提供方 *</label><input id="roProvider" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">变更引用 *</label><input id="roChange" class="input-field"></div>
                    <div class="form-group"><label class="form-label">当前版本引用</label><input id="roCur" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">新版本引用 *</label><input id="roNew" class="input-field"></div>
                    <div class="form-group"><label class="form-label">下次轮换时间 *</label><input type="datetime-local" id="roNext" class="input-field"></div>
                </div>
                <div class="form-group"><label class="form-label">申请原因 *（≥3字）</label><textarea id="roReason" class="input-field" rows="2"></textarea></div>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="roSubmit">提交</button>`,
        });
        modal.querySelector('#roSubmit').addEventListener('click', async () => {
            const body = {
                secret_name: modal.querySelector('#roName').value.trim(),
                provider: modal.querySelector('#roProvider').value.trim(),
                change_ref: modal.querySelector('#roChange').value.trim(),
                current_version_ref: modal.querySelector('#roCur').value.trim() || null,
                proposed_version_ref: modal.querySelector('#roNew').value.trim(),
                next_rotation_due_at: modal.querySelector('#roNext').value,
                reason: modal.querySelector('#roReason').value.trim(),
            };
            if (!body.secret_name || !body.provider || !body.change_ref || !body.proposed_version_ref || !body.next_rotation_due_at || body.reason.length < 3) { showToast('请完整填写轮换申请', 'warning'); return; }
            try {
                await api('/gsp/operations/secret-rotations', { method: 'POST', body });
                closeModal(modal); showToast('轮换申请已提交，等待双人批准', 'success'); await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}
function decideRotation(id, action, entityType, path) {
    const modal = openModal({
        title: '批准秘密轮换', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">决策 *</label><select id="drDecision" class="input-field"><option value="APPROVE">批准</option><option value="REJECT">拒绝</option></select></div>
            <div class="form-group"><label class="form-label">证据引用 *</label><input id="drEv" class="input-field"></div>
            <div class="form-group"><label class="form-label">审批原因 *（≥3字）</label><textarea id="drReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="drSubmit">提交</button>`,
    });
    modal.querySelector('#drSubmit').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#drDecision').value, evidence_ref: modal.querySelector('#drEv').value.trim(), reason: modal.querySelector('#drReason').value.trim() };
        if (!body.evidence_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
        closeModal(modal);
        signAction({ action, entity_type: entityType, entity_id: id, meaning: 'APPROVAL' }, { path, opts: { method: 'POST', body } }, '批准秘密轮换');
    });
}
function implementRotation(id) {
    const modal = openModal({
        title: '实施秘密轮换', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">实施证据引用 *</label><input id="imEv" class="input-field"></div>
            <div class="form-group"><label class="form-label">实施原因 *（≥3字）</label><textarea id="imReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="imSubmit">实施</button>`,
    });
    modal.querySelector('#imSubmit').addEventListener('click', () => {
        const body = { evidence_ref: modal.querySelector('#imEv').value.trim(), reason: modal.querySelector('#imReason').value.trim() };
        if (!body.evidence_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'SECRET_ROTATION_IMPLEMENT', entity_type: 'GspSecretRotation', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/operations/secret-rotations/${id}/implement`, opts: { method: 'POST', body } }, '实施秘密轮换');
    });
}
function verifyRotation(id) {
    const modal = openModal({
        title: '核验秘密轮换', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">核验结果 *</label><select id="vfDecision" class="input-field"><option value="PASS">通过</option><option value="FAIL">不通过</option></select></div>
            <div class="form-group"><label class="form-label">证据引用 *</label><input id="vfEv" class="input-field"></div>
            <div class="form-group"><label class="form-label">核验原因 *（≥3字）</label><textarea id="vfReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="vfSubmit">提交</button>`,
    });
    modal.querySelector('#vfSubmit').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#vfDecision').value, evidence_ref: modal.querySelector('#vfEv').value.trim(), reason: modal.querySelector('#vfReason').value.trim() };
        if (!body.evidence_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'SECRET_ROTATION_VERIFY', entity_type: 'GspSecretRotation', entity_id: id, meaning: 'REVIEW' },
            { path: `/gsp/operations/secret-rotations/${id}/verify`, opts: { method: 'POST', body } }, '核验秘密轮换');
    });
}

/* ---------------- 备份 ---------------- */
async function renderBackups(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-database mr-2" style="color:var(--primary)"></i>备份证据（本异地+离线，定期复核）</span>
                <button class="btn btn-primary" id="bkNewBtn"><i class="fa fa-plus"></i> 登记备份</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>备份ID</th><th>类型</th><th>状态</th><th>计划时间</th><th>完成时间</th><th>大小</th><th>SHA256</th><th>复核</th><th class="actions">操作</th></tr></thead>
                    <tbody>${backups.map(b => `
                        <tr>
                            <td class="font-medium">${esc(b.backup_id)}</td>
                            <td>${badge(b.backup_type === 'FULL' ? '全量' : '增量', b.backup_type === 'FULL' ? 'info' : 'gray')}</td>
                            <td>${statusBadge(b.status)}</td>
                            <td>${fmtDT(b.scheduled_for)}</td>
                            <td>${fmtDT(b.completed_at)}</td>
                            <td>${b.size_bytes ? (b.size_bytes / 1024 / 1024).toFixed(1) + 'MB' : '-'}</td>
                            <td class="text-xs">${esc((b.checksum_sha256 || '').slice(0, 12))}…</td>
                            <td>${b.review_result ? badge(b.review_result, b.review_result === 'ACCEPTED' ? 'success' : 'danger') : badge('待复核', 'warning')}</td>
                            <td class="actions">
                                ${!b.review_result ? `<button class="btn btn-link btn-sm" onclick="PG('operations').reviewBackup(${b.id})"><i class="fa fa-check-circle"></i> 复核</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="9"><div class="empty-state">暂无备份证据</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#bkNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '登记备份证据', size: 'lg',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">备份ID *</label><input id="bkId" class="input-field"></div>
                    <div class="form-group"><label class="form-label">类型</label><select id="bkType" class="input-field"><option value="FULL">全量</option><option value="INCREMENTAL">增量</option></select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">状态 *</label><select id="bkStatus" class="input-field"><option value="SUCCESS">成功</option><option value="FAILED">失败</option></select></div>
                    <div class="form-group"><label class="form-label">计划时间 *</label><input type="datetime-local" id="bkSched" class="input-field" value="${nowLocalISO()}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">开始时间 *</label><input type="datetime-local" id="bkStart" class="input-field" value="${nowLocalISO()}"></div>
                    <div class="form-group"><label class="form-label">完成时间 *</label><input type="datetime-local" id="bkEnd" class="input-field" value="${nowLocalISO()}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">SHA256（64位）</label><input id="bkSha" class="input-field"></div>
                    <div class="form-group"><label class="form-label">大小(字节)</label><input type="number" id="bkSize" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">本机存储引用</label><input id="bkPrim" class="input-field"></div>
                    <div class="form-group"><label class="form-label">异地存储引用</label><input id="bkOff" class="input-field"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">离线存储引用</label><input id="bkOffline" class="input-field"></div>
                    <div class="form-group"><label class="form-label">保留至</label><input type="datetime-local" id="bkRet" class="input-field"></div>
                </div>
                <div class="form-group"><label class="form-label">证据引用 *</label><input id="bkEv" class="input-field"></div>
                <div class="form-group"><label class="form-label">告警证据引用（失败时）</label><input id="bkAlert" class="input-field"></div>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="bkSubmit">登记</button>`,
        });
        modal.querySelector('#bkSubmit').addEventListener('click', async () => {
            const body = {
                backup_id: modal.querySelector('#bkId').value.trim(),
                backup_type: modal.querySelector('#bkType').value,
                status: modal.querySelector('#bkStatus').value,
                scheduled_for: modal.querySelector('#bkSched').value,
                started_at: modal.querySelector('#bkStart').value,
                completed_at: modal.querySelector('#bkEnd').value,
                checksum_sha256: modal.querySelector('#bkSha').value.trim() || null,
                size_bytes: modal.querySelector('#bkSize').value === '' ? null : Number(modal.querySelector('#bkSize').value),
                primary_storage_ref: modal.querySelector('#bkPrim').value.trim() || null,
                offsite_storage_ref: modal.querySelector('#bkOff').value.trim() || null,
                offline_storage_ref: modal.querySelector('#bkOffline').value.trim() || null,
                retention_until: modal.querySelector('#bkRet').value || null,
                evidence_ref: modal.querySelector('#bkEv').value.trim(),
                alert_evidence_ref: modal.querySelector('#bkAlert').value.trim() || null,
            };
            if (!body.backup_id || !body.scheduled_for || !body.started_at || !body.completed_at || !body.evidence_ref) { showToast('请完整填写备份信息', 'warning'); return; }
            try {
                await api('/gsp/operations/backups', { method: 'POST', body });
                closeModal(modal); showToast('备份证据已登记', 'success'); await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}
function reviewBackup(id) {
    const modal = openModal({
        title: '备份证据复核', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">复核结果 *</label><select id="bvDecision" class="input-field"><option value="ACCEPTED">接受</option><option value="REJECTED">拒绝</option></select></div>
            <div class="form-group"><label class="form-label">证据引用 *</label><input id="bvEv" class="input-field"></div>
            <div class="form-group"><label class="form-label">复核原因 *（≥3字）</label><textarea id="bvReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="bvSubmit">提交</button>`,
    });
    modal.querySelector('#bvSubmit').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#bvDecision').value, evidence_ref: modal.querySelector('#bvEv').value.trim(), reason: modal.querySelector('#bvReason').value.trim() };
        if (!body.evidence_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'BACKUP_EVIDENCE_REVIEW', entity_type: 'GspBackupEvidence', entity_id: id, meaning: 'REVIEW' },
            { path: `/gsp/operations/backups/${id}/review`, opts: { method: 'POST', body } }, '备份证据复核');
    });
}

/* ---------------- 恢复演练 ---------------- */
async function renderDrills(box) {
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-life-bouy mr-2" style="color:var(--primary)"></i>恢复演练（RTO/RPO 达标验证）</span>
                <button class="btn btn-primary" id="rdNewBtn"><i class="fa fa-plus"></i> 申请演练</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>变更引用</th><th>计划引用</th><th>目标RTO/RPO</th><th>实际RTO/RPO</th><th>结果</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${drills.map(d => `
                        <tr>
                            <td>${d.id}</td>
                            <td>${esc(d.change_ref)}</td>
                            <td>${esc(d.plan_ref)}</td>
                            <td>${d.target_rto_minutes}/${d.target_rpo_minutes}分</td>
                            <td>${d.actual_rto_minutes !== null ? `${d.actual_rto_minutes}/${d.actual_rpo_minutes}分` : '-'}</td>
                            <td>${d.result ? badge(d.result, d.result === 'PASS' ? 'success' : 'danger') : '-'}</td>
                            <td>${statusBadge(d.status)}</td>
                            <td class="actions">
                                ${d.status === 'REQUESTED' ? `<button class="btn btn-link btn-sm" onclick="PG('operations').drillDecision(${d.id})"><i class="fa fa-gavel"></i> 批准</button>` : ''}
                                ${d.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" onclick="PG('operations').drillExecute(${d.id})"><i class="fa fa-play"></i> 执行</button>` : ''}
                                ${d.status === 'EXECUTED' ? `<button class="btn btn-link btn-sm" onclick="PG('operations').drillVerify(${d.id})"><i class="fa fa-check-circle"></i> 核验</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无恢复演练</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#rdNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '申请恢复演练', size: 'lg',
            body: `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">备份证据 *</label><select id="rdBackup" class="input-field">${optionHTML(backups.filter(b => b.status === 'SUCCESS' && b.review_result === 'ACCEPTED'), 'id', b => b.backup_id, '请选择已复核备份')}</select></div>
                    <div class="form-group"><label class="form-label">变更引用 *</label><input id="rdChange" class="input-field"></div>
                </div>
                <div class="form-group"><label class="form-label">计划引用 *</label><input id="rdPlan" class="input-field"></div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">计划执行时间 *</label><input type="datetime-local" id="rdSched" class="input-field" value="${nowLocalISO()}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">目标RTO(分钟) *</label><input type="number" id="rdRto" class="input-field"></div>
                    <div class="form-group"><label class="form-label">目标RPO(分钟) *</label><input type="number" id="rdRpo" class="input-field"></div>
                </div>
                <div class="form-group"><label class="form-label">申请原因 *（≥3字）</label><textarea id="rdReason" class="input-field" rows="2"></textarea></div>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rdSubmit">提交</button>`,
        });
        modal.querySelector('#rdSubmit').addEventListener('click', async () => {
            const body = {
                backup_evidence_id: Number(modal.querySelector('#rdBackup').value),
                change_ref: modal.querySelector('#rdChange').value.trim(),
                plan_ref: modal.querySelector('#rdPlan').value.trim(),
                scheduled_for: modal.querySelector('#rdSched').value,
                target_rto_minutes: Number(modal.querySelector('#rdRto').value),
                target_rpo_minutes: Number(modal.querySelector('#rdRpo').value),
                reason: modal.querySelector('#rdReason').value.trim(),
            };
            if (!body.backup_evidence_id || !body.change_ref || !body.plan_ref || !body.scheduled_for || !body.target_rto_minutes || body.reason.length < 3) { showToast('请完整填写演练申请', 'warning'); return; }
            try {
                await api('/gsp/operations/recovery-drills', { method: 'POST', body });
                closeModal(modal); showToast('演练申请已提交', 'success'); await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}
function drillDecision(id) {
    const modal = openModal({
        title: '批准恢复演练', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">决策 *</label><select id="odDecision" class="input-field"><option value="APPROVE">批准</option><option value="REJECT">拒绝</option></select></div>
            <div class="form-group"><label class="form-label">证据引用 *</label><input id="odEv" class="input-field"></div>
            <div class="form-group"><label class="form-label">审批原因 *（≥3字）</label><textarea id="odReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="odSubmit">提交</button>`,
    });
    modal.querySelector('#odSubmit').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#odDecision').value, evidence_ref: modal.querySelector('#odEv').value.trim(), reason: modal.querySelector('#odReason').value.trim() };
        if (!body.evidence_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'RECOVERY_DRILL_DECISION', entity_type: 'GspRecoveryDrill', entity_id: id, meaning: 'APPROVAL' },
            { path: `/gsp/operations/recovery-drills/${id}/decision`, opts: { method: 'POST', body } }, '批准恢复演练');
    });
}
function drillExecute(id) {
    const modal = openModal({
        title: '执行恢复演练', size: 'md',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">恢复目标引用 *</label><input id="oeTarget" class="input-field"></div>
                <div class="form-group"><label class="form-label">证据引用 *</label><input id="oeEv" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">实际RTO(分钟) *</label><input type="number" id="oeRto" class="input-field"></div>
                <div class="form-group"><label class="form-label">实际RPO(分钟) *</label><input type="number" id="oeRpo" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">结果 *</label><select id="oeResult" class="input-field"><option value="PASS">通过</option><option value="FAIL">失败</option></select></div>
            <div class="form-group"><label class="form-label">执行原因 *（≥3字）</label><textarea id="oeReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="oeSubmit">提交</button>`,
    });
    modal.querySelector('#oeSubmit').addEventListener('click', () => {
        const body = {
            restore_target_ref: modal.querySelector('#oeTarget').value.trim(),
            evidence_ref: modal.querySelector('#oeEv').value.trim(),
            actual_rto_minutes: Number(modal.querySelector('#oeRto').value),
            actual_rpo_minutes: Number(modal.querySelector('#oeRpo').value),
            result: modal.querySelector('#oeResult').value,
            reason: modal.querySelector('#oeReason').value.trim(),
        };
        if (!body.restore_target_ref || !body.evidence_ref || body.reason.length < 3) { showToast('请完整填写执行信息', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'RECOVERY_DRILL_EXECUTE', entity_type: 'GspRecoveryDrill', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/operations/recovery-drills/${id}/execute`, opts: { method: 'POST', body } }, '执行恢复演练');
    });
}
function drillVerify(id) {
    const modal = openModal({
        title: '核验恢复演练', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">核验结果 *</label><select id="ovDecision" class="input-field"><option value="PASS">通过</option><option value="FAIL">不通过</option></select></div>
            <div class="form-group"><label class="form-label">证据引用 *</label><input id="ovEv" class="input-field"></div>
            <div class="form-group"><label class="form-label">核验原因 *（≥3字）</label><textarea id="ovReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="ovSubmit">提交</button>`,
    });
    modal.querySelector('#ovSubmit').addEventListener('click', () => {
        const body = { decision: modal.querySelector('#ovDecision').value, evidence_ref: modal.querySelector('#ovEv').value.trim(), reason: modal.querySelector('#ovReason').value.trim() };
        if (!body.evidence_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
        closeModal(modal);
        signAction({ action: 'RECOVERY_DRILL_VERIFY', entity_type: 'GspRecoveryDrill', entity_id: id, meaning: 'REVIEW' },
            { path: `/gsp/operations/recovery-drills/${id}/verify`, opts: { method: 'POST', body } }, '核验恢复演练');
    });
}

    window.PAGES = window.PAGES || {};
    window.PAGES['operations'] = {
        title: '运维合规',
        icon: 'fa-gears',
        desc: '备份、恢复演练、秘密轮换',
        init: pageInit,
        fn: { decideRotation, implementRotation, verifyRotation, reviewBackup, drillDecision, drillExecute, drillVerify },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 operations.html
})();
