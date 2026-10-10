const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const res = await db.collection('orders').doc(event.id).get();
  return res.data || null;
};
