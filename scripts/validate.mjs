import { existsSync, readFileSync } from "node:fs";

const errors = [];
const modules = [
  "audit",
  "dashboard",
  "disposition",
  "environment",
  "goods",
  "ldap",
  "maintenance",
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
  const procurement = readFileSync("assets/js/pages/procurement.js", "utf8");
  const products = readFileSync("assets/js/pages/products.js", "utf8");

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
  if (common.includes("new Date().toISOString().slice(0, 10)")) {
    errors.push("默认业务日期仍使用 UTC 日期");
  }
  if (!common.includes("/gsp/roles/me") || !common.includes("canAccessPage")) {
    errors.push("前端未接入有效岗位导航控制");
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
