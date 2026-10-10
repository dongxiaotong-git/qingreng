const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const today = ymd(new Date());
  const c = await db.collection('orders').where({
    orderNo: db.RegExp({ regexp: '^' + today, options: 'i' })
  }).count();
  const orderNo = today + String(c.total + 1).padStart(3, '0');

  const data = Object.assign({
    openid: OPENID,
    orderNo,
    status: 'pending', // pending | accepted | completed
    createdAt: Date.now(),
    courier: null,
    courierName: '',
    acceptPhoto: '',
    completePhoto: '',
    acceptTime: null,
    completeTime: null
  }, event);

  const res = await db.collection('orders').add({ data });
  return Object.assign({ _id: res._id }, data);
};
