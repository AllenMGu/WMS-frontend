/* ==========================================================================
 * SPA 主框架：所有功能模块都在本页面（app.html）内加载渲染，不跳转其它 HTML。
 * 点击侧边栏按钮 -> 动态加载对应模块 JS（一次）-> 调用 PAGES[key].init() 渲染。
 * "全部功能" -> 在内容区渲染全目录按钮网格，点击按钮原地加载对应模块。
 * ========================================================================== */
'use strict';
const APP_VERSION = '20260903-table-pagination';
const content = () => document.getElementById('pageContent');
const loaded = new Set();

window.HUB_DESCS = {
    'dashboard.html': 'GSP 合规总览：待办、预警与需关注事项',
    'goods.html': '基础档案：货物主数据（条码/名称/规格）',
    'warehouses.html': '基础档案：仓库与库位（储存分区设施）',
    'partners.html': '首营管理：供货方/购货方资质建档与核验',
    'products.html': '首营管理：品种质量档案、批准文号与批号',
    'users.html': '权限管理：用户与 GSP 岗位授权（最小权限）',
    'ldap.html': '权限管理：LDAP/AD 目录状态与用户导入',
    'procurement.html': '购进管理：采购→到货→抽样→验收（收货验收分离）',
    'maintenance.html': '储存养护：养护计划与重点养护（GSP 附录）',
    'environment.html': '储存养护：温湿度监测与超限告警',
    'stocktaking.html': '储存养护：批号库存盘点与差异处理',
    'sales.html': '销售管理：销售订单→拣货→复核→发运',
    'transport.html': '运输管理：在途运输、异常与签收',
    'returns.html': '售后管理：销后退回隔离与检验',
    'disposition.html': '质量管理：不合格品登记、批准与处置',
    'my-training.html': '个人质量任务：处理本人 CAPA、培训与岗位考核',
    'qms.html': '质量体系：年度评审、风险/CAPA、培训、文件和设备验证',
    'recalls.html': '质量管理：药品召回与应急演练',
    'trace.html': '追溯管理：批号全链路追溯',
    'signatures.html': '数据完整性：电子签名台账与验签',
    'audit.html': '数据完整性：哈希链审计追踪与校验',
    'operations.html': '系统运维：备份、恢复演练、秘密轮换',
    'legacy-archive.html': '历史归档：受控迁移、独立核对、只读检索与导出',
};

function moduleKey(page) {
    return String(page || '').replace(/\.html$/, '');
}

function setTitle(text) {
    const el = document.querySelector('.page-title');
    if (el) el.textContent = text || '';
}

function highlightNav(page) {
    document.querySelectorAll('.nav-item').forEach(a => {
        a.classList.toggle('active', a.dataset.route === page);
    });
}

async function loadModule(key) {
    if (loaded.has(key)) return window.PAGES[key];
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `assets/js/pages/${key}.js?v=${APP_VERSION}`;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`模块脚本加载失败：${key}.js`));
        document.head.appendChild(s);
    });
    loaded.add(key);
    const mod = window.PAGES && window.PAGES[key];
    if (!mod || typeof mod.init !== 'function') {
        throw new Error(`模块未注册：${key}`);
    }
    return mod;
}

/* "全部功能"目录：SPA 内渲染所有页面按钮，点击原地加载 */
function renderAll() {
    const groups = ((typeof NAV_GROUPS !== 'undefined') ? NAV_GROUPS : (window.NAV_GROUPS || []))
        .map(group => ({ ...group, items: group.items.filter(item => canAccessPage(item.page)) }))
        .filter(group => group.items.length);
    const holder = content();
    holder.innerHTML = `
        <div class="alert alert-info mb-4"><i class="fa fa-th-large mr-2"></i>全部功能目录：点击任意卡片，页面内容直接在当前页面加载（不跳转）。</div>
        <div class="grid grid-2 gap-4">
            ${groups.map(g => `
                <div class="card">
                    <div class="card-header"><span class="card-title">${esc(g.title)}</span><span class="text-sm" style="color:var(--gray-400)">${g.items.length} 个页面</span></div>
                    <div class="card-body">
                        <div class="hub-grid">
                            ${g.items.map(it => `
                                <button type="button" class="hub-item" data-page="${it.page}" style="cursor:pointer;text-align:left;width:100%">
                                    <i class="fa ${esc(it.icon)}"></i>
                                    <div class="hub-text">
                                        <div class="hub-name">${esc(it.label)}</div>
                                        <div class="hub-desc">${esc((window.HUB_DESCS && window.HUB_DESCS[it.page]) || '')}</div>
                                    </div>
                                </button>`).join('')}
                        </div>
                    </div>
                </div>`).join('')}
        </div>`;
    holder.querySelectorAll('.hub-item').forEach(b => {
        b.addEventListener('click', () => openModule(b.dataset.page));
    });
}

async function openModule(page) {
    if (page === 'all') {
        highlightNav('all');
        setTitle('全部功能');
        renderAll();
        return;
    }
    const key = moduleKey(page);
    if (!canAccessPage(page)) {
        content().innerHTML = '<div class="alert alert-error"><i class="fa fa-lock mr-2"></i>当前账号没有访问该模块的有效岗位。</div>';
        return;
    }
    if (!key || !(window.NAV_PAGES || []).includes(page)) {
        content().innerHTML = '<div class="alert alert-error">未知页面：' + esc(page) + '</div>';
        return;
    }
    highlightNav(page);
    content().innerHTML = '<div class="empty-state"><i class="fa fa-spinner fa-spin mr-2"></i>加载中...</div>';
    try {
        const mod = await loadModule(key);
        setTitle(mod.title || key);
        await mod.init(content());
    } catch (e) {
        console.error('openModule error:', e);
        content().innerHTML = `<div class="alert alert-error"><i class="fa fa-exclamation-triangle mr-2"></i>模块加载失败：${esc(e.message)}</div>`;
    }
}

/* 侧边栏导航点击由 app.js 接管（不再整页跳转） */
function bindNav() {
    document.querySelectorAll('.nav-item').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const page = a.dataset.route || a.getAttribute('href');
            if (page) openModule(page);
        });
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    const ready = await window.appShellReady;
    if (!ready) return;

    window.NAV_PAGES = ((typeof NAV_GROUPS !== 'undefined') ? NAV_GROUPS : (window.NAV_GROUPS || []))
        .flatMap(group => group.items)
        .filter(item => item.page !== 'all' && canAccessPage(item.page))
        .map(item => item.page);
    installTableEnhancements(document.getElementById('appShell'));
    bindNav();

    let start = 'dashboard.html';
    try {
        const requested = new URLSearchParams(window.location.search).get('page');
        if (requested === 'all' || window.NAV_PAGES.includes(requested)) start = requested;
    } catch (e) { /* 忽略解析失败 */ }
    await openModule(start);
});
