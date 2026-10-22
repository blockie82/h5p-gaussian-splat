// Edit existing content: change the start view, save, then check DB and player (Moodle caches filtered params).
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const BASE = process.env.MOODLE || 'http://localhost:8800';
const [id] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (let i = 0; i < 4 && !page.url().includes('/my/'); i++) {
  await page.goto(`${BASE}/login/index.php`); await page.waitForLoadState('networkidle');
  await page.fill('#username', 'admin'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#loginbtn')]); await page.waitForLoadState('networkidle');
}
const db = () => execSync(`psql -h /tmp -p 5433 -U postgres moodle -tAc "select h.jsoncontent, coalesce(h.filtered,'') from mdl_h5p h join mdl_files f on f.pathnamehash = h.pathnamehash where f.itemid = ${id} and f.component='contentbank' order by h.id desc limit 1"`).toString();
const show = (label) => {
  const [json, filtered] = db().split('|');
  const cv = (s) => { try { const d = JSON.parse(s); return (d.params ?? d).splat?.cameraView; } catch (e) { return '(none)'; } };
  console.log(`${label}: jsoncontent=${JSON.stringify(cv(json))} filtered=${JSON.stringify(filtered.trim() ? cv(filtered) : '(empty)')}`);
};
show('before edit');
await page.goto(`${BASE}/contentbank/edit.php?contextid=12&plugin=h5p&id=${id}`);
const frame = await (await page.waitForSelector('iframe.h5p-editor-iframe')).contentFrame();
await frame.evaluate(() => { const W = H5PEditor.widgets.gaussianSplat.prototype; const o = W.showPreview; W.showPreview = function (...a) { window.__w = this; return o.apply(this, a); }; }).catch(() => {});
await frame.waitForFunction(() => document.querySelector('.h5peditor-gs-info')?.textContent, null, { timeout: 180000 });
await page.waitForTimeout(2000);
const canvas = await frame.$('.h5peditor-gs-stage canvas');
await canvas.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const box = await canvas.boundingBox();
await page.mouse.move(box.x + 300, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 150, box.y + 260, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(1500);
await frame.click('.h5peditor-gs-set-view');
console.log('editor:', await frame.textContent('.h5peditor-gs-view-state'));
await Promise.all([page.waitForNavigation({ timeout: 120000 }), page.click('button:has-text("Save"), #id_submitbutton')]);
show('after save');
const el = await page.waitForSelector('iframe.h5p-player', { state: 'attached', timeout: 60000 });
await page.waitForTimeout(1000);
const outer = await el.contentFrame();
let player = null;
for (let i = 0; i < 120 && !player; i++) { player = outer.childFrames()[0] ?? null; if (!player) await page.waitForTimeout(500); }
player = player ?? outer;
await player.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 180000 });
await page.waitForTimeout(1500);
console.log('player view:', JSON.stringify(await player.evaluate(() => H5P.instances[0].viewer.getView())));
show('after view');
await b.close();
