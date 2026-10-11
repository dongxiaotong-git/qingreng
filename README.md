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
3. 在云开发控制台创建数据库集合：**`orders`**、**`users`**、**`role_bindings`**（权限配置表；orders 建议加索引 `orderNo`、`status`、`openid`）。
4. 右键 `cloudfunctions/` 下每个文件夹 →「上传并部署：云端安装依赖」，共 8 个云函数：
   `getProfile` / `genOrderNo` / `createOrder` / `listOrders` / `getOrder` / `acceptOrder` / `completeOrder` / `wxLogin`（旧的 `login` 已被 `wxLogin` 取代，不再需要）。

   > **登录流程（以 openid 作为用户唯一标识）**：
   > 1. 登录页点头像（`open-type="chooseAvatar"`）选头像、填昵称（`type="nickname"`）；
   > 2. 点「微信一键登录」→ `api.login()` 调 `wx.login()` 拿到登录 `code`；
   > 3. 云函数 `wxLogin` 用 `jscode2session` 把 `code` 换成 **`openid`**（唯一标识）与 `session_key`；
   > 4. 按 `openid` 查询 `role_bindings` 决定角色，再创建或更新 `users` 记录；
   > 5. 返回用户信息（**不含 `sessionKey`**）。
   >
   > ⚠️ `jscode2session` **必须在服务端调用**，不能放在小程序客户端（否则 `AppSecret` 会泄露）。请在小程序后台「开发管理 → 开发设置」拿到 AppID 和 AppSecret，并配置到 `wxLogin` 云函数的**环境变量** `WX_APPID` / `WX_SECRET`（不要在源码里硬编码）。
   >
   > 📌 头像来自 `chooseAvatar` 的**临时路径**，直接存会在重启后失效：本地模式会 `saveFile` 持久化，云模式会上传到云存储换 `fileID`，逻辑见 `utils/api.js` 的 `persistAvatar`。
   >
   > ☎️ **手机号是可选的**：代码仍保留 `getPhoneNumber` 解密链路，传了 `phoneCode` 就尝试记录真实号码，失败也不阻断登录。之所以降级为可选，是因为微信的「手机号快速验证组件」仅对非个人主体开放，个人主体调用必然报 `errno: 102 jsapi has no permission`。
5. 真机/体验版中，微信支付需配合商户号并在 `create-order.js` 的 `mockPay` 处替换为 `wx.requestPayment`（由云函数统一下单返回 `prepay_id`）。

## 三、如何导入运行

1. 打开微信开发者工具 → 导入项目 → 选择本项目根目录 `trash-delivery-miniprogram/`。
2. AppID：`project.config.json` 中已填 `wxde5a0d0535b61047`；换成自己的小程序时改这个字段，并开通云开发。
3. 编译后即可在模拟器中操作。

### 🔑 如何给某个用户配置权限（openid → 角色）

角色**只认 openid**，不让用户自选（否则人人都能把自己设成管理员）。配置步骤：

1. 让该用户登录小程序 → 进「我的」页 → 点 **🆔 身份标识（openid）** 复制自己的 openid。
2. 打开云开发控制台 → 数据库 → 确认存在集合 **`role_bindings`**（不存在就新建）。
3. 往集合里加一条记录：

   ```json
   { "openid": "oXXXXXXXXXXXXXXXX", "role": "admin", "remark": "张三 - 管理员" }
   ```

   `role` 取值：`user`（普通用户）| `courier`（接单员）| `admin`（管理员）。
4. 该用户**重新登录**后生效。

> 优先级：`role_bindings` 里的配置 > 用户已有的 `role` > 默认 `user`。
> `role_bindings` 集合不存在也不会导致登录失败，只是所有人降级为普通用户。

### 🚫 关于手机号：`errno: 102`

若调用 `getPhoneNumber` 报错 `getPhoneNumber:fail operateWXData:fail jsapi has no permission`（错误码 **102**），这是**微信账号资质限制，不是代码问题** —— 「手机号快速验证组件」仅对非个人主体开放：

| 主体类型 | 能否获取手机号 |
|---------|--------------|
| 个人主体 | ❌ 永久不支持 |
| 企业主体 · 未认证 | ❌ 需先完成微信认证（300元/年） |
| 企业主体 · 已认证 | ✅ 在 mp 后台开通「手机号快速验证」组件 |
| 接口测试号 | ✅ 开发阶段权限全开，可用来验证代码 |

因此本项目的登录**不再依赖手机号**，改用 openid 做唯一标识，任何主体都能正常登录。

> **云函数密钥配置**：`cloudfunctions/wxLogin/config.json` 里要填 `WX_APPID`（已填同一个 AppID）+ `WX_SECRET`。
> 该文件含 AppSecret，和 `config.example.json` 一起**被 `.gitignore` 排除，不会入库**。换机器时自己新建 `config.json`，内容如下：
>
> ```json
> {
>   "permissions": { "openapi": [] },
>   "env": {
>     "WX_APPID": "wxde5a0d0535b61047",
>     "WX_SECRET": "你的AppSecret"
>   }
> }
> ```
>
> 🔒 提交前建议自查：`git grep -n "<你的AppSecret>" $(git rev-list --all) -- .` 应无输出。
> 若密钥曾外泄，请到微信公众平台重置。

## 四、三种角色与体验入口

**登录页不提供身份选择** —— 角色一律由服务端按 **openid**（用户唯一标识）判定，不允许客户端自选（否则用户可把自己提权成管理员）：

| 角色 | 权限 | 如何获得 |
|------|------|---------|
| 普通用户 | 下单、查看自己的订单 | 默认，登录即是 |
| 接单员 | 接单 / 完成订单（需拍照） | 往 `role_bindings` 加 `{openid, role:"courier"}` |
| 管理员 | 查看全部订单 | 往 `role_bindings` 加 `{openid, role:"admin"}` |

配置方法见上一节「🔑 如何给某个用户配置权限」。

> 接单端与普通用户端是同一个 App，靠登录角色区分。
>
> - **云开发模式**：角色在 `wxLogin` 云函数的 `resolveRole()` 里确定，读取 `role_bindings` 集合；集合没记录就沿用用户已有的角色，再没有则默认 `user`。
> - **本地演示模式**（`USE_CLOUD=false`）：没有服务端，`openid` 用本地生成的 `demo_xxx`；「我的 → 切换身份」可直接在三种角色间切换，方便一个人体验全部视角。

## 五、功能与需求文档对照

| 需求 | 实现位置 |
|------|---------|
| 三种权限（管理员/普通用户/接单员） | `cloudfunctions/wxLogin` 的 `resolveRole()` 按 openid 查 `role_bindings`；演示模式在「我的」页切换 |
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
