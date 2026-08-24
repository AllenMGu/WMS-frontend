# WMS Web 前端

这是从 [`AllenMGu/WMS`](https://github.com/AllenMGu/WMS) 拆分出的独立 Web 前端仓库。项目为静态 HTML、CSS 和 JavaScript，不需要打包即可部署。

## 本地运行

```bash
python -m http.server 8080
```

浏览器访问 `http://localhost:8080/index.html`。

## 后端连接

后端由 [`AllenMGu/WMS`](https://github.com/AllenMGu/WMS) 提供。默认请求同源 `/api`；独立域名部署时，修改 `config.js`：

```js
window.WMS_CONFIG = {
  apiBaseUrl: "https://wms-api.example.com/api"
};
```

后端同时需要把前端完整 Origin（协议、域名和端口）加入 `ALLOWED_ORIGINS`。生产环境建议由反向代理统一发布前端与 `/api`，减少跨域和令牌策略差异。

## 当前范围

当前界面同时覆盖兼容期通用 WMS 接口和药品 GSP 受控业务基线，包括质量主数据、采购收货、销售发运、退货召回、不合格品处置、养护、批号盘点、承运与在途、温湿度、电子签名、审计追踪和运维合规。

GSP 页面通过后端 `/api/gsp` 工作，并在受监管操作前执行身份再确认和电子签名。当前前后端联调仍依赖后端补齐药品档案、批次、批号库存、质量锁定和合作方资质文件的列表查询接口；相关接口完成前，对应页面会返回后端错误，不能作为完整验收结果。

部分旧页面引用的图片、字体、样式或脚本未包含在原仓库中；这属于拆分前已有的前端资产缺口，需要在正式部署前补齐并完成页面验收。
