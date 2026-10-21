// Editor preview must stay a fixed size even when the editor stylesheet is not loaded.
import { chromium } from 'playwright';
const [file, query = 'nocss'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
p.on('pageerror', (e) => console.log('[err]', e.message));
await p.goto(`http://localhost:8766/harness/editor.html?${query}`);
await p.waitForFunction(() => window.harnessReady === true);
const c = p.waitForEvent('filechooser'); await p.click('.h5peditor-gaussian-splat .file a'); await (await c).setFiles(file);
await p.waitForFunction(() => document.querySelector('.h5peditor-gs-info')?.textContent.length > 0 || document.querySelector('.h5peditor-gs-error'), null, { timeout: 300000 });
const sizes = [];
for (let i = 0; i < 4; i++) {
  sizes.push(await p.evaluate(() => { const s = document.querySelector('.h5peditor-gs-stage'); return `${s.clientWidth}x${s.clientHeight} page=${document.body.scrollHeight}`; }));
  await p.waitForTimeout(1000);
}
console.log('stage sizes over time:', sizes.join(' | '));
console.log('messages:', await p.$$eval('.h5peditor-gs-messages p', (ps) => ps.map((x) => x.className + ' bg=' + getComputedStyle(x).backgroundColor)));
await p.screenshot({ path: 'test/out/nocss.png', clip: { x: 0, y: 0, width: 1100, height: 900 } });
await b.close();
