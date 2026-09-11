/* 审计追踪：哈希链审计事件 / 链校验 / 校验记录
 * SPA 模块：window.PAGES['audit'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '审计追踪';
    let _el = null;
    const content = () => _el;
    let events = [];
    let verifications = [];
    /* 最近一次哈希链校验结果（用于在展示审计事件前给用户一个完整性结论） */
    let lastVerify = null;
    /* 自动校验只在整个会话首次进入本页面时触发一次（模块级状态随 SPA 生命周期保留） */
    let autoVerifyDone = false;

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        if (!autoVerifyDone) { autoVerifyDone = true; await autoVerifyOnce(); }
        render();
        await load();
    }

    /* 打开审计页时做一次哈希链校验并落校验记录（写 GspAuditVerification）：
       在展示事件前先给出完整性结论；仅会话内首次进入触发，
       之后查询/记录校验的 load() 刷新只读取数据，不再重复写记录 */
    /* 区分「请求失败」与「确认断裂」：网络超时/403/500 等接口故障只是
       「暂时无法完成完整性校验」，不得表述为链断裂或数据篡改（GSP 下会诱导错误的合规判断）。
       若本会话已有「已验证的结论」（valid 为 true/false），请求失败不得把它覆盖掉；
       仅在没有已验证结论时，才置为 request_failed 中性态 */
    function markRequestFailed(e) {
        if (lastVerify && lastVerify.valid !== null && lastVerify.valid !== undefined) return;
        lastVerify = { request_failed: true, error: ((e && e.status) ? 'HTTP ' + e.status : (e && e.message)) || '请求失败' };
    }

    async function autoVerifyOnce() {
        try {
            lastVerify = await api('/gsp/audit-verifications', {
                method: 'POST',
                body: { trigger_source: 'MANUAL', evidence_ref: '页面打开主动校验', reason: '页面打开时主动校验审计链完整性' },
            });
        } catch (e) {
            markRequestFailed(e);
        }
    }

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
                ${lastVerify ? (lastVerify.request_failed
                    ? `<div class="alert alert-warning mb-3"><i class="fa fa-plug mr-2"></i>⚠ 暂时无法完成完整性校验${lastVerify.error ? '（' + esc(lastVerify.error) + '）' : ''}：校验接口请求失败，审计数据完整性状态未确认，请勿据此进行合规判断。可稍后点击「校验审计链」重试。</div>`
                    : (lastVerify.valid
                        ? `<div class="alert alert-success mb-3"><i class="fa fa-check-circle mr-2"></i>✅ 审计链校验通过${lastVerify.verified_at ? '（' + esc(fmtDT(lastVerify.verified_at)) + ' 校验）' : ''}，哈希链完整有效。</div>`
                        : `<div class="alert alert-danger mb-3"><i class="fa fa-exclamation-triangle mr-2"></i>⚠ 审计链校验未通过${lastVerify.broken_event_id ? '（断裂 @ 事件 #' + lastVerify.broken_event_id + '）' : ''}，事件可能已被篡改，请勿据此进行合规判断。</div>`)) : ''}
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
                <div class="text-xs text-gray-500 mt-2">当前页共 ${events.length} 条（按 limit 截取，过滤条件请在对象类型/对象ID 缩小范围）</div>
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
        renderEvents();
    }

    async function load(search) {
        try {
            // 只读取数据（事件/校验记录）。链校验的自动写入在 pageInit 首次进入时只执行一次，
            // 查询、记录校验后的刷新不再写 GspAuditVerification 记录（避免台账重复写入）
            const et = document.getElementById('auEntityType').value.trim();
            const eid = document.getElementById('auEntityId').value.trim();
            const limit = document.getElementById('auLimit').value;
            const q = new URLSearchParams({ limit });
            if (et) q.set('entity_type', et);
            if (eid) q.set('entity_id', eid);
            // 只拉当前 limit 一页（不再 apiAll 全量分页循环，避免一次拉 12 次）
            events = await api('/gsp/audit-events?' + q.toString());
            verifications = await apiAll('/gsp/audit-verifications');
            await ensureUserLabelMap();
            render();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function renderEvents() {
        const tbody = document.getElementById('auBody');
        tbody.innerHTML = events.map(e => {
            const uLabel = entityUserLabel(e.entity_type, e.entity_id);
            const objText = uLabel
                ? `${zhEntity(e.entity_type)}：${esc(uLabel)}`
                : `${zhEntity(e.entity_type)}#${esc(e.entity_id)}`;
            return `
        <tr>
            <td>${e.id}</td>
            <td title="${esc(e.actor_username || '')}">${esc(e.actor_full_name || e.actor_username || e.actor_user_id)}</td>
            <td title="${esc(e.action)}">${badge(zhAction(e.action), 'info')}</td>
            <td class="text-xs" title="${esc(e.entity_type)}#${esc(e.entity_id)}">${objText}</td>
            <td style="white-space:normal;max-width:200px" class="text-xs">${esc(e.reason)}</td>
            <td class="text-xs" title="${esc(e.event_hash)}">${esc((e.event_hash || '').slice(0, 12))}…</td>
            <td>${fmtDT(e.occurred_at)}</td>
        </tr>`;
        }).join('') || '<tr><td colspan="7"><div class="empty-state">暂无审计事件</div></td></tr>';
    }

    async function verifyChain() {
        try {
            const r = await api('/gsp/audit-events/verify');
            lastVerify = r;   // 同步三态（有效/确认断裂/请求失败）并刷新顶部横幅，保证告警与最新校验结论一致
            render();
            const modal = openModal({
                title: '审计链校验结果', size: 'sm',
                body: `
                <div class="text-center p-4">
                    <div style="font-size:40px;color:${r.valid ? 'var(--green-500)' : 'var(--red-500)'}"><i class="fa ${r.valid ? 'fa-check-circle' : 'fa-times-circle'}"></i></div>
                    <div class="text-lg font-bold mt-2" style="color:${r.valid ? 'var(--green-600)' : 'var(--red-600)'}">${r.valid ? '审计链完整有效' : '审计链已断裂'}</div>
                    ${r.broken_event_id ? `<div class="text-sm text-gray-500 mt-1">断裂事件ID：${r.broken_event_id}</div>` : ''}
                </div>`,
            });
        } catch (e) {
            // 手动校验请求失败：同样按「暂时无法完成校验」呈现，且不得掩盖已确认的校验结论
            markRequestFailed(e);
            render();
            showToast(e.message, 'error');
        }
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

    window.PAGES = window.PAGES || {};
    window.PAGES['audit'] = {
        title: '审计追踪',
        icon: 'fa-shield',
        desc: '哈希链审计追踪与校验',
        init: pageInit,
        fn: {},
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 audit.html
})();
