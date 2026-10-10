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
   * 登录：本按钮 open-type="getPhoneNumber"，点击即触发手机号授权。
   * 基础库 2.21.2+ 返回 code（推荐）；旧版返回 encryptedData + iv。两种都接受，
   * 拿到后连同 wx.login 的 code 一起交给云函数，由服务端解密出真实手机号。
   * 角色不由用户选择，由云函数按手机号查后台配置决定。
   */
  onLogin(e) {
    if (this.data.loading) return;

    const detail = (e && e.detail) || {};
    const errMsg = detail.errMsg || '';
    const { code, encryptedData, iv } = detail;
    const ok = errMsg.indexOf('ok') !== -1;
    const authorized = ok && (!!code || (!!encryptedData && !!iv));

    if (!authorized) {
      // 手机号是必需项：拿不到授权就不放行登录，不能静默跳过这一步。
      // 这里把微信返回的原始信息暴露出来，便于定位是权限问题还是用户拒绝。
      console.warn('[login] getPhoneNumber 回调详情 =', JSON.stringify(detail));

      const raw = errMsg || '（微信未返回 errMsg）';
      let hint;
      if (raw.indexOf('no permission') !== -1 || raw.indexOf('not support') !== -1) {
        hint = '该小程序没有「手机号快速验证」权限。个人主体不支持此能力，'
             + '需企业主体，并在微信公众平台「功能」里开通手机号快速验证组件。';
      } else if (raw.indexOf('deny') !== -1 || raw.indexOf('cancel') !== -1) {
        hint = '你在弹窗里点击了拒绝，请重新点击并选择允许。';
      } else if (ok) {
        hint = '授权成功，但微信既未返回 code 也未返回 encryptedData，请更新微信版本后重试。';
      } else {
        hint = '开发者工具不支持手机号授权模拟，请改用「真机预览」；'
             + '真机仍失败通常是未开通手机号验证组件，或小程序主体为个人。';
      }

      wx.showModal({
        title: '手机号授权失败',
        content: `微信返回：${raw}\n\n${hint}`,
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    // 已选完手机号 -> 走 wx.login 登录
    this.setData({ phoneCode: code || '' });
    this.doLogin({ phoneCode: code, encryptedData, iv });
  },

  doLogin(payload) {
    const d = this.data;
    this.setData({ loading: true });
    wx.showLoading({ title: '登录中...', mask: true });

    api.login({
      phoneCode: payload.phoneCode,
      encryptedData: payload.encryptedData,
      iv: payload.iv,
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
        // 演示模式没有服务端，解不出明文，明确告知而不是留个空格子
        const tip = (!USE_CLOUD && !user.phone)
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
