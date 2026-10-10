const app = getApp();
const api = require('../../utils/api');
const { ROLE_LABELS } = require('../../utils/config');

Page({
  data: {
    user: null,
    roleLabel: '',
    isAdmin: false,
    isCourier: false,
    stats: null
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 2 });

    const user = app.globalData.user || wx.getStorageSync('td_user');
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    app.globalData.user = user;
    this.setData({
      user,
      roleLabel: ROLE_LABELS[user.role],
      isAdmin: user.role === 'admin',
      isCourier: user.role === 'courier'
    });
    this.loadStats();
  },

  loadStats() {
    api.listOrders(this.data.user).then(list => {
      const stats = {
        total: list.length,
        pending: list.filter(o => o.status === 'pending').length,
        accepted: list.filter(o => o.status === 'accepted').length,
        completed: list.filter(o => o.status === 'completed').length
      };
      this.setData({ stats });
    });
  },

  switchAccount() {
    wx.showModal({
      title: '切换身份',
      content: '确定退出当前身份并重新登录吗？',
      success: r => {
        if (r.confirm) {
          api.logout();
          app.globalData.user = null;
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  },

  goOrders() {
    wx.switchTab({ url: '/pages/orders/orders' });
  }
});
