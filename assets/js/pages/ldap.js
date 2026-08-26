/* LDAP：只读配置状态 + 管理员用户导入（配置本身由外部秘密管理，运行期不可修改）
 * SPA 模块：window.PAGES['ldap'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = 'LDAP配置';
    let _el = null;
    const content = () => _el;
    let cfg = null;

    const isAdmin = () => !!(currentUser && currentUser.role === 'admin');

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        render();
        await load();
    }

    function render() {
        content().innerHTML = `
        <div class="card mb-4">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-server mr-2" style="color:var(--primary)"></i>LDAP / AD 目录连接状态</span>
            </div>
            <div class="card-body" id="cfgBody">
                <div class="empty-state">加载中...</div>
            </div>
        </div>
        <div class="card">
            <div class="card-header">
                <span class="card-title"><i class="fa fa-cloud-download mr-2" style="color:var(--primary)"></i>LDAP 用户导入</span>
                ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="ldImportBtn"><i class="fa fa-upload"></i> 从目录导入用户</button>` : ''}
            </div>
            <div class="card-body">
                <p class="text-sm mb-3" style="color:var(--gray-500)">
                    导入只建立<b>无仓库、无 GSP 岗位</b>的最小权限账号（默认操作员），访问权限须在"用户与岗位"中单独审批授予；
                    目录口令不在本系统保存，导入用户仍通过 AD/LDAP 认证登录。导入连接参数由受控运行环境配置，界面不接受自定义连接信息。
                </p>
                <div id="ldImportResult"></div>
            </div>
        </div>`;
        document.getElementById('ldImportBtn')?.addEventListener('click', doImport);
    }

    async function load() {
        try {
            cfg = await api('/ldap/config');
            renderCfg();
        } catch (e) { showToast(e.message, 'error'); }
    }

    function renderCfg() {
        const body = document.getElementById('cfgBody');
        if (!body) return;
        const mode = cfg.ldap_transport_mode || '未知';
        const modeBadge = mode === 'LDAPS' ? badge('LDAPS（加密）', 'success') : mode === 'STARTTLS' ? badge('STARTTLS（加密）', 'success') : badge(mode, 'danger');
        const items = [
            ['目录服务器', cfg.ldap_server],
            ['传输模式', modeBadge],
            ['TLS 证书校验', cfg.ldap_tls_validate ? badge('开启', 'success') : badge('关闭', 'danger')],
            ['允许明文认证（LDAP 389）', cfg.ldap_allow_plaintext_auth ? badge('是（需风险批准）', 'danger') : badge('否', 'success')],
            ['Base DN', cfg.ldap_base_dn],
            ['绑定 DN', cfg.ldap_admin_dn || '-'],
            ['用户搜索过滤器', cfg.ldap_user_search_filter],
            ['配置来源', cfg.managed_externally ? badge('外部秘密管理（受控变更）', 'info') : badge('未知', 'warning')],
        ];
        body.innerHTML = `
        <div class="grid grid-2 gap-4">
            ${items.map(([k, v]) => `
                <div class="flex items-center justify-between" style="padding:10px 14px;background:var(--gray-50);border-radius:8px">
                    <span class="text-sm" style="color:var(--gray-500)">${esc(k)}</span>
                    <span class="font-medium" style="font-size:13px">${v}</span>
                </div>`).join('')}
        </div>
        <div class="alert alert-info mt-4" style="margin-top:16px">
            <i class="fa fa-lock mr-2"></i>
            LDAP 连接与绑定凭据由<b>外部秘密管理 + 部署配置</b>注入，运行时不可通过界面或 API 修改（修改须走受控变更流程并重启服务），
            以符合 GSP 附录"计算机系统"与系统数据完整性要求；绑定密码在任何接口中均不回显。
        </div>`;
    }

    async function doImport() {
        confirmModal('将从目录按当前搜索过滤器导入用户（跳过已存在账号），仅建立无仓库、无GSP岗位的最小权限账号。确定继续吗？', async () => {
            try {
                const res = await api('/ldap/import-users', { method: 'POST' });
                document.getElementById('ldImportResult').innerHTML = `
                    <div class="alert alert-success"><i class="fa fa-check-circle mr-2"></i>
                        成功导入 <b>${res.imported}</b> 个用户，跳过 <b>${res.skipped}</b> 个用户。
                    </div>`;
                showToast('导入完成', 'success');
            } catch (e) {
                document.getElementById('ldImportResult').innerHTML = `
                    <div class="alert alert-error"><i class="fa fa-times-circle mr-2"></i>${esc(e.message)}</div>`;
                showToast(e.message, 'error');
            }
        }, '开始导入');
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['ldap'] = {
        title: 'LDAP配置',
        icon: 'fa-server',
        desc: 'LDAP/AD 目录状态与用户导入',
        init: pageInit,
        fn: { doImport },
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 ldap.html
})();
