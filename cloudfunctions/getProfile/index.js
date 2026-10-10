const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { openid } = event;
  if (!openid) throw new Error('缺少 openid');
  const res = await db.collection('users').where({ openid }).get();
  const user = res.data[0];
  if (!user) return null;

  // 安全兜底：sessionKey 仅用于服务端解密，绝不下发客户端
  const { sessionKey, ...safe } = user;
  return safe;
};
