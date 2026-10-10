const app = getApp();
const { PACKAGES, ROLE_LABELS } = require('../../utils/config');

Page({
  data: {
    user: null,
    roleLabel: '',
    packages: PACKAGES,
    steps: [
      { icon: '📝', text: '线上下单' },
      { icon: '📷', text: '门口放袋' },
      { icon: '🛵', text: '专人代扔' },
      { icon: '✅', text: '拍照确认' }
    ]
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0 });

    const user = app.globalData.user || wx.getStorageSync('td_user');
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    app.globalData.user = user;
    this.setData({ user, roleLabel: ROLE_LABELS[user.role] });
  },

  goCreate(e) {
    const pkg = e.currentTarget.dataset.pkg;
    wx.navigateTo({ url: '/pages/create-order/create-order?pkg=' + pkg });
  }
});
