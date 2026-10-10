const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    id: '',
    user: null,
    order: null,
    acceptPhoto: '',
    completePhoto: '',
    showAccept: false,
    showComplete: false,
    processing: false
  },

  onLoad(query) {
    this.setData({ id: query.id });
  },

  onShow() {
    const user = app.globalData.user || wx.getStorageSync('td_user');
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    app.globalData.user = user;
    this.setData({ user });
    this.load();
  },

  load() {
    api.getOrder(this.data.id).then(o => {
      if (!o) {
        wx.showToast({ title: '订单不存在', icon: 'none' });
        return;
      }
      const info = util.statusInfo(o.status);
      const order = Object.assign({}, o, {
        statusText: info.text,
        statusColor: info.color,
        statusBg: info.color + '1a',
        acceptTimeText: util.formatTime(o.acceptTime),
        completeTimeText: util.formatTime(o.completeTime)
      });

      const user = this.data.user;
      const showAccept = user.role === 'courier' && o.status === 'pending';
      const showComplete = user.role === 'courier' && o.status === 'accepted' && o.courier === user.openid;

      this.setData({ order, showAccept, showComplete });
    });
  },

  preview(e) {
    const urls = e.currentTarget.dataset.urls;
    const current = e.currentTarget.dataset.url;
    wx.previewImage({ urls, current });
  },

  chooseAcceptPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        api.persistImage(res.tempFiles[0].tempFilePath).then(p => this.setData({ acceptPhoto: p }));
      }
    });
  },

  chooseCompletePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        api.persistImage(res.tempFiles[0].tempFilePath).then(p => this.setData({ completePhoto: p }));
      }
    });
  },

  onAccept() {
    if (!this.data.acceptPhoto) {
      return wx.showToast({ title: '请先上传接单拍照', icon: 'none' });
    }
    if (this.data.processing) return;
    this.setData({ processing: true });
    api.acceptOrder(this.data.id, this.data.acceptPhoto, this.data.user)
      .then(() => {
        this.setData({ processing: false, acceptPhoto: '', showAccept: false });
        wx.showToast({ title: '已接单', icon: 'success' });
        this.load();
      })
      .catch(err => {
        this.setData({ processing: false });
        wx.showToast({ title: err.message || '接单失败', icon: 'none' });
      });
  },

  onComplete() {
    if (!this.data.completePhoto) {
      return wx.showToast({ title: '请先上传完成拍照', icon: 'none' });
    }
    if (this.data.processing) return;
    this.setData({ processing: true });
    api.completeOrder(this.data.id, this.data.completePhoto, this.data.user)
      .then(() => {
        this.setData({ processing: false, completePhoto: '', showComplete: false });
        wx.showToast({ title: '已完成', icon: 'success' });
        this.load();
      })
      .catch(err => {
        this.setData({ processing: false });
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      });
  }
});
