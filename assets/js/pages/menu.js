/* 全部功能：左侧全目录按钮 + 右侧 iframe 加载子页面（点击按钮即在页面内加载，不跳转） */
'use strict';
window.PAGE_TITLE = '全部功能';
const content = () => document.getElementById('pageContent');
let currentPage = 'dashboard.html';

window.pageInit = function () {
    render();
};

function render() {
    const groups = (typeof NAV_GROUPS !== 'undefined' && NAV_GROUPS.length)
        ? NAV_GROUPS
        : [{ title: '功能目录', items: [
            { page: 'dashboard.html', icon: 'fa-dashboard', label: '合规概览' },
            { page: 'goods.html', icon: 'fa-barcode', label: '货物管理' },
            { page: 'warehouses.html', icon: 'fa-building', label: '仓库与库位' },
            { page: 'users.html', icon: 'fa-users', label: '用户与岗位' },
        ]}];
    const holder = content();
    holder.style.padding = '0';
    holder.innerHTML = `
        <div class="menu-layout">
            <div class="menu-side">
                <div class="menu-head"><i class="fa fa-th-large mr-2"></i>全部功能</div>
                ${groups.map(g => `
                    <div class="menu-group-title">${esc(g.title)}</div>
                    ${g.items.map(it => `
                        <button type="button" class="menu-btn ${it.page === currentPage ? 'active' : ''}" data-page="${it.page}">
                            <i class="fa ${esc(it.icon)}"></i><span>${esc(it.label)}</span>
                        </button>`).join('')}
                `).join('')}
            </div>
            <div class="menu-main">
                <iframe id="hubFrame" src="${currentPage}" title="子页面"></iframe>
            </div>
        </div>`;
    holder.querySelectorAll('.menu-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = btn.dataset.page;
            document.getElementById('hubFrame').src = currentPage;
            holder.querySelectorAll('.menu-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
    });
}
