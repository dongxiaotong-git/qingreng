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
    const avatarUrl = e.detail && e.detail.avatarUrl;
    if (!avatarUrl) {
      // 开发者工具模拟器下 chooseAvatar 可能返回空，提示用真机预览
      wx.showToast({ title: '请在真机预览选择头像', icon: 'none' });
      return;
    }
    // chooseAvatar 返回的是临时文件路径，<image> 渲染不稳且页面关闭即失效，
    // 先 saveFile 转成持久化的 wxfile:// 路径再回显，登录时也能直接复用。
    wx.getFileSystemManager().saveFile({
      tempFilePath: avatarUrl,
      success: (res) => this.setData({ avatar: res.savedFilePath }),
      fail: () => this.setData({ avatar: avatarUrl }) // 兜底：仍用原始路径
    });
  },

  // 微信昵称填写能力
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value || e.detail.nickName || '' });
  },

  // 头像加载失败（如临时文件失效）：回退到默认占位，避免裂图
  onAvatarError() {
    this.setData({ avatar: '' });
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
