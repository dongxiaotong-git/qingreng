const cloud = require('wx-server-sdk');
const https = require('https');
const crypto = require('crypto');
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

/**
 * 4) 旧版兼容：基础库 < 2.21.2 的 getPhoneNumber 返回 encryptedData + iv，
 *    没有 code，需要用 jscode2session 得到的 session_key 做 AES-128-CBC 解密。
 */
function decryptPhoneBySessionKey(encryptedData, iv, sessionKey) {
  const key = Buffer.from(sessionKey, 'base64');
  const ivBuf = Buffer.from(iv, 'base64');
  const data = Buffer.from(encryptedData, 'base64');

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, ivBuf);
  decipher.setAutoPadding(false);
  let out = Buffer.concat([decipher.update(data), decipher.final()]);

  // 手动去掉 PKCS#7 填充
  const pad = out[out.length - 1];
  if (pad >= 1 && pad <= 16) out = out.slice(0, out.length - pad);

  const json = JSON.parse(out.toString('utf8'));
  // 校验水印，防止换包伪造
  if (json.watermark && json.watermark.appid && json.watermark.appid !== APPID) {
    throw new Error('watermark.appid 校验失败');
  }
  return json; // { phoneNumber, purePhoneNumber, countryCode, watermark }
}

/* ------------------------------- 主流程 ------------------------------- */
exports.main = async (event) => {
  // 注意：不再接受客户端传来的 phone / role
  //   手机号一律由 phoneCode 服务端解密得到，角色一律由后台配置决定，防止客户端自选提权
  const { code, phoneCode, encryptedData, iv, nickname, avatar } = event;
  if (!code) throw new Error('缺少登录 code');
  if (APPID === 'YOUR_APPID' || SECRET === 'YOUR_SECRET') {
    throw new Error('请先在云函数环境变量配置 WX_APPID / WX_SECRET');
  }

  // 1) code -> openid / session_key
  const session = await jscode2session(code);
  const openid = session.openid;

  // 2) 手机号：只认微信授权的数据，不支持手动输入
  //    优先用新版 code 换，旧版基础库则用 session_key 解密 encryptedData
  let finalPhone = '';
  let phoneFromWx = false;
  try {
    if (phoneCode) {
      const p = await getUserPhoneNumber(phoneCode);
      finalPhone = p.phone;
    } else if (encryptedData && iv) {
      const p = decryptPhoneBySessionKey(encryptedData, iv, session.session_key);
      finalPhone = p.purePhoneNumber || p.phoneNumber || '';
    } else {
      throw new Error('缺少手机号授权信息（code 或 encryptedData）');
    }
    if (!finalPhone) {
      throw new Error('微信未返回手机号');
    }
    phoneFromWx = true;
  } catch (e) {
    // 手机号是必填项：拿不到就直接抛出，由前端提示用户重新授权
    // 常见原因：个人主体无 getuserphonenumber 权限 / code 已用过（一次性）/ 用户拒绝授权
    console.error('获取手机号失败:', e.message);
    throw new Error(`获取手机号失败：${e.message}`);
  }

  // 3) upsert 用户
  const users = db.collection('users');
  const existing = await users.where({ openid }).get();

  // 角色由后台配置决定，不接受客户端自选，避免用户把自己提权成管理员
  let finalRole;
  if (existing.data.length === 0) {
    // 新用户：按手机号查后台角色配置
    // TODO: DEMO 是占位实现，生产应改为查「角色配置表」或运营后台白名单
    finalRole = DEMO[finalPhone] || 'user';
  } else {
    // 老用户：保留后台已设定的角色，不因重新登录被重置成普通用户
    finalRole = existing.data[0].role || 'user';
  }

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

  // 4) 返回给客户端，去掉 sessionKey
  return {
    _id,
    openid,
    phone: payload.phone,
    nickname: payload.nickname,
    avatar: payload.avatar,
    role: payload.role,
    phoneFromWx
  };
};
