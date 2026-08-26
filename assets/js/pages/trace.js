/* 批号追溯：全生命周期追溯（批次→库存→锁定→退货→召回→养护→盘点→不合格→审计）
 * SPA 模块：window.PAGES['trace'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '批号追溯';
    let _el = null;
    const content = () => _el;

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        render();
    }

    function render() {
        content().innerHTML = `
        <div class="card">
            <div class="card-header"><span class="card-title"><i class="fa fa-search mr-2" style="color:var(--primary)"></i>批号全生命周期追溯</span></div>
            <div class="card-body">
                <div class="flex gap-2 mb-4" style="max-width:520px">
                    <input id="trBatch" class="input-field" placeholder="输入批号，如 B20260801">
                    <button class="btn btn-primary" id="trBtn"><i class="fa fa-search"></i> 追溯</button>
                </div>
                <div id="trResult"></div>
            </div>
        </div>`;
        const btn = document.getElementById('trBtn');
        const input = document.getElementById('trBatch');
        const doTrace = async () => {
            const batchNo = input.value.trim();
            if (!batchNo) { showToast('请输入批号', 'warning'); return; }
            const box = document.getElementById('trResult');
            box.innerHTML = '<div class="text-center p-6"><span class="loading"></span></div>';
            try {
                const data = await api('/gsp/trace/batches/' + encodeURIComponent(batchNo));
                renderTrace(box, data);
            } catch (e) {
                box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`;
            }
        };
        btn.addEventListener('click', doTrace);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doTrace(); });
    }

    function renderTrace(box, data) {
        if (!data.length) { box.innerHTML = '<div class="empty-state">未找到该批号</div>'; return; }
        const html = data.map(b => {
            const batch = b.batch || {};
            const sections = [];
            sections.push(`
            <div class="detail-grid mb-3">
                <div class="kv"><span class="kv-label">批号</span><span class="font-medium">${esc(batch.batch_no)}</span></div>
                <div class="kv"><span class="kv-label">货物ID</span><span>${batch.goods_id}</span></div>
                <div class="kv"><span class="kv-label">生产/有效期</span><span>${fmtD(batch.production_date)} ~ ${fmtD(batch.expiry_date)}</span></div>
                <div class="kv"><span class="kv-label">供货方</span><span>${batch.supplier_id}</span></div>
                <div class="kv"><span class="kv-label">收货单号</span><span>${esc(batch.receipt_document_no)}</span></div>
                <div class="kv"><span class="kv-label">状态</span><span>${statusBadge(batch.status)}</span></div>
            </div>`);
            sections.push(`<div class="font-semibold text-sm mb-1">库存</div>${sectionTable(['仓库', '库位', '数量', '预留', '状态'], (b.stock || []).map(s => [s.warehouse_id, s.location_id, fmtNum(s.quantity), fmtNum(s.reserved_quantity), statusBadge(s.stock_status)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">质量锁定</div>${sectionTable(['原因代码', '原因', '状态', '发起时间'], (b.quality_holds || []).map(h => [badge(h.reason_code, 'warning'), esc(h.reason), statusBadge(h.status), fmtDT(h.initiated_at)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">销后退回明细</div>${sectionTable(['行', '退回数量', '合格', '拒收', '检验状态'], (b.sales_returns || []).map(i => [i.line_no, fmtNum(i.received_quantity), fmtNum(i.accepted_quantity), fmtNum(i.rejected_quantity), statusBadge(i.inspection_status)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">召回</div>${sectionTable(['召回ID', '批次数量', '回收数量'], (b.recalls || []).map(r => [r.recall_id, fmtNum(r.target_shipped_quantity), fmtNum(r.recovered_quantity)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">召回演练</div>${sectionTable(['演练ID', '发运数量'], (b.recall_drills || []).map(r => [r.drill_id, fmtNum(r.target_shipped_quantity)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">养护明细</div>${sectionTable(['计划行', '结果', '下次养护'], (b.maintenance_items || []).map(i => [i.id, esc(i.finding || '-'), fmtD(i.next_due_on)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">盘点明细</div>${sectionTable(['盘点行', '账面', '实盘', '差异'], (b.stocktake_items || []).map(i => [i.id, fmtNum(i.book_quantity), fmtNum(i.counted_quantity), fmtNum(i.difference_quantity)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">不合格品</div>${sectionTable(['记录号', '数量', '状态'], (b.nonconforming_records || []).map(r => [esc(r.record_no), fmtNum(r.quantity), statusBadge(r.status)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">购进退出</div>${sectionTable(['退出单', '数量', '状态'], (b.purchase_returns || []).map(r => [esc(r.return_no), fmtNum((r.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0)), statusBadge(r.status)]))}`);
            sections.push(`<div class="font-semibold text-sm mb-1">审计事件（${(b.audit_events || []).length}）</div>${sectionTable(['ID', '动作', '操作人', '原因', '时间'], (b.audit_events || []).map(e => [e.id, badge(e.action, 'info'), e.actor_user_id, esc((e.reason || '').slice(0, 40)), fmtDT(e.occurred_at)]))}`);
            return `<div class="card p-4 mb-4">${sections.join('')}</div>`;
        }).join('');
        box.innerHTML = html;
    }

    function sectionTable(headers, rows) {
        if (!rows.length) return '<div class="empty-state" style="padding:12px">无记录</div>';
        return `
        <div class="table-wrap mb-3"><table class="data-table">
            <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c === null || c === undefined ? '-' : c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['trace'] = {
        title: '批号追溯',
        icon: 'fa-search',
        desc: '批号全链路追溯',
        init: pageInit,
        fn: {},
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 trace.html
})();
