const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 演示账号：手机号 -> 角色
const DEMO_ACCOUNTS = { '13800000000': 'admin', '13800000001': 'courier' };

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { phone, nickname, avatar } = event;

  let role = 'user';
  if (phone && DEMO_ACCOUNTS[phone]) role = DEMO_ACCOUNTS[phone];

  const users = db.collection('users');
  const exist = await users.where({ openid: OPENID }).get();

  const data = {
    openid: OPENID,
    phone: phone || '',
    nickname: nickname || '微信用户',
    avatar: avatar || '',
    role
  };

  if (exist.data.length === 0) {
    const res = await users.add({ data });
    data._id = res._id;
  } else {
    await users.doc(exist.data[0]._id).update({ data });
    data._id = exist.data[0]._id;
  }
  return data;
};
