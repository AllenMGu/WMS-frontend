/* 药品与批次：品种档案 / 批次台账 / 批号库存 / 质量锁定
 * SPA 模块：window.PAGES['products'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '药品与批次';
    let _el = null;
    const content = () => _el;
let tab = 'profiles';
let goodsList = [];
let partners = [];

async function pageInit(el) { _el = el || document.getElementById('pageContent');
    await Promise.all([refGoods(), refPartners()]).then(([g, p]) => { goodsList = g; partners = p; }).catch(() => {});
    render();
    await loadTab();
};

function render() {
    content().innerHTML = `
        <div class="tabs">
            <div class="tab ${tab === 'profiles' ? 'active' : ''}" data-tab="profiles"><i class="fa fa-file-text-o mr-1"></i>品种档案</div>
            <div class="tab ${tab === 'batches' ? 'active' : ''}" data-tab="batches"><i class="fa fa-cubes mr-1"></i>批次台账</div>
            <div class="tab ${tab === 'stock' ? 'active' : ''}" data-tab="stock"><i class="fa fa-database mr-1"></i>批号库存</div>
            <div class="tab ${tab === 'holds' ? 'active' : ''}" data-tab="holds"><i class="fa fa-lock mr-1"></i>质量锁定</div>
        </div>
        <div id="tabContent"></div>`;
    content().querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
        tab = t.dataset.tab;
        content().querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
        loadTab();
    }));
}

async function loadTab() {
    const box = document.getElementById('tabContent');
    box.innerHTML = '<div class="card p-6 text-center"><span class="loading"></span></div>';
    try {
        if (tab === 'profiles') await renderProfiles(box);
        else if (tab === 'batches') await renderBatches(box);
        else if (tab === 'stock') await renderStock(box);
        else await renderHolds(box);
    } catch (e) {
        box.innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-circle mr-2"></i>${esc(e.message)}</div>`;
    }
}

/* ---------------- 品种档案 ---------------- */
async function renderProfiles(box) {
    const profiles = await refProfiles(true);
    const profiledGoods = new Set(profiles.map(p => p.goods_id));
    const unprofiled = goodsList.filter(g => !profiledGoods.has(g.id));
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-file-text-o mr-2" style="color:var(--primary)"></i>药品质量主数据（NMPA注册批准档案）</span>
                <button class="btn btn-primary" id="newProfileBtn"><i class="fa fa-plus"></i> 新建品种档案</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>货物</th><th>批准文号</th><th>通用名</th><th>剂型</th><th>生产企业</th><th>储存条件</th><th>监管类别</th><th>注册有效期</th><th>追溯要求</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${profiles.map(p => `
                        <tr>
                            <td class="font-medium">${esc(p.goods_name)}</td>
                            <td>${esc(p.approval_no)}</td>
                            <td>${esc(p.generic_name)}</td>
                            <td>${esc(p.dosage_form)}</td>
                            <td>${esc(p.manufacturer)}</td>
                            <td>${badge({ NORMAL: '常温', COOL: '阴凉', COLD: '冷藏', FROZEN: '冷冻', SPECIAL: '特殊' }[p.storage_condition] || p.storage_condition, p.storage_condition === 'NORMAL' ? 'info' : 'warning')}</td>
                            <td>${badge({ GENERAL: '普通药品', SPECIAL_CONTROLLED: '特殊管理药品', VACCINE: '疫苗' }[p.regulatory_category] || p.regulatory_category, p.regulatory_category === 'GENERAL' ? 'gray' : 'danger')}</td>
                            <td>${fmtD(p.registration_valid_to)}</td>
                            <td>${boolBadge(p.traceability_required)}</td>
                            <td>${statusBadge(p.status)}</td>
                            <td class="actions">
                                <button class="btn btn-link btn-sm" onclick="PG('products').openProfileModal(${p.goods_id}, ${p.id})"><i class="fa fa-edit"></i> 编辑</button>
                                ${p.status === 'PENDING' ? `<button class="btn btn-link btn-sm" onclick="PG('products').approveProfile(${p.goods_id})"><i class="fa fa-check"></i> 批准</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="11"><div class="empty-state">暂无品种档案</div></td></tr>'}</tbody>
                </table>
            </div>
            ${unprofiled.length ? `
            <div class="card-body">
                <div class="text-sm font-medium mb-2" style="color:var(--gray-500)">未建档货物（${unprofiled.length}）</div>
                <div class="flex flex-wrap gap-1">
                    ${unprofiled.slice(0, 20).map(g => `<button class="btn btn-secondary btn-xs" onclick="PG('products').openProfileModal(${g.id}, null)">${esc(g.name)}</button>`).join('')}
                    ${unprofiled.length > 20 ? `<span class="text-xs text-gray-400">等 ${unprofiled.length} 项</span>` : ''}
                </div>
            </div>` : ''}
        </div>`;
    box.querySelector('#newProfileBtn').addEventListener('click', () => openProfileModal(null, null));
}

function openProfileModal(goodsId, profileId) {
    const profiles = refCache.profiles || [];
    const profile = profileId ? profiles.find(p => p.id === profileId) : null;
    const modal = openModal({
        title: profileId ? '编辑品种档案' : '新建品种档案',
        size: 'lg',
        body: `
            <div class="form-row">
                <div class="form-group"><label class="form-label">货物 *</label>
                    <select id="gGoods" class="input-field">${optionHTML(goodsList, 'id', g => `${g.name}（${g.spec || '无规格'}）`, '请选择货物')}</select>
                </div>
                <div class="form-group"><label class="form-label">批准文号 *</label><input id="gApproval" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">通用名 *</label><input id="gGeneric" class="input-field"></div>
                <div class="form-group"><label class="form-label">剂型 *</label><input id="gForm" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">生产企业 *</label><input id="gMfr" class="input-field"></div>
                <div class="form-group"><label class="form-label">上市许可持有人</label><input id="gMaho" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">储存条件 *</label>
                    <select id="gStorage" class="input-field">
                        <option value="NORMAL">常温</option><option value="COOL">阴凉</option>
                        <option value="COLD">冷藏</option><option value="FROZEN">冷冻</option><option value="SPECIAL">特殊</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">注册有效期至</label><input type="date" id="gRegTo" class="input-field"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">最低温度(℃)</label><input type="number" step="0.1" id="gMinT" class="input-field"></div>
                <div class="form-group"><label class="form-label">最高温度(℃)</label><input type="number" step="0.1" id="gMaxT" class="input-field"></div>
            </div>
            <div class="form-group"><label class="form-label">监管类别 *</label>
                <select id="gCategory" class="input-field">
                    <option value="GENERAL">普通药品</option>
                    <option value="SPECIAL_CONTROLLED">特殊管理药品（需批准经营范围）</option>
                    <option value="VACCINE">疫苗（需批准经营范围）</option>
                </select>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">注册文件引用 *</label><input id="gRegDoc" class="input-field"></div>
                <div class="form-group"><label class="form-label">NMPA核验引用 *</label><input id="gNmpa" class="input-field"></div>
            </div>
            <div class="form-row">
                <label class="checkbox-label"><input type="checkbox" id="gPresc" class="checkbox" checked> 处方药</label>
                <label class="checkbox-label"><input type="checkbox" id="gTrace" class="checkbox" checked> 必须追溯</label>
            </div>
            <div class="form-group"><label class="form-label">变更原因 *（≥3字）</label><textarea id="gReason" class="input-field" rows="2"></textarea></div>
        `,
        footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="gSubmitBtn">保存</button>`,
    });
    if (profile) {
        modal.querySelector('#gGoods').value = profile.goods_id;
        modal.querySelector('#gGoods').disabled = true;
        modal.querySelector('#gApproval').value = profile.approval_no || '';
        modal.querySelector('#gGeneric').value = profile.generic_name || '';
        modal.querySelector('#gForm').value = profile.dosage_form || '';
        modal.querySelector('#gMfr').value = profile.manufacturer || '';
        modal.querySelector('#gMaho').value = profile.marketing_authorization_holder || '';
        modal.querySelector('#gStorage').value = profile.storage_condition || 'NORMAL';
        modal.querySelector('#gRegTo').value = profile.registration_valid_to || '';
        modal.querySelector('#gMinT').value = profile.min_temperature ?? '';
        modal.querySelector('#gMaxT').value = profile.max_temperature ?? '';
        modal.querySelector('#gRegDoc').value = profile.registration_document_ref || '';
        modal.querySelector('#gNmpa').value = profile.nmpa_verification_ref || '';
        modal.querySelector('#gPresc').checked = !!profile.is_prescription;
        modal.querySelector('#gCategory').value = profile.regulatory_category || (profile.is_special_controlled ? 'SPECIAL_CONTROLLED' : 'GENERAL');
        modal.querySelector('#gTrace').checked = !!profile.traceability_required;
    } else if (goodsId) {
        modal.querySelector('#gGoods').value = goodsId;
    }
    modal.querySelector('#gRegDoc').closest('.form-group').insertAdjacentHTML('beforebegin',
        `<div class="form-group"><label class="form-label">上传注册文件受控附件（推荐）</label><input type="file" id="gRegFile" class="input-field" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.csv,.txt"><button type="button" id="gRegCancel" class="btn btn-secondary btn-sm mt-2">取消上传并停用</button><div class="text-xs text-gray-500" id="gRegFileInfo">选择文件自动填入注册文件引用；上传后可再选更换</div></div>`);
    const gRegCtl = bindControlledFileInput(modal, { fileSel: '#gRegFile', infoSel: '#gRegFileInfo', refSel: '#gRegDoc', purpose: 'DRUG_REGISTRATION', submitSel: '#gSubmitBtn' });
    modal.querySelector('#gRegCancel').addEventListener('click', () => gRegCtl.cancel());
    modal.querySelector('#gSubmitBtn').addEventListener('click', async () => {
        const gid = Number(modal.querySelector('#gGoods').value);
        const body = {
            approval_no: modal.querySelector('#gApproval').value.trim(),
            generic_name: modal.querySelector('#gGeneric').value.trim(),
            dosage_form: modal.querySelector('#gForm').value.trim(),
            manufacturer: modal.querySelector('#gMfr').value.trim(),
            marketing_authorization_holder: modal.querySelector('#gMaho').value.trim() || null,
            storage_condition: modal.querySelector('#gStorage').value,
            min_temperature: modal.querySelector('#gMinT').value === '' ? null : Number(modal.querySelector('#gMinT').value),
            max_temperature: modal.querySelector('#gMaxT').value === '' ? null : Number(modal.querySelector('#gMaxT').value),
            is_prescription: modal.querySelector('#gPresc').checked,
            is_special_controlled: modal.querySelector('#gCategory').value !== 'GENERAL',
            regulatory_category: modal.querySelector('#gCategory').value,
            traceability_required: modal.querySelector('#gTrace').checked,
            registration_valid_to: modal.querySelector('#gRegTo').value || null,
            registration_document_ref: modal.querySelector('#gRegDoc').value.trim(),
            nmpa_verification_ref: modal.querySelector('#gNmpa').value.trim(),
            reason: modal.querySelector('#gReason').value.trim(),
        };
        if (!gid || !body.approval_no || !body.generic_name || !body.dosage_form || !body.manufacturer || !body.registration_document_ref || !body.nmpa_verification_ref) { showToast('请填写必填项', 'warning'); return; }
        if (body.reason.length < 3) { showToast('变更原因不能少于3个字', 'warning'); return; }
        try {
            await api(`/gsp/products/${gid}/profile`, { method: 'PUT', body });
            closeModal(modal);
            showToast('品种档案已保存（待独立批准）', 'success');
            await loadTab();
        } catch (e) { showToast(e.message, 'error'); }
    });
}

function approveProfile(goodsId) {
    signAction(
        { action: 'DRUG_PROFILE_APPROVE', entity_type: 'GspDrugProfile', entity_id: goodsId, meaning: 'APPROVAL' },
        { path: `/gsp/products/${goodsId}/approve`, opts: { method: 'POST', body: { reason: '' } } },
        '批准品种档案'
    );
}

/* ---------------- 批次台账 ---------------- */
async function renderBatches(box) {
    const batches = await refBatches(true);
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-cubes mr-2" style="color:var(--primary)"></i>药品批次台账（含验收放行）</span>
                ${badge('由采购收货自动生成', 'info')}
            </div>
            <div class="card-body">
                <div class="alert alert-info mb-3">手工建档和手工放行已停用。批次必须由采购收货生成，并在收货明细中完成抽样和独立验收。</div>
                <div class="filter-bar mb-3">
                    <input id="bSearch" class="input-field" placeholder="搜索批号/货物名">
                    <select id="bStatus" class="input-field">
                        <option value="">全部状态</option>
                        <option value="PENDING_INSPECTION">待验收</option>
                        <option value="RELEASED">已放行</option>
                    </select>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>批号</th><th>货物</th><th>供货方</th><th>生产日期</th><th>有效期</th><th>检验报告</th><th>追溯码</th><th>状态</th><th class="actions">操作</th></tr></thead>
                        <tbody id="batchBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
    const searchEl = box.querySelector('#bSearch');
    const statusEl = box.querySelector('#bStatus');
    searchEl.addEventListener('input', debounce(() => renderBatchRows(batches, searchEl.value, statusEl.value), 250));
    statusEl.addEventListener('change', () => renderBatchRows(batches, searchEl.value, statusEl.value));
    renderBatchRows(batches, '', '');
}

function renderBatchRows(batches, search, status) {
    const tbody = document.getElementById('batchBody');
    const rows = batches.filter(b =>
        (!search || (b.batch_no + (b.goods_name || '')).toLowerCase().includes(search.toLowerCase())) &&
        (!status || b.status === status));
    tbody.innerHTML = rows.map(b => `
        <tr>
            <td class="font-medium">${esc(b.batch_no)}</td>
            <td>${esc(b.goods_name)}</td>
            <td>${esc(b.supplier_name)}</td>
            <td>${fmtD(b.production_date)}</td>
            <td>${fmtD(b.expiry_date)} ${b.expiry_date && new Date(b.expiry_date) < new Date() ? badge('过期', 'danger') : ''}</td>
            <td>${esc(b.inspection_report_no || '-')}</td>
            <td>${esc(b.traceability_code || '-')}</td>
            <td>${statusBadge(b.status)}</td>
            <td class="actions">-</td>
        </tr>`).join('') || '<tr><td colspan="9"><div class="empty-state">暂无批次</div></td></tr>';
}

/* ---------------- 批号库存 ---------------- */
async function renderStock(box) {
    const stock = await refBatchStock(true);
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-database mr-2" style="color:var(--primary)"></i>批号库存（合格批次入库后形成）</span>
                ${badge('受控业务自动形成', 'info')}
            </div>
            <div class="card-body">
                <div class="alert alert-info mb-3">禁止手工增加批号库存；库存只能由验收合格、销后退回检验合格或批准的盘点差异调整形成。</div>
                <div class="table-wrap"><table class="data-table">
                    <thead><tr><th>批号</th><th>货物</th><th>仓库</th><th>库位</th><th>数量</th><th>预留</th><th>可用</th><th>状态</th></tr></thead>
                    <tbody>${stock.map(s => `
                        <tr>
                            <td class="font-medium">${esc(s.batch_no)}</td>
                            <td>${esc(s.goods_name)}</td>
                            <td>${esc(s.warehouse_name)}</td>
                            <td>${esc(s.location_code)}</td>
                            <td>${fmtNum(s.quantity)}</td>
                            <td>${fmtNum(s.reserved_quantity)}</td>
                            <td class="font-medium">${fmtNum((Number(s.quantity) || 0) - (Number(s.reserved_quantity) || 0))}</td>
                            <td>${statusBadge(s.stock_status)}</td>
                        </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">暂无批号库存，请先完成受控采购收货验收</div></td></tr>'}</tbody>
                </table></div>
            </div>
        </div>`;
}

/* ---------------- 质量锁定 ---------------- */
async function renderHolds(box) {
    const holds = await refHolds(true);
    const batches = await refBatches(true);
    box.innerHTML = `
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-lock mr-2" style="color:var(--primary)"></i>批次质量锁定</span>
                <button class="btn btn-primary" id="holdNewBtn"><i class="fa fa-plus"></i> 新建锁定</button>
            </div>
            <div class="card-body p-0 table-wrap">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>批号</th><th>原因代码</th><th>原因</th><th>发起时间</th><th>状态</th><th class="actions">操作</th></tr></thead>
                    <tbody>${holds.map(h => `
                        <tr>
                            <td>${h.id}</td>
                            <td class="font-medium">${esc(h.batch_no)}</td>
                            <td>${badge(h.reason_code, h.reason_code === 'RECALL' || h.reason_code === 'NONCONFORMING' ? 'danger' : 'warning')}</td>
                            <td>${esc(h.reason)}</td>
                            <td>${fmtDT(h.initiated_at)}</td>
                            <td>${statusBadge(h.status)}</td>
                            <td class="actions">
                                ${h.status === 'ACTIVE' ? `<button class="btn btn-link btn-sm" onclick="PG('products').releaseHold(${h.id})"><i class="fa fa-unlock"></i> 解除</button>` : ''}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">暂无质量锁定</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    box.querySelector('#holdNewBtn').addEventListener('click', () => {
        const modal = openModal({
            title: '新建质量锁定',
            size: 'md',
            body: `
                <div class="form-group"><label class="form-label">批次 *</label><select id="hBatch" class="input-field">${optionHTML(batches, 'id', b => `${b.batch_no} - ${b.goods_name}`, '请选择批次')}</select></div>
                <div class="form-group"><label class="form-label">原因代码 *</label>
                    <select id="hCode" class="input-field">
                        <option value="NONCONFORMING">NONCONFORMING 不合格</option>
                        <option value="MAINTENANCE_ABNORMAL">MAINTENANCE_ABNORMAL 养护异常</option>
                        <option value="RECALL">RECALL 召回</option>
                        <option value="SUSPECTED_FRAUD">SUSPECTED_FRAUD 疑似伪劣</option>
                        <option value="STORAGE_ANOMALY">STORAGE_ANOMALY 储存异常</option>
                        <option value="OTHER">OTHER 其他</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">锁定原因 *（≥3字）</label><textarea id="hReason" class="input-field" rows="2"></textarea></div>
            `,
            footer: `<button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" id="hSubmitBtn">锁定</button>`,
        });
        modal.querySelector('#hSubmitBtn').addEventListener('click', async () => {
            const body = {
                batch_id: Number(modal.querySelector('#hBatch').value),
                reason_code: modal.querySelector('#hCode').value,
                reason: modal.querySelector('#hReason').value.trim(),
            };
            if (!body.batch_id || body.reason.length < 3) { showToast('请填写批次与锁定原因', 'warning'); return; }
            try {
                await api('/gsp/quality-holds', { method: 'POST', body });
                closeModal(modal);
                showToast('批次已锁定', 'success');
                await loadTab();
            } catch (e) { showToast(e.message, 'error'); }
        });
    });
}

function releaseHold(id) {
    signAction(
        { action: 'QUALITY_HOLD_RELEASE', entity_type: 'GspQualityHold', entity_id: id, meaning: 'RELEASE' },
        { path: `/gsp/quality-holds/${id}/release`, opts: { method: 'POST', body: { reason: '' } } },
        '解除质量锁定'
    );
}


    window.PAGES = window.PAGES || {};
    window.PAGES['products'] = {
        title: '药品与批次',
        icon: 'fa-cubes',
        desc: '药品质量档案、批次与批号库存',
        init: pageInit,
        fn: { openProfileModal, approveProfile, releaseHold },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 products.html
})();
