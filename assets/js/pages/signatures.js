/* 电子签名台账：签名链列表 / 单条核验 / 全链核验 / 签名策略
 * SPA 模块：window.PAGES['signatures'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '电子签名台账';
    let _el = null;
    const content = () => _el;
    let signatures = [];

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        render();
        await load();
    }

    function render() {
        content().innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-pencil-square-o mr-2" style="color:var(--primary)"></i>电子签名记录（密码核验 + 哈希链）</span>
                <div class="flex gap-2">
                    <button class="btn btn-secondary btn-sm" id="sgChainBtn"><i class="fa fa-link"></i> 全链核验</button>
                    <button class="btn btn-primary btn-sm" id="sgPolicyBtn"><i class="fa fa-list"></i> 签名策略</button>
                </div>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>签名引用</th><th>签署人</th><th>动作</th><th>对象</th><th>含义</th><th>核验方式</th><th>签署时间</th><th>哈希</th><th class="actions">操作</th></tr></thead>
                    <tbody id="sgBody"></tbody>
                </table>
            </div>
        </div>`;
        document.getElementById('sgChainBtn').addEventListener('click', verifyChain);
        document.getElementById('sgPolicyBtn').addEventListener('click', showPolicies);
    }

    async function load() {
        try {
            signatures = await apiAll('/gsp/electronic-signatures');
            renderTable();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function renderTable() {
        const tbody = document.getElementById('sgBody');
        tbody.innerHTML = signatures.map(s => `
        <tr>
            <td class="font-medium text-xs">${esc(s.signature_ref)}</td>
            <td>${esc(s.signer_full_name || s.signer_username)}</td>
            <td>${badge(s.action, 'info')}</td>
            <td class="text-xs">${esc(s.entity_type)}#${esc(s.entity_id)}</td>
            <td>${badge({ APPROVAL: '批准', REVIEW: '复核', RELEASE: '解除', CONFIRMATION: '确认', RESPONSIBILITY: '责任认定' }[s.meaning] || s.meaning, 'purple')}</td>
            <td>${esc(s.authentication_method)}</td>
            <td>${fmtDT(s.signed_at)}</td>
            <td class="text-xs" title="${esc(s.signature_hash)}">${esc((s.signature_hash || '').slice(0, 10))}…</td>
            <td class="actions"><button class="btn btn-link btn-sm" onclick="PG('signatures').verifyOne('${esc(s.signature_ref)}')"><i class="fa fa-check-circle"></i> 核验</button></td>
        </tr>`).join('') || '<tr><td colspan="9"><div class="empty-state">暂无电子签名记录</div></td></tr>';
    }

    async function verifyOne(ref) {
        try {
            const r = await api(`/gsp/electronic-signatures/${encodeURIComponent(ref)}/verify`);
            showToast(r.valid ? `签名 ${ref} 有效` : `签名 ${ref} 无效！`, r.valid ? 'success' : 'error');
        } catch (e) { showToast(e.message, 'error'); }
    }
    async function verifyChain() {
        try {
            const r = await api('/gsp/electronic-signatures/verify-chain/all');
            const modal = openModal({
                title: '电子签名链核验结果', size: 'sm',
                body: `
                <div class="text-center p-4">
                    <div style="font-size:40px;color:${r.valid ? 'var(--green-500)' : 'var(--red-500)'}"><i class="fa ${r.valid ? 'fa-check-circle' : 'fa-times-circle'}"></i></div>
                    <div class="text-lg font-bold mt-2" style="color:${r.valid ? 'var(--green-600)' : 'var(--red-600)'}">${r.valid ? '签名链完整有效' : '签名链已断裂'}</div>
                    <div class="text-sm text-gray-500 mt-1">检查签名数：${r.checked_signature_count}${r.broken_signature_id ? `，断裂签名ID：${r.broken_signature_id}` : ''}</div>
                </div>`,
            });
        } catch (e) { showToast(e.message, 'error'); }
    }
    async function showPolicies() {
        try {
            const policies = await apiAll('/gsp/electronic-signatures/policies');
            openModal({
                title: `电子签名策略（${policies.length} 项）`, size: 'lg',
                body: `
                <div class="table-wrap"><table class="data-table">
                    <thead><tr><th>动作</th><th>对象类型</th><th>含义</th></tr></thead>
                    <tbody>${policies.map(p => `<tr><td class="font-medium">${esc(p.action)}</td><td>${esc(p.entity_type)}</td><td>${esc(p.meaning)}</td></tr>`).join('')}</tbody>
                </table></div>`,
            });
        } catch (e) { showToast(e.message, 'error'); }
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['signatures'] = {
        title: '电子签名台账',
        icon: 'fa-pencil-square-o',
        desc: '电子签名台账与验签',
        init: pageInit,
        fn: { verifyOne },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 signatures.html
})();
