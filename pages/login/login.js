const app = getApp();
const api = require('../../utils/api');
const { USE_CLOUD } = require('../../utils/config');

Page({
  data: {
    avatar: '',
    nickname: '',
    openid: '',     // 用户唯一标识（登录后回填，仅展示）
    loading: false
  },

  onLoad() {
    // 已登录过时回填资料，避免每次重新选头像/昵称
    const user = app.globalData.user || wx.getStorageSync('td_user') || null;
    if (user) {
      this.setData({
        avatar: user.avatar || '',
        nickname: user.nickname || '',
        openid: user.openid || ''
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

  /**
   * 登录：wx.login() 拿 code -> 云函数 jscode2session 换 openid。
   * openid 即用户唯一标识，权限由服务端按 openid 查配置决定，客户端无法自选。
   */
  onLogin() {
    if (this.data.loading) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '登录中...', mask: true });

    api.login({
      nickname: this.data.nickname,
      avatar: this.data.avatar
    })
      .then(user => {
        wx.hideLoading();
        this.setData({ loading: false, openid: user.openid || '' });
        app.globalData.user = user;
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/home/home' });
        }, 600);
      })
      .catch(err => {
        wx.hideLoading();
        this.setData({ loading: false });
        wx.showModal({
          title: '登录失败',
          content: err.message || '请重试',
          showCancel: false
        });
      });
  }
});
