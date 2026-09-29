const { app, BrowserWindow, ipcMain, net, protocol, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const commands = new Set([
  'list_profiles', 'list_regions', 'fetch_topology', 'get_scan_progress', 'cancel_scan',
  'save_snapshot', 'list_snapshots', 'load_snapshot', 'delete_snapshot',
  'preview_prune_snapshots', 'prune_snapshots', 'migration_status', 'read_legacy_planning'
]);

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const userData = path.join(app.getPath('appData'), 'com.basil.awsome.electron');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
const dataHome = process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share');
const dataDir = path.join(dataHome, 'com.basil.awsome.electron');
const legacyData = path.join(dataHome, 'com.basil.awsome');

let window;
let companion;
let buffer = '';
let nextId = 1;
const pending = new Map();

function companionPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'awsome-native')
    : path.join(__dirname, '..', 'src-tauri', 'target', 'debug', 'awsome-native');
}

function failPending(error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

function startCompanion() {
  if (companion && !companion.killed && companion.exitCode === null) return companion;
  const binary = companionPath();
  companion = spawn(binary, [dataDir, legacyData], { stdio: ['pipe', 'pipe', 'pipe'] });
  const child = companion;
  buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (companion !== child) return;
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let response;
      try { response = JSON.parse(line); } catch { continue; }
      const call = pending.get(response.id);
      if (!call) continue;
      pending.delete(response.id);
      if (response.ok) call.resolve(response.result);
      else call.reject(new Error(response.error || 'Native command failed'));
    }
  });
  child.stderr.on('data', (chunk) => console.error(String(chunk).trim()));
  child.on('error', (error) => {
    if (companion !== child) return;
    failPending(new Error(`Native companion unavailable: ${error.message}`));
    companion = null;
  });
  child.on('exit', (code) => {
    if (companion !== child) return;
    failPending(new Error(`Native companion exited (${code ?? 'unknown'})`));
    companion = null;
  });
  return child;
}

function invokeNative(command, args) {
  return new Promise((resolve, reject) => {
    const child = startCompanion();
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ id, command, args })}\n`, (error) => {
      if (error && pending.has(id)) {
        pending.delete(id);
        reject(error);
      }
    });
  });
}

function trustedSender(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
  const url = event.senderFrame.url;
  return app.isPackaged ? url.startsWith('app://awsome/') : url.startsWith('http://localhost:5173/');
}

function registerContentProtocol() {
  const dist = path.resolve(__dirname, '..', 'dist');
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'awsome') return new Response('Unknown host', { status: 404 });
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Invalid path', { status: 400 }); }
    const file = path.resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(dist, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Invalid path', { status: 400 });
    const response = await net.fetch(pathToFileURL(file).toString());
    if (relative === 'index.html') {
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'");
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  });
}

function createWindow() {
  window = new BrowserWindow({
    title: 'awsome', width: 1440, height: 960, minWidth: 1100, minHeight: 720,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icons', 'icon.png') : path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  if (app.isPackaged) window.loadURL('app://awsome/');
  else window.loadURL('http://localhost:5173/');
}

app.whenReady().then(() => {
  registerContentProtocol();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ipcMain.handle('awsome:invoke', (event, command, args) => {
    if (!trustedSender(event) || !commands.has(command) || !args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error('Desktop command denied');
    }
    return invokeNative(command, args);
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (companion && !companion.killed) companion.kill(); });
