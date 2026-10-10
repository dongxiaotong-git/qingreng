/**
 * 全局配置
 * ------------------------------------------------------------------
 * 数据模式说明：
 *  - USE_CLOUD = false（默认）：本地演示模式。订单/用户数据存于本地 Storage，
 *    无需任何后端配置，导入微信开发者工具即可直接体验全部功能。
 *  - USE_CLOUD = true：微信云开发模式。需要把 cloudfunctions/ 下的云函数
 *    部署到微信云开发环境，并填写下方 CLOUD_ENV。此时无需自建服务器。
 *
 * 注意：需求文档中提及的「php」无法运行在微信云开发（云开发仅支持 Node.js
 * 云函数）。因此本项目后端采用微信云开发 Node.js 云函数，既满足「无需购买
 * 服务器」，也最贴合「微信小程序 + 微信云开发」的技术栈。
 */

const USE_CLOUD = false;
const CLOUD_ENV = 'your-cloud-env-id'; // 云开发模式时填写你的环境 ID

// 演示账号：手机号 -> 角色。未配置的手机号默认「普通用户」。
// 生产环境应按真实业务通过手机号校验角色，这里仅为本地演示提供便捷入口。
const DEMO_ACCOUNTS = {
  '13262340679': 'admin',   // 管理员
  '13262340679': 'courier'  // 接单员
};

const ROLE_LABELS = {
  admin: '管理员',
  user: '普通用户',
  courier: '接单员'
};

// 套餐配置：single=单次(需支付)，week/month=包周/包月(无需再次支付)
const PACKAGES = [
  {
    id: 'single',
    name: '单次代扔',
    price: 15,
    desc: '单次上门代扔，生活垃圾或大件垃圾均可',
    needPay: true,
    days: 0
  },
  {
    id: 'week',
    name: '包周套餐',
    price: 68,
    desc: '7 天内不限次代扔（不含大件垃圾）',
    needPay: false,
    days: 7
  },
  {
    id: 'month',
    name: '包月套餐',
    price: 228,
    desc: '30 天内不限次代扔（不含大件垃圾）',
    needPay: false,
    days: 30
  }
];

// 垃圾类型
const TRASH_TYPES = [
  { id: 'daily', name: '生活垃圾' },
  { id: 'bulky', name: '大件垃圾' }
];

// 上门时间段
const TIME_SLOTS = [
  { id: 'morning', name: '早上', range: '6:00 - 8:00' },
  { id: 'evening', name: '晚上', range: '20:00 - 24:00' }
];

module.exports = {
  USE_CLOUD,
  CLOUD_ENV,
  DEMO_ACCOUNTS,
  ROLE_LABELS,
  PACKAGES,
  TRASH_TYPES,
  TIME_SLOTS
};
