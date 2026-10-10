const app = getApp();
const api = require('../../utils/api');
const { DEMO_ACCOUNTS, ROLE_LABELS } = require('../../utils/config');

Page({
  data: {
    phone: '',
    selectedRole: 'user',
    roles: [
      { id: 'user', name: ROLE_LABELS.user, desc: '下单代扔垃圾' },
      { id: 'courier', name: ROLE_LABELS.courier, desc: '接单并完成代扔' },
      { id: 'admin', name: ROLE_LABELS.admin, desc: '查看与管理全部订单' }
    ],
    demoHint: '演示账号：13800000001=接单员，13800000000=管理员；其它手机号默认普通用户。'
  },

  onInputPhone(e) {
    const phone = e.detail.value;
    let selectedRole = 'user';
    if (DEMO_ACCOUNTS[phone]) selectedRole = DEMO_ACCOUNTS[phone];
    this.setData({ phone, selectedRole });
  },

  selectRole(e) {
    this.setData({ selectedRole: e.currentTarget.dataset.role });
  },

  onLogin() {
    const { phone, selectedRole } = this.data;
    wx.showLoading({ title: '登录中', mask: true });
    api.login({ phone, role: selectedRole, nickname: '微信用户' })
      .then(user => {
        app.globalData.user = user;
        wx.hideLoading();
        wx.reLaunch({ url: '/pages/home/home' });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '登录失败', icon: 'none' });
      });
  }
});
