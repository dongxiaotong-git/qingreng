const { USE_CLOUD, CLOUD_ENV } = require('./utils/config');

App({
  globalData: {
    user: null,
    useCloud: USE_CLOUD
  },

  onLaunch() {
    if (USE_CLOUD) {
      if (!wx.cloud) {
        console.error('当前基础库版本过低，请使用 2.2.3 及以上的基础库以使用云能力');
      } else {
        wx.cloud.init({
          env: CLOUD_ENV,
          traceUser: true
        });
      }
    }
    // 恢复本地登录态（本地演示模式 / 云模式都会缓存用户信息）
    const user = wx.getStorageSync('td_user');
    if (user) {
      this.globalData.user = user;
    }
  }
});
