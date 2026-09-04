/* 合作方管理：建档 / 审批 / 资质文件 / 暂停
 * SPA 模块：window.PAGES['partners'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '合作方管理';
    let _el = null;
    const content = () => _el;
    let partners = [];
    let goodsList = [];
    let productProfiles = [];
    let authorizationAlerts = [];
    let authorizationWarningDays = 30;
    let currentFilter = { partner_type: '', status: '' };

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        render();
        await load();
    }

    function render() {
        content().innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-handshake-o mr-2" style="color:var(--primary)"></i>合作方（供货方 / 购货方）资质台账</span>
                <button class="btn btn-primary" id="newPartnerBtn"><i class="fa fa-plus"></i> 新建合作方</button>
            </div>
            <div class="card-body">
                <div id="supplierProductAlerts" class="mb-4"></div>
                <div class="filter-bar mb-4">
                    <select id="fType" class="input-field">
                        <option value="">全部类型</option>
                        <option value="SUPPLIER">供货方</option>
                        <option value="CUSTOMER">购货方</option>
                        <option value="BOTH">供货+购货</option>
                    </select>
                    <select id="fStatus" class="input-field">
                        <option value="">全部状态</option>
                        <option value="PENDING">待审批</option>
                        <option value="APPROVED">合格</option>
                        <option value="SUSPENDED">已暂停</option>
                    </select>
                    <button class="btn btn-secondary btn-sm" id="refreshBtn"><i class="fa fa-refresh"></i> 刷新</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table" id="partnerTable">
                        <thead><tr>
                            <th>编码</th><th>名称</th><th>类型</th><th>许可证号</th><th>许可证有效期</th><th>质量协议有效期</th><th>建档人</th><th>审批人</th><th>状态</th><th class="actions">操作</th>
                        </tr></thead>
                        <tbody id="partnerBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        document.getElementById('newPartnerBtn').addEventListener('click', openCreateModal);
        document.getElementById('refreshBtn').addEventListener('click', () => load(true));
        document.getElementById('fType').addEventListener('change', (e) => { currentFilter.partner_type = e.target.value; renderTable(); });
        document.getElementById('fStatus').addEventListener('change', (e) => { currentFilter.status = e.target.value; renderTable(); });
    }

    async function load(force) {
        try {
            let summary;
            [partners, goodsList, productProfiles, summary] = await Promise.all([
                refPartners(force),
                refGoods(force),
                apiAll('/gsp/products'),
                api('/gsp/compliance/summary'),
            ]);
            authorizationWarningDays = summary.supplier_product_warning_days || 30;
            authorizationAlerts = await apiAll(`/gsp/supplier-product-authorizations?alert_only=true&warning_days=${authorizationWarningDays}`);
            renderAuthorizationAlerts();
            renderTable();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function renderAuthorizationAlerts() {
        const box = document.getElementById('supplierProductAlerts');
        if (!box) return;
        if (!authorizationAlerts.length) {
            box.innerHTML = '<div class="alert alert-success"><i class="fa fa-check-circle mr-2"></i>当前没有待审批、临期或过期的供应商品种授权。</div>';
            return;
        }
        const today = todayISO();
        box.innerHTML = `<div class="alert alert-warning mb-2"><b>供货品种授权预警：</b>以下记录待审批、${authorizationWarningDays} 天内到期或已经过期。</div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>供应商</th><th>品种</th><th>有效期至</th><th>状态</th><th>处理</th></tr></thead><tbody>${authorizationAlerts.map(a => {
            const supplier = partners.find(p => p.id === a.supplier_id);
            const goods = goodsList.find(g => g.id === a.goods_id);
            const state = a.status === 'PENDING' ? badge('待审批', 'warning') : a.valid_to < today ? badge('已过期', 'danger') : badge(`${authorizationWarningDays}天内到期`, 'warning');
            return `<tr><td>${esc(supplier?.name || `供应商 #${a.supplier_id}`)}</td><td>${esc(goods ? `${goods.name}（${goods.spec || ''}）` : `货物 #${a.goods_id}`)}</td><td>${fmtD(a.valid_to)}</td><td>${state}</td><td><button class="btn btn-link btn-sm" onclick="PG('partners').viewPartner(${a.supplier_id})">查看处理</button></td></tr>`;
        }).join('')}</tbody></table></div>`;
    }

    function renderTable() {
        const rows = partners.filter(p =>
            (!currentFilter.partner_type || p.partner_type === currentFilter.partner_type) &&
            (!currentFilter.status || p.status === currentFilter.status));
        const tbody = document.getElementById('partnerBody');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state">暂无合作方，点击右上角新建</div></td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(p => `
        <tr>
            <td class="font-medium">${esc(p.code)}</td>
            <td>${esc(p.name)}</td>
            <td>${badge({ SUPPLIER: '供货方', CUSTOMER: '购货方', BOTH: '供货+购货' }[p.partner_type] || p.partner_type, 'info')}</td>
            <td>${esc(p.license_no)}</td>
            <td>${fmtD(p.license_valid_to)} ${p.license_valid_to && new Date(p.license_valid_to) < new Date() ? badge('已过期', 'danger') : ''}</td>
            <td>${fmtD(p.quality_agreement_valid_to)}</td>
            <td>用户 #${esc(p.created_by)}</td>
            <td>${p.approved_by ? `用户 #${esc(p.approved_by)}` : '-'}</td>
            <td>${statusBadge(p.status)}</td>
            <td class="actions">
                <button class="btn btn-link btn-sm" onclick="PG('partners').viewPartner(${p.id})"><i class="fa fa-folder-open-o"></i> 资质/品种</button>
                ${p.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="PG('partners').approvePartner(${p.id})"><i class="fa fa-check"></i> 批准</button>` : ''}
                ${p.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="PG('partners').suspendPartner(${p.id})"><i class="fa fa-pause"></i> 暂停</button>` : ''}
            </td>
        </tr>`).join('');
    }

    function openCreateModal() {
        const modal = openModal({
            title: '新建合作方建档',
            size: 'md',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">编码 *</label><input id="pCode" class="input-field" placeholder="如 SUP001"></div>
                <div class="form-group"><label class="form-label">名称 *</label><input id="pName" class="input-field" placeholder="企业名称"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">类型 *</label>
                    <select id="pType" class="input-field"><option value="SUPPLIER">供货方</option><option value="CUSTOMER">购货方</option><option value="BOTH">供货+购货</option></select>
                </div>
                <div class="form-group"><label class="form-label">统一社会信用代码</label><input id="pCredit" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">许可证号 *</label><input id="pLicNo" class="input-field"></div>
                <div class="form-group"><label class="form-label">许可证有效期至 *</label><input type="date" id="pLicTo" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">许可证经营范围 *</label><textarea id="pLicScope" class="input-field" rows="2" placeholder="如：中药饮片、化学药制剂等"></textarea></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">许可证起始日期</label><input type="date" id="pLicFrom" class="input-field"></div>
                <div class="form-group"><label class="form-label">质量协议有效期至</label><input type="date" id="pAgreeTo" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">建档原因 *（≥3字）</label><textarea id="pReason" class="input-field" rows="2"></textarea></div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="pSubmitBtn">提交建档</button>`,
        });
        modal.querySelector('#pSubmitBtn').addEventListener('click', async () => {
            const body = {
                code: modal.querySelector('#pCode').value.trim(),
                name: modal.querySelector('#pName').value.trim(),
                partner_type: modal.querySelector('#pType').value,
                unified_social_credit_code: modal.querySelector('#pCredit').value.trim() || null,
                license_no: modal.querySelector('#pLicNo').value.trim(),
                license_scope: modal.querySelector('#pLicScope').value.trim(),
                license_valid_from: modal.querySelector('#pLicFrom').value || null,
                license_valid_to: modal.querySelector('#pLicTo').value,
                quality_agreement_valid_to: modal.querySelector('#pAgreeTo').value || null,
                reason: modal.querySelector('#pReason').value.trim(),
            };
            if (!body.code || !body.name || !body.license_no || !body.license_scope || !body.license_valid_to) { showToast('请填写必填项', 'warning'); return; }
            if (body.reason.length < 3) { showToast('建档原因不能少于3个字', 'warning'); return; }
            try {
                await api('/gsp/partners', { method: 'POST', body });
                closeModal(modal);
                showToast('合作方已建档，等待质量审批', 'success');
                await load(true);
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function approvePartner(id) {
        const p = partners.find(x => x.id === id);
        signAction(
            { action: 'PARTNER_APPROVE', entity_type: 'GspBusinessPartner', entity_id: id, meaning: 'APPROVAL' },
            { path: `/gsp/partners/${id}/approve`, opts: { method: 'POST', body: { reason: '' } } },
            `批准合作方「${p ? p.name : id}」`
        );
    }

    function suspendPartner(id) {
        const p = partners.find(x => x.id === id);
        signAction(
            { action: 'PARTNER_SUSPEND', entity_type: 'GspBusinessPartner', entity_id: id, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/partners/${id}/suspend`, opts: { method: 'POST', body: { reason: '' } } },
            `暂停合作方「${p ? p.name : id}」`
        );
    }

    async function viewPartner(id) {
        const p = partners.find(x => x.id === id);
        let docs = [];
        let authorizations = [];
        try {
            [docs, authorizations] = await Promise.all([
                apiAll(`/gsp/partners/${id}/documents`),
                ['SUPPLIER', 'BOTH'].includes(p.partner_type) ? apiAll(`/gsp/partners/${id}/products`) : Promise.resolve([]),
            ]);
        } catch (e) { docs = []; authorizations = []; }
        // 该类型合作方批准所需的已核验文件清单
        const required = p.partner_type === 'SUPPLIER' ? ['BUSINESS_LICENSE', 'DRUG_LICENSE', 'QUALITY_AGREEMENT', 'SALES_AUTHORIZATION']
            : p.partner_type === 'CUSTOMER' ? ['BUSINESS_LICENSE', 'DRUG_LICENSE', 'PROCUREMENT_AUTHORIZATION']
            : ['BUSINESS_LICENSE', 'DRUG_LICENSE', 'QUALITY_AGREEMENT', 'SALES_AUTHORIZATION', 'PROCUREMENT_AUTHORIZATION'];
        const verifiedTypes = new Set(docs.filter(d => d.status === 'VERIFIED').map(d => d.document_type));
        const modal = openModal({
            title: `合作方资质 - ${p ? p.name : id}`,
            size: 'lg',
            body: `
            <div class="detail-grid mb-4">
                <div class="kv"><span class="kv-label">编码</span><span>${esc(p.code)}</span></div>
                <div class="kv"><span class="kv-label">类型</span><span>${badge({ SUPPLIER: '供货方', CUSTOMER: '购货方', BOTH: '供货+购货' }[p.partner_type] || p.partner_type, 'info')}</span></div>
                <div class="kv"><span class="kv-label">许可证号</span><span>${esc(p.license_no)}</span></div>
                <div class="kv"><span class="kv-label">许可证有效期</span><span>${fmtD(p.license_valid_from)} ~ ${fmtD(p.license_valid_to)}</span></div>
                <div class="kv"><span class="kv-label">经营范围</span><span class="break-all">${esc(p.license_scope)}</span></div>
                <div class="kv"><span class="kv-label">状态</span><span>${statusBadge(p.status)}</span></div>
                <div class="kv"><span class="kv-label">首营建档人</span><span>用户 #${esc(p.created_by)}</span></div>
                <div class="kv"><span class="kv-label">质量审批人</span><span>${p.approved_by ? `用户 #${esc(p.approved_by)}` : '待审批'}</span></div>
                ${p.suspension_reason ? `<div class="kv"><span class="kv-label">暂停原因</span><span>${esc(p.suspension_reason)}</span></div>` : ''}
            </div>
            <div class="alert alert-info mb-3"><i class="fa fa-info-circle mr-2"></i>
                批准前必须<b>录入并核验通过</b>以下文件，且首营建档人与质量审批人、文件上传人与核验人必须分别由不同用户承担：${required.map(t => `${docTypeLabel(t)} ${verifiedTypes.has(t) ? '<span class="badge badge-success">已核验</span>' : '<span class="badge badge-danger">缺</span>'}`).join(' ')}
            </div>
            <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-sm">资质文件清单</span>
                <button class="btn btn-primary btn-sm" id="addDocBtn"><i class="fa fa-plus"></i> 新增资质文件</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>类型</th><th>编号</th><th>有效期</th><th>授权人员</th><th>岗位</th><th>上传人</th><th>核验人</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody id="docBody"></tbody>
                </table>
            </div>
            ${['SUPPLIER', 'BOTH'].includes(p.partner_type) ? `
            <div class="flex items-center justify-between mt-4 mb-2">
                <span class="font-semibold text-sm">获准供货品种目录</span>
                <div class="flex gap-2"><button class="btn btn-secondary btn-sm" id="bulkSupplierProductBtn"><i class="fa fa-upload"></i> 批量导入</button><button class="btn btn-primary btn-sm" id="addSupplierProductBtn"><i class="fa fa-plus"></i> 关联供货品种</button></div>
            </div>
            <div class="alert alert-warning mb-2">供应商和品种分别首营通过后，仍必须由质量人员独立批准该关联；未批准、暂停或过期的关联不能采购、收货或验收。</div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>货物</th><th>批准文号</th><th>生产厂家</th><th>授权范围</th><th>有效期</th><th>维护/批准人</th><th>状态</th><th class="actions">操作</th></tr></thead><tbody id="supplierProductBody"></tbody></table></div>` : ''}
        `,
        });
        const renderDocs = () => {
            const tbody = modal.querySelector('#docBody');
            tbody.innerHTML = docs.length ? docs.map(d => `
            <tr>
                <td>${docTypeLabel(d.document_type)}</td>
                <td>${esc(d.document_no)}</td>
                <td>${fmtD(d.valid_to)}</td>
                <td>${esc(d.person_name || '-')}</td>
                <td>${esc(d.person_role || '-')}</td>
                <td>用户 #${esc(d.created_by)}</td>
                <td>${d.verified_by ? `用户 #${esc(d.verified_by)}` : '-'}</td>
                <td>${statusBadge(d.status)}</td>
                <td class="actions">
                    ${d.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="PG('partners').verifyDoc(${id}, ${d.id})"><i class="fa fa-check-circle"></i> 核验</button>` : ''}
                </td>
            </tr>`).join('') : '<tr><td colspan="9"><div class="empty-state">暂无资质文件</div></td></tr>';
        };
        renderDocs();
        modal.querySelector('#addDocBtn').addEventListener('click', () => openDocModal(id, docs, renderDocs));
        if (['SUPPLIER', 'BOTH'].includes(p.partner_type)) {
            const renderAuthorizations = () => {
                const tbody = modal.querySelector('#supplierProductBody');
                tbody.innerHTML = authorizations.length ? authorizations.map(a => {
                    const goods = goodsList.find(g => g.id === a.goods_id);
                    const profile = productProfiles.find(x => x.goods_id === a.goods_id);
                    return `<tr><td>${esc(goods ? `${goods.name}（${goods.spec || ''}）` : `货物 #${a.goods_id}`)}</td><td>${esc(profile?.approval_no || '-')}</td><td>${esc(profile?.manufacturer || '-')}</td><td>${esc(a.scope_description)}</td><td>${fmtD(a.valid_from)} ~ ${fmtD(a.valid_to)}</td><td>#${a.updated_by} / ${a.approved_by ? `#${a.approved_by}` : '-'}</td><td>${statusBadge(a.status)}</td><td class="actions">${a.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="PG('partners').approveSupplierProduct(${id}, ${a.id})">批准</button>` : ''}${a.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" onclick="PG('partners').suspendSupplierProduct(${id}, ${a.id})">暂停</button>` : ''}<button class="btn btn-link btn-sm" onclick="PG('partners').editSupplierProduct(${id}, ${a.goods_id})">更新</button></td></tr>`;
                }).join('') : '<tr><td colspan="8"><div class="empty-state">尚未建立供货品种目录；该供应商不能用于药品采购</div></td></tr>';
            };
            renderAuthorizations();
            modal.querySelector('#addSupplierProductBtn').addEventListener('click', () => openSupplierProductModal(id));
            modal.querySelector('#bulkSupplierProductBtn').addEventListener('click', () => openBulkSupplierProductModal(id));
        }
    }

    function openSupplierProductModal(partnerId, goodsId = null) {
        const eligibleProfiles = productProfiles.filter(p => p.status === 'APPROVED');
        const choices = eligibleProfiles.map(p => {
            const goods = goodsList.find(g => g.id === p.goods_id);
            return { id: p.goods_id, label: `${goods?.name || p.generic_name}（${goods?.spec || ''}）· ${p.approval_no}` };
        });
        const modal = openModal({
            title: goodsId ? '更新供货品种授权' : '关联供应商供货品种', size: 'lg',
            body: `<div class="form-row"><div class="form-group"><label class="form-label">已批准药品品种 *</label><select id="spaGoods" class="input-field" ${goodsId ? 'disabled' : ''}>${optionHTML(choices, 'id', 'label', '请选择品种')}</select></div><div class="form-group"><label class="form-label">授权文件引用 *</label><input id="spaRef" class="input-field"></div></div><div class="form-group"><label class="form-label">授权范围说明 *</label><textarea id="spaScope" class="input-field" placeholder="例如：仅允许供应该批准文号、生产厂家及当前规格"></textarea></div><div class="form-row"><div class="form-group"><label class="form-label">生效日期 *</label><input type="date" id="spaFrom" class="input-field" value="${todayISO()}"></div><div class="form-group"><label class="form-label">有效期至 *</label><input type="date" id="spaTo" class="input-field"></div></div><div class="form-row"><div class="form-group"><label class="form-label">文件 SHA-256 *</label><input id="spaHash" maxlength="64" class="input-field"></div><div class="form-group"><label class="form-label">文件大小（字节）*</label><input type="number" min="1" id="spaSize" class="input-field"></div></div><div class="form-group"><label class="form-label">维护原因 *</label><textarea id="spaReason" class="input-field"></textarea></div>`,
            footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="spaSubmit">保存并待独立审批</button>',
        });
        if (goodsId) modal.querySelector('#spaGoods').value = goodsId;
        modal.querySelector('#spaSubmit').addEventListener('click', async () => {
            const body = { goods_id: Number(modal.querySelector('#spaGoods').value), authorization_ref: modal.querySelector('#spaRef').value.trim(), authorization_sha256: modal.querySelector('#spaHash').value.trim().toLowerCase(), authorization_size_bytes: Number(modal.querySelector('#spaSize').value), scope_description: modal.querySelector('#spaScope').value.trim(), valid_from: modal.querySelector('#spaFrom').value, valid_to: modal.querySelector('#spaTo').value, reason: modal.querySelector('#spaReason').value.trim() };
            if (!body.goods_id || body.authorization_ref.length < 3 || body.scope_description.length < 3 || !body.valid_from || !body.valid_to || !/^[0-9a-f]{64}$/.test(body.authorization_sha256) || body.authorization_size_bytes < 1 || body.reason.length < 3) return showToast('请完整填写授权范围、有效期和文件完整性证据', 'warning');
            try { await api(`/gsp/partners/${partnerId}/products`, { method: 'POST', body }); document.querySelectorAll('.modal').forEach(closeModal); showToast('供货品种关联已保存，等待独立质量批准', 'success'); await load(true); } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function approveSupplierProduct(partnerId, authorizationId) {
        signAction(
            { action: 'SUPPLIER_PRODUCT_APPROVE', entity_type: 'GspSupplierProductAuthorization', entity_id: authorizationId, meaning: 'APPROVAL' },
            { path: `/gsp/partners/${partnerId}/products/${authorizationId}/approve`, opts: { method: 'POST', body: { reason: '' } }, successMessage: '供应商供货品种已批准', onSuccess: async () => { document.querySelectorAll('.modal').forEach(closeModal); await load(true); } },
            '批准供应商供货品种'
        );
    }

    function suspendSupplierProduct(partnerId, authorizationId) {
        signAction(
            { action: 'SUPPLIER_PRODUCT_SUSPEND', entity_type: 'GspSupplierProductAuthorization', entity_id: authorizationId, meaning: 'RESPONSIBILITY' },
            { path: `/gsp/partners/${partnerId}/products/${authorizationId}/suspend`, opts: { method: 'POST', body: { reason: '' } }, successMessage: '该供应商品种供货权限已暂停', onSuccess: async () => { document.querySelectorAll('.modal').forEach(closeModal); await load(true); } },
            '暂停供应商供货品种'
        );
    }

    function editSupplierProduct(partnerId, goodsId) { openSupplierProductModal(partnerId, goodsId); }

    const supplierProductCsvHeaders = ['goods_barcode', 'approval_no', 'authorization_ref', 'authorization_sha256', 'authorization_size_bytes', 'scope_description', 'valid_from', 'valid_to'];

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let cell = '';
        let quoted = false;
        for (let i = 0; i < text.length; i += 1) {
            const char = text[i];
            if (quoted) {
                if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
                else if (char === '"') quoted = false;
                else cell += char;
            } else if (char === '"' && cell === '') quoted = true;
            else if (char === ',') { row.push(cell); cell = ''; }
            else if (char === '\n' || char === '\r') {
                if (char === '\r' && text[i + 1] === '\n') i += 1;
                row.push(cell); cell = '';
                if (row.some(value => value.trim())) rows.push(row);
                row = [];
            } else cell += char;
        }
        row.push(cell);
        if (row.some(value => value.trim())) rows.push(row);
        return rows;
    }

    function downloadSupplierProductTemplate() {
        const content = `\uFEFF${supplierProductCsvHeaders.join(',')}\r\n`;
        const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'supplier-product-authorization-template.csv';
        anchor.click();
        URL.revokeObjectURL(url);
    }

    function openBulkSupplierProductModal(partnerId) {
        const approved = productProfiles.filter(profile => profile.status === 'APPROVED').slice(0, 20);
        const modal = openModal({
            title: '批量导入供应商供货品种',
            size: 'lg',
            body: `<div class="alert alert-warning mb-3">导入只建立或更新为<b>待审批</b>，不会自动批准；已批准关联被更新后也会重新待审。单次最多 1000 行，整个文件校验通过后才会一次性写入。</div>
            <div class="flex gap-2 mb-3"><button type="button" class="btn btn-secondary btn-sm" id="spaDownloadTemplate"><i class="fa fa-download"></i> 下载 CSV 模板</button></div>
            <div class="form-group"><label class="form-label">UTF-8 CSV 文件 *</label><input type="file" accept=".csv,text/csv" id="spaCsvFile" class="input-field"></div>
            <div class="form-group"><label class="form-label">批量导入原因 *（≥3字）</label><textarea id="spaBulkReason" class="input-field" rows="2"></textarea></div>
            <div class="text-xs mb-2" style="color:var(--gray-500)">模板使用货物条码和批准文号双重核对。当前已批准品种示例：</div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>货物条码</th><th>批准文号</th><th>品种</th></tr></thead><tbody>${approved.length ? approved.map(profile => { const goods = goodsList.find(item => item.id === profile.goods_id); return `<tr><td>${esc(goods?.barcode || '-')}</td><td>${esc(profile.approval_no)}</td><td>${esc(goods?.name || profile.generic_name)}</td></tr>`; }).join('') : '<tr><td colspan="3">暂无已批准品种</td></tr>'}</tbody></table></div>`,
            footer: '<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="spaBulkSubmit">导入并进入待审批</button>',
        });
        modal.querySelector('#spaDownloadTemplate').addEventListener('click', downloadSupplierProductTemplate);
        modal.querySelector('#spaBulkSubmit').addEventListener('click', async () => {
            const file = modal.querySelector('#spaCsvFile').files[0];
            const reason = modal.querySelector('#spaBulkReason').value.trim();
            if (!file || reason.length < 3) { showToast('请选择 CSV 文件并填写导入原因', 'warning'); return; }
            try {
                const parsed = parseCsv(await file.text());
                if (parsed.length < 2) throw new Error('CSV 没有数据行');
                const headers = parsed[0].map((value, index) => index === 0 ? value.replace(/^\uFEFF/, '').trim() : value.trim());
                if (headers.join(',') !== supplierProductCsvHeaders.join(',')) throw new Error('CSV 表头与模板不一致');
                const rows = parsed.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]))).map(row => ({
                    ...row,
                    authorization_size_bytes: Number(row.authorization_size_bytes),
                }));
                if (rows.length > 1000) throw new Error('单次导入不能超过 1000 行');
                const result = await api(`/gsp/partners/${partnerId}/products/bulk-import`, { method: 'POST', body: { rows, reason } });
                document.querySelectorAll('.modal').forEach(closeModal);
                showToast(`批量导入完成：新增 ${result.created}，更新 ${result.updated}，共 ${result.pending_approval} 条待审批`, 'success');
                await load(true);
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function openDocModal(partnerId, docs, onAdd) {
        const modal = openModal({
            title: '新增资质文件',
            size: 'md',
            body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">文件类型 *（与后端批准清单一致）</label>
                    <select id="dType" class="input-field">
                        <option value="BUSINESS_LICENSE">营业执照</option>
                        <option value="DRUG_LICENSE">药品经营许可证</option>
                        <option value="QUALITY_AGREEMENT">质量保证协议</option>
                        <option value="SALES_AUTHORIZATION">销售授权书（供货方，需授权人员）</option>
                        <option value="PROCUREMENT_AUTHORIZATION">采购授权书（购货方，需授权人员）</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">文件编号 *</label><input id="dNo" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">有效期至 *</label><input type="date" id="dTo" class="input-field"></div>
                <div class="form-group"><label class="form-label">生效日期</label><input type="date" id="dFrom" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">授权人员姓名</label><input id="dPerson" class="input-field"></div>
                <div class="form-group"><label class="form-label">授权人员岗位</label><input id="dRole" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">文件引用（file_ref）*</label><input id="dRef" class="input-field" placeholder="如电子档案路径/URL"></div>
            <div class="form-group"><label class="form-label">登记原因 *（≥3字）</label><textarea id="dReason" class="input-field" rows="2"></textarea></div>
        `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="dSubmitBtn">保存</button>`,
        });
        modal.querySelector('#dSubmitBtn').addEventListener('click', async () => {
            const body = {
                document_type: modal.querySelector('#dType').value,
                document_no: modal.querySelector('#dNo').value.trim(),
                valid_from: modal.querySelector('#dFrom').value || null,
                valid_to: modal.querySelector('#dTo').value,
                file_ref: modal.querySelector('#dRef').value.trim(),
                person_name: modal.querySelector('#dPerson').value.trim() || null,
                person_role: modal.querySelector('#dRole').value.trim() || null,
                reason: modal.querySelector('#dReason').value.trim(),
            };
            if (!body.document_no || !body.valid_to || !body.file_ref) { showToast('请填写必填项', 'warning'); return; }
            if (body.reason.length < 3) { showToast('登记原因不能少于3个字', 'warning'); return; }
            try {
                const doc = await api(`/gsp/partners/${partnerId}/documents`, { method: 'POST', body });
                docs.unshift(doc);
                closeModal(modal);
                onAdd();
                showToast('资质文件已登记（待核验）', 'success');
            } catch (e) { showToast(e.message, 'error'); }
        });
    }

    function verifyDoc(partnerId, docId) {
        signAction(
            { action: 'PARTNER_DOCUMENT_VERIFY', entity_type: 'GspPartnerDocument', entity_id: docId, meaning: 'REVIEW' },
            { path: `/gsp/partners/${partnerId}/documents/${docId}/verify`, opts: { method: 'POST', body: { reason: '' } } },
            '核验资质文件'
        );
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['partners'] = {
        title: '合作方管理',
        icon: 'fa-handshake-o',
        desc: '供货方/购货方资质建档与核验',
        init: pageInit,
        fn: { viewPartner, approvePartner, suspendPartner, verifyDoc, approveSupplierProduct, suspendSupplierProduct, editSupplierProduct },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 partners.html
})();
