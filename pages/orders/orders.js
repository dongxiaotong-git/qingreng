const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    user: null,
    statusFilter: 'all',
    filters: [
      { id: 'all', name: '全部' },
      { id: 'pending', name: '待处理' },
      { id: 'accepted', name: '已接单' },
      { id: 'completed', name: '已完成' }
    ],
    allOrders: [],
    list: []
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 1 });

    const user = app.globalData.user || wx.getStorageSync('td_user');
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    app.globalData.user = user;
    this.setData({ user });
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList(() => wx.stopPullDownRefresh());
  },

  loadList(cb) {
    api.listOrders(this.data.user).then(raw => {
      const list = raw.map(o => {
        const info = util.statusInfo(o.status);
        return Object.assign({}, o, {
          statusText: info.text,
          statusColor: info.color,
          statusBg: info.color + '1a'
        });
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      this.setData({ allOrders: list });
      this.applyFilter();
      if (cb) cb();
    });
  },

  applyFilter() {
    const f = this.data.statusFilter;
    const list = f === 'all'
      ? this.data.allOrders
      : this.data.allOrders.filter(o => o.status === f);
    this.setData({ list });
  },

  onFilter(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.id });
    this.applyFilter();
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + id });
  }
});
