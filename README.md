# 代扔垃圾小程序

一个「线上下单、专人上门代扔垃圾」的微信小程序。支持普通用户下单、接单员接单/完成、管理员查看，覆盖了需求文档中的全部核心流程。

## 一、技术选型说明（与原需求文档的差异）

原需求文档写的是「uni-app + php + 微信云开发」。这里做了两点工程修正，原因说明如下：

1. **php 无法运行在微信云开发上**：微信云开发（CloudBase）的云函数只支持 Node.js，不托管 PHP。因此后端改为**微信云开发 Node.js 云函数**，既满足「无需购买服务器」，也最贴合「微信小程序 + 微信云开发」的技术栈。
2. **前端用原生微信小程序而非 uni-app**：原生小程序可直接用「微信开发者工具」打开运行，无需 HBuilderX / 编译步骤，开箱即用、最稳。若团队坚持 uni-app，本项目的页面逻辑可平滑迁移到 uni-app 的 `.vue` 结构。

> 如确需 uni-app 版本，可后续基于本项目的 `pages/` 逻辑改造，数据层 `utils/api.js` 可原样复用。

## 二、两种运行模式

项目内置 **本地演示模式**（默认），无需任何后端即可体验全部功能；也可切换到 **微信云开发模式** 接入真实后端。

### 模式一：本地演示模式（默认，推荐先体验）
- 打开 `utils/config.js`，确认 `USE_CLOUD = false`（默认值）。
- 用「微信开发者工具」导入本项目根目录即可直接运行。
- 订单、用户数据存于小程序本地 `Storage`，刷新/重装会清空（演示性质）。

### 模式二：微信云开发模式（生产）
1. 在微信开发者工具中开通「云开发」，拿到**环境 ID**。
2. 把 `utils/config.js` 改为 `USE_CLOUD = true`，并填写 `CLOUD_ENV = '你的环境ID'`。
3. 在云开发控制台创建数据库集合：**`orders`**、**`users`**（orders 建议加索引 `orderNo`、`status`、`openid`）。
4. 右键 `cloudfunctions/` 下每个文件夹 →「上传并部署：云端安装依赖」，共 8 个云函数：
   `getProfile` / `genOrderNo` / `createOrder` / `listOrders` / `getOrder` / `acceptOrder` / `completeOrder` / `wxLogin`（旧的 `login` 已被 `wxLogin` 取代，不再需要）。

   > **登录流程（标准微信登录，手机号全自动授权）**：
   > 1. 登录页点头像（`open-type="chooseAvatar"`）选头像、填昵称（`type="nickname"`）；**手机号不提供手动输入**；
   > 2. 「微信一键登录」按钮本身就是 `open-type="getPhoneNumber"` —— 点一次同时触发手机号授权，回调里拿到 `phoneCode`；
   > 3. 随后 `api.login()` 调 `wx.login()` 拿登录 `code`，把 `code` + `phoneCode` + 昵称/头像一起传给云函数 `wxLogin`；
   > 4. 云函数用 `jscode2session` 换 `openid` / `session_key`；
   > 5. 云函数拿 `access_token` 调 `https://api.weixin.qq.com/wxa/business/getuserphonenumber` 解密真实手机号；
   > 6. 按 `openid` 创建或更新 `users` 记录，返回用户信息（**不含 `sessionKey`**）。
   >
   > ⚠️ `jscode2session` **必须在服务端调用**，不能放在小程序客户端（否则 `AppSecret` 会泄露）。请在小程序后台「开发管理 → 开发设置」拿到 AppID 和 AppSecret，并配置到 `wxLogin` 云函数的**环境变量** `WX_APPID` / `WX_SECRET`（不要在源码里硬编码）。
   >
   > 📌 头像来自 `chooseAvatar` 的**临时路径**，直接存会在重启后失效：本地模式会 `saveFile` 持久化，云模式会上传到云存储换 `fileID`，逻辑见 `utils/api.js` 的 `persistAvatar`。
   >
   > ❗ **手机号是必填项**：云函数只认 `phoneCode` 解密的结果，不再接受客户端传来的 `phone`。解密失败（常见原因：个人主体小程序没有 `getuserphonenumber` 权限、`phoneCode` 已用过一次）会直接抛错并由前端提示重新授权，**不会静默降级**。
5. 真机/体验版中，微信支付需配合商户号并在 `create-order.js` 的 `mockPay` 处替换为 `wx.requestPayment`（由云函数统一下单返回 `prepay_id`）。

## 三、如何导入运行

1. 打开微信开发者工具 → 导入项目 → 选择本项目根目录 `trash-delivery-miniprogram/`。
2. AppID：默认 `touristappid`（游客模式，可本地体验）；正式发布请替换为你的小程序 AppID，并开通云开发。
3. 编译后即可在模拟器中操作。

## 四、三种角色与体验入口

登录页提供「身份快速选择」（Demo 便捷入口，**生产应由后台按真实手机号配置角色**，而不是让用户在客户端自选）：

| 角色 | 权限 |
|------|------|
| 普通用户 | 下单、查看自己的订单 |
| 接单员 | 接单 / 完成订单（需拍照） |
| 管理员 | 查看全部订单 |

> 接单端与普通用户端是同一个 App，靠登录角色区分。在「我的 → 切换身份」可一键切换体验三种角色。
>
> 注：`utils/config.js` 里的 `DEMO_ACCOUNTS`（`13800000000` → 管理员、`13800000001` → 接单员）是早期手动输入手机号时的调试映射。手机号改为微信授权获取后，真实号码不会命中这两个值，该映射仅在本地演示模式（`USE_CLOUD=false`）下生效。

## 五、功能与需求文档对照

| 需求 | 实现位置 |
|------|---------|
| 三种权限（管理员/普通用户/接单员，按手机号区分） | `utils/config.js` DEMO_ACCOUNTS、登录页身份选择 |
| 底部菜单：首页 / 订单 / 我的 | `app.json` tabBar（自定义，见 `custom-tab-bar/`） |
| 首页套餐选择（单次/包周/包月） | `pages/home` |
| 订单号 = 当天日期 + 序号（如 20261009001） | `utils/api.js` genOrderNo |
| 地址（必填、到门牌号） | `pages/create-order` |
| 垃圾类型（生活/大件），选择后提示 ≤5 袋、放门口 | `pages/create-order`（showTrashTip） |
| 日期（默认当天）、时间段（早6-8 / 晚8-12，必填） | `pages/create-order` |
| 图片（必填，上传垃圾图） | `pages/create-order` |
| 备注（选填） | `pages/create-order` |
| 微信支付后创建；包周/包月无需再支付 | `pages/create-order` submit（mockPay 模拟） |
| 订单列表 + 状态（待处理-已接单-已完成） | `pages/orders` |
| 接单前须拍照，否则不可接单 | `pages/order-detail` showAccept + onAccept |
| 完成后须再次拍照，否则无法完成 | `pages/order-detail` showComplete + onComplete |

## 六、目录结构

```
trash-delivery-miniprogram/
├── app.js / app.json / app.wxss         # 全局配置与样式
├── project.config.json / sitemap.json   # 开发者工具配置
├── custom-tab-bar/                      # 自定义底部 TabBar
├── pages/
│   ├── login/                           # 登录 / 角色选择
│   ├── home/                            # 首页：套餐选择
│   ├── create-order/                    # 创建订单 + 支付
│   ├── orders/                          # 订单列表 + 状态筛选
│   ├── order-detail/                    # 订单详情 + 接单/完成
│   └── profile/                         # 我的 + 角色切换
├── utils/
│   ├── config.js                        # 全局配置（模式/角色/套餐）
│   ├── util.js                          # 日期、订单号、状态映射
│   └── api.js                           # 数据层（本地 / 云开发 双实现）
└── cloudfunctions/                      # 微信云开发云函数（8 个）
```

## 七、已知限制 / 后续可扩展
- 本地模式下订单图片用 `saveFile` 持久化，重装小程序会失效；云开发模式建议改用 `wx.cloud.uploadFile` 上传到云存储。
- 微信支付为模拟实现，正式上线需接入商户号。
- 角色目前靠「手机号 → 角色」映射，生产应结合手机号验证码 / 企业微信通讯录做真实权限校验。
- 可补充：订单取消、评价、消息通知、接单员派单范围等。
