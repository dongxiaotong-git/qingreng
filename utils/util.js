// 通用工具函数

function pad(n, len) {
  let s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

// 2026-10-09
function formatDate(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

// 20261009（订单号日期前缀）
function ymd(d) {
  d = d || new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
}

// 时间戳 -> 可读时间
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${formatDate(d)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}

const STATUS_MAP = {
  pending: { text: '待处理', color: '#fa8c16' },
  accepted: { text: '已接单', color: '#1677ff' },
  completed: { text: '已完成', color: '#07c160' }
};

function statusInfo(status) {
  return STATUS_MAP[status] || { text: '未知', color: '#999' };
}

module.exports = {
  pad,
  formatDate,
  ymd,
  formatTime,
  statusInfo,
  STATUS_MAP
};
