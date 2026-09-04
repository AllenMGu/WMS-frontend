/* 我的质量任务：所有有效 GSP 岗位仅查看并处理本人 CAPA 与培训记录。 */
(function () {
    'use strict';
    window.PAGE_TITLE = '我的质量任务';
    let _el = null;
    let records = [];
    let capas = [];
    const content = () => _el;

    async function pageInit(el) {
        _el = el || document.getElementById('pageContent');
        await load();
    }

    async function load() {
        content().innerHTML = '<div class="card p-6 text-center"><span class="loading"></span></div>';
        try {
            [capas, records] = await Promise.all([
                apiAll('/gsp/quality-system/capas/me'),
                apiAll('/gsp/quality-system/training/me'),
            ]);
            render();
        } catch (e) {
            content().innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
        }
    }

    function render() {
        content().innerHTML = `
            <div class="alert alert-info mb-3"><i class="fa fa-user mr-2"></i>这里只显示当前账号本人负责的 CAPA、培训和岗位考核；本人提交完成证据后由质量人员独立复核。</div>
            <div class="card mb-3">
                <div class="card-header"><span class="card-title"><i class="fa fa-tasks mr-2" style="color:var(--primary)"></i>我的 CAPA</span></div>
                <div class="card-body p-0 table-wrap">
                    <table class="data-table"><thead><tr><th>编号</th><th>来源</th><th>类型</th><th>措施</th><th>期限</th><th>完成证据</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${capas.map(c => `<tr><td>${esc(c.action_no)}</td><td>${c.event_id ? `事件#${c.event_id}` : `风险#${c.risk_id}`}</td><td>${esc(c.action_type)}</td><td>${esc(c.description)}</td><td>${fmtD(c.due_date)}</td><td>${esc(c.completion_evidence_ref || '-')}</td><td>${statusBadge(c.status)}</td><td class="actions">${c.status === 'OPEN' ? `<button class="btn btn-link btn-sm" onclick="PG('my-training').implementCapa(${c.id})"><i class="fa fa-check"></i> 提交完成证据</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无本人 CAPA</div></td></tr>'}</tbody></table>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><span class="card-title"><i class="fa fa-graduation-cap mr-2" style="color:var(--primary)"></i>我的培训与岗位考核</span></div>
                <div class="card-body p-0 table-wrap">
                    <table class="data-table"><thead><tr><th>编号</th><th>主题</th><th>类型</th><th>依据</th><th>计划日期</th><th>成绩</th><th>结果</th><th>有效期</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${records.map(t => `<tr><td>${esc(t.training_no)}</td><td>${esc(t.subject)}</td><td>${esc(t.training_type)}</td><td>${esc(t.requirement_ref)}</td><td>${fmtD(t.planned_date)}</td><td>${t.score ?? '-'}</td><td>${esc(t.result || '-')}</td><td>${fmtD(t.valid_to)}</td><td>${statusBadge(t.status)}</td><td class="actions">${t.status === 'PLANNED' ? `<button class="btn btn-link btn-sm" onclick="PG('my-training').completeTraining(${t.id})"><i class="fa fa-check"></i> 本人确认</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="10"><div class="empty-state">暂无本人培训记录</div></td></tr>'}</tbody></table>
                </div>
            </div>`;
    }

    function implementCapa(id) {
        const record = capas.find(item => item.id === id);
        if (!record || record.status !== 'OPEN') return;
        const modal = openModal({
            title: '提交 CAPA 完成证据', size: 'sm',
            body: `<div class="alert alert-info mb-3">${esc(record.action_no)} · ${esc(record.description)}</div><div class="form-group"><label class="form-label">完成证据引用 *</label><input id="capaEvidence" class="input-field" placeholder="受控文件路径、记录编号或附件引用"></div><div class="form-group"><label class="form-label">实施说明 *</label><textarea id="capaReason" class="input-field"></textarea></div>`,
            footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="capaSubmit">提交质量复核</button>',
        });
        modal.querySelector('#capaSubmit').addEventListener('click', async () => {
            const body = {
                completion_evidence_ref: modal.querySelector('#capaEvidence').value.trim(),
                reason: modal.querySelector('#capaReason').value.trim(),
            };
            if (body.completion_evidence_ref.length < 3 || body.reason.length < 3) {
                showToast('请填写完成证据和实施说明', 'warning'); return;
            }
            try {
                await api(`/gsp/quality-system/capas/${id}/implement`, { method: 'POST', body });
                closeModal(modal);
                showToast('CAPA 完成证据已提交，等待独立有效性验证', 'success');
                await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function completeTraining(id) {
        const record = records.find(item => item.id === id);
        if (!record || record.status !== 'PLANNED') return;
        const needsScore = ['ASSESSMENT', 'JOB_QUALIFICATION', 'JOB_ASSESSMENT'].includes(record.training_type);
        const modal = openModal({
            title: '本人确认培训完成', size: 'md',
            body: `<div class="alert alert-info mb-3">${esc(record.subject)}</div><div class="form-row"><div class="form-group"><label class="form-label">培训师 *</label><input id="tcTrainer" class="input-field"></div><div class="form-group"><label class="form-label">完成日期 *</label><input type="date" id="tcDate" class="input-field" value="${todayISO()}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">成绩${needsScore ? ' *' : ''}</label><input type="number" min="0" max="100" id="tcScore" class="input-field"></div><div class="form-group"><label class="form-label">结果 *</label><select id="tcResult" class="input-field">${needsScore ? '<option>PASSED</option><option>FAILED</option>' : '<option>ATTENDED</option><option>PASSED</option><option>FAILED</option>'}</select></div></div><div class="form-row"><div class="form-group"><label class="form-label">证据引用 *</label><input id="tcRef" class="input-field"></div><div class="form-group"><label class="form-label">有效期</label><input type="date" id="tcValid" class="input-field"></div></div><div class="form-group"><label class="form-label">确认原因 *</label><textarea id="tcReason" class="input-field"></textarea></div>`,
            footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="tcSubmit">本人确认</button>',
        });
        modal.querySelector('#tcSubmit').addEventListener('click', async () => {
            const scoreText = modal.querySelector('#tcScore').value;
            const body = {
                trainer: modal.querySelector('#tcTrainer').value.trim(),
                completed_on: modal.querySelector('#tcDate').value,
                score: scoreText === '' ? null : Number(scoreText),
                result: modal.querySelector('#tcResult').value,
                evidence_ref: modal.querySelector('#tcRef').value.trim(),
                valid_to: modal.querySelector('#tcValid').value || null,
                reason: modal.querySelector('#tcReason').value.trim(),
            };
            if (!body.trainer || !body.completed_on || !body.evidence_ref || body.reason.length < 3 || (needsScore && body.score === null)) {
                showToast('请完整填写本人培训确认信息', 'warning'); return;
            }
            try {
                await api(`/gsp/quality-system/training/${id}/complete`, { method: 'POST', body });
                closeModal(modal);
                showToast('培训完成信息已提交，等待质量复核', 'success');
                await load();
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['my-training'] = {
        title: '我的质量任务', icon: 'fa-tasks', desc: '处理本人 CAPA、培训与岗位考核', init: pageInit,
        fn: { implementCapa, completeTraining },
    };
})();
