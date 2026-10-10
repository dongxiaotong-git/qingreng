const app = getApp();
const api = require('../../utils/api');
const { USE_CLOUD } = require('../../utils/config');

Page({
  data: {
    avatar: '',
    nickname: '',
    phone: '',        // 仅展示用：来自上次登录回填或本次授权解密结果
    phoneCode: '',    // 本次授权拿到的手机号 code
    selectedRole: 'user',
    loading: false,
    roles: [
      { id: 'user', name: '普通用户', desc: '下单查看' },
      { id: 'courier', name: '接单员', desc: '接单/完成' },
      { id: 'admin', name: '管理员', desc: '查看全部' }
    ],
    demoHint: '手机号由微信授权自动获取，不会手动输入；身份仅在演示环境手动选择，正式环境应由后台按手机号配置。'
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

  selectRole(e) {
    this.setData({ selectedRole: e.currentTarget.dataset.role });
  },

  /**
   * 登录：本按钮 open-type="getPhoneNumber"，点击即同时触发手机号授权。
   * 拿到 phoneCode 后立刻 wx.login() 拿 code，两者一起交给云函数。
   */
  onLogin(e) {
    if (this.data.loading) return;

    const detail = (e && e.detail) || {};
    const code = detail.code;
    const errMsg = detail.errMsg || '';
    const authorized = !!code && errMsg.indexOf('ok') !== -1;

    if (!authorized) {
      // 云模式：手机号是必填，拿不到就阻断并提示重新授权
      if (USE_CLOUD) {
        wx.showToast({ title: '请先授权手机号', icon: 'none' });
        return;
      }
      // 演示模式（无真实 AppID）无法授权，降级放行以便继续体验
      wx.showToast({ title: '演示模式：跳过手机号', icon: 'none' });
      this.doLogin('');
      return;
    }

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
      role: d.selectedRole,
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
        wx.showToast({ title: '登录成功', icon: 'success' });
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
