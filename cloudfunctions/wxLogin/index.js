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

/* ----------------------- access_token 缓存（云函数实例内复用） ----------------------- */
// getuserphonenumber 需要 access_token，token 有效期 7200s，提前 5 分钟刷新
let tokenCache = { token: '', expireAt: 0 };

/* ------------------------------- HTTP 工具 ------------------------------- */
function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('微信接口返回非 JSON: ' + data));
        }
      });
    }).on('error', reject);
  });
}

function httpsPostJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('微信接口返回非 JSON: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* --------------------------- 微信能力封装 --------------------------- */

// 1) wx.login 的 code 换 openid / session_key
function jscode2session(code) {
  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`;
  return httpsGetJson(url).then(json => {
    if (json.errcode) {
      throw new Error(`微信登录失败(${json.errcode}): ${json.errmsg}`);
    }
    return json; // { openid, session_key, unionid, expires_in }
  });
}

// 2) 获取全局 access_token（用于手机号等接口）
async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expireAt > now) return tokenCache.token;

  const json = await httpsGetJson(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`
  );
  if (!json.access_token) {
    throw new Error(`获取 access_token 失败: ${JSON.stringify(json)}`);
  }
  tokenCache = {
    token: json.access_token,
    expireAt: now + (json.expires_in || 7200) * 1000 - 5 * 60 * 1000
  };
  return tokenCache.token;
}

// 3) 用 button 授权拿到的 phoneCode 换取真实手机号
//    GET 老接口需要 session_key 解密；新版 phone_code 由服务端直接换，更安全。
async function getUserPhoneNumber(phoneCode) {
  const token = await getAccessToken();
  const json = await httpsPostJson(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`,
    { code: phoneCode }
  );
  if (json.errcode && json.errcode !== 0) {
    throw new Error(`获取手机号失败(${json.errcode}): ${json.errmsg}`);
  }
  const info = json.phone_info || {};
  return {
    phone: info.purePhoneNumber || info.phoneNumber || '',
    countryCode: info.countryCode || ''
  };
}

/* ------------------------------- 主流程 ------------------------------- */
exports.main = async (event) => {
  const { code, phone, phoneCode, role, nickname, avatar } = event;
  if (!code) throw new Error('缺少登录 code');
  if (APPID === 'YOUR_APPID' || SECRET === 'YOUR_SECRET') {
    throw new Error('请先在云函数环境变量配置 WX_APPID / WX_SECRET');
  }

  // 1) code -> openid / session_key
  const session = await jscode2session(code);
  const openid = session.openid;

  // 2) 手机号：优先用微信授权解密，失败（如个人主体）则回退到手动输入
  let finalPhone = phone || '';
  let phoneFromWx = false;
  let phoneWarn = '';
  if (phoneCode) {
    try {
      const p = await getUserPhoneNumber(phoneCode);
      if (p.phone) {
        finalPhone = p.phone;
        phoneFromWx = true;
      }
    } catch (e) {
      // 个人主体小程序无权限调用，保留手动输入的手机号，不阻断登录
      phoneWarn = e.message || '手机号解密失败';
      console.warn('getuserphonenumber failed:', phoneWarn);
    }
  }

  // 3) 角色：演示手机号优先，否则沿用客户端所选
  let finalRole = 'user';
  if (finalPhone && DEMO[finalPhone]) finalRole = DEMO[finalPhone];
  else if (role) finalRole = role;

  // 4) upsert 用户
  const users = db.collection('users');
  const existing = await users.where({ openid }).get();
  const payload = {
    openid,
    phone: finalPhone,
    nickname: nickname || '微信用户',
    avatar: avatar || '',
    role: finalRole,
    sessionKey: session.session_key, // 仅存服务端，绝不下发客户端
    updatedAt: Date.now()
  };

  let _id;
  if (existing.data.length === 0) {
    const r = await users.add({ data: Object.assign({ createdAt: Date.now() }, payload) });
    _id = r._id;
  } else {
    _id = existing.data[0]._id;
    await users.doc(_id).update({ data: payload });
  }

  // 5) 返回给客户端，去掉 sessionKey
  return {
    _id,
    openid,
    phone: payload.phone,
    nickname: payload.nickname,
    avatar: payload.avatar,
    role: payload.role,
    phoneFromWx,
    phoneWarn
  };
};
