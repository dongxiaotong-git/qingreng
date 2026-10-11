# 数据库设计（微信云开发）

代扔垃圾小程序的云端数据层基于**微信云开发文档数据库**（NoSQL，MongoDB 风格）。
所有客户端读写都通过云函数（admin 上下文）完成，不在小程序端直连数据库，因此集合权限可设为最严格的「仅管理端可读写」。

> 本地演示模式（`USE_CLOUD=false`）不依赖云端数据库，数据存 `wx.Storage`；下文仅描述云端真实环境。

## 一、集合清单

| 集合 | 用途 | 写入方 | 读取方 |
| --- | --- | --- | --- |
| `users` | 用户信息：openid 唯一标识、昵称、头像、角色 | `wxLogin` | `getProfile`、`wxLogin` |
| `role_bindings` | openid → 角色绑定，运营后台配置权限 | 手动 / 后台 | `wxLogin` |
| `orders` | 代扔订单 | `createOrder` | `listOrders`、`getOrder`、`acceptOrder`、`completeOrder` |

## 二、字段结构

### 2.1 users（用户）

| 字段 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| `openid` | string | **用户唯一标识**（微信 openid），登录主键 | `oABC123...` |
| `nickname` | string | 微信昵称（登录页填写能力获取） | `微信用户` |
| `avatar` | string | 头像地址：本地 `wxfile://` 或云存储 `cloud://` 文件 ID | `cloud://xxx.png` |
| `phone` | string | 手机号（可选；个人主体拿不到，默认为空） | `13800000000` |
| `role` | string | 角色：`user` / `courier` / `admin`，由 `role_bindings` 决定 | `user` |
| `sessionKey` | string | `jscode2session` 换得的会话密钥，**仅服务端用，绝不返回客户端** | — |
| `createdAt` | number | 创建时间戳（ms） | `1697000000000` |
| `updatedAt` | number | 更新时间戳（ms） | `1697000000000` |

> `users` 写入走云函数（admin），不会自动带 `_openid`；我们自建 `openid` 字段作为主键，请在 `openid` 上建**唯一索引**。

### 2.2 role_bindings（权限绑定）

| 字段 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| `openid` | string | 目标用户 openid | `oABC123...` |
| `role` | string | 授予角色：`user` / `courier` / `admin` | `courier` |
| `remark` | string | 运营备注（谁配的、原因） | `运营后台手动开通接单` |
| `createdAt` | number | 创建时间戳 | `1697000000000` |
| `updatedAt` | number | 更新时间戳 | `1697000000000` |

> `wxLogin.resolveRole()` 的判定优先级：`role_bindings` 命中 > 用户已有 role > 默认 `user`。
> 集合不存在 / 查询失败**不阻断登录**，仅回退默认角色。
> 运营配置入口：登录后「我的 → 🆔 身份标识」复制 openid，到云控制台 `role_bindings` 加一条记录，重新登录生效。

### 2.3 orders（代扔订单）

| 字段 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| `_id` | string | 文档主键（云自动生成） | `auto` |
| `openid` | string | 下单用户 openid（取自 `cloud.getWXContext().OPENID`，服务端可信） | `oABC123...` |
| `orderNo` | string | 订单号：`YYYYMMDD` + 当日 3 位序号 | `20261011001` |
| `status` | string | 状态：`pending` / `accepted` / `completed` | `pending` |
| `createdAt` | number | 创建时间戳 | `1697000000000` |
| `courier` | string \| null | 接单员 openid | `oCourier...` |
| `courierName` | string | 接单员昵称 | `接单员` |
| `acceptPhoto` | string | 接单拍照（云存储 fileID） | `cloud://xxx.png` |
| `completePhoto` | string | 完成拍照（云存储 fileID） | `cloud://xxx.png` |
| `acceptTime` | number \| null | 接单时间 | `1697000000000` |
| `completeTime` | number \| null | 完成时间 | `1697000000000` |
| `address` / `remark` / `garbageType` … | string | 订单表单的其它业务字段（由下单页传入，结构灵活） | — |

> 业务规则（见各云函数）：
> - 接单（`acceptOrder`）：仅 `pending` 可接；须传拍照；写 `courier/courierName/acceptPhoto/acceptTime`。
> - 完成（`completeOrder`）：仅 `accepted` 且**接单本人**可完成；须传拍照。
> - 列表（`listOrders`）：`user` 只看自己的；`courier` 看未完成 + 自己完成的；`admin` 看全部。

## 三、权限配置（云控制台）

所有集合统一设为 **「仅管理端可读写」**：

- 云函数运行在 admin 上下文，读写**不受集合权限规则限制**，所以权限规则只用来挡住「小程序端直连数据库」的越权访问。
- 本项目客户端一律走 `wx.cloud.callFunction`，不直连，因此可设最严格档。
- 配置路径：云开发控制台 → 数据库 → 对应集合 → 权限设置 → 选择「仅管理端可读写」。

> 若将来需要客户端直连（不推荐），再按需放宽到「仅创建者可读写」等。

## 四、索引建议（云控制台 → 数据库 → 索引管理）

| 集合 | 索引字段 | 类型 | 说明 |
| --- | --- | --- | --- |
| `users` | `openid` | 唯一 | 按 openid 查用户 / upsert |
| `role_bindings` | `openid` | 唯一 | 按 openid 查角色 |
| `orders` | `orderNo` | 普通 | 订单号查询 / 生成序号计数 |
| `orders` | `openid` | 普通 | 用户维度列表 |
| `orders` | `status` | 普通 | 接单员维度筛选未完成单 |
| `orders` | `createdAt` | 普通（降序） | 列表按时间排序 |

## 五、初始化步骤

1. 在 `utils/config.js` 填好 `CLOUD_ENV`，并把 `USE_CLOUD` 改为 `true`（详见 README）。
2. 微信开发者工具 → 云开发 → 上传并部署全部云函数（至少包含 `wxLogin`、`initDB` 及订单相关函数）。
3. 在云函数列表找到 `initDB`，点击「测试」调用一次，返回 `ok: true` 即表示三集合创建完成（已存在会返回 `status: "exists"`，可重复调用）。
4. 到云控制台按 **第三节** 设置三个集合权限、按 **第四节** 建索引。
5. （可选）到 `role_bindings` 手动插入一条管理员记录，便于后续在后台配置其它用户权限。

## 六、注意事项

- **AppSecret / sessionKey 不下发客户端**：`sessionKey` 只存云端，用于解密手机号等，绝不出现在任何云函数返回值里（`getProfile` 已做剥离）。
- **openid 一致性**：订单用 `cloud.getWXContext().OPENID`（服务端可信），用户用 `wxLogin` 的 `jscode2session` openid，两者均为同一微信 openid，可放心关联。
- 本地演示模式与云端字段结构保持一致，切换 `USE_CLOUD` 即可无缝迁移。
