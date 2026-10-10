const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { id, photo } = event;

  const cur = await db.collection('orders').doc(id).get();
  const o = cur.data;
  if (!o) throw new Error('订单不存在');
  if (o.status !== 'accepted') throw new Error('该订单未接单或已完成');
  if (o.courier !== OPENID) throw new Error('仅接单本人可标记完成');
  if (!photo) throw new Error('请先上传完成拍照');

  await db.collection('orders').doc(id).update({
    data: {
      status: 'completed',
      completePhoto: photo,
      completeTime: Date.now()
    }
  });

  return (await db.collection('orders').doc(id).get()).data;
};
