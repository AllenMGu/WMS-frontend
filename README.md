# WMS Web 前端

这是从 [AllenMGu/WMS](https://github.com/AllenMGu/WMS) 拆分出的独立 Web 前端仓库。后端、Web 前端和微信小程序分别维护，前端代码不进入后端仓库。

当前界面采用静态单页应用（SPA）结构，无需打包：

- `app.html`：SPA 主入口；
- `assets/js/app.js`：模块动态加载与页面内导航；
- `assets/js/pages/*.js`：各业务模块；
- `config.js`：部署时可覆盖的后端 API 地址；
- 旧 `*.html` 地址保留为跳转入口，转到 `app.html?page=...`。

## 本地运行

```bash
python -m http.server 8080
```

浏览器访问 `http://localhost:8080/index.html`。

## 后端连接

后端由 [AllenMGu/WMS](https://github.com/AllenMGu/WMS) 提供。默认请求同源 `/api`。独立域名部署时修改 `config.js`：

```js
window.WMS_CONFIG = {
  apiBaseUrl: "https://wms-api.example.com/api"
};
```

后端需要把前端完整 Origin（协议、域名和端口）加入 `ALLOWED_ORIGINS`。生产环境建议通过反向代理统一发布前端和 `/api`。

## 权限与审计

- 页面菜单根据 `GET /api/gsp/roles/me` 返回的有效岗位过滤；
- 后端权限仍是最终授权边界，隐藏按钮不能替代服务端校验；
- 仓库、库位、用户创建和仓库权限分配要求填写真实变更原因；
- 电子签名密码核验失败不会误清除当前登录会话；
- 管理员停用、岗位授权和其他受控操作继续使用后端审计链与电子签名控制。

## 当前范围

当前 SPA 覆盖货物、仓库库位、合作方、药品批次、采购收货、养护、温湿度、盘点、销售发运、运输签收、退货、不合格品、召回、追溯、用户岗位、LDAP、电子签名、审计和运维合规；首营管理支持把供应商与其获准供货品种建立有效期受控的关联，经独立质量批准后，采购建单只显示该供应商的有效品种；“我的质量任务”提供本人 CAPA 与培训闭环，“老 GSP 历史归档”提供受控迁移、独立核对、只读查询、打印和导出。

## 验证

Pull Request 和 `main` 推送会运行前端 CI：

- SPA 文件、运行时配置和模块注册检查；
- GSP 关键前端控制检查；
- 所有维护中的 JavaScript 文件执行 `node --check`。

前端 CI 通过仅代表工程检查通过，正式上线仍需完成目标环境联调、浏览器兼容性验证及 CSV/OQ/PQ 执行。
