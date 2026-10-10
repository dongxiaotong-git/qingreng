const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { role } = event;

  let query = {};
  if (role === 'user') {
    query = { openid: OPENID };
  } else if (role === 'courier') {
    // 接单员：待处理/已接单全部可见，已完成仅看自己接的
    query = _.or([{ status: _.neq('completed') }, { courier: OPENID }]);
  }
  // admin：看全部（query 为空）

  const res = await db.collection('orders')
    .where(query)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return res.data;
};
