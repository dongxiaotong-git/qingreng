/**
 * 数据访问层
 * 同时支持两种模式：
 *  1) 本地演示模式（USE_CLOUD=false）：使用 wx.Storage，开箱即用。
 *  2) 微信云开发模式（USE_CLOUD=true）：调用 cloudfunctions/ 下对应云函数。
 *
 * 所有方法均返回 Promise，便于页面统一处理。
 */
const { USE_CLOUD, CLOUD_ENV, DEMO_ACCOUNTS } = require('./config');
const util = require('./util');

const KEY_USER = 'td_user';
const KEY_ORDERS = 'td_orders';

/* ----------------------------- 本地存储辅助 ----------------------------- */
function getOrders() {
  return wx.getStorageSync(KEY_ORDERS) || [];
}
function saveOrders(list) {
  wx.setStorageSync(KEY_ORDERS, list);
}
function genOrderNoLocal() {
  const today = util.ymd(new Date());
  const todayCount = getOrders().filter(o => (o.orderNo || '').indexOf(today) === 0).length;
  return today + util.pad(todayCount + 1, 3);
}

/* ----------------------------- 云函数封装 ----------------------------- */
function callCloud(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: res => resolve(res.result),
      fail: err => reject(err)
    });
  });
}

// 把临时图片持久化到本地（仅本地模式需要，避免重启后缩略图失效）
function persistImage(tempPath) {
  return new Promise((resolve) => {
    if (!tempPath || USE_CLOUD) return resolve(tempPath);
    const fs = wx.getFileSystemManager();
    fs.saveFile({
      tempFilePath: tempPath,
      success: r => resolve(r.savedFilePath),
      fail: () => resolve(tempPath)
    });
  });
}

/* ----------------------------- 对外接口 ----------------------------- */

// 登录/注册：根据手机号判断角色（演示账号见 config.DEMO_ACCOUNTS）
function login({ phone, role, nickname, avatar }) {
  if (USE_CLOUD) {
    // 标准微信登录：先 wx.login() 拿 code，再让云函数用 jscode2session 换 openid
    return new Promise((resolve, reject) => {
      wx.login({
        success: res => {
          if (!res.code) return reject(new Error('获取微信登录 code 失败'));
          callCloud('wxLogin', { code: res.code, phone, role, nickname, avatar })
            .then(user => {
              wx.setStorageSync(KEY_USER, user);
              resolve(user);
            })
            .catch(reject);
        },
        fail: err => reject(err)
      });
    });
  }
  return new Promise((resolve) => {
    // 本地演示：优先使用登录页主动选择的身份；若手机号命中演示账号则覆盖。
    let finalRole = 'user';
    if (phone && DEMO_ACCOUNTS[phone]) finalRole = DEMO_ACCOUNTS[phone];
    else if (role) finalRole = role;
    const user = {
      openid: 'local_' + (phone || 'demo'),
      phone: phone || '',
      nickname: nickname || '微信用户',
      avatar: avatar || '',
      role: finalRole
    };
    wx.setStorageSync(KEY_USER, user);
    resolve(user);
  });
}

function getProfile() {
  if (USE_CLOUD) {
    const user = wx.getStorageSync(KEY_USER) || {};
    return callCloud('getProfile', { openid: user.openid });
  }
  return Promise.resolve(wx.getStorageSync(KEY_USER) || null);
}

function logout() {
  wx.removeStorageSync(KEY_USER);
  return Promise.resolve();
}

// 生成订单号（当天日期 + 3 位序号）
function genOrderNo() {
  if (USE_CLOUD) return callCloud('genOrderNo', {});
  return Promise.resolve(genOrderNoLocal());
}

// 创建订单
function createOrder(data) {
  if (USE_CLOUD) return callCloud('createOrder', data);
  return new Promise((resolve) => {
    const orders = getOrders();
    const order = Object.assign({
      _id: 'o_' + Date.now(),
      orderNo: genOrderNoLocal(),
      status: 'pending', // pending | accepted | completed
      createdAt: Date.now(),
      courier: null,
      courierName: '',
      acceptPhoto: '',
      completePhoto: '',
      acceptTime: null,
      completeTime: null
    }, data);
    orders.unshift(order);
    saveOrders(orders);
    resolve(order);
  });
}

// 订单列表（按角色过滤）
function listOrders(user) {
  if (USE_CLOUD) return callCloud('listOrders', { role: user.role, openid: user.openid });
  return new Promise((resolve) => {
    let list = getOrders();
    if (user.role === 'user') {
      list = list.filter(o => o.openid === user.openid);
    } else if (user.role === 'courier') {
      // 接单员：看到待处理 + 已接单（自己接的），已完成中仅自己接的可见
      list = list.filter(o => o.status !== 'completed' || o.courier === user.openid);
    }
    // 管理员：看全部
    resolve(list);
  });
}

function getOrder(id) {
  if (USE_CLOUD) return callCloud('getOrder', { id });
  return Promise.resolve(getOrders().find(o => o._id === id) || null);
}

// 接单：必须先传拍照图片
function acceptOrder(id, photo, user) {
  if (USE_CLOUD) return callCloud('acceptOrder', { id, photo, openid: user.openid, nickname: user.nickname });
  return new Promise((resolve, reject) => {
    const list = getOrders();
    const o = list.find(x => x._id === id);
    if (!o) return reject(new Error('订单不存在'));
    if (o.status !== 'pending') return reject(new Error('该订单已被接单'));
    if (!photo) return reject(new Error('请先上传接单拍照'));
    o.status = 'accepted';
    o.courier = user.openid;
    o.courierName = user.nickname;
    o.acceptPhoto = photo;
    o.acceptTime = Date.now();
    saveOrders(list);
    resolve(o);
  });
}

// 完成：必须再次上传拍照，且仅接单本人可操作
function completeOrder(id, photo, user) {
  if (USE_CLOUD) return callCloud('completeOrder', { id, photo, openid: user.openid });
  return new Promise((resolve, reject) => {
    const list = getOrders();
    const o = list.find(x => x._id === id);
    if (!o) return reject(new Error('订单不存在'));
    if (o.status !== 'accepted') return reject(new Error('该订单未接单或已完成'));
    if (o.courier !== user.openid) return reject(new Error('仅接单本人可标记完成'));
    if (!photo) return reject(new Error('请先上传完成拍照'));
    o.status = 'completed';
    o.completePhoto = photo;
    o.completeTime = Date.now();
    saveOrders(list);
    resolve(o);
  });
}

module.exports = {
  login,
  getProfile,
  logout,
  genOrderNo,
  createOrder,
  listOrders,
  getOrder,
  acceptOrder,
  completeOrder,
  persistImage
};
