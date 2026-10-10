const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const DEMO = { '13800000000': 'admin', '13800000001': 'courier' };

/**
 * AppID / AppSecret 建议配置到云函数的环境变量（WX_APPID / WX_SECRET），
 * 不要硬编码进源码、也不要下发到客户端。这里提供占位回退，方便本地先跑通。
 */
const APPID = process.env.WX_APPID || 'YOUR_APPID';
const SECRET = process.env.WX_SECRET || 'YOUR_SECRET';

// 调用微信接口：code 换 openid / session_key
function jscode2session(code) {
  return new Promise((resolve, reject) => {
    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`;
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errcode) {
            return reject(new Error(`微信登录失败(${json.errcode}): ${json.errmsg}`));
          }
          resolve(json); // { openid, session_key, unionid, expires_in }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

exports.main = async (event) => {
  const { code, phone, role, nickname, avatar } = event;
  if (!code) throw new Error('缺少登录 code');
  if (APPID === 'YOUR_APPID' || SECRET === 'YOUR_SECRET') {
    throw new Error('请先在云函数环境变量配置 WX_APPID / WX_SECRET');
  }

  const session = await jscode2session(code);
  const openid = session.openid;

  // 角色：手机号命中演示账号优先，否则沿用客户端所选
  let finalRole = 'user';
  if (phone && DEMO[phone]) finalRole = DEMO[phone];
  else if (role) finalRole = role;

  const users = db.collection('users');
  const existing = await users.where({ openid }).get();
  const payload = {
    openid,
    phone: phone || '',
    nickname: nickname || '微信用户',
    avatar: avatar || '',
    role: finalRole,
    sessionKey: session.session_key, // 仅存服务端，绝不下发客户端
    updatedAt: Date.now()
  };

  let _id;
  if (existing.data.length === 0) {
    const r = await users.add({ data: payload });
    _id = r._id;
  } else {
    _id = existing.data[0]._id;
    const { sessionKey, ...rest } = payload;
    await users.doc(_id).update({ data: Object.assign({ sessionKey }, rest) });
  }

  // 返回给客户端，去掉 sessionKey
  return {
    _id,
    openid,
    phone: payload.phone,
    nickname: payload.nickname,
    avatar: payload.avatar,
    role: payload.role
  };
};
