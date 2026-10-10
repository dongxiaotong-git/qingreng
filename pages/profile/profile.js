const app = getApp();
const api = require('../../utils/api');
const { ROLE_LABELS, USE_CLOUD } = require('../../utils/config');

Page({
  data: {
    user: null,
    roleLabel: '',
    isAdmin: false,
    isCourier: false,
    isDemo: !USE_CLOUD, // 演示模式下可直接切换角色；云模式角色由后台决定
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
    // 演示模式（无后台）：直接切换角色，方便一个人体验三种视角
    if (this.data.isDemo) {
      wx.showActionSheet({
        itemList: ['切换为 普通用户', '切换为 接单员', '切换为 管理员'],
        success: r => {
          const roles = ['user', 'courier', 'admin'];
          const role = roles[r.tapIndex];
          if (!role) return;
          const user = Object.assign({}, this.data.user, { role });
          wx.setStorageSync('td_user', user);
          app.globalData.user = user;
          wx.showToast({ title: '已切换为' + ROLE_LABELS[role], icon: 'none' });
          this.onShow();
        }
      });
      return;
    }

    // 云模式：角色由后台按手机号配置，需退出后重新授权登录
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
