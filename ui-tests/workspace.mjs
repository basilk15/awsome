import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

let server;
let browser;
let baseUrl;

before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 5180, strictPort: false }, logLevel: 'error' });
  await server.listen();
  baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.AWSOME_TEST_CHROMIUM ? { executablePath: process.env.AWSOME_TEST_CHROMIUM } : {})
  });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function openApp({ delayProfiles = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.addInitScript(({ delayProfiles }) => {
    window.awsomeDesktop = {
      invoke: async (command) => {
        switch (command) {
          case 'migration_status': return { warnings: [] };
          case 'read_legacy_planning': return { warnings: [], entries: [] };
          case 'list_profiles':
            if (delayProfiles) return new Promise((resolve) => { window.resolveProfiles = () => resolve(['default']); });
            return ['default'];
          case 'list_regions': window.regionLookupComplete = true; return ['us-east-1'];
          case 'list_snapshots': return [];
          case 'fetch_topology': return {
            nodes: [{ data: { id: 'vpc:vpc-0123', label: 'vpc-0123', type: 'vpc', region: 'us-east-1', details: {} } }],
            edges: [], warnings: []
          };
          case 'save_snapshot': return { id: 'test' };
          default: return null;
        }
      }
    };
  }, { delayProfiles });
  await page.goto(baseUrl);
  return page;
}

test('opening the workspace survives an asynchronous profile update', async () => {
  const page = await openApp({ delayProfiles: true });
  try {
    await page.waitForFunction(() => typeof window.resolveProfiles === 'function');
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.evaluate(() => window.resolveProfiles());
    await page.getByLabel('AWS profile').waitFor({ state: 'visible', timeout: 6000 });
  } finally {
    await page.close();
  }
});

test('typing a resource ID with zero works while a live graph is open', async () => {
  const page = await openApp();
  try {
    await page.waitForFunction(() => window.regionLookupComplete === true);
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('button', { name: 'Load topology', exact: true }).first().click();
    await page.locator('canvas').first().waitFor({ state: 'visible' });
    const search = page.getByLabel('Search live topology resources');
    await search.focus();
    await page.keyboard.type('vpc-0123');
    assert.equal(await search.inputValue(), 'vpc-0123');
  } finally {
    await page.close();
  }
});

test('planning edits are restored after reloading the workspace', async () => {
  const page = await openApp();
  try {
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('button', { name: 'Planning mode' }).click();
    await page.getByRole('button', { name: 'Amazon EC2 Compute' }).click();
    const name = page.getByLabel('Planning node display name');
    await name.fill('Web server');
    await page.getByText('Saved locally on this device.', { exact: true }).waitFor();

    await page.reload();
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('button', { name: 'Planning mode' }).click();
    await page.getByRole('button', { name: 'Web server architecture node' }).waitFor();
    await page.getByText('1 service placed', { exact: true }).waitFor();
  } finally {
    await page.close();
  }
});

test('a labeled planning connection survives a reload', async () => {
  const page = await openApp();
  try {
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('button', { name: 'Planning mode' }).click();
    await page.getByRole('button', { name: 'Amazon EC2 Compute' }).click();
    await page.getByRole('button', { name: 'Amazon S3 Storage' }).click();
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByRole('button', { name: 'Amazon EC2 architecture node' }).press('Enter');
    await page.getByRole('button', { name: 'Amazon S3 architecture node' }).press('Enter');
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Amazon EC2 architecture node' }).press('Enter');
    const label = page.getByLabel('Connection label with Amazon S3');
    await label.fill('HTTPS');
    await label.blur();
    await page.waitForFunction(() => localStorage.getItem('graphivo.planning.last-document')?.includes('"label":"HTTPS"'));

    await page.reload();
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('button', { name: 'Planning mode' }).click();
    await page.getByRole('button', { name: 'Amazon EC2 architecture node' }).press('Enter');
    assert.equal(await page.getByLabel('Connection label with Amazon S3').inputValue(), 'HTTPS');
  } finally {
    await page.close();
  }
});
