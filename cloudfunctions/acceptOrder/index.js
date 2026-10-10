const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { id, photo, nickname } = event;

  const cur = await db.collection('orders').doc(id).get();
  const o = cur.data;
  if (!o) throw new Error('订单不存在');
  if (o.status !== 'pending') throw new Error('该订单已被接单');
  if (!photo) throw new Error('请先上传接单拍照');

  await db.collection('orders').doc(id).update({
    data: {
      status: 'accepted',
      courier: OPENID,
      courierName: nickname || '接单员',
      acceptPhoto: photo,
      acceptTime: Date.now()
    }
  });

  return (await db.collection('orders').doc(id).get()).data;
};
