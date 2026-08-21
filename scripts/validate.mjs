import { existsSync, readFileSync, readdirSync } from "node:fs";

const htmlFiles = readdirSync(".").filter((name) => name.endsWith(".html"));
const errors = [];

if (htmlFiles.length === 0) {
  errors.push("未找到 HTML 页面");
}

for (const file of htmlFiles) {
  const content = readFileSync(file, "utf8");
  if (!content.includes('<script src="config.js"></script>')) {
    errors.push(`${file} 未加载运行时 config.js`);
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

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`已验证 ${htmlFiles.length} 个 HTML 页面和运行时 API 配置。`);
