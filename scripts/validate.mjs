import { existsSync, readFileSync } from "node:fs";

const errors = [];
const modules = [
  "audit",
  "dashboard",
  "disposition",
  "environment",
  "goods",
  "ldap",
  "legacy-archive",
  "maintenance",
  "my-training",
  "operations",
  "partners",
  "procurement",
  "products",
  "qms",
  "recalls",
  "returns",
  "sales",
  "signatures",
  "stocktaking",
  "trace",
  "transport",
  "users",
  "warehouses",
];

const requiredFiles = [
  "README.md",
  "config.js",
  "index.html",
  "app.html",
  "assets/js/common.js",
  "assets/js/app.js",
  ...modules.map((name) => `assets/js/pages/${name}.js`),
];

for (const file of requiredFiles) {
  if (!existsSync(file)) errors.push(`缺少关键文件 ${file}`);
}

if (errors.length === 0) {
  const appHtml = readFileSync("app.html", "utf8");
  const indexHtml = readFileSync("index.html", "utf8");
  const common = readFileSync("assets/js/common.js", "utf8");
  const app = readFileSync("assets/js/app.js", "utf8");
  const warehouses = readFileSync("assets/js/pages/warehouses.js", "utf8");
  const users = readFileSync("assets/js/pages/users.js", "utf8");
  const recalls = readFileSync("assets/js/pages/recalls.js", "utf8");
  const environment = readFileSync("assets/js/pages/environment.js", "utf8");
  const dashboard = readFileSync("assets/js/pages/dashboard.js", "utf8");
  const procurement = readFileSync("assets/js/pages/procurement.js", "utf8");
  const disposition = readFileSync("assets/js/pages/disposition.js", "utf8");
  const returns = readFileSync("assets/js/pages/returns.js", "utf8");
  const partners = readFileSync("assets/js/pages/partners.js", "utf8");
  const products = readFileSync("assets/js/pages/products.js", "utf8");
  const qms = readFileSync("assets/js/pages/qms.js", "utf8");
  const myTraining = readFileSync("assets/js/pages/my-training.js", "utf8");
  const legacyArchive = readFileSync("assets/js/pages/legacy-archive.js", "utf8");

  const configIndex = appHtml.indexOf("config.js");
  const commonIndex = appHtml.indexOf("assets/js/common.js");
  if (configIndex < 0 || commonIndex < 0 || configIndex > commonIndex) {
    errors.push("app.html 必须在 common.js 之前加载 config.js");
  }
  if (!indexHtml.includes("config.js") || !indexHtml.includes("window.WMS_CONFIG?.apiBaseUrl")) {
    errors.push("登录页未使用运行时 API 配置");
  }
  if (!common.includes("window.WMS_CONFIG?.apiBaseUrl")) {
    errors.push("common.js 未从运行时配置读取 API 地址");
  }
  if (!common.includes("logoutOn401: false")) {
    errors.push("电子签名身份再确认失败仍可能触发全局退出");
  }
  if (!common.includes("async function apiAll")) {
    errors.push("目录查询缺少完整分页加载");
  }
  if (!common.includes("function installTableEnhancements") || !app.includes("installTableEnhancements")) {
    errors.push("SPA 数据表未统一接入排序和翻页");
  }
  if (!common.includes("aria-sort") || !common.includes("data-page-size")) {
    errors.push("数据表排序或每页条数控制缺失");
  }
  if (environment.includes("readings.slice(-100).reverse()")) {
    errors.push("温湿度读数仍在截取最旧 100 条并反转");
  }
  if (common.includes("new Date().toISOString().slice(0, 10)")) {
    errors.push("默认业务日期仍使用 UTC 日期");
  }
  if (!common.includes("/gsp/roles/me") || !common.includes("canAccessPage")) {
    errors.push("前端未接入有效岗位导航控制");
  }
  if (!common.includes("'my-training.html': ['ANY_GSP_ROLE']")) {
    errors.push("本人培训页面未限制为有效 GSP 岗位");
  }
  if (!common.includes("'qms.html': ['GSP_ROLE_ONLY', 'AUDITOR', 'QUALITY_MANAGER', 'QUALITY_REVIEWER']")) {
    errors.push("质量体系页面仍允许无质量岗位的旧管理员绕过岗位控制");
  }
  if (!qms.includes("refQualityUsers()") || qms.includes("refUsers()")) {
    errors.push("质量体系页面仍依赖管理员用户接口");
  }
  if (!myTraining.includes("/gsp/quality-system/training/me") || !myTraining.includes("/complete")) {
    errors.push("本人培训页面未接入本人查询或完成确认接口");
  }
  if (!myTraining.includes("/gsp/quality-system/capas/me") || !myTraining.includes("/implement")) {
    errors.push("我的质量任务页面未接入本人 CAPA 查询或完成证据接口");
  }
  if (!common.includes("'legacy-archive.html': ['SYSTEM_ADMIN', 'AUDITOR', 'QUALITY_MANAGER', 'QUALITY_REVIEWER']")) {
    errors.push("老 GSP 历史归档页面缺少受控岗位限制");
  }
  if (!legacyArchive.includes("/gsp/legacy-archive/batches") || !legacyArchive.includes("/reconcile") || !legacyArchive.includes("/export")) {
    errors.push("老 GSP 历史归档页面未覆盖迁移、核对或导出闭环");
  }
  if (!common.includes("window.appShellReady") || !app.includes("await window.appShellReady")) {
    errors.push("SPA 启动未等待认证和岗位加载完成");
  }
  if (!app.includes("if (!canAccessPage(page))")) {
    errors.push("SPA 动态模块入口未执行岗位访问检查");
  }
  if ((warehouses.match(/withReason/g) || []).length < 6) {
    errors.push("仓库与库位维护未完整提交真实变更原因");
  }
  if ((users.match(/withReason/g) || []).length < 3) {
    errors.push("用户创建和仓库分配未完整提交真实变更原因");
  }
  if (!users.includes("SYSTEM_ADMIN") || !users.includes("ENVIRONMENT_MONITOR")) {
    errors.push("岗位授权选项未覆盖后端有效岗位集合");
  }
  if (!recalls.includes("RECALL_COMPLETION_REPORT")) {
    errors.push("召回完成报告未接入电子签名策略");
  }
  if (!environment.includes("/verify-chain") || !environment.includes("/alarms/scan-offline")) {
    errors.push("温湿度页面缺少读数链核验或离线扫描");
  }
  if (!procurement.includes("renderControlledReceiptPrint") || !procurement.includes("printWindow.print()")) {
    errors.push("收货受控打印未生成可打印副本");
  }
  if (!procurement.includes("hasAnyGspRole('PROCUREMENT')") || !procurement.includes("hasAnyGspRole('QUALITY_MANAGER', 'QUALITY_REVIEWER')")) {
    errors.push("采购订单提交/取消与质量批准/驳回按钮未按岗位分离");
  }
  if (!disposition.includes("hasAnyGspRole('PROCUREMENT')") || !disposition.includes("hasAnyGspRole('WAREHOUSE_CUSTODIAN')") || !disposition.includes("hasAnyGspRole('QUALITY_MANAGER', 'QUALITY_REVIEWER')")) {
    errors.push("不合格品与购进退出操作按钮未按质量、采购和仓库岗位分离");
  }
  if (!returns.includes("hasAnyGspRole('RETURNS_RECEIVER', 'WAREHOUSE_CUSTODIAN', 'QUALITY_MANAGER', 'QUALITY_REVIEWER')")) {
    errors.push("销后退回取消按钮未按后端授权岗位展示");
  }
  if (!partners.includes("/products") || !partners.includes("approveSupplierProduct") || !partners.includes("suspendSupplierProduct")) {
    errors.push("首营管理未覆盖供应商供货品种关联、批准或暂停闭环");
  }
  if (!partners.includes("products/bulk-import") || !partners.includes("supplier-product-authorization-template.csv")) {
    errors.push("首营管理未接入供应商品种 CSV 批量导入或模板下载");
  }
  if (!partners.includes("supplier-product-authorizations?alert_only=true") || !dashboard.includes("near_expiry_supplier_product_authorizations")) {
    errors.push("供应商品种授权待审、临期和过期预警未完整展示");
  }
  if (!procurement.includes("products?effective_only=true") || !procurement.includes("authorizedGoods")) {
    errors.push("采购建单未按供应商有效供货品种目录过滤产品");
  }
  if (products.includes("/gsp/batches', { method: 'POST'") || products.includes("/gsp/batch-stock/receipt")) {
    errors.push("药品批次页面仍暴露手工批次建档或直接库存增加入口");
  }
  if (!products.includes("由采购收货自动生成") || !products.includes("批准的盘点差异调整")) {
    errors.push("药品批次页面未说明受控批次和库存来源");
  }

  for (const name of modules) {
    const source = readFileSync(`assets/js/pages/${name}.js`, "utf8");
    if (!source.includes(`window.PAGES['${name}']`)) {
      errors.push(`模块 ${name} 未注册到 window.PAGES`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`已验证 ${modules.length} 个 SPA 模块、运行时配置、岗位访问、审计原因和关键 GSP 控制。`);
