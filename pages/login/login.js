const app = getApp();
const api = require('../../utils/api');
const { USE_CLOUD } = require('../../utils/config');

Page({
  data: {
    avatar: '',
    nickname: '',
    phone: '',      // 仅展示用：来自上次登录回填或本次授权解密结果
    phoneCode: '',  // 本次授权拿到的手机号 code（一次性）
    loading: false
  },

  onLoad() {
    // 已登录过时回填资料，避免每次重新选头像/昵称
    const user = app.globalData.user || wx.getStorageSync('td_user') || null;
    if (user) {
      this.setData({
        avatar: user.avatar || '',
        nickname: user.nickname || '',
        phone: user.phone || ''
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
   * 登录：本按钮 open-type="getPhoneNumber"，点击即同时触发手机号授权。
   * 拿到 phoneCode 后立刻 wx.login() 拿 code，两者一起交给云函数。
   * 角色不由用户选择，由云函数按手机号查后台配置决定。
   */
  onLogin(e) {
    if (this.data.loading) return;

    const detail = (e && e.detail) || {};
    const code = detail.code;
    const errMsg = detail.errMsg || '';
    const authorized = !!code && errMsg.indexOf('ok') !== -1;

    if (!authorized) {
      // 手机号是必需项：拿不到授权就不放行登录，不能静默跳过这一步。
      // 常见原因：微信开发者工具不支持手机号授权模拟（必须真机），
      // 或小程序是个人主体（无 getPhoneNumber 权限），或用户在弹窗里点了拒绝。
      wx.showModal({
        title: '需要授权手机号',
        content:
          '本小程序需授权手机号才能登录。\n\n' +
          '若未弹出选择框，通常是微信开发者工具不支持该能力的模拟，' +
          '请用「真机预览」或体验版测试。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    // 已选完手机号 -> 走 wx.login 登录
    this.setData({ phoneCode: code });
    this.doLogin(code);
  },

  doLogin(phoneCode) {
    const d = this.data;
    this.setData({ loading: true });
    wx.showLoading({ title: '登录中...', mask: true });

    api.login({
      phone: d.phone,
      phoneCode: phoneCode,
      nickname: d.nickname,
      avatar: d.avatar
    })
      .then(user => {
        wx.hideLoading();
        this.setData({ loading: false });
        app.globalData.user = user;
        if (user.phone) {
          this.setData({ phone: user.phone });
        }
        // 演示模式没有服务端，phoneCode 解不出明文，明确告知而不是留个空格子
        const tip = (!USE_CLOUD && phoneCode && !user.phone)
          ? '登录成功·演示模式无法解密手机号'
          : '登录成功';
        wx.showToast({ title: tip, icon: 'none', duration: 2200 });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/home/home' });
        }, 600);
      })
      .catch(err => {
        wx.hideLoading();
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '登录失败', icon: 'none', duration: 2500 });
      });
  }
});
