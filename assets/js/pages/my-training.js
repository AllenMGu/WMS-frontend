/* 本人培训：所有有效 GSP 岗位仅查看并确认自己的培训/岗位考核记录。 */
(function () {
    'use strict';
    window.PAGE_TITLE = '我的培训';
    let _el = null;
    let records = [];
    const content = () => _el;

    async function pageInit(el) {
        _el = el || document.getElementById('pageContent');
        await load();
    }

    async function load() {
        content().innerHTML = '<div class="card p-6 text-center"><span class="loading"></span></div>';
        try {
            records = await api('/gsp/quality-system/training/me');
            render();
        } catch (e) {
            content().innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
        }
    }

    function render() {
        content().innerHTML = `
            <div class="alert alert-info mb-3"><i class="fa fa-user mr-2"></i>这里只显示当前账号本人的培训和岗位考核记录；完成确认后由质量人员独立复核。</div>
            <div class="card">
                <div class="card-header"><span class="card-title"><i class="fa fa-graduation-cap mr-2" style="color:var(--primary)"></i>我的培训与岗位考核</span></div>
                <div class="card-body p-0 table-wrap">
                    <table class="data-table"><thead><tr><th>编号</th><th>主题</th><th>类型</th><th>依据</th><th>计划日期</th><th>成绩</th><th>结果</th><th>有效期</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${records.map(t => `<tr><td>${esc(t.training_no)}</td><td>${esc(t.subject)}</td><td>${esc(t.training_type)}</td><td>${esc(t.requirement_ref)}</td><td>${fmtD(t.planned_date)}</td><td>${t.score ?? '-'}</td><td>${esc(t.result || '-')}</td><td>${fmtD(t.valid_to)}</td><td>${statusBadge(t.status)}</td><td class="actions">${t.status === 'PLANNED' ? `<button class="btn btn-link btn-sm" onclick="PG('my-training').completeTraining(${t.id})"><i class="fa fa-check"></i> 本人确认</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="10"><div class="empty-state">暂无本人培训记录</div></td></tr>'}</tbody></table>
                </div>
            </div>`;
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
        title: '我的培训', icon: 'fa-graduation-cap', desc: '查看并确认本人培训与岗位考核', init: pageInit,
        fn: { completeTraining },
    };
})();
