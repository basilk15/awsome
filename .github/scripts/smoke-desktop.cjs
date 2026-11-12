const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awsome-smoke-'));
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(tempDir, 'config'), XDG_DATA_HOME: path.join(tempDir, 'data') };
  for (const name of Object.keys(env)) if (name.startsWith('AWS_')) delete env[name];
  env.AWS_EC2_METADATA_DISABLED = 'true';
  env.AWS_CONFIG_FILE = path.join(tempDir, 'missing-config');
  env.AWS_SHARED_CREDENTIALS_FILE = path.join(tempDir, 'missing-credentials');
  const port = await availablePort();
  const args = [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'];
  if (process.env.AWSOME_TEST_NO_SANDBOX === '1') args.push('--no-sandbox');
  const child = spawn(process.argv[2] || 'awsome', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  const exited = new Promise((resolve) => child.once('close', resolve));
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { logs = (logs + chunk).slice(-20000); });
  let browser;
  try {
    const endpoint = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30000;
    let websocketUrl;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Desktop app exited with code ${child.exitCode}`);
      try {
        const response = await fetch(`${endpoint}/json/version`);
        if (response.ok) websocketUrl = (await response.json()).webSocketDebuggerUrl;
        if (websocketUrl) break;
      } catch { /* Wait for Electron. */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!websocketUrl) throw new Error('Desktop app did not expose its debugging endpoint');
    browser = await chromium.connectOverCDP(websocketUrl, { timeout: 10000 });
    const context = browser.contexts()[0];
    let page = context.pages()[0];
    if (!page) page = await context.waitForEvent('page', { timeout: 10000 });
    const expectedStatus = process.env.AWSOME_TEST_EXPECT_OFFLINE === '1'
      ? 'Electron companion unavailable'
      : 'Native backend ready';
    await page.getByLabel('AWS profile').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText(expectedStatus, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    if (process.env.AWSOME_TEST_EXPECT_OFFLINE === '1') {
      await page.getByRole('button', { name: 'Planning mode' }).click();
      await page.getByRole('heading', { name: 'Design your AWS architecture' }).waitFor({ state: 'visible' });
    }
    console.log(`The desktop workspace started: ${expectedStatus}.`);
  } catch (error) {
    if (logs) console.error(logs);
    throw error;
  } finally {
    if (child.exitCode === null && !child.killed) child.kill();
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await browser?.close().catch(() => {});
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
