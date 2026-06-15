# 线上商城试穿嵌入方案（服务点二）

> 目标：把我们的虚拟试穿能力嵌入商家的在线销售页面，让顾客在**商品详情页**就能"上身看看"，
> 降低退货率、提升下单转化。本文是**导入方案与落地路线**，供商务对接与后续排期使用。
> 当前仓库已实现的是 B2B 批量出图（服务点一）；本文档描述的嵌入能力属于**下一阶段**，尚未实现。

---

## 1. 两套接入方式（按商家技术能力选）

### 方案 A —— iframe 嵌入（零开发，面向中小商家 / 档口）

商家只需在商品详情页粘贴一段 HTML：

```html
<iframe
  src="https://app.styleai.com/embed/tryon?merchantId=MERCHANT_ID&productImageUrl=ENCODED_URL"
  width="380" height="600"
  style="border:none;border-radius:16px;overflow:hidden"
  allow="camera">
</iframe>
```

- `merchantId`：商家在我们平台注册后获得的公开标识。
- `productImageUrl`：当前商品的图片 URL（由商家模板动态填入，需 URL-encode）。
- 顾客在 iframe 内上传/拍摄自己的照片 → 生成试穿图，全程不跳离商家网站。
- 顾客**无需注册**，基于匿名会话使用（见 §4）。

**优点**：零开发、5 分钟上线。**约束**：UI 定制有限，跨域受 `X-Frame-Options` / CSP 影响（我们侧放开，商家侧需允许嵌入）。

### 方案 B —— JS SDK（面向有开发能力的商家，可深度定制）

```html
<script src="https://app.styleai.com/sdk/v1/styleai.js"></script>
<script>
  StyleAI.init({ merchantId: 'MERCHANT_ID' });
  StyleAI.mountButton('#tryon-btn', {
    productImageUrl: window.PRODUCT.imageUrl,
    category: 'top',                 // 商品品类，提升试穿贴合度
    onResult: (img) => console.log('tryon result:', img.url),
  });
</script>
<button id="tryon-btn">上身看看</button>
```

- SDK 弹出我们托管的试穿浮层，结果通过 `onResult` 回调返回，商家可自行埋点/展示。
- 适合需要与购物车、收藏、A/B 实验联动的中大型商家。

---

## 2. 顾客侧体验流程

```
商品详情页「上身看看」
   → 上传/拍摄本人照片（或选择已存的虚拟形象）
   → 生成中（约 10–30s，展示骨架屏）
   → 试穿图展示，可切换姿态 / 收藏 / 一键加入购物车
```

- Mobile-first：嵌入页与 SDK 浮层均为窄屏优先布局。
- 首次使用引导一次性拍照要求（正面、光线、全身）。

---

## 3. 需要新增的基础设施（下一阶段实现）

| 模块 | 说明 | 复用现有 |
|---|---|---|
| 商家账户体系 | 商家注册、`merchantId` + 服务端 `merchant_api_key`、充值/套餐 | 复用用户系统、额度系统 |
| 按量计费 | 每次顾客试穿扣商家额度；月度对账 | 复用 `usage_events` 账本、`credits/service.py` |
| 嵌入页 `/embed/tryon` | 无侧边栏、无登录的极简整屏页（参考 `AppShell` 的 `PUBLIC_ROUTES`） | 复用试穿生成管线、任务队列 |
| 公开 SDK `styleai.js` | 注入按钮 + 浮层 + postMessage 通信 | 新增 |
| 域名白名单 / CORS | 商家注册时登记自有域名，校验 `Origin` 防盗刷 | 扩展现有 CORS 配置 |
| 匿名顾客会话 | 24h 有效、无需注册、结果临时存储与过期清理 | 扩展会话与存储 |
| 商家后台 | 试穿次数、转化、Top 商品分析 | 复用管理后台框架 |

### 与现有架构的契合点
- 生成仍走现有 **DB 轮询任务队列**（`app/jobs/`）与 **NanoBanana 供应商**（`app/inference/`），嵌入只是新增入口与计费主体。
- 图片访问沿用 **`/v1/files/{key}` 鉴权**（`app/files/`），匿名会话作为归属主体即可。
- 计费直接复用 **额度账本**，把"用户扣费"扩展为"商家扣费"。

---

## 4. 安全与风控

- **域名白名单**：`merchant_api_key` 仅服务端持有；`merchantId` 公开但绑定注册域名，校验请求 `Origin`/`Referer`。
- **速率限制**：按 `merchantId` + 顾客匿名会话双维度限流，防刷额度。
- **内容合规**：顾客上传照片仅用于本次生成，按隐私政策**短期留存后自动删除**（需配套隐私条款，见路线图法务项）。
- **额度护栏**：商家额度耗尽时降级为"联系商家"提示，不中断商家页面。

---

## 5. 商家导入流程（商务视角）

```
1. 注册 StyleAI 商家账号 → 选套餐 / 充值额度
2. 在「嵌入设置」获取 merchantId + 代码片段（iframe 或 SDK）
3. 登记自有域名（白名单）
4. 把片段贴进商品详情页模板 → 上线
5. 在商家后台查看试穿量 / 转化分析，按量续费
```

---

## 6. 落地优先级建议

| 阶段 | 内容 | 依赖 |
|---|---|---|
| P1 | 商家账户 + 按量计费（复用额度账本） | 无新外部依赖 |
| P2 | `/embed/tryon` 嵌入页 + iframe 接入 | P1 |
| P3 | `styleai.js` SDK + 域名白名单/风控 | P2 |
| P4 | 商家分析后台、A/B 与购物车联动 | P3 |

> 建议先用**方案 A（iframe）**跑通 1–2 家真实商家验证转化效果，再投入 SDK 与分析后台。
> 这与商业化计划 §2.6"先用现有原型 + 人工运营验证有人愿意付费，再建全部基础设施"的思路一致。
