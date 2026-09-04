/* 老 GSP 历史归档：受控迁移、独立核对和只读检索。 */
(function () {
    'use strict';
    window.PAGE_TITLE = '老 GSP 历史归档';
    let _el = null;
    let batches = [];
    let records = [];
    const content = () => _el;
    const canPrepare = () => currentGspRoles.has('SYSTEM_ADMIN') || currentGspRoles.has('QUALITY_MANAGER');
    const canValidate = () => ['QUALITY_MANAGER', 'QUALITY_REVIEWER', 'AUDITOR'].some(r => currentGspRoles.has(r));
    const canReconcile = () => currentGspRoles.has('QUALITY_REVIEWER') || currentGspRoles.has('AUDITOR');

    async function pageInit(el) {
        _el = el || document.getElementById('pageContent');
        await loadBatches();
    }

    async function loadBatches() {
        content().innerHTML = '<div class="card p-6 text-center"><span class="loading"></span></div>';
        try {
            batches = await apiAll('/gsp/legacy-archive/batches');
            render();
        } catch (e) { content().innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
    }

    function render() {
        content().innerHTML = `
            <div class="alert alert-info mb-3"><i class="fa fa-archive mr-2"></i>历史数据仅以批准的映射清洗后归档。只有独立核对通过的批次可检索和导出；归档原始记录不可修改或删除。</div>
            <div class="card mb-3"><div class="card-header"><span class="card-title">迁移与核对批次</span>${canPrepare() ? '<button class="btn btn-primary" id="newBatch">新建迁移批次</button>' : ''}</div><div class="card-body p-0 table-wrap"><table class="data-table"><thead><tr><th>批次</th><th>来源</th><th>映射</th><th>预期/导入/重复</th><th>汇总摘要</th><th>保留至</th><th>状态</th><th class="actions">操作</th></tr></thead><tbody>${batches.map(b => `<tr><td>${esc(b.batch_no)}</td><td>${esc(b.source_system)}<br><small>${esc(b.source_instance)}</small></td><td>${esc(b.mapping_version)}</td><td>${b.expected_record_count}/${b.imported_record_count}/${b.duplicate_record_count}</td><td><code>${esc((b.aggregate_sha256 || '-').slice(0, 12))}</code></td><td>${fmtD(b.retention_until)}</td><td>${statusBadge(b.status)}</td><td class="actions">${b.status === 'DRAFT' && canValidate() ? `<button class="btn btn-link btn-sm" onclick="PG('legacy-archive').validateBatch(${b.id})">独立验证</button>` : ''}${['VALIDATED','IMPORTED'].includes(b.status) && canPrepare() ? `<button class="btn btn-link btn-sm" onclick="PG('legacy-archive').importFile(${b.id})">导入 JSON</button>` : ''}${b.status === 'IMPORTED' && canReconcile() ? `<button class="btn btn-link btn-sm" onclick="PG('legacy-archive').reconcile(${b.id})">独立核对</button>` : ''}${b.status === 'RECONCILED' ? `<button class="btn btn-link btn-sm" onclick="PG('legacy-archive').searchBatch(${b.id})">查询</button><button class="btn btn-link btn-sm" onclick="PG('legacy-archive').exportBatch(${b.id}, '${esc(b.batch_no)}')">导出</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无历史迁移批次</div></td></tr>'}</tbody></table></div></div>
            <div class="card"><div class="card-header"><span class="card-title">只读历史记录</span><div><input id="archiveSearch" class="input-field" style="display:inline-block;width:220px" placeholder="编号、标题或关键词"><button class="btn btn-secondary ml-2" id="searchAll">检索</button><button class="btn btn-secondary ml-2" onclick="window.print()">打印</button></div></div><div id="archiveRecords" class="card-body"><div class="empty-state">请选择已核对批次，或输入关键词检索</div></div></div>`;
        const newBtn = content().querySelector('#newBatch');
        if (newBtn) newBtn.addEventListener('click', newBatch);
        content().querySelector('#searchAll').addEventListener('click', () => searchBatch(null));
    }

    function newBatch() {
        const modal = openModal({ title: '新建老 GSP 迁移批次', size: 'lg', body: `<div class="form-row"><div class="form-group"><label class="form-label">批次号 *</label><input id="lbNo" class="input-field"></div><div class="form-group"><label class="form-label">来源系统 *</label><input id="lbSystem" class="input-field" value="OLD_GSP"></div></div><div class="form-row"><div class="form-group"><label class="form-label">来源实例/导出时点 *</label><input id="lbInstance" class="input-field"></div><div class="form-group"><label class="form-label">预期记录数 *</label><input type="number" min="0" id="lbCount" class="input-field"></div></div><div class="form-row"><div class="form-group"><label class="form-label">清单版本 *</label><input id="lbManifest" class="input-field" value="1.0"></div><div class="form-group"><label class="form-label">映射版本 *</label><input id="lbMapping" class="input-field"></div></div><div class="form-group"><label class="form-label">完整源包 SHA-256 *</label><input id="lbHash" class="input-field" maxlength="64"></div><div class="form-row"><div class="form-group"><label class="form-label">保留期限 *</label><input type="date" id="lbRetention" class="input-field"></div><div class="form-group"><label class="form-label">建批原因 *</label><textarea id="lbReason" class="input-field"></textarea></div></div>`, footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="lbSubmit">建立批次</button>' });
        modal.querySelector('#lbSubmit').addEventListener('click', async () => {
            const body = { batch_no: modal.querySelector('#lbNo').value.trim(), source_system: modal.querySelector('#lbSystem').value.trim(), source_instance: modal.querySelector('#lbInstance').value.trim(), manifest_version: modal.querySelector('#lbManifest').value.trim(), mapping_version: modal.querySelector('#lbMapping').value.trim(), package_sha256: modal.querySelector('#lbHash').value.trim().toLowerCase(), retention_until: modal.querySelector('#lbRetention').value, expected_record_count: Number(modal.querySelector('#lbCount').value), reason: modal.querySelector('#lbReason').value.trim() };
            if (!body.batch_no || !body.source_system || !body.source_instance || !body.mapping_version || !/^[0-9a-f]{64}$/.test(body.package_sha256) || !body.retention_until || body.expected_record_count < 1 || body.reason.length < 3) return showToast('请完整填写记录数并校验 SHA-256', 'warning');
            try { await api('/gsp/legacy-archive/batches', { method: 'POST', body }); closeModal(modal); showToast('迁移批次已建立，等待独立验证', 'success'); await loadBatches(); } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function validateBatch(id) { reasonModal('独立验证迁移批次', async reason => api(`/gsp/legacy-archive/batches/${id}/validate`, { method: 'POST', body: { reason } }), '映射和清洗规则已验证'); }

    function reasonModal(title, action, success) {
        const modal = openModal({ title, size: 'sm', body: '<div class="form-group"><label class="form-label">受控操作原因 *</label><textarea id="archiveReason" class="input-field"></textarea></div>', footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="archiveConfirm">确认</button>' });
        modal.querySelector('#archiveConfirm').addEventListener('click', async () => { const reason = modal.querySelector('#archiveReason').value.trim(); if (reason.length < 3) return showToast('原因不能少于3个字', 'warning'); try { await action(reason); closeModal(modal); showToast(success, 'success'); await loadBatches(); } catch (e) { showToast(e.message, 'error'); } });
    }

    function importFile(id) {
        const modal = openModal({ title: '导入已映射历史记录', size: 'md', body: '<div class="alert alert-warning mb-3">文件应为记录数组，或包含 records 数组；每条 payload 必须带规范 JSON 的 SHA-256。</div><div class="form-group"><label class="form-label">JSON 文件 *</label><input type="file" accept="application/json,.json" id="legacyFile" class="input-field"></div><div class="form-group"><label class="form-label">导入原因 *</label><textarea id="legacyImportReason" class="input-field"></textarea></div>', footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="legacyImport">校验并导入</button>' });
        modal.querySelector('#legacyImport').addEventListener('click', async () => { const file = modal.querySelector('#legacyFile').files[0]; const reason = modal.querySelector('#legacyImportReason').value.trim(); if (!file || reason.length < 3) return showToast('请选择文件并填写导入原因', 'warning'); try { const parsed = JSON.parse(await file.text()); const rows = Array.isArray(parsed) ? parsed : parsed.records; if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('单次文件必须包含 1-500 条记录'); const result = await api(`/gsp/legacy-archive/batches/${id}/records`, { method: 'POST', body: { records: rows, reason } }); closeModal(modal); showToast(`导入 ${result.inserted} 条，重复 ${result.duplicates} 条`, 'success'); await loadBatches(); } catch (e) { showToast(e.message, 'error'); } });
    }

    function reconcile(id) {
        const modal = openModal({ title: '独立核对迁移批次', size: 'md', body: '<div class="form-group"><label class="form-label">按类别预期数量 JSON *</label><textarea id="lrCounts" class="input-field" placeholder=\'{"MASTER_DATA":100,"INVENTORY_BATCH":50}\'></textarea></div><div class="form-group"><label class="form-label">核对证据引用 *</label><input id="lrEvidence" class="input-field"></div><div class="form-group"><label class="form-label">核对原因 *</label><textarea id="lrReason" class="input-field"></textarea></div>', footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="lrSubmit">核对并封存</button>' });
        modal.querySelector('#lrSubmit').addEventListener('click', async () => { try { const body = { expected_by_entity: JSON.parse(modal.querySelector('#lrCounts').value), evidence_ref: modal.querySelector('#lrEvidence').value.trim(), reason: modal.querySelector('#lrReason').value.trim() }; if (body.evidence_ref.length < 3 || body.reason.length < 3) throw new Error('请填写证据引用和核对原因'); await api(`/gsp/legacy-archive/batches/${id}/reconcile`, { method: 'POST', body }); closeModal(modal); showToast('数量核对通过，批次已只读封存', 'success'); await loadBatches(); } catch (e) { showToast(e.message, 'error'); } });
    }

    async function searchBatch(id) {
        const q = content().querySelector('#archiveSearch').value.trim();
        const params = new URLSearchParams(); if (id) params.set('batch_id', id); if (q) params.set('q', q);
        try { records = await apiAll(`/gsp/legacy-archive/records?${params}`); content().querySelector('#archiveRecords').innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>类别</th><th>来源键</th><th>业务日期</th><th>标题</th><th>内容摘要</th><th>归档哈希</th></tr></thead><tbody>${records.map(r => `<tr><td>${esc(r.source_entity)}</td><td>${esc(r.source_table)}/${esc(r.source_key)}</td><td>${fmtD(r.business_date)}</td><td>${esc(r.title)}<br><small>${esc(r.search_text)}</small></td><td><pre style="max-width:420px;white-space:pre-wrap">${esc(JSON.stringify(r.payload, null, 2))}</pre></td><td><code>${esc(r.record_hash)}</code></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">未找到匹配记录</div></td></tr>'}</tbody></table></div>`; } catch (e) { showToast(e.message, 'error'); }
    }

    async function exportBatch(id, batchNo) {
        try { const res = await fetch(`${API_BASE_URL}/gsp/legacy-archive/batches/${id}/export`, { headers: getAuthHeaders() }); if (!res.ok) { let detail; try { detail = await res.json(); } catch (_) { detail = null; } throw new Error(extractDetailMessage(detail)); } const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `${batchNo}.jsonl`; a.click(); URL.revokeObjectURL(url); } catch (e) { showToast(e.message, 'error'); }
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['legacy-archive'] = { title: '老 GSP 历史归档', icon: 'fa-archive', desc: '受控迁移、独立核对和只读检索历史数据', init: pageInit, fn: { validateBatch, importFile, reconcile, searchBatch, exportBatch } };
})();
