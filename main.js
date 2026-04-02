const fs = require('fs');
const http = require('http');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const next = require('next');
const { fetchAwsResources } = require('./backend/awsFetcher');
const { buildGraph } = require('./backend/graphBuilder');

let nextServer = null;

async function resolveAppUrl() {
  if (process.env.NEXT_DEV_SERVER_URL) {
    console.log(`[main] Using Next.js dev server: ${process.env.NEXT_DEV_SERVER_URL}`);
    return process.env.NEXT_DEV_SERVER_URL;
  }

  if (nextServer) {
    const { port } = nextServer.address();
    return `http://127.0.0.1:${port}`;
  }

  const buildIdPath = `${__dirname}/.next/BUILD_ID`;
  if (!fs.existsSync(buildIdPath)) {
    throw new Error('Next.js production build not found. Run "npm run build:web" before launching Electron.');
  }

  console.log('[main] Starting local Next.js production server');

  const nextApp = next({
    dev: false,
    dir: __dirname
  });

  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  nextServer = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
      const message = error && error.message ? error.message : String(error);
      console.error('[main] Next.js request handling failed:', message);
      response.statusCode = 500;
      response.end('Internal server error');
    });
  });

  await new Promise((resolve, reject) => {
    nextServer.once('error', reject);
    nextServer.listen(0, '127.0.0.1', () => {
      nextServer.off('error', reject);
      resolve();
    });
  });

  const { port } = nextServer.address();
  const appUrl = `http://127.0.0.1:${port}`;
  console.log(`[main] Next.js production server ready: ${appUrl}`);
  return appUrl;
}

async function createWindow() {
  console.log('[main] Creating BrowserWindow');

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const appUrl = await resolveAppUrl();
  console.log(`[main] Loading Next.js renderer: ${appUrl}`);
  await mainWindow.loadURL(appUrl);
}

ipcMain.handle('fetch-topology', async (_event, options) => {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const profile = typeof safeOptions.profile === 'string' ? safeOptions.profile.trim() : '';
  const region = typeof safeOptions.region === 'string' ? safeOptions.region.trim() : '';

  console.log(
    `[main] IPC fetch-topology received (profile=${profile || 'default'}, region=${region || 'me-south-1'})`
  );

  try {
    const rawData = await fetchAwsResources(profile, region);
    const graph = buildGraph(rawData);
    console.log(
      `[main] Topology graph built (nodes=${graph.nodes.length}, edges=${graph.edges.length})`
    );
    return graph;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error('[main] Failed to fetch topology:', message);
    throw new Error(`Failed to fetch topology: ${message}`);
  }
});

app.whenReady().then(async () => {
  console.log('[main] App ready');
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        const message = error && error.message ? error.message : String(error);
        console.error('[main] Failed to recreate window:', message);
      });
    }
  });
}).catch((error) => {
  const message = error && error.message ? error.message : String(error);
  console.error('[main] Failed during app startup:', message);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('[main] All windows closed, quitting app');
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nextServer) {
    console.log('[main] Closing local Next.js production server');
    nextServer.close();
    nextServer = null;
  }
});
