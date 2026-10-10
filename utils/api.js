/**
 * 数据访问层
 * 同时支持两种模式：
 *  1) 本地演示模式（USE_CLOUD=false）：使用 wx.Storage，开箱即用。
 *  2) 微信云开发模式（USE_CLOUD=true）：调用 cloudfunctions/ 下对应云函数。
 *
 * 所有方法均返回 Promise，便于页面统一处理。
 */
const { USE_CLOUD } = require('./config');
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

// 头像持久化：wx.chooseAvatar 返回的是临时路径，重启即失效，
// 本地模式存本地文件，云模式上传云存储，拿 fileID。
function persistAvatar(tempPath) {
  if (!tempPath) return Promise.resolve('');
  // 已经是持久化地址（本地 wxfile 或云 fileID）就不重复处理
  if (tempPath.indexOf('cloud://') === 0 || tempPath.indexOf('https://') === 0) {
    return Promise.resolve(tempPath);
  }
  if (USE_CLOUD) {
    return new Promise((resolve) => {
      const ext = (tempPath.split('.').pop() || 'png').toLowerCase();
      const cloudPath = `avatars/${Date.now()}_${Math.floor(Math.random() * 100000)}.${ext}`;
      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
        success: res => resolve(res.fileID),
        fail: () => resolve(tempPath)
      });
    });
  }
  return persistImage(tempPath);
}

/* ----------------------------- 对外接口 ----------------------------- */

/**
 * 登录/注册
 * @param {string} phoneCode     <button open-type="getPhoneNumber"> 拿到的授权 code（基础库 2.21.2+）
 * @param {string} encryptedData 旧版基础库返回的加密数据，与 iv 配对使用
 * @param {string} iv            旧版基础库返回的解密向量
 * @param {string} nickname      微信昵称填写能力拿到的昵称
 * @param {string} avatar        微信头像填写能力拿到的临时路径
 * 手机号与角色均由服务端解密/判定，客户端不再传入。
 */
function login({ phoneCode, encryptedData, iv, nickname, avatar }) {
  return persistAvatar(avatar).then((savedAvatar) => {
    if (USE_CLOUD) {
      // 标准微信登录：先 wx.login() 拿 code，再让云函数用 jscode2session 换 openid；
      // phoneCode 一并发给云函数，由服务端调 getuserphonenumber 解密真实手机号。
      return new Promise((resolve, reject) => {
        wx.login({
          success: res => {
            if (!res.code) return reject(new Error('获取微信登录 code 失败'));
            callCloud('wxLogin', {
              code: res.code,
              phoneCode: phoneCode || '',
              // 基础库 < 2.21.2 时微信返回 encryptedData + iv 而非 code，一并带上
              encryptedData: encryptedData || '',
              iv: iv || '',
              nickname,
              avatar: savedAvatar
            })
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
      // 本地演示模式没有服务端，解不出手机号明文。
      // 保留上次登录的角色/手机号，避免被覆盖重置（角色可在「我的」页切换）。
      const prev = wx.getStorageSync(KEY_USER) || {};
      const user = {
        openid: prev.openid || ('local_' + Date.now()),
        phone: prev.phone || '',
        nickname: nickname || prev.nickname || '微信用户',
        avatar: savedAvatar || prev.avatar || '',
        role: prev.role || 'user'
      };
      wx.setStorageSync(KEY_USER, user);
      resolve(user);
    });
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
