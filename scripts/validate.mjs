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

const login = readFileSync("index.html", "utf8");
if (!login.includes("window.WMS_CONFIG?.apiBaseUrl")) {
  errors.push("登录页未从运行时配置读取 API 地址");
}

const recalls = readFileSync("assets/js/pages/recalls.js", "utf8");
if (!recalls.includes("RECALL_COMPLETION_REPORT")) {
  errors.push("召回完成报告未接入电子签名策略");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`已验证 ${htmlFiles.length} 个 HTML 页面、运行时 API 配置和关键 GSP 签名策略。`);
