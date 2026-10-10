Component({
  data: {
    selected: 0,
    color: '#999999',
    selectedColor: '#07c160',
    list: [
      { pagePath: '/pages/home/home', text: '首页', icon: '🏠' },
      { pagePath: '/pages/orders/orders', text: '订单', icon: '📋' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: '👤' }
    ]
  },
  methods: {
    switchTab(e) {
      const path = e.currentTarget.dataset.path;
      wx.switchTab({ url: path });
    }
  }
});
