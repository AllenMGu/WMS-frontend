/* 合作方管理：建档 / 审批 / 资质文件 / 暂停 */
'use strict';
window.PAGE_TITLE = '合作方管理';
const content = () => document.getElementById('pageContent');
let partners = [];
let currentFilter = { partner_type: '', status: '' };

window.pageInit = async function () {
    render();
    await load();
};

function render() {
    content().innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-handshake-o mr-2" style="color:var(--primary)"></i>合作方（供货方 / 购货方）资质台账</span>
                <button class="btn btn-primary" id="newPartnerBtn"><i class="fa fa-plus"></i> 新建合作方</button>
            </div>
            <div class="card-body">
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
                            <th>编码</th><th>名称</th><th>类型</th><th>许可证号</th><th>许可证有效期</th><th>质量协议有效期</th><th>状态</th><th class="actions">操作</th>
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
        partners = await refPartners(force);
        renderTable();
    } catch (e) { showToast(e.message, 'error'); }
}

function renderTable() {
    const rows = partners.filter(p =>
        (!currentFilter.partner_type || p.partner_type === currentFilter.partner_type) &&
        (!currentFilter.status || p.status === currentFilter.status));
    const tbody = document.getElementById('partnerBody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">暂无合作方，点击右上角新建</div></td></tr>';
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
            <td>${statusBadge(p.status)}</td>
            <td class="actions">
                <button class="btn btn-link btn-sm" onclick="viewPartner(${p.id})"><i class="fa fa-folder-open-o"></i> 资质</button>
                ${p.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="approvePartner(${p.id})"><i class="fa fa-check"></i> 批准</button>` : ''}
                ${p.status === 'APPROVED' ? `<button class="btn btn-link btn-sm" style="color:var(--red-600)" onclick="suspendPartner(${p.id})"><i class="fa fa-pause"></i> 暂停</button>` : ''}
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
    try { docs = await api(`/gsp/partners/${id}/documents`); } catch (e) { docs = []; }
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
                ${p.suspension_reason ? `<div class="kv"><span class="kv-label">暂停原因</span><span>${esc(p.suspension_reason)}</span></div>` : ''}
            </div>
            <div class="alert alert-info mb-3"><i class="fa fa-info-circle mr-2"></i>
                批准前必须<b>录入并核验通过</b>以下文件：${required.map(t => `${docTypeLabel(t)} ${verifiedTypes.has(t) ? '<span class="badge badge-success">已核验</span>' : '<span class="badge badge-danger">缺</span>'}`).join(' ')}
            </div>
            <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-sm">资质文件清单</span>
                <button class="btn btn-primary btn-sm" id="addDocBtn"><i class="fa fa-plus"></i> 新增资质文件</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>类型</th><th>编号</th><th>有效期</th><th>授权人员</th><th>岗位</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody id="docBody"></tbody>
                </table>
            </div>
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
                <td>${statusBadge(d.status)}</td>
                <td class="actions">
                    ${d.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="verifyDoc(${id}, ${d.id})"><i class="fa fa-check-circle"></i> 核验</button>` : ''}
                </td>
            </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">暂无资质文件</div></td></tr>';
    };
    renderDocs();
    modal.querySelector('#addDocBtn').addEventListener('click', () => openDocModal(id, docs, renderDocs));
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
