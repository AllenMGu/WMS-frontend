/* 合规概览：统计卡片 + 需关注清单 + 环境告警
 * SPA 模块：window.PAGES['dashboard'] = { title, icon, desc, init, fn } */
(function () {
    'use strict';
    window.PAGE_TITLE = '合规概览';
    let _el = null;
    const content = () => _el;

    async function pageInit(el) { _el = el || document.getElementById('pageContent');
        await loadSummary();
        await loadAlarms();
        await loadHolds();
    }

    function statCard(icon, bg, label, value, link) {
        return `
        <a href="${link || '#'}" class="stat-card card-hover" style="text-decoration:none">
            <div class="stat-icon" style="background:${bg}"><i class="fa ${icon}"></i></div>
            <div>
                <div class="stat-value">${esc(value ?? '-')}</div>
                <div class="stat-label">${esc(label)}</div>
            </div>
        </a>`;
    }

    async function loadSummary() {
        const data = await api('/gsp/compliance/summary');
        content().innerHTML = `
        <div class="grid grid-5 gap-3 mb-4" id="statCards"></div>
        <div class="grid grid-2 gap-4">
            <div class="card">
                <div class="card-header"><span class="card-title"><i class="fa fa-exclamation-triangle text-yellow-500 mr-2"></i>需关注事项</span></div>
                <div class="card-body" id="attentionList"></div>
            </div>
            <div class="card">
                <div class="card-header"><span class="card-title"><i class="fa fa-bell text-red-500 mr-2"></i>实时温湿度告警</span></div>
                <div class="card-body p-0" id="alarmList"></div>
            </div>
        </div>
        <div class="card mt-4">
            <div class="card-header"><span class="card-title"><i class="fa fa-lock text-purple-600 mr-2"></i>有效质量锁定</span></div>
            <div class="card-body p-0" id="holdList"></div>
        </div>
    `;
        const cards = [
            statCard('fa-file-text-o', '#f59e0b', '待审批品种档案', data.pending_product_approvals, 'products.html'),
            statCard('fa-handshake-o', '#f59e0b', '待审批合作方', data.pending_partner_approvals, 'partners.html'),
            statCard('fa-id-card-o', '#ef4444', '过期证照/文件', (data.expired_partner_licenses || 0) + (data.expired_partner_documents || 0), 'partners.html'),
            statCard('fa-list-alt', '#f59e0b', '供货品种授权待处理', (data.pending_supplier_product_authorizations || 0) + (data.near_expiry_supplier_product_authorizations || 0) + (data.expired_supplier_product_authorizations || 0), 'partners.html'),
            statCard('fa-hourglass-half', '#3b82f6', '近效期批次(90天)', data.near_expiry_batches, 'products.html'),
            statCard('fa-lock', '#ef4444', '质量锁定', data.active_quality_holds, 'products.html'),
            statCard('fa-shopping-cart', '#3b82f6', '流转中销售订单', data.pending_sales_orders, 'sales.html'),
            statCard('fa-check-square-o', '#8b5cf6', '待出库复核', data.pending_outbound_reviews, 'sales.html'),
            statCard('fa-truck', '#f59e0b', '待承运审批', data.pending_carrier_approvals, 'transport.html'),
            statCard('fa-exclamation-circle', '#ef4444', '运输异常(待质量处理)', data.open_transport_exceptions, 'transport.html'),
            statCard('fa-thermometer-half', '#ef4444', '温湿度告警', data.open_environment_alarms, 'environment.html'),
            statCard('fa-undo', '#f59e0b', '待检验退回', data.pending_return_inspections, 'returns.html'),
            statCard('fa-bullhorn', '#ef4444', '执行中召回', data.active_recalls, 'recalls.html'),
        ];
        document.getElementById('statCards').innerHTML = cards.join('');

        const attention = [];
        if (data.expired_partner_licenses) attention.push(['danger', '过期合作方许可证', `${data.expired_partner_licenses} 家合作方许可证已过期`, 'partners.html']);
        if (data.expired_partner_documents) attention.push(['danger', '过期资质文件', `${data.expired_partner_documents} 份已核验资质文件过期`, 'partners.html']);
        if (data.pending_supplier_product_authorizations) attention.push(['info', '供货品种授权待审批', `${data.pending_supplier_product_authorizations} 条供应商品种关联待独立审批`, 'partners.html']);
        if (data.near_expiry_supplier_product_authorizations) attention.push(['warning', '供货品种授权临期', `${data.near_expiry_supplier_product_authorizations} 条授权将在 ${data.supplier_product_warning_days || 30} 天内到期`, 'partners.html']);
        if (data.expired_supplier_product_authorizations) attention.push(['danger', '供货品种授权过期', `${data.expired_supplier_product_authorizations} 条授权已过期并阻断采购`, 'partners.html']);
        if (data.expired_batches) attention.push(['danger', '过期批次', `${data.expired_batches} 个批次已过期`, 'products.html']);
        if (data.active_quality_holds) attention.push(['warning', '质量锁定', `${data.active_quality_holds} 个批次处于质量锁定`, 'products.html']);
        if (data.pending_nonconforming_dispositions) attention.push(['danger', '不合格品待批准', `${data.pending_nonconforming_dispositions} 条不合格品记录待处置批准`, 'disposition.html']);
        if (data.approved_nonconforming_pending_execution) attention.push(['warning', '不合格品待执行', `${data.approved_nonconforming_pending_execution} 条已批准处置待执行`, 'disposition.html']);
        if (data.pending_recall_completion_reports) attention.push(['warning', '召回完成报告待提交', `${data.pending_recall_completion_reports} 个已关闭召回缺少完成报告`, 'recalls.html']);
        if (data.overdue_recall_completion_reports) attention.push(['danger', '召回完成报告逾期', `${data.overdue_recall_completion_reports} 个召回完成报告已逾期`, 'recalls.html']);
        if (data.active_recalls) attention.push(['danger', '执行中召回', `${data.active_recalls} 个召回正在执行`, 'recalls.html']);
        if (data.pending_integration_messages) attention.push(['info', '待发送集成消息', `${data.pending_integration_messages} 条出站消息待发送`, 'audit.html']);
        if (data.overdue_in_transit_tasks) attention.push(['danger', '在途超期任务', `${data.overdue_in_transit_tasks} 个运输任务已超过预计到达时间`, 'transport.html']);
        if (data.open_transport_exceptions) attention.push(['danger', '运输异常', `${data.open_transport_exceptions} 条运输异常待质量决策`, 'transport.html']);
        if (data.critical_environment_alarms) attention.push(['danger', '关键温湿度告警', `${data.critical_environment_alarms} 条严重告警未解除`, 'environment.html']);
        if (data.expired_environment_calibrations) attention.push(['warning', '监测设备校准过期', `${data.expired_environment_calibrations} 台设备校准已过期`, 'environment.html']);
        if (data.expired_unused_signature_challenges) attention.push(['warning', '过期未用签名挑战', `${data.expired_unused_signature_challenges} 个签名挑战已过期未使用`, 'signatures.html']);
        if (data.pending_outbound_reviews) attention.push(['info', '待出库复核', `${data.pending_outbound_reviews} 单备货待独立复核`, 'sales.html']);
        if (data.pending_carrier_approvals) attention.push(['info', '待承运审批', `${data.pending_carrier_approvals} 家承运方待审批`, 'transport.html']);
        if (data.pending_return_inspections) attention.push(['info', '销后退回待检验', `${data.pending_return_inspections} 条退回明细待检验`, 'returns.html']);
        if (data.delivered_pending_transport_close) attention.push(['info', '待关闭运输任务', `${data.delivered_pending_transport_close} 个已送达任务待关闭`, 'transport.html']);
        if (!attention.length) attention.push(['success', '暂无待处理事项', '所有合规指标正常', '#']);

        document.getElementById('attentionList').innerHTML = attention.map(([cls, title, desc, link]) => `
        <a href="${link}" class="flex items-start gap-3 p-3" style="border-bottom:1px solid var(--gray-100);text-decoration:none">
            <i class="fa fa-circle mt-1" style="color:var(--${cls === 'danger' ? 'red' : cls === 'warning' ? 'yellow' : cls === 'info' ? 'blue' : 'green'}-500);font-size:8px"></i>
            <div class="flex-1">
                <div class="text-sm font-medium" style="color:var(--gray-800)">${esc(title)}</div>
                <div class="text-xs" style="color:var(--gray-500)">${esc(desc)}</div>
            </div>
            <i class="fa fa-chevron-right mt-1" style="color:var(--gray-300)"></i>
        </a>`).join('') || '<div class="empty-state">无记录</div>';
    }

    async function loadAlarms() {
        let rows = [];
        try { rows = await apiAll('/gsp/environment/alarms'); } catch (e) { rows = []; }
        const open = rows.filter(r => ['OPEN', 'ACKNOWLEDGED'].includes(r.status)).slice(0, 8);
        document.getElementById('alarmList').innerHTML = open.length ? `
        <table class="data-table">
            <thead><tr><th>告警号</th><th>类型</th><th>级别</th><th>观测值</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>${open.map(a => `
                <tr>
                    <td>${esc(a.alarm_no)}</td>
                    <td>${esc(a.alarm_type)}</td>
                    <td>${badge(a.severity, a.severity === 'CRITICAL' ? 'danger' : a.severity === 'HIGH' ? 'warning' : 'info')}</td>
                    <td>${esc(a.observed_value)} / ${esc(a.threshold_value)}</td>
                    <td>${statusBadge(a.status)}</td>
                    <td>${fmtDT(a.opened_at)}</td>
                </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state"><i class="fa fa-check-circle text-green-500 mr-2"></i>当前无未处理告警</div>';
    }

    async function loadHolds() {
        let rows = [];
        try { rows = await api('/gsp/quality-holds'); } catch (e) { rows = []; }
        const active = rows.filter(r => r.status === 'ACTIVE').slice(0, 10);
        document.getElementById('holdList').innerHTML = active.length ? `
        <table class="data-table">
            <thead><tr><th>ID</th><th>批号</th><th>原因代码</th><th>原因</th><th>发起时间</th></tr></thead>
            <tbody>${active.map(h => `
                <tr>
                    <td>${h.id}</td>
                    <td class="font-medium">${esc(h.batch_no)}</td>
                    <td>${badge(h.reason_code, h.reason_code === 'RECALL' ? 'danger' : h.reason_code === 'NONCONFORMING' ? 'danger' : 'warning')}</td>
                    <td>${esc(h.reason)}</td>
                    <td>${fmtDT(h.initiated_at)}</td>
                </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state">无有效质量锁定</div>';
    }

    window.PAGES = window.PAGES || {};
    window.PAGES['dashboard'] = {
        title: '合规概览',
        icon: 'fa-dashboard',
        desc: 'GSP 合规汇总、需关注事项与告警',
        init: pageInit,
        fn: {},
    };
    window.pageInit = pageInit; // 兼容直接访问旧页面 dashboard.html
})();
