const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

exports.main = async () => {
  const today = ymd(new Date());
  const c = await db.collection('orders').where({
    orderNo: db.RegExp({ regexp: '^' + today, options: 'i' })
  }).count();
  return today + String(c.total + 1).padStart(3, '0');
};
