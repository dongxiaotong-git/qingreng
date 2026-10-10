const app = getApp();
const api = require('../../utils/api');
const { PACKAGES, TRASH_TYPES, TIME_SLOTS, ROLE_LABELS } = require('../../utils/config');
const util = require('../../utils/util');

Page({
  data: {
    pkg: null,
    orderNo: '',
    address: '',
    trashTypes: TRASH_TYPES,
    trashTypeId: '',
    showTrashTip: false,
    date: '',
    timeSlots: TIME_SLOTS,
    timeSlotId: '',
    images: [],
    remark: '',
    maxImages: 5,
    submitting: false
  },

  onLoad(query) {
    const pkg = PACKAGES.find(p => p.id === query.pkg) || PACKAGES[0];
    this.setData({ pkg, date: util.formatDate(new Date()) });
    api.genOrderNo().then(no => this.setData({ orderNo: no }));
  },

  selectTrash(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ trashTypeId: id, showTrashTip: true });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  selectTime(e) {
    this.setData({ timeSlotId: e.currentTarget.dataset.id });
  },

  onAddressInput(e) {
    this.setData({ address: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  chooseImage() {
    const remain = this.data.maxImages - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传5张', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const temps = res.tempFiles.map(f => f.tempFilePath);
        const tasks = temps.map(t => api.persistImage(t));
        Promise.all(tasks).then(saved => {
          this.setData({ images: this.data.images.concat(saved) });
        });
      }
    });
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index;
    const images = this.data.images.slice();
    images.splice(idx, 1);
    this.setData({ images });
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ urls: this.data.images, current: url });
  },

  mockPay(amount) {
    return new Promise(resolve => {
      wx.showLoading({ title: '微信支付中', mask: true });
      // 本地演示：模拟支付回调。真实环境应使用 wx.requestPayment，
      // 由云函数统一下单返回 prepay_id 后调用。
      setTimeout(() => {
        wx.hideLoading();
        resolve({ ok: true });
      }, 800);
    });
  },

  submit() {
    const d = this.data;
    if (!d.address.trim()) return wx.showToast({ title: '请填写地址', icon: 'none' });
    if (!d.trashTypeId) return wx.showToast({ title: '请选择垃圾类型', icon: 'none' });
    if (!d.date) return wx.showToast({ title: '请选择日期', icon: 'none' });
    if (!d.timeSlotId) return wx.showToast({ title: '请选择时间段', icon: 'none' });
    if (d.images.length === 0) return wx.showToast({ title: '请上传垃圾图片', icon: 'none' });

    if (d.submitting) return;
    this.setData({ submitting: true });

    const trash = TRASH_TYPES.find(t => t.id === d.trashTypeId);
    const slot = TIME_SLOTS.find(s => s.id === d.timeSlotId);
    const user = app.globalData.user;

    const doCreate = () => {
      return api.createOrder({
        openid: user.openid,
        packageId: d.pkg.id,
        packageName: d.pkg.name,
        price: d.pkg.price,
        orderNo: d.orderNo,
        address: d.address.trim(),
        trashTypeId: d.trashTypeId,
        trashTypeName: trash ? trash.name : '',
        date: d.date,
        timeSlotId: d.timeSlotId,
        timeSlotName: slot ? `${slot.name} ${slot.range}` : '',
        images: d.images,
        remark: d.remark.trim()
      });
    };

    const finish = (order) => {
      wx.showToast({ title: '下单成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/orders/orders' });
      }, 600);
    };

    if (d.pkg.needPay) {
      this.mockPay(d.pkg.price).then(() => doCreate()).then(finish).catch(() => {
        this.setData({ submitting: false });
        wx.showToast({ title: '支付失败', icon: 'none' });
      });
    } else {
      doCreate().then(finish).catch(() => {
        this.setData({ submitting: false });
        wx.showToast({ title: '下单失败', icon: 'none' });
      });
    }
  }
});
