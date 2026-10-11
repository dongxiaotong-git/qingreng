const cloud = require('wx-server-sdk');
const https = require('https');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * AppID / AppSecret 建议配置到云函数的环境变量（WX_APPID / WX_SECRET），
 * 不要硬编码进源码、也不要下发到客户端。
 */
const APPID = process.env.WX_APPID || 'YOUR_APPID';
const SECRET = process.env.WX_SECRET || 'YOUR_SECRET';

/* ----------------------- access_token 缓存（云函数实例内复用） ----------------------- */
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

// wx.login 的 code 换 openid / session_key（openid 即用户唯一标识）
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

// 手机号：新版 code 换（需「手机号快速验证」权限，个人主体不可用）
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
  return { phone: info.purePhoneNumber || info.phoneNumber || '' };
}

// 手机号：旧版基础库用 session_key 解密 encryptedData
function decryptPhoneBySessionKey(encryptedData, iv, sessionKey) {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from(sessionKey, 'base64'),
    Buffer.from(iv, 'base64')
  );
  decipher.setAutoPadding(false);
  let out = Buffer.concat([decipher.update(Buffer.from(encryptedData, 'base64')), decipher.final()]);
  const pad = out[out.length - 1];
  if (pad >= 1 && pad <= 16) out = out.slice(0, out.length - pad);

  const json = JSON.parse(out.toString('utf8'));
  if (json.watermark && json.watermark.appid && json.watermark.appid !== APPID) {
    throw new Error('watermark.appid 校验失败');
  }
  return json;
}

/* --------------------------- 权限：openid → 角色 --------------------------- */

/**
 * 按 openid 解析角色。这是「唯一标识 → 权限」的唯一入口。
 *
 * 优先级：
 *   1) role_bindings 集合里的运营配置（可在云开发控制台直接改数据，不用改代码）
 *   2) users 表里该用户已有的角色
 *   3) 默认 'user'
 *
 * 集合不存在时不阻断登录，降级走 2/3。
 */
async function resolveRole(openid, existingRole) {
  try {
    const res = await db.collection('role_bindings').where({ openid }).get();
    if (res.data.length > 0 && res.data[0].role) {
      return { role: res.data[0].role, source: 'binding' };
    }
  } catch (e) {
    console.warn('查询 role_bindings 失败（集合可能未创建）:', e.message);
  }
  if (existingRole) return { role: existingRole, source: 'existing' };
  return { role: 'user', source: 'default' };
}

/* ------------------------------- 主流程 ------------------------------- */
exports.main = async (event) => {
  // 不接受客户端传来的 openid / role，防止伪造身份与自选提权
  const { code, phoneCode, encryptedData, iv, nickname, avatar } = event;
  if (!code) throw new Error('缺少登录 code');
  if (APPID === 'YOUR_APPID' || SECRET === 'YOUR_SECRET') {
    throw new Error('请先在云函数环境变量配置 WX_APPID / WX_SECRET');
  }

  // 1) code -> openid（用户唯一标识）/ session_key
  const session = await jscode2session(code);
  const openid = session.openid;

  // 2) 手机号【可选】：个人主体拿不到，失败也不阻断登录
  let finalPhone = '';
  let phoneFromWx = false;
  if (phoneCode || (encryptedData && iv)) {
    try {
      const p = phoneCode
        ? await getUserPhoneNumber(phoneCode)
        : decryptPhoneBySessionKey(encryptedData, iv, session.session_key);
      finalPhone = p.phone || p.purePhoneNumber || p.phoneNumber || '';
      phoneFromWx = !!finalPhone;
    } catch (e) {
      console.warn('手机号获取失败（可选项，不影响登录）:', e.message);
    }
  }

  // 3) 按 openid 解析权限
  const users = db.collection('users');
  const existingRes = await users.where({ openid }).get();
  const existing = existingRes.data[0] || null;
  const roleRes = await resolveRole(openid, existing && existing.role);

  // 4) upsert 用户
  const payload = {
    openid,
    phone: finalPhone || (existing && existing.phone) || '',
    nickname: nickname || (existing && existing.nickname) || '微信用户',
    avatar: avatar || (existing && existing.avatar) || '',
    role: roleRes.role,
    sessionKey: session.session_key, // 仅存服务端，绝不下发客户端
    updatedAt: Date.now()
  };

  let _id;
  if (!existing) {
    const r = await users.add({ data: Object.assign({ createdAt: Date.now() }, payload) });
    _id = r._id;
  } else {
    _id = existing._id;
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
    roleSource: roleRes.source,
    phoneFromWx
  };
};
