const { app, BrowserWindow, ipcMain, screen, Menu, globalShortcut } = require('electron');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

let main = null, out = null, dragKey = null;
let last = { display: 0, fill: false, onTop: true };
const iconPath = path.join(__dirname, 'build', 'icon.png');
const icon = fs.existsSync(iconPath) ? iconPath : undefined;
const preload = path.join(__dirname, 'preload.js');
const wp = { preload, contextIsolation: true, backgroundThrottling: false };

async function setDrag(on) {
  if (!out || out.isDestroyed()) return;
  const wc = out.webContents;
  if (on && !dragKey) dragKey = await wc.insertCSS('body{-webkit-app-region:drag}');
  if (!on && dragKey) { await wc.removeInsertedCSS(dragKey); dragKey = null; }
}

async function place(o) {
  if (!out || out.isDestroyed()) return;
  last = { display: o.display || 0, fill: !!o.fill, onTop: o.onTop !== false };
  const list = screen.getAllDisplays();
  const d = list[last.display] || screen.getPrimaryDisplay();
  if (last.fill) {
    await setDrag(false);
    out.setAlwaysOnTop(last.onTop, 'screen-saver');
    out.setBounds(d.bounds);
  } else {
    await setDrag(true);
    out.setAlwaysOnTop(last.onTop, 'screen-saver');
    const w = 960, h = 540;
    out.setBounds({ x: d.bounds.x + Math.round((d.bounds.width - w) / 2), y: d.bounds.y + Math.round((d.bounds.height - h) / 2), width: w, height: h });
  }
}

function createMain() {
  Menu.setApplicationMenu(null);
  main = new BrowserWindow({
    width: 1280, height: 900, backgroundColor: '#0b0c0e', title: 'Chrono événement', icon,
    webPreferences: wp
  });
  main.loadFile('index.html');

  main.webContents.setWindowOpenHandler((details) => {
    const m = /width=(\d+),height=(\d+)/.exec(details.features || '');
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        transparent: true, frame: false, hasShadow: false, backgroundColor: '#00000000',
        resizable: true, fullscreenable: false, skipTaskbar: false, alwaysOnTop: last.onTop, icon,
        width: m ? +m[1] : 960, height: m ? +m[2] : 540,
        webPreferences: wp
      }
    };
  });
  main.webContents.on('did-create-window', (w) => {
    out = w; dragKey = null;
    w.webContents.once('did-finish-load', () => setDrag(true));
    w.on('closed', () => { out = null; dragKey = null; });
  });
  main.on('closed', () => app.quit());
}

/* ---- Pilotage à distance : Stream Deck, Companion, page web ---- */
const PORT = 9595;
const FIXED = ['start', 'pause', 'toggle', 'reset', 'close', 'fullscreen', 'msg-toggle', 'msg-show', 'msg-hide', 'out-open', 'out-fill', 'out-window', 'plus1h', 'minus1h', 'plus1m', 'minus1m', 'plus5s', 'minus5s'];
let remote = { port: null, keys: [] };
let net = { lan: false, ctl: false, rmt: false, pin: '' };
let srv = null;
let state = {};
let full = null;
let imgData = '';

/* macroN / msgN (numérotés à partir de 1 côté utilisateur) -> index à partir de 0 pour l'interface */
function normalize(c) {
  const o = /^out-(fill|window)(\d+)$/.exec(c);
  if (o) { const n = +o[2]; return (n >= 1 && n <= 8) ? 'out-' + o[1] + (n - 1) : null; }
  const t = /^set(\d+)$/.exec(c);
  if (t && +t[1] <= 359999) return c;
  const m = /^(macro|msg)(\d+)$/.exec(c);
  if (m) { const n = +m[2]; return (n >= 1 && n <= (m[1] === 'macro' ? 10 : 20)) ? m[1] + (n - 1) : null; }
  return FIXED.includes(c) ? c : null;
}
function send(c) {
  const n = normalize(c);
  if (!n || !main || main.isDestroyed()) return false;
  main.webContents.send('cmd', n);
  return true;
}
function lanIps() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal).map((i) => i.address);
}
function pinOk(req) {
  if (!net.pin) return true;
  const q = /[?&]pin=([^&]*)/.exec(req.url || '');
  return req.headers['x-pin'] === net.pin || (q && decodeURIComponent(q[1]) === net.pin);
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (d) => { n += d.length; if (n > max) { reject(new Error('trop gros')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function handler(req, res) {
  const ra = req.socket.remoteAddress || '';
  const local = /^(::1|127\.|::ffff:127\.)/.test(ra);
  const p = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+|\/+$/g, '');
  const head = (t, cors) => Object.assign({ 'Content-Type': t, 'Cache-Control': 'no-store' }, cors ? { 'Access-Control-Allow-Origin': '*' } : {});
  const deny = (code, msg) => { res.writeHead(code, head('text/plain; charset=utf-8')); res.end(msg); };
  const lanOk = local || net.lan || net.rmt;
  /* accès aux Paramètres à distance : 403 si désactivé, 401 si le code est absent ou faux */
  const rmtCode = local ? 200 : !net.rmt ? 403 : pinOk(req) ? 200 : 401;

  if (p === '' || p === 'view') {
    if (!lanOk) return deny(403, 'Accès réseau désactivé (Paramètres > Réseau).');
    res.writeHead(200, head('text/html; charset=utf-8'));
    return res.end(fs.readFileSync(path.join(__dirname, 'viewer.html')));
  }
  if (p === 'remote') {
    if (!(local || net.rmt)) return deny(403, 'Accès aux Paramètres à distance désactivé (Paramètres > Réseau).');
    res.writeHead(200, head('text/html; charset=utf-8'));
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  if (p === 'api/state' || p === 'api/text') {
    if (!lanOk) return deny(403, 'Accès réseau désactivé (Paramètres > Réseau).');
    if (p === 'api/state') { res.writeHead(200, head('application/json; charset=utf-8', true)); return res.end(JSON.stringify(state)); }
    res.writeHead(200, head('text/plain; charset=utf-8', true)); return res.end(String(state.text || ''));
  }
  if (p === 'api/full') {
    if (rmtCode !== 200) return deny(rmtCode, rmtCode === 401 ? 'Code requis' : 'Désactivé');
    if (!full) return deny(503, 'Pas encore prêt');
    res.writeHead(200, head('application/json; charset=utf-8'));
    return res.end(JSON.stringify(Object.assign({}, full, { serverNow: Date.now() })));
  }
  if (p === 'api/img') {
    if (rmtCode !== 200) return deny(rmtCode, rmtCode === 401 ? 'Code requis' : 'Désactivé');
    if (req.method === 'POST') {
      try { const body = await readBody(req, 40 * 1024 * 1024); if (main && !main.isDestroyed()) main.webContents.send('patch', { img: body }); res.writeHead(200, head('text/plain')); return res.end('OK'); }
      catch (e) { return deny(413, 'Image trop grande'); }
    }
    res.writeHead(200, head('text/plain; charset=utf-8')); return res.end(imgData);
  }
  if (p === 'api/patch') {
    if (rmtCode !== 200) return deny(rmtCode, rmtCode === 401 ? 'Code requis' : 'Désactivé');
    if (req.method !== 'POST') return deny(405, 'POST requis');
    try {
      const o = JSON.parse(await readBody(req, 2 * 1024 * 1024)), patch = {};
      if (o.S && typeof o.S === 'object') patch.S = o.S;
      if (Array.isArray(o.MAC)) patch.MAC = o.MAC.slice(0, 10);
      if (Array.isArray(o.MSG)) patch.MSG = o.MSG.slice(0, 20);
      if (main && !main.isDestroyed()) main.webContents.send('patch', patch);
      res.writeHead(200, head('text/plain')); return res.end('OK');
    } catch (e) { return deny(400, 'Requête invalide'); }
  }
  /* commandes : machine locale, ou réseau si autorisé (commandes) ou si l'accès distant est autorisé et le code correct */
  if (!local && !net.ctl && rmtCode !== 200) return deny(rmtCode === 401 ? 401 : 403, 'Commandes refusées depuis le réseau (option désactivée dans Paramètres).');
  const ok = send(p);
  res.writeHead(ok ? 200 : 404, head('text/plain; charset=utf-8'));
  res.end(ok ? 'OK ' + p : 'Commande inconnue');
}
function startServer() {
  return new Promise((resolve) => {
    const old = srv;
    const go = () => {
      const s = http.createServer(handler);
      srv = s; remote.port = null;
      let p = PORT;
      const host = (net.lan || net.rmt) ? '0.0.0.0' : '127.0.0.1';
      s.on('error', (e) => { if (e.code === 'EADDRINUSE' && p < PORT + 10) { p++; s.listen(p, host); } else resolve(); });
      s.on('listening', () => { remote.port = s.address().port; resolve(); });
      s.listen(p, host);
    };
    if (old) { old.close(go); if (old.closeAllConnections) old.closeAllConnections(); } else go();
  });
}
/* Raccourcis clavier actifs même quand une autre fenêtre est au premier plan (option, Ctrl+Maj+...) */
let gk = { on: false, ok: [], fail: [] };
const GMAP = { 'CommandOrControl+Shift+Space': 'toggle', 'CommandOrControl+Shift+Backspace': 'reset', 'CommandOrControl+Shift+Return': 'msg-toggle',
  'CommandOrControl+Shift+End': 'close', 'CommandOrControl+Shift+Home': 'fullscreen', 'CommandOrControl+Shift+PageUp': 'plus1m', 'CommandOrControl+Shift+PageDown': 'minus1m' };
for (let i = 1; i <= 10; i++) GMAP['CommandOrControl+Shift+F' + i] = 'macro' + i;
function setGlobalKeys(on) {
  on = !!on;
  if (on === gk.on && (on || !gk.ok.length)) return;
  gk.ok.forEach((k) => { try { globalShortcut.unregister(k); } catch (e) {} });
  gk = { on, ok: [], fail: [] };
  if (!on) return;
  for (const k in GMAP) { let r = false; try { r = globalShortcut.register(k, () => send(GMAP[k])); } catch (e) {} (r ? gk.ok : gk.fail).push(k); }
}
function info() { return { port: remote.port, ips: lanIps(), lan: net.lan, ctl: net.ctl, rmt: net.rmt, keys: remote.keys, gk: gk.on, gkFail: gk.fail }; }
function startKeys() {
  const map = { F23: 'start', F24: 'toggle', 'CommandOrControl+F13': 'reset', 'CommandOrControl+F14': 'close', 'CommandOrControl+F15': 'msg-toggle', 'CommandOrControl+F16': 'pause' };
  for (let i = 1; i <= 10; i++) map['F' + (12 + i)] = 'macro' + i;
  for (const k in map) { try { if (globalShortcut.register(k, () => send(map[k]))) remote.keys.push(k + ' = ' + map[k]); } catch (e) {} }
}

ipcMain.handle('remoteinfo', () => info());
ipcMain.handle('setnet', async (_e, n) => {
  const next = { lan: !!(n && n.lan), ctl: !!(n && n.ctl), rmt: !!(n && n.rmt), pin: String((n && n.pin) || '') };
  const rebind = (next.lan || next.rmt) !== (net.lan || net.rmt) || !srv;
  net = next;
  setGlobalKeys(n && n.gk);
  if (rebind) await startServer();
  return info();
});
ipcMain.on('state', (_e, s) => { state = s; });
ipcMain.on('full', (_e, f) => { full = f; });
ipcMain.on('img', (_e, d) => { imgData = d || ''; });

ipcMain.handle('displays', () =>
  screen.getAllDisplays().map((d, i) => ({
    i,
    label: 'Écran ' + (i + 1) + ' (' + Math.round(d.size.width * d.scaleFactor) + '×' + Math.round(d.size.height * d.scaleFactor) + ')'
  })));
ipcMain.handle('place', (_e, o) => place(o));
ipcMain.handle('toggle', () => place({ display: last.display, fill: !last.fill, onTop: last.onTop }));
ipcMain.handle('ontop', (_e, v) => { last.onTop = !!v; if (out && !out.isDestroyed()) out.setAlwaysOnTop(last.onTop, 'screen-saver'); });

function displaysChanged() { if (main && !main.isDestroyed()) main.webContents.send('displays-changed'); }
app.whenReady().then(() => {
  createMain(); startServer(); startKeys();
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
