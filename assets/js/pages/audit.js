/* 审计追踪：哈希链审计事件 / 链校验 / 校验记录 */
'use strict';
window.PAGE_TITLE = '审计追踪';
const content = () => document.getElementById('pageContent');
let events = [];
let verifications = [];

window.pageInit = async function () {
    render();
    await load();
};

function render() {
    content().innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-shield mr-2" style="color:var(--primary)"></i>审计事件（哈希链防篡改）</span>
                <div class="flex gap-2">
                    <button class="btn btn-secondary btn-sm" id="auVerifyBtn"><i class="fa fa-check-circle"></i> 校验审计链</button>
                    <button class="btn btn-primary btn-sm" id="auRecordBtn"><i class="fa fa-plus"></i> 记录校验</button>
                </div>
            </div>
            <div class="card-body">
                <div class="filter-bar mb-3">
                    <input id="auEntityType" class="input-field" placeholder="对象类型，如 GspDrugBatch">
                    <input id="auEntityId" class="input-field" placeholder="对象ID">
                    <select id="auLimit" class="input-field"><option value="100">最近100条</option><option value="200">最近200条</option><option value="500">最近500条</option></select>
                    <button class="btn btn-secondary btn-sm" id="auSearchBtn"><i class="fa fa-search"></i> 查询</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>ID</th><th>操作人</th><th>动作</th><th>对象</th><th>原因</th><th>事件哈希</th><th>时间</th></tr></thead>
                        <tbody id="auBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="card mt-4">
            <div class="card-header"><span class="card-title"><i class="fa fa-history mr-2" style="color:var(--primary)"></i>审计链校验记录</span></div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>触发</th><th>证据引用</th><th>检查事件数</th><th>结果</th><th>校验时间</th></tr></thead>
                    <tbody>${verifications.map(v => `
                        <tr>
                            <td>${v.id}</td>
                            <td>${badge(v.trigger_source === 'MANUAL' ? '手工' : '计划任务', 'info')}</td>
                            <td>${esc(v.evidence_ref)}</td>
                            <td>${v.checked_event_count}</td>
                            <td>${v.valid ? badge('有效', 'success') : badge(`断裂@${v.broken_event_id}`, 'danger')}</td>
                            <td>${fmtDT(v.verified_at)}</td>
                        </tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">暂无校验记录</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    document.getElementById('auVerifyBtn').addEventListener('click', verifyChain);
    document.getElementById('auRecordBtn').addEventListener('click', recordVerification);
    document.getElementById('auSearchBtn').addEventListener('click', () => load(true));
}

async function load(search) {
    try {
        const et = document.getElementById('auEntityType').value.trim();
        const eid = document.getElementById('auEntityId').value.trim();
        const limit = document.getElementById('auLimit').value;
        const q = new URLSearchParams({ limit });
        if (et) q.set('entity_type', et);
        if (eid) q.set('entity_id', eid);
        events = await api('/gsp/audit-events?' + q.toString());
        verifications = await api('/gsp/audit-verifications');
        renderEvents();
        const tbody2 = document.querySelectorAll('#auBody')[0].closest('.card').nextElementSibling;
        const vrows = verifications.map(v => `
            <tr><td>${v.id}</td><td>${badge(v.trigger_source === 'MANUAL' ? '手工' : '计划任务', 'info')}</td><td>${esc(v.evidence_ref)}</td><td>${v.checked_event_count}</td><td>${v.valid ? badge('有效', 'success') : badge(`断裂@${v.broken_event_id}`, 'danger')}</td><td>${fmtDT(v.verified_at)}</td></tr>`).join('');
        tbody2.querySelector('tbody').innerHTML = vrows || '<tr><td colspan="6"><div class="empty-state">暂无校验记录</div></td></tr>';
    } catch (e) { showToast(e.message, 'error'); }
}

function renderEvents() {
    const tbody = document.getElementById('auBody');
    tbody.innerHTML = events.map(e => `
        <tr>
            <td>${e.id}</td>
            <td>${e.actor_user_id}</td>
            <td>${badge(e.action, 'info')}</td>
            <td class="text-xs">${esc(e.entity_type)}#${esc(e.entity_id)}</td>
            <td style="white-space:normal;max-width:200px" class="text-xs">${esc(e.reason)}</td>
            <td class="text-xs" title="${esc(e.event_hash)}">${esc((e.event_hash || '').slice(0, 12))}…</td>
            <td>${fmtDT(e.occurred_at)}</td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无审计事件</div></td></tr>';
}

async function verifyChain() {
    try {
        const r = await api('/gsp/audit-events/verify');
        const modal = openModal({
            title: '审计链校验结果', size: 'sm',
            body: `
                <div class="text-center p-4">
                    <div style="font-size:40px;color:${r.valid ? 'var(--green-500)' : 'var(--red-500)'}"><i class="fa ${r.valid ? 'fa-check-circle' : 'fa-times-circle'}"></i></div>
                    <div class="text-lg font-bold mt-2" style="color:${r.valid ? 'var(--green-600)' : 'var(--red-600)'}">${r.valid ? '审计链完整有效' : '审计链已断裂'}</div>
                    ${r.broken_event_id ? `<div class="text-sm text-gray-500 mt-1">断裂事件ID：${r.broken_event_id}</div>` : ''}
                </div>`,
        });
    } catch (e) { showToast(e.message, 'error'); }
}
function recordVerification() {
    const modal = openModal({
        title: '记录审计链校验结果', size: 'md',
        body: `
            <div class="form-group"><label class="form-label">触发来源</label><select id="rvSrc" class="input-field"><option value="MANUAL">手工</option><option value="SCHEDULED">计划任务</option></select></div>
            <div class="form-group"><label class="form-label">证据引用 *（≥3字）</label><input id="rvEv" class="input-field"></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="rvReason" class="input-field" rows="2"></textarea></div>`,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rvSubmit">保存</button>`,
    });
    modal.querySelector('#rvSubmit').addEventListener('click', async () => {
        const body = {
            trigger_source: modal.querySelector('#rvSrc').value,
            evidence_ref: modal.querySelector('#rvEv').value.trim(),
            reason: modal.querySelector('#rvReason').value.trim(),
        };
        if (!body.evidence_ref || body.reason.length < 3) { showToast('请完整填写', 'warning'); return; }
        try {
            await api('/gsp/audit-verifications', { method: 'POST', body });
            closeModal(modal); showToast('校验记录已保存', 'success'); await load();
        } catch (e) { showToast(e.message, 'error'); }
    });
}
