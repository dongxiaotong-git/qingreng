const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    avatar: '',
    nickname: '',
    phone: '',
    phoneCode: '',
    phoneAuthorized: false, // 是否已用微信授权手机号
    selectedRole: 'user',
    roles: [
      { id: 'user', name: '普通用户', desc: '下单查看' },
      { id: 'courier', name: '接单员', desc: '接单/完成' },
      { id: 'admin', name: '管理员', desc: '查看全部' }
    ],
    demoHint: '演示：手机号 13800000001 为接单员、13800000000 为管理员；也可直接选身份体验。'
  },

  onLoad() {
    // 已登录过时回填资料，避免每次重新选头像/昵称
    const user = app.globalData.user || wx.getStorageSync('td_user') || null;
    if (user) {
      this.setData({
        avatar: user.avatar || '',
        nickname: user.nickname || '',
        phone: user.phone || '',
        selectedRole: user.role || 'user'
      });
    }
  },

  // 微信头像填写能力（只能由用户点击 button 触发，不支持静默获取）
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (avatarUrl) this.setData({ avatar: avatarUrl });
  },

  // 微信昵称填写能力
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value || e.detail.nickName || '' });
  },

  onInputPhone(e) {
    this.setData({ phone: e.detail.value, phoneAuthorized: false, phoneCode: '' });
  },

  // 微信手机号授权（需企业/非个人主体小程序，个人主体会失败，可走手动输入）
  onGetPhoneNumber(e) {
    const { code, errMsg } = e.detail;
    if (!code || (errMsg && errMsg.indexOf('ok') === -1)) {
      wx.showToast({ title: '未授权手机号，可手动输入', icon: 'none' });
      return;
    }
    // code 不能直接换手机号，需连同 wx.login 的 code 一起交给云函数解密
    this.setData({ phoneCode: code, phoneAuthorized: true });
    wx.showToast({ title: '已授权，登录后自动获取', icon: 'none' });
  },

  selectRole(e) {
    this.setData({ selectedRole: e.currentTarget.dataset.role });
  },

  onLogin() {
    const d = this.data;
    wx.showLoading({ title: '登录中...', mask: true });
    api.login({
      phone: d.phone,
      phoneCode: d.phoneCode,
      role: d.selectedRole,
      nickname: d.nickname,
      avatar: d.avatar
    })
      .then(user => {
        wx.hideLoading();
        app.globalData.user = user;
        // 云函数解密手机号后回填
        if (user.phone) {
          this.setData({ phone: user.phone, phoneAuthorized: !!user.phoneFromWx });
        }
        if (user.phoneWarn) {
          wx.showToast({ title: '手机号未解密，已用输入值', icon: 'none', duration: 2000 });
        } else {
          wx.showToast({ title: '登录成功', icon: 'success' });
        }
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/home/home' });
        }, 600);
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      });
  }
});
