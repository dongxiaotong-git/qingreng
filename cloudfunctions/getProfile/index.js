const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { openid } = event;
  if (!openid) throw new Error('缺少 openid');
  const res = await db.collection('users').where({ openid }).get();
  return res.data[0] || null;
};
