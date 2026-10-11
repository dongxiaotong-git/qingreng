const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 初始化云数据库集合。
 *
 * 用法：把本云函数部署到云环境后，在云函数列表里「测试」调用一次（或前端 callFunction 调一次），
 * 即可自动创建 users / role_bindings / orders 三个集合。
 * 集合已存在时不会报错，可反复调用。
 *
 * 注意：集合的「权限」与「索引」无法用代码设置，请按 DATABASE.md 在云控制台手动配置。
 */
const COLLECTIONS = [
  { name: 'users', desc: '用户信息（openid 唯一标识、昵称、头像、角色）' },
  { name: 'role_bindings', desc: 'openid → 角色绑定（运营后台配置权限用）' },
  { name: 'orders', desc: '代扔订单' }
];

exports.main = async () => {
  const collections = [];
  for (const c of COLLECTIONS) {
    try {
      await db.createCollection(c.name);
      collections.push({ name: c.name, status: 'created', desc: c.desc });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      // 集合已存在（常见错误码 -502003 / "already exists"）视为成功，避免重复调用报错
      const exists = /already exists|已存在|502003|collection exist/i.test(msg);
      collections.push({
        name: c.name,
        status: exists ? 'exists' : 'error',
        desc: c.desc,
        message: exists ? '集合已存在' : msg
      });
    }
  }
  return { ok: true, collections };
};
