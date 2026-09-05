/* 业务报表中心：目录 → 查询分页 → 受控打印/开发预览 → 打印台账与校验
 * SPA 模块：window.PAGES['reports'] */
(function () {
    'use strict';
    window.PAGE_TITLE = '业务报表';
    let _el = null;
    const content = () => _el;
    let catalog = [];
    let current = null;   // {key,title,production_ready,columns}
    let page = { rows: [], rowKeys: [], total: 0, offset: 0, limit: 20, hasMore: false };
    const PAGE_SIZE = 20;
    let printsPage = { offset: 0, limit: 20, total: 0, hasMore: false };

    async function pageInit(el) { _el = el || document.getElementById('pageContent'); await listReports(); }

    function escV(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function listReports() {
        catalog = await api('/gsp/reports');
        content().innerHTML = `
        <div class="alert alert-info mb-3"><i class="fa fa-print mr-2"></i>业务报表：正式台账（含电子签名/审计）与开发预览；受控打印件可追溯、可校验哈希。</div>
        <div class="grid grid-2 gap-4" id="rptCards"></div>
        <div class="card mt-4"><div class="card-header"><span class="card-title"><i class="fa fa-history mr-2"></i>打印记录台账（正式受控 / 开发预览）</span>
            <div class="flex items-center gap-2"><span class="text-xs text-gray-500" id="rptPrintsSum"></span>
            <button type="button" class="btn btn-secondary btn-sm" id="rptPrv">上一页</button>
            <button type="button" class="btn btn-secondary btn-sm" id="rptNext">下一页</button></div></div>
          <div class="card-body p-0 table-wrap"><table class="data-table" data-no-pagination="true"><thead><tr><th>编号</th><th>状态</th><th>报表</th><th>行数/总数</th><th>说明</th><th>操作</th></tr></thead>
          <tbody id="rptPrints"></tbody></table></div></div>`;
        const holder = content().querySelector('#rptCards');
        holder.innerHTML = catalog.map(r => `
            <div class="card">
              <div class="card-header"><span class="card-title"><i class="fa fa-file-text-o mr-2"></i>${escV(r.title)}</span>
                ${r.production_ready ? '<span class="badge badge-success">正式</span>' : '<span class="badge badge-warning">开发预览</span>'}
              </div>
              <div class="card-body">
                <div class="text-sm" style="color:var(--gray-400)">${escV(r.desc)}</div>
                <div class="mt-2 flex gap-2">
                  <button type="button" class="btn btn-primary btn-sm" data-open="${r.key}"><i class="fa fa-search"></i> 查询</button>
                  ${r.production_ready ? '' : '<span class="text-xs" style="color:var(--gray-400)">打印需显式 preview=true</span>'}
                </div>
              </div>
            </div>`).join('');
        holder.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openReport(b.dataset.open)));
        await loadPrints();
    }

    async function openReport(key) {
        current = catalog.find(r => r.key === key);
        page = { rows: [], rowKeys: [], total: 0, offset: 0, limit: PAGE_SIZE, hasMore: false };
        content().innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div><span class="page-title-inline text-lg font-bold">${escV(current.title)}</span>
            ${current.production_ready ? '<span class="badge badge-success ml-2">正式</span>' : '<span class="badge badge-warning ml-2">开发预览</span>'}</div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" id="rbBack"><i class="fa fa-arrow-left"></i> 返回目录</button>
            ${current.production_ready ? '<button class="btn btn-primary btn-sm" id="rbPrint"><i class="fa fa-print"></i> 受控打印</button>'
                                       : '<button class="btn btn-warning btn-sm" id="rbPreview"><i class="fa fa-flask"></i> 生成开发预览件</button>'}
          </div>
        </div>
        <div class="card"><div class="card-body p-0 table-wrap">
          <table class="data-table" data-no-pagination="true"><thead id="rbHead"></thead><tbody id="rbBody"></tbody></table>
        </div></div>
        <div class="filter-bar justify-between p-2">
          <span class="text-xs text-gray-500" id="rbSummary"></span>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" id="rbPrev" disabled>上一页</button>
            <button class="btn btn-secondary btn-sm" id="rbNext" disabled>下一页</button>
          </div>
        </div>`;
        content().querySelector('#rbBack').addEventListener('click', listReports);
        const bp = content().querySelector('#rbPrint');
        if (bp) bp.addEventListener('click', () => promptPrint(false));
        const pv = content().querySelector('#rbPreview');
        if (pv) pv.addEventListener('click', () => promptPrint(true));
        content().querySelector('#rbPrev').addEventListener('click', () => { page.offset = Math.max(0, page.offset - PAGE_SIZE); return loadRows(); });
        content().querySelector('#rbNext').addEventListener('click', () => { if (page.hasMore) { page.offset += PAGE_SIZE; return loadRows(); } });
        return loadRows();
    }

    async function loadRows() {
        const data = await api(`/gsp/reports/${current.key}?limit=${page.limit}&offset=${page.offset}`);
        page.rows = data.rows;
        page.total = data.total;
        page.hasMore = data.has_more;
        const head = content().querySelector('#rbHead');
        head.innerHTML = '<tr>' + data.columns.map(c => `<th>${escV(c)}</th>`).join('') + '</tr>';
        const body = content().querySelector('#rbBody');
        body.innerHTML = data.rows.length ? data.rows.map(r =>
            '<tr>' + data.row_keys.map(k => `<td class="text-xs">${escV(r[k])}</td>`).join('') + '</tr>'
        ).join('') : '<tr><td colspan="99" class="empty-state">暂无数据</td></tr>';
        const s = content().querySelector('#rbSummary');
        if (s) s.textContent = `共 ${page.total} 行 · 第 ${page.offset + 1}–${page.offset + data.rows.length} 行`;
        content().querySelector('#rbPrev').disabled = page.offset <= 0;
        content().querySelector('#rbNext').disabled = !page.hasMore;
        // keep the nav actions attached
        return openReportAttach();
    }

    function openReportAttach() {
        return true;
    }

    function promptPrint(preview) {
        const modal = openModal({
            title: preview ? '生成开发预览件（非受控）' : '受控打印',
            size: 'sm',
            body: `
            <div class="form-group"><label class="form-label">${preview ? '验证原因' : '打印原因'} *（≥3字，写入审计）</label>
              <textarea id="rpReason" class="input-field" rows="3"></textarea></div>
            ${preview ? '<div class="alert alert-warning">将生成 PREVIEW- 编号的非受控预览件（含每页水印），禁止归档为正式记录。</div>' : ''}
            <label class="checkbox-label"><input type="checkbox" id="rpCover" class="checkbox"> 覆盖全部匹配记录（cover_all；超 10000 行将拒绝）</label>`,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="rpGo">生成</button>`,
        });
        modal.querySelector('#rpGo').addEventListener('click', async () => {
            const reason = modal.querySelector('#rpReason').value.trim();
            if (reason.length < 3) { showToast('原因不能少于3个字', 'warning'); return; }
            const body = { reason, limit: page.limit, offset: page.offset, preview };
            if (modal.querySelector('#rpCover').checked) body.cover_all = true;
            try {
                const res = await api(`/gsp/reports/${current.key}/print`, { method: 'POST', body });
                closeModal(modal);
                showPreviewPrint(res);
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function showPreviewPrint(res) {
        const preview = String(res.copy_no || '').startsWith('PREVIEW-');
        const modal = openModal({ title: `${preview ? '开发预览件' : '受控打印件'} ${res.copy_no}`, size: 'lg',
            body: `<div class="text-xs text-gray-500 mb-2">内容哈希 ${res.content_hash}</div>
                   <iframe id="rpIframe" style="width:100%;height:60vh;border:1px solid #ccc"></iframe>`,
            footer: `<button class="btn btn-secondary" data-close>关闭</button>
                     <button class="btn btn-primary" id="rpPrint"><i class="fa fa-print"></i> 打印</button>
                     <button class="btn btn-secondary" id="rpVerify">校验哈希</button>` });
        modal.querySelector('#rpIframe').srcdoc = res.html;
        modal.querySelector('#rpPrint').addEventListener('click', () => {
            const w = window.open('', '_blank');
            if (w) { w.document.write(res.html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); }
        });
        modal.querySelector('#rpVerify').addEventListener('click', async () => {
            try {
                const v = await api(`/gsp/reports/prints/${res.print_id}/verify`, { method: 'POST', body: {} });
                showToast(v.valid ? (preview ? '校验通过：预览记录内容与后端快照一致' : '校验通过：内容与受控记录一致') : (preview ? '校验失败：预览记录与快照不符' : '校验失败：内容与记录不符'), v.valid ? 'success' : 'error');
            } catch (e) { showToast(e.message, 'error'); }
        });
        setTimeout(() => loadPrints(), 300);
    }

    async function loadPrints(reset = true) {
        const body = content().querySelector('#rptPrints');
        if (!body) return;
        if (reset) printsPage.offset = 0;
        try {
            const data = await api(`/gsp/reports/prints/list?limit=${printsPage.limit}&offset=${printsPage.offset}`);
            printsPage.total = data.total;
            printsPage.hasMore = data.has_more;
            body.innerHTML = data.items.length ? data.items.map(p => `
              <tr>
                <td class="text-xs">${escV(p.copy_no)}</td>
                <td>${p.status === 'PREVIEW' ? '<span class="badge badge-warning">预览</span>' : '<span class="badge badge-success">受控</span>'}</td>
                <td class="text-xs">${escV((p.snapshot && p.snapshot.title) || p.document_type)}</td>
                <td class="text-xs">${p.snapshot ? `${p.snapshot.count}/${p.snapshot.total}${p.snapshot.truncated ? '（截断）' : ''}` : '-'}</td>
                <td class="text-xs" style="max-width:220px">${escV(p.purpose)}</td>
                <td><button class="btn btn-link btn-sm" data-fetch="${p.id}">取回</button><button class="btn btn-link btn-sm" data-verify="${p.id}">校验</button></td>
              </tr>`).join('')
              : '<tr><td colspan="6" class="empty-state">暂无打印记录</td></tr>';
            const sum = content().querySelector('#rptPrintsSum');
            if (sum) sum.textContent = `共 ${printsPage.total} 条`;
            const prv = content().querySelector('#rptPrv');
            const nxt = content().querySelector('#rptNext');
            if (prv) { prv.disabled = printsPage.offset <= 0; prv.onclick = () => { printsPage.offset = Math.max(0, printsPage.offset - printsPage.limit); return loadPrints(false); }; }
            if (nxt) { nxt.disabled = !printsPage.hasMore; nxt.onclick = () => { printsPage.offset += printsPage.limit; return loadPrints(false); }; }
            body.querySelectorAll('[data-fetch]').forEach(b => b.addEventListener('click', async () => {
                const rec = await api(`/gsp/reports/prints/${b.dataset.fetch}`);
                showPreviewPrint(rec);
            }));
            body.querySelectorAll('[data-verify]').forEach(b => b.addEventListener('click', async () => {
                const rec = await api(`/gsp/reports/prints/${b.dataset.verify}`);
                const v = await api(`/gsp/reports/prints/${b.dataset.verify}/verify`, { method: 'POST', body: {} });
                const preview = String(rec.copy_no || '').startsWith('PREVIEW-');
                showToast(v.valid ? (preview ? '校验通过：预览记录与快照一致' : '校验通过') : '校验失败', v.valid ? 'success' : 'error');
            }));
        } catch (e) { body.innerHTML = '<tr><td colspan="6" class="empty-state">加载失败</td></tr>'; }
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['reports'] = { title: '业务报表', icon: 'fa-print', desc: '业务报表、受控打印与校验', init: pageInit, fn: {} };
    window.pageInit = pageInit;
})();
