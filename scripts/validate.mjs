import { existsSync, readFileSync, readdirSync } from "node:fs";

const htmlFiles = readdirSync(".").filter((name) => name.endsWith(".html"));
const errors = [];
const requiredGspPages = [
  "audit.html",
  "dashboard.html",
  "disposition.html",
  "environment.html",
  "maintenance.html",
  "operations.html",
  "partners.html",
  "procurement.html",
  "products.html",
  "recalls.html",
  "returns.html",
  "sales.html",
  "signatures.html",
  "stocktaking.html",
  "trace.html",
  "transport.html",
  "users.html",
];

if (htmlFiles.length === 0) {
  errors.push("未找到 HTML 页面");
}

for (const page of requiredGspPages) {
  if (!htmlFiles.includes(page)) {
    errors.push(`缺少 GSP 页面 ${page}`);
  }
}

for (const file of htmlFiles) {
  const content = readFileSync(file, "utf8");
  const configTag = '<script src="config.js"></script>';
  const configIndex = content.indexOf(configTag);
  if (configIndex < 0) {
    errors.push(`${file} 未加载运行时 config.js`);
    continue;
  }

  const commonIndex = content.indexOf('<script src="assets/js/common.js"></script>');
  if (commonIndex >= 0 && configIndex > commonIndex) {
    errors.push(`${file} 必须在 common.js 之前加载 config.js`);
  }
}

for (const file of ["config.js", "assets/js/common.js", "assets/js/utils.js"]) {
  if (!existsSync(file)) {
    errors.push(`缺少关键文件 ${file}`);
    continue;
  }
  const content = readFileSync(file, "utf8");
  if (!content.includes("WMS_CONFIG")) {
    errors.push(`${file} 未使用 WMS_CONFIG`);
  }
}

const common = readFileSync("assets/js/common.js", "utf8");
if (!common.includes("window.WMS_CONFIG?.apiBaseUrl")) {
  errors.push("common.js 未从运行时配置读取 API 地址");
}
if (!common.includes("logoutOn401: false")) {
  errors.push("电子签名身份再确认失败时仍可能触发全局退出");
}
if (!common.includes("typeof window.pageInit === 'function'")) {
  errors.push("签名操作成功后未配置默认页面刷新");
}

const login = readFileSync("index.html", "utf8");
if (!login.includes("window.WMS_CONFIG?.apiBaseUrl")) {
  errors.push("登录页未从运行时配置读取 API 地址");
}

const recalls = readFileSync("assets/js/pages/recalls.js", "utf8");
if (!recalls.includes("RECALL_COMPLETION_REPORT")) {
  errors.push("召回完成报告未接入电子签名策略");
}

const dashboard = readFileSync("assets/js/pages/dashboard.js", "utf8");
if (dashboard.includes("catch (e) { rows = []; }")) {
  errors.push("合规概览仍将接口错误误显示为无告警或无锁定");
}

const partners = readFileSync("assets/js/pages/partners.js", "utf8");
if (partners.includes("catch (e) { docs = []; }")) {
  errors.push("合作方资质接口错误仍被误显示为空清单");
}

const environment = readFileSync("assets/js/pages/environment.js", "utf8");
if (!environment.includes("/verify-chain")) {
  errors.push("温湿度监测页未接入读数链核验");
}
if (!environment.includes("/alarms/scan-offline")) {
  errors.push("温湿度监测页未接入离线点位扫描");
}

if (!common.includes("/gsp/roles/me") || !common.includes("canAccessPage")) {
  errors.push("前端未接入有效岗位导航控制");
}
if (common.includes("new Date().toISOString().slice(0, 10)")) {
  errors.push("默认业务日期仍使用 UTC，非本地日期");
}
if (!common.includes("async function apiAll")) {
  errors.push("目录查询缺少完整分页加载");
}

const procurement = readFileSync("assets/js/pages/procurement.js", "utf8");
if (!procurement.includes("renderControlledReceiptPrint") || !procurement.includes("printWindow.print()")) {
  errors.push("收货受控打印仍仅登记记录，未生成可打印副本");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`已验证 ${htmlFiles.length} 个 HTML 页面、运行时 API 配置、错误反馈和关键 GSP 签名策略。`);
