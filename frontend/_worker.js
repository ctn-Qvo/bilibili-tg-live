// ========== 公共头部与样式 ==========
const COMMON_HEAD = `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/axios@1.11.0/dist/axios.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.22.2/dist/sweetalert2.all.min.js"></script>
<link href="https://cdn.jsdelivr.net/npm/sweetalert2@11.22.2/dist/sweetalert2.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#f0f5ff;--card-bg:#ffffff;--primary:#2b6cb5;--text:#1a365d}
[data-bs-theme="dark"]{--bg:#1a202c;--card-bg:#2d3748;--primary:#4a8bdb;--text:#e2e8f0}
body{background:var(--bg);color:var(--text);transition:0.3s}
.card{background:var(--card-bg);border:none;border-radius:16px;box-shadow:0 4px 12px rgba(43,108,181,0.08)}
.card-header{background:var(--primary);color:white;border-radius:16px 16px 0 0!important;padding:0.75rem 1.25rem;font-weight:600}
.btn-primary{background:var(--primary);border-color:var(--primary)}
.btn-outline-primary{color:var(--primary);border-color:var(--primary)}
.btn-outline-primary:hover{background:var(--primary);color:white}
.btn-outline-danger:hover{background:#dc3545;color:white}
.status-dot{width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:8px;flex-shrink:0}
.status-dot.live{background:#20c997;box-shadow:0 0 12px rgba(32,201,151,0.6)}
.status-dot.offline{background:#dc3545;box-shadow:0 0 12px rgba(220,53,69,0.4)}
.room-card{transition:0.2s;cursor:default}
.room-card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(43,108,181,0.12)}
.room-title{font-weight:600;font-size:1.1rem;margin-bottom:0.25rem}
.room-meta{font-size:0.9rem;color:#6c757d}
.log-box{max-height:400px;overflow-y:auto;font-size:0.85rem;background:var(--card-bg);border-radius:0 0 16px 16px;padding:0.5rem 1rem}
.log-entry{padding:0.25rem 0;border-bottom:1px solid rgba(0,0,0,0.05)}
.log-time{color:#6c757d;margin-right:0.5rem}
.log-level-info{color:#0d6efd}
.log-level-warn{color:#ffc107}
.log-level-error{color:#dc3545}
.tab-btn{border-radius:12px 12px 0 0;font-weight:500}
.tab-btn.active{background:var(--primary);color:white}
.tab-btn:not(.active){background:transparent;color:var(--text)}
.tab-btn:not(.active):hover{background:rgba(43,108,181,0.08)}
#notifies .form-control,#notifies .form-select{background:var(--card-bg);color:var(--text);border-color:#ced4da}
[data-bs-theme="dark"] .form-control,[data-bs-theme="dark"] .form-select{background:#2d3748;color:#e2e8f0;border-color:#4a5568}
</style>
`;

// ========== 公共 JavaScript ==========
const COMMON_JS = `
function closest(el, selector) {
  while (el && el !== document) {
    if (el.matches && el.matches(selector)) return el;
    el = el.parentNode;
  }
  return null;
}

function showMessage(msg, type) {
  type = type || 'info';
  var box = document.createElement('div');
  box.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-' + (type === 'error' ? 'danger' : type === 'warn' ? 'warning' : 'success');
  box.style.zIndex = '99999';
  box.style.minWidth = '320px';
  box.style.textAlign = 'center';
  box.textContent = msg;
  document.body.appendChild(box);
  setTimeout(function() {
    box.style.transition = 'opacity .5s';
    box.style.opacity = '0';
    setTimeout(function() { box.remove(); }, 500);
  }, 8000);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '从未更新';
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss');
}

axios.defaults.baseURL = '';
axios.defaults.withCredentials = true;
axios.defaults.timeout = 10000;

axios.interceptors.response.use(
  function(response) { return response; },
  function(error) {
    if (error.code === 'ECONNABORTED') {
      showMessage('请求超时，请检查网络', 'error');
    } else if (error.response) {
      console.error('API错误:', error.response.status, error.response.data);
    } else {
      console.error('网络错误:', error.message);
      showMessage('网络连接失败，请检查网络或后端服务', 'error');
    }
    return Promise.reject(error);
  }
);

var reportingError = false;

async function reportError(error, context) {
  if (reportingError) return null;
  reportingError = true;
  try {
    var payload = {
      message: error.message || String(error),
      stack: error.stack || '',
      url: window.location.href,
      user_agent: navigator.userAgent,
      context: context || 'unknown',
      extra: {}
    };
    var res = await axios.post('/api/client-errors', payload);
    return res.data.id;
  } catch (e) {
    console.error('上报错误失败:', e);
    return null;
  } finally {
    reportingError = false;
  }
}

window.viewErrorDetail = async function(id) {
  try {
    var res = await axios.get('/api/client-errors/' + id);
    var data = res.data;
    var body = document.getElementById('errorDetailBody');
    var html = '<p><strong>错误ID:</strong> ' + escapeHtml(data.id) + '</p>';
    html += '<p><strong>时间:</strong> ' + escapeHtml(formatDate(data.timestamp)) + '</p>';
    html += '<p><strong>消息:</strong> ' + escapeHtml(data.message) + '</p>';
    html += '<p><strong>URL:</strong> ' + escapeHtml(data.url) + '</p>';
    html += '<p><strong>用户代理:</strong> ' + escapeHtml(data.user_agent) + '</p>';
    html += '<p><strong>上下文:</strong> ' + escapeHtml(data.context) + '</p>';
    html += '<p><strong>堆栈:</strong><br><pre style="background:#f8f9fa;padding:10px;border-radius:4px;white-space:pre-wrap;word-break:break-all;">' + escapeHtml(data.stack || '无堆栈信息') + '</pre></p>';
    if (data.extra) {
      html += '<p><strong>额外信息:</strong> <pre>' + escapeHtml(JSON.stringify(data.extra, null, 2)) + '</pre></p>';
    }
    body.innerHTML = html;
    if (typeof bootstrap !== 'undefined') {
      var modal = new bootstrap.Modal(document.getElementById('errorDetailModal'));
      modal.show();
    } else {
      showMessage('Bootstrap未加载，无法显示详情弹窗', 'error');
    }
  } catch (e) {
    showMessage('加载错误详情失败: ' + e.message, 'error');
  }
};

async function checkAuth() {
  try {
    var res = await axios.get('/api/me?_=' + Date.now());
    return res.data && res.data.username;
  } catch(e) {
    return false;
  }
}

async function loginReq(username, password) {
  var res = await axios.post(
    '/api/login?_=' + Date.now(),
    { username: username, password: password },
    {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }
  );
  if (!res.data.success) {
    throw new Error(res.data.error || '登录失败');
  }
  return res.data;
}

function logout() {
  axios.post('/api/logout')
    .finally(function() {
      window.location.href = '/login';
    });
}
`;

// ========== 登录页面 ==========
const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="zh">
<head>${COMMON_HEAD}
<title>直播监控 - 登录</title>
</head>
<body>
<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div class="col-md-4"><div class="card shadow"><div class="card-body"><h1 class="card-title text-center">管理登录</h1><div id="loginError" class="alert alert-danger" style="display:none;"></div><form id="loginForm"><div class="mb-3"><label class="form-label">用户名</label><input type="text" id="loginUsername" class="form-control" required></div><div class="mb-3"><label class="form-label">密码</label><input type="password" id="loginPassword" class="form-control" required></div><button type="submit" class="btn btn-primary w-100">登录</button></form></div></div></div>
</div>
<script>
${COMMON_JS}
document.getElementById('loginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  var btn = this.querySelector('button');
  var errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '登录中...';
  try {
    var username = document.getElementById('loginUsername').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!username || !password) throw new Error('请输入用户名和密码');
    await loginReq(username, password);
    window.location.href = '/dashboard/rooms';
  } catch(err) {
    errorEl.innerText = err.message || '登录失败';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '登录';
  }
});
(async function() {
  if (await checkAuth()) {
    window.location.href = '/dashboard/rooms';
  }
})();
</script>
</body>
</html>`;

// ========== 仪表盘通用模板 ==========
function dashboardTemplate(bodyContent, activeTab, pageScript) {
  return `<!DOCTYPE html>
<html lang="zh">
<head>${COMMON_HEAD}
<title>直播监控 - 仪表盘</title>
</head>
<body>
<div class="container-fluid p-3">
  <div class="row mb-3 align-items-center">
    <div class="col-md-6"><h1 class="d-flex align-items-center gap-2" style="color:var(--primary);"><i class="bi bi-broadcast"></i> 直播监控</h1></div>
    <div class="col-md-6 text-end"><button id="themeToggle" class="btn btn-outline-secondary me-2">深色</button><button id="logoutBtn" class="btn btn-outline-danger">退出</button></div>
  </div>
  <ul class="nav nav-tabs mb-3">
    <li class="nav-item"><a class="nav-link ${activeTab === 'rooms' ? 'active' : ''}" href="/dashboard/rooms">房间</a></li>
    <li class="nav-item"><a class="nav-link ${activeTab === 'logs' ? 'active' : ''}" href="/dashboard/logs">日志</a></li>
    <li class="nav-item"><a class="nav-link ${activeTab === 'notify' ? 'active' : ''}" href="/dashboard/notify">通知配置</a></li>
  </ul>
  <div id="content">${bodyContent}</div>
</div>
<script>
${COMMON_JS}
// 主题切换
document.getElementById('themeToggle').addEventListener('click', function() {
  var html = document.documentElement;
  var theme = html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-bs-theme', theme);
  this.textContent = theme === 'dark' ? '亮色' : '深色';
});
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.setAttribute('data-bs-theme', 'dark');
  document.getElementById('themeToggle').textContent = '亮色';
}
document.getElementById('logoutBtn').addEventListener('click', logout);

// 认证检查
(async function() {
  if (!(await checkAuth())) {
    window.location.href = '/login';
    return;
  }
  if (typeof initPage === 'function') {
    await initPage();
  }
})();
${pageScript}
</script>
</body>
</html>`;
}

// ========== 房间管理页面 ==========
const ROOMS_PAGE = dashboardTemplate(`
<div class="card"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><i class="bi bi-house-door"></i> 监控房间<div class="ms-auto d-flex flex-wrap gap-2"><button id="addRoomBtn" class="btn btn-sm btn-light"><i class="bi bi-plus-circle"></i> 添加</button><button id="checkAllBtn" class="btn btn-sm btn-light"><i class="bi bi-arrow-repeat"></i> 检查</button><button id="refreshRoomsBtn" class="btn btn-sm btn-light"><i class="bi bi-cloud-refresh"></i> 刷新</button><button id="sendLiveBtn" class="btn btn-sm btn-warning"><i class="bi bi-broadcast"></i> 模拟</button><div class="input-group input-group-sm" style="width:200px;"><input id="singleCheckInput" class="form-control" placeholder="房间号"><button id="singleCheckBtn" class="btn btn-light">查</button></div></div></div><div class="card-body"><div id="roomContainer" class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3"></div></div></div>
<div class="modal fade" id="addRoomModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">添加房间</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><p>请输入直播间房间号：</p><input type="text" id="roomInput" class="form-control" placeholder="例如：1768500100"></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button type="button" id="addRoomConfirmBtn" class="btn btn-primary">完成</button></div></div></div></div>
<div class="modal fade" id="customModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 id="modalTitle" class="modal-title">提示</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body" id="modalMessage"></div><div class="modal-footer"><button type="button" id="modalConfirmBtn" class="btn btn-primary">确定</button><button type="button" id="modalCancelBtn" class="btn btn-secondary" data-bs-dismiss="modal">取消</button></div></div></div></div>
`, 'rooms', `
async function renderRooms() {
  var container = document.getElementById('roomContainer');
  try {
    var res = await axios.get('/api/rooms');
    var rooms = res.data.rooms;
    var states = res.data.states || {};
    if (!rooms || !rooms.length) {
      container.innerHTML = '<div class="col-12 text-center text-muted py-4">暂无房间，请添加</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < rooms.length; i++) {
      var id = rooms[i];
      var state = states[id] || {};
      var isLive = state.state === 'LIVE';
      var dotClass = isLive ? 'live' : 'offline';
      var title = state.last_title || '未知';
      var online = state.last_online || 0;
      var area = state.last_parent_area ? state.last_parent_area + ' - ' + state.last_area : '未知分区';
      var updateTime = formatDate(state.last_update);
      html += '<div class="col"><div class="card room-card h-100"><div class="card-body d-flex align-items-start"><span class="status-dot ' + dotClass + '"></span><div class="flex-grow-1 ms-2"><div class="room-title">' + escapeHtml(title) + '</div><div class="room-meta">房间 ' + id + ' · 人气 ' + online + ' · ' + escapeHtml(area) + '</div><div class="room-meta small">更新于 ' + updateTime + '</div></div><button class="delete-room-btn btn btn-outline-danger btn-sm" data-room="' + id + '" style="writing-mode: vertical-rl; letter-spacing: 2px; padding: 4px 6px; height: auto; min-height: 60px; line-height: 1.2;">删除</button></div></div></div>';
    }
    container.innerHTML = html;
  } catch (e) {
    showMessage('加载房间失败: ' + e.message, 'error');
  }
}

function initRoomsEvents() {
  var addRoomModal = new bootstrap.Modal(document.getElementById('addRoomModal'));
  document.getElementById('addRoomBtn').addEventListener('click', function() {
    document.getElementById('roomInput').value = '';
    addRoomModal.show();
  });
  document.getElementById('addRoomConfirmBtn').addEventListener('click', async function() {
    var roomId = document.getElementById('roomInput').value.trim();
    if (!roomId) { showMessage('请输入房间号', 'error'); return; }
    this.disabled = true;
    this.textContent = '提交中...';
    try {
      await axios.post('/api/rooms', { room_id: roomId });
      addRoomModal.hide();
      showMessage('房间 ' + roomId + ' 已添加', 'info');
      await renderRooms();
    } catch (e) {
      var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
      showMessage('添加失败: ' + errMsg, 'error');
    }
    this.disabled = false;
    this.textContent = '完成';
  });

  document.addEventListener('click', async function(e) {
    var btn = closest(e.target, '.delete-room-btn');
    if (btn) {
      var roomId = btn.dataset.room;
      if (!confirm('确定删除房间 ' + roomId + ' 吗？')) return;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
      try {
        await axios.delete('/api/rooms', { data: { room_id: roomId } });
        showMessage('房间 ' + roomId + ' 已删除', 'info');
        await renderRooms();
      } catch (e) {
        var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showMessage('删除失败: ' + errMsg, 'error');
        btn.disabled = false;
        btn.innerHTML = '删除';
      }
    }
  });

  document.getElementById('checkAllBtn').addEventListener('click', async function() {
    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    try {
      await axios.post('/api/monitor', { force: true });
      showMessage('检查完成', 'info');
      await renderRooms();
    } catch (e) {
      showMessage('检查失败: ' + e.message, 'error');
    }
    this.disabled = false;
    this.innerHTML = '<i class="bi bi-arrow-repeat"></i> 检查';
  });

  document.getElementById('refreshRoomsBtn').addEventListener('click', async function() {
    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    await renderRooms();
    this.disabled = false;
    this.innerHTML = '<i class="bi bi-cloud-refresh"></i> 刷新';
  });

  document.getElementById('sendLiveBtn').addEventListener('click', async function() {
    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    try {
      var res = await axios.post('/api/send-live-notify');
      showMessage(res.data.message || '发送成功', 'info');
    } catch (e) {
      var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
      showMessage('发送失败: ' + errMsg, 'error');
    }
    this.disabled = false;
    this.innerHTML = '<i class="bi bi-broadcast"></i> 模拟';
  });

  document.getElementById('singleCheckBtn').addEventListener('click', async function() {
    var roomId = document.getElementById('singleCheckInput').value.trim();
    if (!roomId) { showMessage('请输入房间号', 'error'); return; }
    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    try {
      await axios.post('/api/monitor', { force: true, room_id: roomId });
      showMessage('已触发检查，请稍后刷新查看', 'info');
      setTimeout(renderRooms, 3000);
    } catch (e) {
      showMessage('操作失败: ' + e.message, 'error');
    }
    this.disabled = false;
    this.innerHTML = '查';
  });
}

window.initPage = async function() {
  await renderRooms();
  initRoomsEvents();
};
`);

// ========== 日志页面 ==========
const LOGS_PAGE = dashboardTemplate(`
<div class="card"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><i class="bi bi-journal-text"></i> 运行日志<div class="ms-auto d-flex gap-2 flex-wrap"><button id="clearLogsBtn" class="btn btn-sm btn-light"><i class="bi bi-trash"></i> 清除</button><button id="refreshLogsBtn" class="btn btn-sm btn-light"><i class="bi bi-arrow-clockwise"></i> 刷新</button><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="autoRefresh" checked><label class="form-check-label" for="autoRefresh">自动</label></div><input id="logSearch" class="form-control form-control-sm" placeholder="搜索..." style="width:120px;"><select id="logLevelFilter" class="form-select form-select-sm" style="width:auto;"><option value="">全部</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option></select><button id="exportLogsBtn" class="btn btn-sm btn-light"><i class="bi bi-download"></i></button></div></div><div class="card-body"><div id="logContainer" class="log-box"></div></div></div>
`, 'logs', `
var allLogs = [];
var logTimer = null;

async function fetchLogs() {
  try {
    var res = await axios.get('/api/logs');
    allLogs = res.data;
    renderLogs();
  } catch (e) {
    console.error('获取日志失败', e);
  }
}

function renderLogs() {
  var container = document.getElementById('logContainer');
  var search = document.getElementById('logSearch').value.toLowerCase();
  var level = document.getElementById('logLevelFilter').value;
  var filtered = allLogs;
  if (search) filtered = filtered.filter(function(e) {
    var msg = String(e.message || '').toLowerCase();
    return msg.includes(search);
  });
  if (level) filtered = filtered.filter(function(e) { return e.level === level; });
  if (!filtered.length) {
    container.innerHTML = '<div class="text-secondary">暂无日志</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var entry = filtered[i];
    var levelColor = { info: 'log-level-info', warn: 'log-level-warn', error: 'log-level-error' }[entry.level] || '';
    html += '<div class="log-entry"><span class="log-time">' + escapeHtml(entry.time) + '</span><span class="' + levelColor + '">[' + escapeHtml(entry.level.toUpperCase()) + ']</span> ' + escapeHtml(entry.message) + '</div>';
  }
  container.innerHTML = html;
}

function initLogsEvents() {
  document.getElementById('refreshLogsBtn').addEventListener('click', fetchLogs);
  document.getElementById('logSearch').addEventListener('input', renderLogs);
  document.getElementById('logLevelFilter').addEventListener('change', renderLogs);
  document.getElementById('autoRefresh').addEventListener('change', function() {
    if (this.checked) {
      if (logTimer) clearInterval(logTimer);
      logTimer = setInterval(fetchLogs, 5000);
      fetchLogs();
    } else {
      if (logTimer) {
        clearInterval(logTimer);
        logTimer = null;
      }
    }
  });
  if (document.getElementById('autoRefresh').checked) {
    if (logTimer) clearInterval(logTimer);
    logTimer = setInterval(fetchLogs, 5000);
    fetchLogs();
  }

  document.getElementById('clearLogsBtn').addEventListener('click', async function() {
    if (!confirm('确定清除所有日志吗？')) return;
    try {
      await axios.post('/api/logs/clear');
      showMessage('日志已清除', 'info');
      await fetchLogs();
    } catch (e) {
      showMessage('清除失败: ' + e.message, 'error');
    }
  });

  document.getElementById('exportLogsBtn').addEventListener('click', function() {
    var blob = new Blob([JSON.stringify(allLogs, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'logs.json'; a.click();
    URL.revokeObjectURL(url);
  });
}

window.initPage = async function() {
  await fetchLogs();
  initLogsEvents();
};
`);

// ========== 通知配置页面 ==========
const NOTIFY_PAGE = dashboardTemplate(`
<div class="card mb-3"><div class="card-header"><i class="bi bi-plus-circle"></i> 添加通知配置</div><div class="card-body"><form id="addNotifyForm" class="row g-3"><div class="col-md-4"><label class="form-label">名称</label><input type="text" name="name" class="form-control" placeholder="" required></div><div class="col-md-4"><label class="form-label">协议</label><select name="protocol" id="protocolSelect" class="form-select"><option value="telegram">Telegram</option><option value="onebot_private">OneBot 私聊</option><option value="onebot_group">OneBot 群聊</option><option value="discord">Discord Webhook</option><option value="custom_webhook">自定义 Webhook</option></select></div><input type="hidden" id="apiUrl" name="api_url"><div class="col-md-6" id="tgTokenGroup"><label class="form-label">Bot Token</label><input type="text" id="tgToken" name="tg_token" class="form-control" placeholder=""><small class="text-muted">自动构建 API 地址</small></div><div class="col-md-6"><label class="form-label" id="receiverLabel">接收者 ID</label><input type="text" name="chat_id" id="chatId" class="form-control" placeholder=""></div><div class="col-12"><label class="form-label">通知模板 (可选)</label><textarea name="template" id="templateArea" class="form-control" rows="6">[{{事件}}] {{主播}}\n标题：{{标题}}\n房间号：{{房间号}} | UID：{{UID}}\n分区：{{父分区}} - {{分区}}\n人气：{{人气}} | 直播时间：{{直播时间}}\n直播间链接：{{直播链接}}\n封面：{{封面}}\n等级：{{等级}} | 粉丝：{{粉丝}} | 关注：{{关注}} | 性别：{{性别}}\nVIP：{{VIP类型}} ({{VIP状态}})\n投稿数：{{投稿数}} | 文章数：{{文章数}}\n签名：{{签名}}\n头像：{{头像}}\n更新时间：{{时间}}</textarea></div><div class="col-12"><button type="submit" class="btn btn-primary"><i class="bi bi-plus-circle"></i> 添加配置</button></div></form></div></div>
<div class="card"><div class="card-header"><i class="bi bi-list-ul"></i> 现有配置</div><div class="card-body"><div class="table-responsive"><table class="table table-hover"><thead><tr><th>名称</th><th>协议</th><th>状态</th><th>操作</th></tr></thead><tbody id="configTableBody"></tbody></table></div></div></div>
`, 'notify', `
async function renderConfigs() {
  var tbody = document.getElementById('configTableBody');
  try {
    var res = await axios.get('/api/notify-configs');
    var configs = res.data;
    if (!configs.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">暂无配置</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < configs.length; i++) {
      var cfg = configs[i];
      var protocolLabel = { telegram: 'Telegram', onebot_private: 'OneBot私聊', onebot_group: 'OneBot群聊', discord: 'Discord', custom_webhook: '自定义Webhook' }[cfg.protocol] || cfg.protocol;
      var status = cfg.enabled ? '启用' : '禁用';
      var statusColor = cfg.enabled ? 'success' : 'secondary';
      html += '<tr><td>' + escapeHtml(cfg.name) + '</td><td>' + escapeHtml(protocolLabel) + '</td><td><span class="badge bg-' + statusColor + '">' + status + '</span></td><td><button class="test-btn btn btn-sm btn-outline-primary" data-id="' + cfg.id + '">测试</button><button class="toggle-btn btn btn-sm btn-outline-warning" data-id="' + cfg.id + '">' + (cfg.enabled ? '禁用' : '启用') + '</button><button class="delete-config-btn btn btn-sm btn-outline-danger" data-id="' + cfg.id + '">删除</button></td></tr>';
    }
    tbody.innerHTML = html;
  } catch (e) {
    showMessage('加载配置失败: ' + e.message, 'error');
  }
}

function updateNotifyForm() {
  var val = document.getElementById('protocolSelect').value;
  var tgTokenGroup = document.getElementById('tgTokenGroup');
  var receiverLabel = document.getElementById('receiverLabel');
  var chatId = document.getElementById('chatId');
  if (val === 'telegram') {
    tgTokenGroup.style.display = 'block';
    receiverLabel.textContent = '接收者 ID (chat_id)';
    chatId.placeholder = '';
  } else {
    tgTokenGroup.style.display = 'none';
    if (val === 'onebot_private') {
      receiverLabel.textContent = '用户 ID (user_id)';
      chatId.placeholder = '';
    } else if (val === 'onebot_group') {
      receiverLabel.textContent = '群 ID (group_id)';
      chatId.placeholder = '';
    } else {
      receiverLabel.textContent = '接收者 ID (可选)';
      chatId.placeholder = '';
    }
  }
}

function initNotifyEvents() {
  document.getElementById('protocolSelect').addEventListener('change', updateNotifyForm);
  updateNotifyForm();

  document.getElementById('addNotifyForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var form = this;
    var protocol = document.getElementById('protocolSelect').value;
    var apiUrl = document.getElementById('apiUrl').value;
    if (protocol === 'telegram') {
      var token = document.getElementById('tgToken').value.trim();
      if (!token) { showMessage('请输入 Bot Token', 'error'); return; }
      apiUrl = 'https://api.telegram.org/bot' + token + '/sendMessage';
    }
    var formData = new FormData(form);
    var payload = {
      name: formData.get('name'),
      protocol: protocol,
      api_url: apiUrl,
      chat_id: formData.get('chat_id') || '',
      template: formData.get('template') || '',
      extra_params: {}
    };
    if (protocol === 'telegram') {
      payload.receiver_key = 'chat_id';
      payload.message_key = 'text';
    } else if (protocol === 'onebot_private') {
      payload.receiver_key = 'user_id';
      payload.message_key = 'message';
    } else if (protocol === 'onebot_group') {
      payload.receiver_key = 'group_id';
      payload.message_key = 'message';
    } else {
      payload.receiver_key = '';
      payload.message_key = '';
    }
    try {
      await axios.post('/api/notify-configs', payload);
      showMessage('配置添加成功', 'info');
      await renderConfigs();
      form.reset();
      updateNotifyForm();
    } catch (e) {
      var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
      showMessage('添加失败: ' + errMsg, 'error');
    }
  });

  document.addEventListener('click', async function(e) {
    var btn = closest(e.target, '.test-btn');
    if (btn) {
      var id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = '测试中...';
      try {
        var res = await axios.post('/api/notify-configs/test', { id: id });
        showMessage(res.data.message || '测试成功', 'info');
      } catch (e) {
        var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showMessage('测试失败: ' + errMsg, 'error');
      }
      btn.disabled = false;
      btn.textContent = '测试';
      return;
    }
    var toggleBtn = closest(e.target, '.toggle-btn');
    if (toggleBtn) {
      var id = toggleBtn.dataset.id;
      toggleBtn.disabled = true;
      toggleBtn.textContent = '切换中...';
      try {
        await axios.post('/api/notify-configs/toggle', { id: id });
        showMessage('切换成功', 'info');
        await renderConfigs();
      } catch (e) {
        var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showMessage('切换失败: ' + errMsg, 'error');
        toggleBtn.disabled = false;
        toggleBtn.textContent = '切换';
      }
      return;
    }
    var deleteBtn = closest(e.target, '.delete-config-btn');
    if (deleteBtn) {
      var id = deleteBtn.dataset.id;
      if (!confirm('确定删除该配置吗？')) return;
      try {
        await axios.delete('/api/notify-configs', { data: { id: id } });
        showMessage('删除成功', 'info');
        await renderConfigs();
      } catch (e) {
        var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showMessage('删除失败: ' + errMsg, 'error');
      }
    }
  });
}

window.initPage = async function() {
  await renderConfigs();
  initNotifyEvents();
};
`);

// ========== Worker 主入口（已修复） ==========
export default {
  async fetch(request, env) {
    // 从环境变量读取后端地址
    const backendUrl = env.BACKEND_URL;
    if (!backendUrl) {
      return new Response(
        JSON.stringify({ error: 'BACKEND_URL 环境变量未设置' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 代理所有 /api/* 请求到后端
    if (path.startsWith('/api/')) {
      const target = backendUrl.replace(/\/$/, '') + path + url.search;
      const headers = new Headers(request.headers);

      // 强制设置正确的 Origin 和 Referer（修复自定义域名跨域问题）
      headers.set('Origin', 'https://live.ctn32.us.kg');
      headers.set('Referer', 'https://live.ctn32.us.kg/');

      // 保留原始 Host 信息（用于后端日志）
      headers.set('X-Forwarded-Host', request.headers.get('Host') || '');
      headers.set('X-Forwarded-Proto', 'https');

      // 注入 ctn32 Cookie（绕过防火墙）
      const oldCookie = request.headers.get('cookie') || '';
      let newCookie = oldCookie;
      if (!/(^|;\s*)ctn32=ctn32/i.test(oldCookie)) {
        newCookie = oldCookie ? oldCookie + '; ctn32=ctn32' : 'ctn32=ctn32';
      }
      headers.set('Cookie', newCookie);

      // 准备请求体
      const requestBody = (request.method === 'GET' || request.method === 'HEAD')
        ? undefined
        : await request.arrayBuffer();

      let response;
      try {
        response = await fetch(
          new Request(target, {
            method: request.method,
            headers: headers,
            body: requestBody,
            redirect: 'manual'
          })
        );
      } catch (e) {
        // 网络错误捕获，返回详细 JSON
        return new Response(
          JSON.stringify({
            error: 'Backend proxy failed',
            message: e.message,
            target: target,
            stack: e.stack
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // 构建响应头
      const outHeaders = new Headers();
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() !== 'set-cookie') {
          outHeaders.append(key, value);
        }
      }

      // 透传 Set-Cookie（使用 append，确保多个 Cookie 不被覆盖）
      if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        for (const c of cookies) {
          outHeaders.append('Set-Cookie', c);
        }
      } else {
        const cookie = response.headers.get('set-cookie');
        if (cookie) {
          outHeaders.append('Set-Cookie', cookie);
        }
      }

      // 禁用缓存
      outHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      outHeaders.set('Pragma', 'no-cache');
      outHeaders.set('Expires', '0');

      return new Response(response.body, {
        status: response.status,
        headers: outHeaders
      });
    }

    // 路由：返回对应 HTML 页面
    if (path === '/login') {
      return new Response(LOGIN_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    if (path === '/dashboard/rooms') {
      return new Response(ROOMS_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    if (path === '/dashboard/logs') {
      return new Response(LOGS_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    if (path === '/dashboard/notify') {
      return new Response(NOTIFY_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    if (path === '/') {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/dashboard/rooms' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
