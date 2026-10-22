// Reproduces: first-upload error messages, and whether "Use this view as the starting view" survives save/reopen/view.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const BASE = process.env.MOODLE || 'http://localhost:8800';
const [splatFile, moveMode = 'orbit'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });   // fresh profile, empty localStorage
const page = await ctx.newPage();
const log = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`[console.${m.type()}] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url().replace(BASE, '').slice(0, 120)}`); });
for (let i = 0; i < 4 && !page.url().includes('/my/'); i++) {
  await page.goto(`${BASE}/login/index.php`); await page.waitForLoadState('networkidle');
  await page.fill('#username', 'admin'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#loginbtn')]); await page.waitForLoadState('networkidle');
}
const visibleErrors = async (frame) => frame.evaluate(() => [...document.querySelectorAll('.h5p-errors, .h5peditor-gs-messages p')]
  .map((e) => e.textContent.trim()).filter(Boolean));

await page.goto(`${BASE}/contentbank/edit.php?contextid=12&plugin=h5p&library=${encodeURIComponent('H5P.GaussianSplat 1.0')}`);
let frame = await (await page.waitForSelector('iframe.h5p-editor-iframe')).contentFrame();
await frame.waitForSelector('.h5peditor-gaussian-splat .file a', { timeout: 120000 });
await frame.evaluate(() => { const W = H5PEditor.widgets.gaussianSplat.prototype; const o = W.showPreview; W.showPreview = function (...a) { window.__w = this; return o.apply(this, a); }; });
await frame.fill('.field-name-extraTitle input, input[id^="field-extratitle"]', 'Start view test');
const chooser = page.waitForEvent('filechooser');
await frame.click('.h5peditor-gaussian-splat .file a');
await (await chooser).setFiles(splatFile);
// Watch messages during the upload
const seen = new Set();
const t0 = Date.now();
while (Date.now() - t0 < 180000) {
  (await visibleErrors(frame)).forEach((m) => seen.add(m));
  if (await frame.evaluate(() => !!document.querySelector('.h5peditor-gs-info')?.textContent)) break;
  await page.waitForTimeout(150);
}
console.log('messages seen during first upload:', [...seen]);
await page.waitForTimeout(2500);

// Move the camera
const canvas = await frame.$('.h5peditor-gs-stage canvas');
await canvas.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const box = await canvas.boundingBox();
const viewNow = () => frame.evaluate(() => JSON.stringify(H5PEditor.findField('splat/file', window.__root)?.viewer?.getView?.() ?? null)).catch(() => null);
if (moveMode === 'fly') {
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w');
  await page.mouse.move(box.x + 300, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 420, box.y + 220, { steps: 8 }); await page.mouse.up();
}
else {
  await page.mouse.move(box.x + 300, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 460, box.y + 240, { steps: 10 }); await page.mouse.up();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -500);
}
await page.waitForTimeout(2500);
const viewBefore = await frame.evaluate(() => JSON.stringify(window.__w.viewer.getView()));
console.log('editor view before saving:', viewBefore);
await frame.click('.h5peditor-gs-set-view', { force: true });
const state = await frame.textContent('.h5peditor-gs-view-state');
console.log('after "Use this view":', state);
await page.screenshot({ path: `test/out/repro-${moveMode}-1-editor.png` });

await Promise.all([page.waitForNavigation({ timeout: 120000 }), page.click('button:has-text("Save"), #id_submitbutton')]);
const id = new URL(page.url()).searchParams.get('id');
console.log('saved content id', id);
const stored = execSync(`psql -h /tmp -p 5433 -U postgres moodle -tAc "select jsoncontent from mdl_h5p order by id desc limit 1"`).toString();
console.log('stored cameraView:', JSON.stringify(JSON.parse(stored).params?.splat?.cameraView ?? JSON.parse(stored).splat?.cameraView));

// Player view
const outer = await (await page.waitForSelector('iframe.h5p-player, .h5p-iframe, iframe[id^="h5p-iframe"]')).contentFrame();
const player = outer.childFrames()[0] ?? outer;
await player.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 180000 });
await page.waitForTimeout(2000);
console.log('player view:', JSON.stringify(await player.evaluate(() => H5P.instances[0].viewer.getView())), 'mode', await player.evaluate(() => H5P.instances[0].viewer.mode));
await page.screenshot({ path: `test/out/repro-${moveMode}-2-player.png` });

// Reopen the editor
await page.goto(`${BASE}/contentbank/edit.php?contextid=12&plugin=h5p&id=${id}`);
frame = await (await page.waitForSelector('iframe.h5p-editor-iframe')).contentFrame();
await frame.waitForFunction(() => document.querySelector('.h5peditor-gs-info')?.textContent, null, { timeout: 180000 });
await page.waitForTimeout(2000);
console.log('reopened editor state:', await frame.textContent('.h5peditor-gs-view-state'));
await page.screenshot({ path: `test/out/repro-${moveMode}-3-reopen.png` });
console.log(log.filter((l) => !/favicon|allowfullscreen/.test(l)).join('\n'));
await b.close();
