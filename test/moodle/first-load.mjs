// Opens the H5P activity editor in a local Moodle twice and records slow/failed requests.
import { chromium } from 'playwright';
const BASE = process.env.MOODLE || 'http://localhost:8800';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
const page = await ctx.newPage();
const log = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
const reqs = new Map();
page.on('request', (r) => reqs.set(r, Date.now()));
page.on('requestfinished', async (r) => {
  const ms = Date.now() - reqs.get(r);
  const resp = await r.response();
  const size = Number((await r.sizes().catch(() => ({}))).responseBodySize ?? 0);
  if (ms > 700 || (resp && resp.status() >= 400)) log.push(`[slow] ${ms}ms ${resp?.status()} ${(size / 1024).toFixed(0)}KB ${r.url().replace(BASE, '').slice(0, 140)}`);
});
page.on('requestfailed', (r) => log.push(`[failed] ${r.failure()?.errorText} ${r.url().replace(BASE, '').slice(0, 140)}`));

for (let i = 0; i < 4 && !(page.url().includes('/my/')); i++) {
  await page.goto(`${BASE}/login/index.php`);
  await page.waitForLoadState('networkidle');
  if (!(await page.$('#username'))) break;
  await page.fill('#username', 'admin'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#loginbtn')]);
  await page.waitForLoadState('networkidle');
}
log.push(`[login] now at ${page.url()}`);

const libs = (process.env.LIBS || 'H5P.GaussianSplat 1.0').split(',');
for (const lib of libs) {
  for (const attempt of [1, 2]) {
    log.push(`--- ${lib}, attempt ${attempt}`);
    const t0 = Date.now();
    await page.goto(`${BASE}/contentbank/edit.php?contextid=${process.env.CTX || 12}&plugin=h5p&library=${encodeURIComponent(lib)}`);
    const iframeEl = await page.waitForSelector('iframe.h5p-editor-iframe', { timeout: 120000 }).catch(() => null);
    if (!iframeEl) {
      log.push(`[stuck] no editor iframe after ${Date.now() - t0}ms`);
      await page.screenshot({ path: `test/out/moodle-stuck-${attempt}.png`, fullPage: true });
      continue;
    }
    const frame = await iframeEl.contentFrame();
    const ok = await frame.waitForSelector('.h5peditor-form .field', { timeout: 180000 }).then(() => true).catch(() => false);
    log.push(ok ? `[time] editor form ready after ${Date.now() - t0}ms` : `[stuck] editor form not shown after ${Date.now() - t0}ms`);
    await page.screenshot({ path: `test/out/moodle-${lib.split(' ')[0]}-${attempt}.png` });
  }
}
console.log(log.join('\n'));
await b.close();
