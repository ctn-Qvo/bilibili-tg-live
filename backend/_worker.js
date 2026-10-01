const CONFIG = {
  UAPI_DIRECT: 'https://uapis.cn/api/v1/social/bilibili/liveroom?room_id=',
  USER_API_DIRECT: 'https://uapis.cn/api/v1/social/bilibili/userinfo?uid=',
  BILI_DIRECT: 'https://api.live.bilibili.com/room/v1/Room/get_info?room_id=',
  IS_LIVE_STATUS: [1],
  USER_INFO_TTL: 86400,
  CACHE_TTL: 30,
  MAX_LEVEL: 6,
  POPULARITY_MILESTONES: [1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  DEFAULT_TEMPLATE: `[{{事件}}] {{主播}}\n标题：{{标题}}\n房间号：{{房间号}} | UID：{{UID}}\n分区：{{父分区}} - {{分区}}\n人气：{{人气}} | 直播时间：{{直播时间}}\n直播间链接：{{直播链接}}\n封面：{{封面}}\n等级：{{等级}} | 粉丝：{{粉丝}} | 关注：{{关注}} | 性别：{{性别}}\nVIP：{{VIP类型}} ({{VIP状态}})\n投稿数：{{投稿数}} | 文章数：{{文章数}}\n签名：{{签名}}\n头像：{{头像}}\n更新时间：{{时间}}`
};

const PROXY_CHAIN = [
  { name: 'http-proxy', build: (u) => 'https://http-proxy.ctn32.qzz.io/' + u },
  { name: 'cfspider', build: (u) => 'https://cfspider.ctn32.us.kg/api/fetch?url=' + encodeURIComponent(u) },
  { name: 'vercel', build: (u) => 'https://vercel-proxy.ctn32.us.kg/https/' + u.replace(/^https?:\/\//, '') },
  { name: 'cfspider-qzz', build: (u) => 'https://cfspider.ctn32.qzz.io/api/fetch?url=' + encodeURIComponent(u) }
];

const SERVERCHAN_PROXIES = [
  { base: 'http://http-proxy.ctn32.qzz.io/', transform: (u) => u },
  { base: 'https://vercel-proxy.ctn32.us.kg/', transform: (u) => 'https/' + u.replace(/^https?:\/\//, '') }
];

function toRoomId(id) { return String(id).trim(); }
function buildCacheKey(...parts) { return parts.join(':'); }
function normalizeCover(url) { if (!url) return ''; return url.split('?')[0].trim(); }
function formatLevel(level) { const lv = parseInt(level || 0) || 1; return 'LV ' + Math.min(lv, CONFIG.MAX_LEVEL); }
function renderTemplate(template, vars) {
  if (!template) template = CONFIG.DEFAULT_TEMPLATE;
  return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const val = vars[key.trim()];
    return val !== undefined && val !== null ? String(val) : '';
  });
}
function hasBypassCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split(';').map(c => c.trim()).includes('ctn32=ctn32');
}

/* ============================================================
 * 日志系统：只输出到 console，不写 D1
 * ------------------------------------------------------------
 * 查看方式：
 *   - Cloudflare Dashboard → Workers → 该 Worker → Logs
 *   - 命令行：npx wrangler tail
 * ============================================================ */
function systemLog(env, level, message, data = {}) {
  const text = Object.keys(data).length ? message + ' ' + JSON.stringify(data) : message;
  console.log(`[${level.toUpperCase()}] ${text}`);
}

/* ============================================================
 * 缓存
 * ============================================================ */
async function getCache(key) {
  const cache = caches.default;
  const resp = await cache.match(new Request('https://cache/' + key));
  if (resp && resp.ok) return resp.json();
  return null;
}
async function setCache(key, data, ttl) {
  ttl = ttl || CONFIG.CACHE_TTL;
  const cache = caches.default;
  const resp = new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + ttl }
  });
  await cache.put(new Request('https://cache/' + key), resp);
}

/* ============================================================
 * 网络请求
 * ============================================================ */
async function fetchDirect(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*'
      }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

const RETRY_STATUS = [401, 402, 403, 408, 429, 500, 502, 503, 520, 522, 523, 524];

async function fetchThroughProxy(targetUrl, env) {
  let lastError = null;
  for (const proxy of PROXY_CHAIN) {
    try {
      const proxyUrl = proxy.build(targetUrl);
      const resp = await fetch(proxyUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 Chrome/120 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*'
        }
      });
      if (RETRY_STATUS.includes(resp.status)) {
        systemLog(env, 'system', `${proxy.name} 请求失败，切换代理`, { status: resp.status });
        continue;
      }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      systemLog(env, 'system', `${proxy.name} 代理异常`, { error: e.message });
      lastError = e;
    }
  }
  throw new Error('代理链全部失败: ' + (lastError?.message || 'unknown'));
}

function buildUapiRoom(roomId) { return CONFIG.UAPI_DIRECT + encodeURIComponent(toRoomId(roomId)); }
function buildUserApi(uid) { return CONFIG.USER_API_DIRECT + encodeURIComponent(String(uid)); }
function buildBiliRoom(roomId) { return CONFIG.BILI_DIRECT + encodeURIComponent(toRoomId(roomId)); }

function normalizeRoomData(data, roomId) {
  return {
    room_id: data.room_id || roomId,
    uid: data.uid || '',
    live_status: Number(data.live_status || 0),
    title: data.title || '',
    online: Number(data.online || 0),
    area_name: data.area_name || '',
    parent_area_name: data.parent_area_name || '',
    user_cover: data.user_cover || '',
    live_time: data.live_time || ''
  };
}

async function fetchLiveStatus(roomId, env) {
  roomId = toRoomId(roomId);
  const cacheKey = 'live:' + roomId;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  let result = null;
  const uapiTarget = buildUapiRoom(roomId);

  try {
    const data = await fetchDirect(uapiTarget);
    if (data && data.room_id) result = normalizeRoomData(data, roomId);
  } catch (e) {
    systemLog(env, 'system', 'UAPI 直连失败', { room: roomId, error: e.message });
  }

  if (!result) {
    try {
      const data = await fetchThroughProxy(uapiTarget, env);
      if (data && data.room_id) result = normalizeRoomData(data, roomId);
    } catch (e) {
      systemLog(env, 'system', 'UAPI 代理失败', { room: roomId, error: e.message });
    }
  }

  if (!result) {
    const biliTarget = buildBiliRoom(roomId);
    try {
      const data = await fetchThroughProxy(biliTarget, env);
      if (data && data.code === 0 && data.data) result = normalizeRoomData(data.data, roomId);
    } catch (e) {
      systemLog(env, 'system', 'B站 代理异常', { room: roomId, error: e.message });
    }
  }

  if (!result) {
    const biliTarget = buildBiliRoom(roomId);
    try {
      const data = await fetchDirect(biliTarget);
      if (data && data.code === 0 && data.data) result = normalizeRoomData(data.data, roomId);
    } catch (e) {
      systemLog(env, 'system', 'B站 直连异常', { room: roomId, error: e.message });
    }
  }

  if (result) {
    await setCache(cacheKey, result, CONFIG.CACHE_TTL);
    return result;
  }
  systemLog(env, 'error', '所有直播接口均失败', { room: roomId });
  return null;
}

async function fetchUserInfo(uid, env) {
  if (!uid) return null;
  const cacheKey = buildCacheKey('userinfo', uid);
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  let result = null;
  const target = buildUserApi(uid);
  try {
    const data = await fetchDirect(target);
    if (data && data.mid) result = data;
  } catch (e) {
    systemLog(env, 'system', '用户信息直连失败', { uid, error: e.message });
  }

  if (!result) {
    try {
      const data = await fetchThroughProxy(target, env);
      if (data && data.mid) result = data;
    } catch (e) {
      systemLog(env, 'system', '用户信息代理失败', { uid, error: e.message });
    }
  }

  if (result) {
    await setCache(cacheKey, result, CONFIG.USER_INFO_TTL);
    return result;
  }
  return null;
}

/* ============================================================
 * 通知发送
 * ============================================================ */
async function sendNotificationToConfig(config, text, extra) {
  extra = extra || {};
  try {
    if (config.protocol === 'telegram') {
      const receiverKey = config.receiver_key || 'chat_id';
      const messageKey = config.message_key || 'text';
      const payload = { [receiverKey]: config.chat_id, [messageKey]: text };
      if (config.extra_params) Object.assign(payload, config.extra_params);
      const resp = await fetch(config.api_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) return { success: true };
      return { success: false, error: await resp.text() };
    } else if (config.protocol === 'serverchan') {
      const title = config.chat_id || 'B站直播通知';
      const params = new URLSearchParams({ text: title, desp: text });
      const targetUrl = config.api_url;
      let lastError = null;
      for (const proxy of SERVERCHAN_PROXIES) {
        try {
          const path = proxy.transform(targetUrl);
          const base = proxy.base.endsWith('/') ? proxy.base : proxy.base + '/';
          const proxyUrl = base + path;
          const resp = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });
          if (resp.ok) return { success: true };
          lastError = await resp.text();
        } catch (e) {
          lastError = e.message;
        }
      }
      return { success: false, error: '所有代理请求失败: ' + lastError };
    }
    return { success: false, error: '不支持的协议: ' + config.protocol };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 发送通知。可选传入已加载的 configs，避免重复查 D1。
 */
async function sendNotification(text, env, extra, configs) {
  extra = extra || {};
  const roomId = extra.room_id;
  if (!configs) configs = await getNotifyConfigs(env);
  const enabled = configs.filter(c => c.enabled);
  if (enabled.length === 0) return false;

  let success = false;
  for (const config of enabled) {
    const ids = config.room_ids || [];
    if (ids.length > 0 && roomId && !ids.includes(roomId)) continue;
    const result = await sendNotificationToConfig(config, text, extra);
    if (result.success) success = true;
  }
  return success;
}

/* ============================================================
 * 消息模板渲染
 * ============================================================ */
async function buildNotification(roomId, current, env, eventType, extra, configs) {
  extra = extra || {};
  let userInfo = null;
  try {
    userInfo = await fetchUserInfo(current.uid, env);
  } catch (e) {
    systemLog(env, 'system', '获取用户信息失败', { uid: current.uid });
  }
  const anchorName = (userInfo && userInfo.name) ? userInfo.name : '房间 ' + roomId;
  const now = new Date();
  const shanghaiNow = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  if (eventType === 'live_end') {
    let duration = '';
    if (current.live_time) {
      let startTime;
      if (typeof current.live_time === 'string' && current.live_time.includes('-')) {
        startTime = new Date(current.live_time.replace(/-/g, '/') + ' UTC+8');
      } else {
        startTime = new Date(Number(current.live_time) * 1000);
      }
      if (!isNaN(startTime)) {
        const diffMs = now - startTime;
        if (diffMs > 0) {
          const diffMin = Math.floor(diffMs / 60000);
          duration = (Math.floor(diffMin / 60) > 0 ? Math.floor(diffMin / 60) + '小时' : '') + (diffMin % 60) + '分钟';
        }
      }
    }
    let message = `[直播结束] ${anchorName}\n结束时间：${shanghaiNow}\n房间号：${current.room_id || roomId}`;
    if (duration) message += `\n直播时长：${duration}`;
    return message;
  }

  const vipTypeMap = { 0: '无', 1: '月度大会员', 2: '年度大会员' };
  const vipType = (userInfo && userInfo.vip_type !== undefined) ? vipTypeMap[userInfo.vip_type] || userInfo.vip_type : '';
  const vipStatus = (userInfo && userInfo.vip_status !== undefined) ? (userInfo.vip_status === 1 ? '已开通' : '未开通') : '';
  const levelDisplay = formatLevel(userInfo ? userInfo.level : 0);
  const eventNameMap = { 'live_start': '开播', 'title_change': '标题修改', 'cover_change': '封面变化', 'area_change': '分区切换', 'popularity_milestone': '人气里程碑' };
  const eventDisplay = eventNameMap[eventType] || eventType;

  const baseVars = {
    '事件': eventDisplay,
    '主播': anchorName,
    '标题': current.title || '未知',
    'UID': current.uid || '',
    '房间号': current.room_id || roomId,
    '直播时间': current.live_time
      ? (typeof current.live_time === 'string' && current.live_time.includes('-')
          ? current.live_time
          : new Date(Number(current.live_time) * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))
      : '',
    '直播链接': 'https://live.bilibili.com/' + (current.room_id || roomId),
    '分区': current.area_name || '未知',
    '父分区': current.parent_area_name || '未知',
    '人气': current.online || 0,
    '封面': current.user_cover || '',
    '签名': (userInfo && userInfo.sign) || '',
    '粉丝': (userInfo && userInfo.follower) || 0,
    '关注': (userInfo && userInfo.following) || 0,
    '等级': levelDisplay,
    '性别': (userInfo && userInfo.sex) || '',
    'VIP类型': vipType,
    'VIP状态': vipStatus,
    '投稿数': (userInfo && userInfo.archive_count) || 0,
    '文章数': (userInfo && userInfo.article_count) || 0,
    '头像': (userInfo && userInfo.face) || '',
    '时间': shanghaiNow
  };

  if (!configs) configs = await getNotifyConfigs(env);
  let template = null;
  for (const cfg of configs) {
    if (cfg.template && cfg.template.trim()) { template = cfg.template; break; }
  }
  if (!template) template = CONFIG.DEFAULT_TEMPLATE;
  return renderTemplate(template, baseVars);
}

/* ============================================================
 * 数据访问层
 * ============================================================ */
async function getRoomList(env) {
  const { results } = await env.DB.prepare('SELECT room_id, notify_enabled FROM rooms').all();
  return results.map(r => ({ room_id: r.room_id, notify_enabled: r.notify_enabled === 1 }));
}

async function addRoom(env, roomId) {
  await env.DB.prepare('INSERT OR IGNORE INTO rooms (room_id, notify_enabled) VALUES (?, 1)').bind(roomId).run();
  systemLog(env, 'user', '添加房间', { room: roomId });
}

async function removeRoom(env, roomId) {
  await env.DB.prepare('DELETE FROM rooms WHERE room_id = ?').bind(roomId).run();
  await env.DB.prepare('DELETE FROM monitor_states WHERE room_id = ?').bind(roomId).run();
  systemLog(env, 'user', '删除房间', { room: roomId });
}

async function getMonitorState(env, roomId) {
  const row = await env.DB.prepare('SELECT * FROM monitor_states WHERE room_id = ?').bind(roomId).first();
  if (!row) {
    return {
      room_id: roomId, state: 'OFFLINE', last_title: '', last_cover: '',
      last_area: '', last_parent_area: '', last_online: 0, last_live_time: '',
      last_events: [], last_check: 0, last_update: null, version: 3
    };
  }
  return {
    ...row,
    last_events: JSON.parse(row.last_events || '[]'),
    last_online: Number(row.last_online) || 0,
    last_check: Number(row.last_check) || 0
  };
}

async function setMonitorState(env, roomId, state) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO monitor_states
     (room_id, state, last_title, last_cover, last_area, last_parent_area,
      last_online, last_live_time, last_events, last_check, last_update, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    roomId, state.state, state.last_title || '', state.last_cover || '',
    state.last_area || '', state.last_parent_area || '', state.last_online || 0,
    state.last_live_time || '', JSON.stringify(state.last_events || []),
    state.last_check || Date.now(), state.last_update || new Date().toISOString(),
    state.version || 3
  ).run();
}

async function getNotifyConfigs(env) {
  const { results } = await env.DB.prepare('SELECT * FROM notify_configs ORDER BY created_at').all();
  return results.map(row => ({
    ...row,
    enabled: row.enabled === 1,
    extra_params: row.extra_params ? JSON.parse(row.extra_params) : {},
    template: row.template || CONFIG.DEFAULT_TEMPLATE,
    room_ids: row.room_ids ? JSON.parse(row.room_ids) : []
  }));
}

async function addNotifyConfig(env, config) {
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const roomIds = Array.isArray(config.room_ids) ? config.room_ids : [];
  await env.DB.prepare(
    `INSERT INTO notify_configs
     (id, name, protocol, api_url, chat_id, receiver_key, message_key,
      template, extra_params, enabled, room_ids, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, config.name, config.protocol, config.api_url, config.chat_id || '',
    config.receiver_key || 'chat_id', config.message_key || 'text',
    config.template || CONFIG.DEFAULT_TEMPLATE,
    JSON.stringify(config.extra_params || {}), config.enabled ? 1 : 0,
    JSON.stringify(roomIds), new Date().toISOString()
  ).run();
  systemLog(env, 'user', '添加通知配置', { name: config.name });
  return { ...config, id };
}

async function deleteNotifyConfig(env, id) {
  await env.DB.prepare('DELETE FROM notify_configs WHERE id = ?').bind(id).run();
  systemLog(env, 'user', '删除通知配置', { id });
}

async function toggleNotifyConfig(env, id) {
  const current = await env.DB.prepare('SELECT enabled FROM notify_configs WHERE id = ?').bind(id).first();
  if (!current) throw new Error('配置不存在');
  const newEnabled = current.enabled === 1 ? 0 : 1;
  await env.DB.prepare('UPDATE notify_configs SET enabled = ? WHERE id = ?').bind(newEnabled, id).run();
  systemLog(env, 'user', '切换通知配置状态', { id, enabled: newEnabled });
}

async function updateNotifyConfig(env, id, config) {
  const roomIds = Array.isArray(config.room_ids) ? config.room_ids : [];
  await env.DB.prepare(
    `UPDATE notify_configs
     SET name=?, protocol=?, api_url=?, chat_id=?, receiver_key=?, message_key=?,
         template=?, extra_params=?, room_ids=?
     WHERE id=?`
  ).bind(
    config.name, config.protocol, config.api_url, config.chat_id || '',
    config.receiver_key || 'chat_id', config.message_key || 'text',
    config.template || CONFIG.DEFAULT_TEMPLATE,
    JSON.stringify(config.extra_params || {}), JSON.stringify(roomIds), id
  ).run();
  systemLog(env, 'user', '更新通知配置', { id, name: config.name });
}

/* 客户端错误：不再写 D1，只输出到 console（可在 Workers 实时日志查看） */
async function addClientError(env, data) {
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  console.error('[CLIENT_ERROR] ' + JSON.stringify({
    id,
    message: data.message || '',
    stack: (data.stack || '').slice(0, 800),
    url: data.url || '',
    user_agent: data.user_agent || '',
    context: data.context || '',
    extra: data.extra || {}
  }));
  return id;
}

/* ============================================================
 * 巡检核心
 * ------------------------------------------------------------
 * 关键优化：只有当「状态 / 标题 / 封面 / 分区」发生变化，
 * 或者跨越人气里程碑时，才写入 monitor_states。
 * 单纯的人气数值波动不再触发写入。
 * ============================================================ */
async function processRoom(roomId, env, options) {
  options = options || {};
  roomId = toRoomId(roomId);

  let current, prev;
  try {
    prev = await getMonitorState(env, roomId);
  } catch (e) {
    systemLog(env, 'error', '获取旧状态失败', { room: roomId, error: e.message });
    return { error: e.message };
  }

  try {
    current = await fetchLiveStatus(roomId, env);
    if (!current) return { state: prev.state || 'OFFLINE', events: [] };
    current.live_status = Number(current.live_status ?? 0);
  } catch (e) {
    systemLog(env, 'error', '获取新状态失败', { room: roomId, error: e.message });
    return { error: e.message };
  }

  const isLive = CONFIG.IS_LIVE_STATUS.includes(current.live_status);
  const state = isLive ? 'LIVE' : 'OFFLINE';
  const oldState = prev.state || 'OFFLINE';
  const events = [];

  // —— 事件检测 ——
  if (oldState !== state) {
    systemLog(env, 'system', '状态变化', { room: roomId, from: oldState, to: state });
    events.push(state === 'LIVE'
      ? { type: 'live_start', data: current }
      : { type: 'live_end', data: current });
  } else if (state === 'LIVE') {
    const oldTitle = (prev.last_title || '').trim();
    const newTitle = (current.title || '').trim();
    if (oldTitle && oldTitle !== newTitle) {
      events.push({ type: 'title_change', data: current, old_title: prev.last_title || '' });
    }
    if (normalizeCover(prev.last_cover) !== normalizeCover(current.user_cover)) {
      events.push({ type: 'cover_change', data: current, old_cover: prev.last_cover });
    }
    if (String(prev.last_area || '') !== String(current.area_name || '') ||
        String(prev.last_parent_area || '') !== String(current.parent_area_name || '')) {
      events.push({ type: 'area_change', data: current, old_area: prev.last_area || '', old_parent_area: prev.last_parent_area || '' });
    }
  }

  // —— 人气里程碑检测 ——
  const prevOnline = prev.last_online || 0;
  let milestoneHit = false;
  if (state === 'LIVE') {
    for (const milestone of CONFIG.POPULARITY_MILESTONES) {
      if (prevOnline < milestone && current.online >= milestone) {
        milestoneHit = true;
        events.push({ type: 'popularity_milestone', data: current, milestone });
      }
    }
  }

  // —— 只有真正需要时才写 D1 ——
  const stateChanged =
    prev.state !== state ||
    prev.last_title !== (current.title || '') ||
    normalizeCover(prev.last_cover) !== normalizeCover(current.user_cover) ||
    prev.last_area !== (current.area_name || '') ||
    prev.last_parent_area !== (current.parent_area_name || '');

  if (stateChanged || milestoneHit) {
    await setMonitorState(env, roomId, {
      room_id: roomId,
      state,
      last_live_time: current.live_time || prev.last_live_time || '',
      last_title: current.title || '',
      last_cover: current.user_cover || '',
      last_area: current.area_name || '',
      last_parent_area: current.parent_area_name || '',
      // 只要本次写入，就把人气基线同步到当前值
      last_online: Number(current.online || 0),
      last_events: events.map(e => e.type),
      last_update: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      last_check: Date.now(),
      version: 3
    });
  }

  // —— 推送事件 ——
  if (events.length > 0 && options.notify_enabled !== false) {
    // 一次事件周期内只查一次配置
    const configs = await getNotifyConfigs(env);
    for (const evt of events) {
      const text = await buildNotification(roomId, evt.data, env, evt.type, evt, configs);
      const success = await sendNotification(text, env, { event: evt.type, room_id: roomId, ...evt.data }, configs);
      if (!success) systemLog(env, 'error', '事件通知失败', { room: roomId, event: evt.type });
    }
  }

  return { state, events };
}

async function monitorAll(env, options) {
  options = options || {};
  const rooms = await getRoomList(env);
  if (rooms.length === 0) {
    systemLog(env, 'system', '房间列表为空，跳过检查');
    return { error: '房间列表为空' };
  }
  systemLog(env, 'system', '开始批量检查', { count: rooms.length });

  const results = [];
  for (const { room_id, notify_enabled } of rooms) {
    const roomId = toRoomId(room_id);
    try {
      const res = await processRoom(roomId, env, { force: options.force, notify_enabled });
      results.push({ room_id: roomId, ...res });
    } catch (e) {
      systemLog(env, 'error', '处理房间失败', { room: roomId, error: e.message });
      results.push({ room_id: roomId, error: e.message });
    }
  }
  return results;
}

/* ============================================================
 * HTTP 辅助
 * ============================================================ */
function isAuthenticated(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const authCookie = cookie.split(';').find(c => c.trim().startsWith('auth='));
  if (!authCookie) return false;
  try {
    const decoded = atob(authCookie.split('=')[1]);
    const parts = decoded.split(':');
    return parts[0] === env.ADMIN_USER && parts[1] === env.ADMIN_PASSWORD;
  } catch { return false; }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || 'https://live.ctn32.us.kg';
  const allowedOrigins = [
    'https://live.ctn32.us.kg',
    'https://bilibili-live-frontend.ctn32.workers.dev',
    'https://live.ctn32.us.kg:443'
  ];
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

function jsonResponse(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) }
  });
}

/* ============================================================
 * 路由
 * ============================================================ */
async function handleRequest(request, env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request, env) });

    if (path === '/api/health' && method === 'GET') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() }, 200, request, env);
    }

    if (path === '/api/login' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      const { username, password } = body;
      if (username === env.ADMIN_USER && password === env.ADMIN_PASSWORD) {
        const auth = btoa(username + ':' + password);
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            ...corsHeaders(request, env),
            'Set-Cookie': 'auth=' + auth + '; HttpOnly; Secure; Path=/; Max-Age=86400; SameSite=None',
            'Content-Type': 'application/json'
          }
        });
      }
      return jsonResponse({ success: false, error: '用户名或密码错误' }, 401, request, env);
    }

    if (path === '/api/logout' && method === 'POST') {
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders(request, env),
          'Set-Cookie': 'auth=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=None',
          'Content-Type': 'application/json'
        }
      });
    }

    if (path === '/api/me' && method === 'GET') {
      if (!isAuthenticated(request, env)) return jsonResponse({ error: '未认证' }, 401, request, env);
      return jsonResponse({ username: env.ADMIN_USER }, 200, request, env);
    }

    /* 客户端错误上报：不再写 D1，只 console.error */
    if (path === '/api/client-errors' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      const id = await addClientError(env, body);
      return jsonResponse({ id, success: true }, 200, request, env);
    }

    if (!isAuthenticated(request, env)) {
      return jsonResponse({ error: '未认证' }, 401, request, env);
    }

    if (path === '/api/rooms' && method === 'GET') {
      const rooms = await getRoomList(env);
      const states = {};
      for (const { room_id } of rooms) states[room_id] = await getMonitorState(env, room_id);
      return jsonResponse({ rooms, states }, 200, request, env);
    }

    if (path === '/api/rooms' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      const roomId = toRoomId(body.room_id || '');
      if (!roomId) return jsonResponse({ error: '缺少房间号' }, 400, request, env);
      await addRoom(env, roomId);
      try { await processRoom(roomId, env, { force: true }); } catch (e) {}
      return jsonResponse({ success: true }, 200, request, env);
    }

    if (path === '/api/rooms' && method === 'DELETE') {
      let body; try { body = await request.json(); } catch { body = {}; }
      const roomId = toRoomId(body.room_id || '');
      if (!roomId) return jsonResponse({ error: '缺少房间号' }, 400, request, env);
      await removeRoom(env, roomId);
      return jsonResponse({ success: true }, 200, request, env);
    }

    if (path === '/api/rooms/toggle-notify' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      const roomId = toRoomId(body.room_id || '');
      const enabled = body.enabled === true ? 1 : 0;
      if (!roomId) return jsonResponse({ error: '缺少房间号' }, 400, request, env);
      await env.DB.prepare('UPDATE rooms SET notify_enabled = ? WHERE room_id = ?').bind(enabled, roomId).run();
      systemLog(env, 'user', '切换房间通知状态', { room: roomId, enabled });
      return jsonResponse({ success: true }, 200, request, env);
    }

    /* 日志接口已废弃：返回空数组，避免前端报错 */
    if (path === '/api/logs' && method === 'GET') {
      return jsonResponse([], 200, request, env);
    }
    if (path === '/api/logs/clear' && method === 'POST') {
      return jsonResponse({ success: true, note: '日志已改为 Cloudflare 控制台查看' }, 200, request, env);
    }

    if (path === '/api/notify-configs' && method === 'GET') {
      return jsonResponse(await getNotifyConfigs(env), 200, request, env);
    }

    if (path === '/api/notify-configs' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      const { name, protocol, api_url, chat_id, template, extra_params, room_ids } = body;
      if (!name) return jsonResponse({ error: '缺少名称' }, 400, request, env);
      if (!['telegram', 'serverchan'].includes(protocol)) {
        return jsonResponse({ error: '仅支持 telegram 或 serverchan 协议' }, 400, request, env);
      }
      const result = await addNotifyConfig(env, {
        name,
        protocol: protocol || 'telegram',
        api_url: api_url || '',
        chat_id: chat_id || '',
        receiver_key: body.receiver_key || 'chat_id',
        message_key: body.message_key || 'text',
        template: template || CONFIG.DEFAULT_TEMPLATE,
        extra_params: extra_params || {},
        room_ids: Array.isArray(room_ids) ? room_ids : [],
        enabled: true
      });
      return jsonResponse(result, 200, request, env);
    }

    if (path === '/api/notify-configs' && method === 'DELETE') {
      let body; try { body = await request.json(); } catch { body = {}; }
      if (!body.id) return jsonResponse({ error: '缺少ID' }, 400, request, env);
      await deleteNotifyConfig(env, body.id);
      return jsonResponse({ success: true }, 200, request, env);
    }

    if (path === '/api/notify-configs/toggle' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      if (!body.id) return jsonResponse({ error: '缺少ID' }, 400, request, env);
      try {
        await toggleNotifyConfig(env, body.id);
        return jsonResponse({ success: true }, 200, request, env);
      } catch (e) {
        return jsonResponse({ error: e.message }, 404, request, env);
      }
    }

    if (path.startsWith('/api/notify-configs/') && method === 'PUT') {
      const id = path.split('/')[3];
      if (!id) return jsonResponse({ error: '缺少ID' }, 400, request, env);
      let body; try { body = await request.json(); } catch { body = {}; }
      const { name, protocol, api_url, chat_id, template, room_ids, extra_params, receiver_key, message_key } = body;
      if (!name) return jsonResponse({ error: '缺少名称' }, 400, request, env);
      if (!['telegram', 'serverchan'].includes(protocol)) {
        return jsonResponse({ error: '仅支持 telegram 或 serverchan 协议' }, 400, request, env);
      }
      try {
        await updateNotifyConfig(env, id, {
          name, protocol, api_url, chat_id: chat_id || '',
          template: template || CONFIG.DEFAULT_TEMPLATE,
          room_ids: Array.isArray(room_ids) ? room_ids : [],
          extra_params: extra_params || {},
          receiver_key: receiver_key || 'chat_id',
          message_key: message_key || 'text'
        });
        return jsonResponse({ success: true }, 200, request, env);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500, request, env);
      }
    }

    if (path === '/api/notify-configs/test' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      if (!body.id) return jsonResponse({ error: '缺少ID' }, 400, request, env);
      const configs = await getNotifyConfigs(env);
      const config = configs.find(c => c.id === body.id);
      if (!config) return jsonResponse({ error: '配置不存在' }, 404, request, env);
      const roomList = await getRoomList(env);
      if (!roomList.length) return jsonResponse({ error: '房间列表为空' }, 400, request, env);
      let roomId = (config.room_ids && config.room_ids.length > 0)
        ? config.room_ids[0]
        : toRoomId(roomList[Math.floor(Math.random() * roomList.length)].room_id);
      try {
        const current = await fetchLiveStatus(roomId, env);
        if (!current) return jsonResponse({ error: '获取直播状态失败' }, 500, request, env);
        current.live_status = Number(current.live_status ?? 0);
        const isLive = CONFIG.IS_LIVE_STATUS.includes(current.live_status);
        if (!isLive) {
          const last = await getMonitorState(env, roomId);
          current.title = last.last_title || current.title || '模拟标题';
          current.online = last.last_online || 0;
          current.area_name = last.last_area || current.area_name || '未知分区';
          current.parent_area_name = last.last_parent_area || current.parent_area_name || '未知父分区';
          current.live_time = last.last_live_time || '';
          current.uid = current.uid || 0;
        }
        const eventType = isLive ? 'live_start' : 'live_end';
        const text = await buildNotification(roomId, current, env, eventType, {}, configs);
        const result = await sendNotificationToConfig(config, '[测试] ' + text, { event: eventType, room_id: roomId, ...current });
        if (result.success) return jsonResponse({ success: true, message: '测试通知发送成功' }, 200, request, env);
        return jsonResponse({ success: false, error: result.error }, 500, request, env);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500, request, env);
      }
    }

    if (path === '/api/monitor' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      const result = await monitorAll(env, { force: body.force === true });
      return jsonResponse(result, 200, request, env);
    }

    if (path === '/api/send-live-notify' && method === 'POST') {
      let body; try { body = await request.json(); } catch { body = {}; }
      let roomIds = [];
      if (Array.isArray(body.room_ids)) {
        roomIds = body.room_ids.map(id => toRoomId(id)).filter(Boolean);
      } else if (body.room_id) {
        roomIds = [toRoomId(body.room_id)];
      } else {
        const all = await getRoomList(env);
        if (!all.length) return jsonResponse({ error: '房间列表为空' }, 400, request, env);
        roomIds = [toRoomId(all[Math.floor(Math.random() * all.length)].room_id)];
      }
      const requestedEvent = body.event || null;
      const configs = await getNotifyConfigs(env);
      const results = [];
      for (const roomId of roomIds) {
        try {
          const current = await fetchLiveStatus(roomId, env);
          if (!current) {
            results.push({ room_id: roomId, success: false, error: '获取直播状态失败' });
            continue;
          }
          current.live_status = Number(current.live_status ?? 0);
          const isLive = CONFIG.IS_LIVE_STATUS.includes(current.live_status);
          const eventType = requestedEvent || (isLive ? 'live_start' : 'live_end');
          if (!isLive && eventType === 'live_start') {
            const last = await getMonitorState(env, roomId);
            current.title = last.last_title || current.title || '模拟标题';
            current.online = last.last_online || 0;
            current.area_name = last.last_area || current.area_name || '未知分区';
            current.parent_area_name = last.last_parent_area || current.parent_area_name || '未知父分区';
            current.live_time = last.last_live_time || '';
            current.uid = current.uid || 0;
          }
          const text = await buildNotification(roomId, current, env, eventType, {}, configs);
          const success = await sendNotification(text, env, { event: eventType, room_id: roomId, ...current }, configs);
          results.push(success
            ? { room_id: roomId, success: true, event: eventType }
            : { room_id: roomId, success: false, error: '通知发送失败，请检查配置' });
        } catch (e) {
          systemLog(env, 'error', '手动发送通知异常', { room: roomId, error: e.message });
          results.push({ room_id: roomId, success: false, error: e.message });
        }
      }
      return jsonResponse({ results }, 200, request, env);
    }

    return jsonResponse({ error: 'Not Found' }, 404, request, env);
  } catch (e) {
    console.error('Unhandled error:', e);
    return jsonResponse({ error: '服务器内部错误: ' + e.message }, 500, request, env);
  }
}

/* ============================================================
 * 入口
 * ============================================================ */
export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      console.error('Fatal fetch error:', e);
      return jsonResponse({ error: '致命错误: ' + e.message }, 500, request, env);
    }
  },

  async scheduled(event, env) {
    systemLog(env, 'system', '定时任务启动');
    try {
      await monitorAll(env);
      systemLog(env, 'system', '定时任务完成');
    } catch (e) {
      systemLog(env, 'error', '定时任务异常', { error: e.message });
    }
  }
};
