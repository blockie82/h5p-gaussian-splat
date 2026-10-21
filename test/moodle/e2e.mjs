// End-to-end in a real Moodle: content bank > Gaussian Splat > upload > preview > save > view.
// Usage: node test/moodle/e2e.mjs <splat file>   (env MOODLE, CTX)
import { chromium } from 'playwright';
const BASE = process.env.MOODLE || 'http://localhost:8800';
const [file] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1300, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const big = [];
page.on('requestfinished', async (r) => {
  const s = await r.sizes().catch(() => ({}));
  if ((s.responseBodySize || 0) > 200 * 1024 && /pluginfile|core_h5p/.test(r.url())) big.push(`${(s.responseBodySize / 1024 / 1024).toFixed(1)}MB ${r.url().replace(BASE, '').split('?')[0]}`);
});
for (let i = 0; i < 4 && !page.url().includes('/my/'); i++) {
  await page.goto(`${BASE}/login/index.php`); await page.waitForLoadState('networkidle');
  await page.fill('#username', 'admin'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#loginbtn')]); await page.waitForLoadState('networkidle');
}
let t0 = Date.now();
await page.goto(`${BASE}/contentbank/edit.php?contextid=${process.env.CTX || 12}&plugin=h5p&library=${encodeURIComponent('H5P.GaussianSplat 1.0')}`);
const frame = await (await page.waitForSelector('iframe.h5p-editor-iframe')).contentFrame();
await frame.waitForSelector('.h5peditor-gaussian-splat .file a', { timeout: 120000 });
console.log(`editor form ready after ${Date.now() - t0}ms; large downloads so far: ${big.length ? big.join(', ') : 'none'}`);
big.length = 0;

const chooser = page.waitForEvent('filechooser');
await frame.click('.h5peditor-gaussian-splat .file a');
await (await chooser).setFiles(file);
t0 = Date.now();
await frame.waitForFunction(() => document.querySelector('.h5peditor-gs-info')?.textContent || document.querySelector('.h5peditor-gs-error'), null, { timeout: 300000 });
console.log(`preview after ${Date.now() - t0}ms:`, await frame.textContent('.h5peditor-gs-info'));
console.log('messages:', await frame.$$eval('.h5peditor-gs-messages p', (ps) => ps.map((p) => p.textContent.slice(0, 120))));
console.log('stage size:', await frame.$eval('.h5peditor-gs-stage', (s) => `${s.clientWidth}x${s.clientHeight}`));
console.log('downloaded for preview:', big.join(', '));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'test/out/moodle-e2e-editor.png' });

// Title, save start view, then save
await frame.fill('.field-name-extraTitle input, input[id^="field-extratitle"]', 'Strawberry');
await frame.click('.h5peditor-gs-set-view');
console.log('saved view field:', await frame.textContent('.h5peditor-gs-view-state'));
await Promise.all([page.waitForNavigation({ timeout: 120000 }), page.click('#id_submitbutton, input[name="submitbutton"], button:has-text("Save")')]);
console.log('after save:', page.url().replace(BASE, ''));
const player = await (await page.waitForSelector('iframe.h5p-player, iframe[id^="h5p-iframe"], .h5p-iframe', { timeout: 60000 })).contentFrame();
const inner = player.childFrames()[0] ?? player;
const ok = await inner.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden), .h5p-gs-message:not(.h5p-gs-hidden)', { timeout: 180000 }).then(() => true).catch(() => false);
console.log('player:', ok ? await inner.evaluate(() => document.querySelector('.h5p-gs-message:not(.h5p-gs-hidden)')?.textContent || 'scene loaded, toolbar shown') : 'nothing shown');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'test/out/moodle-e2e-view.png' });
await b.close();
