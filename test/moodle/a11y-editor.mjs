// Moodle editor: start view survives an orientation change; a hotspot can be
// placed with the keyboard only (Add hotspot -> aim -> Enter); values are saved.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const BASE = process.env.MOODLE || 'http://localhost:8800';
const [splatFile] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
const page = await ctx.newPage();
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`); ok = ok && cond; };
for (let i = 0; i < 4 && !page.url().includes('/my/'); i++) {
  await page.goto(`${BASE}/login/index.php`); await page.waitForLoadState('networkidle');
  await page.fill('#username', 'admin'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#loginbtn')]); await page.waitForLoadState('networkidle');
}
await page.goto(`${BASE}/contentbank/edit.php?contextid=12&plugin=h5p&library=${encodeURIComponent('H5P.GaussianSplat 1.0')}`);
const frame = await (await page.waitForSelector('iframe.h5p-editor-iframe')).contentFrame();
await frame.waitForSelector('.h5peditor-gaussian-splat .file a', { timeout: 120000 });
await frame.evaluate(() => { const W = H5PEditor.widgets.gaussianSplat.prototype; const o = W.showPreview; W.showPreview = function (...a) { window.__w = this; return o.apply(this, a); }; });
await frame.fill('.field-name-extraTitle input, input[id^="field-extratitle"]', 'A11y editor test');
const errorsSeen = new Set();
const chooser = page.waitForEvent('filechooser');
await frame.click('.h5peditor-gaussian-splat .file a');
await (await chooser).setFiles(splatFile);
const t0 = Date.now();
while (Date.now() - t0 < 180000) {
  (await frame.evaluate(() => [...document.querySelectorAll('.h5p-errors .h5p-error, .h5peditor-gs-messages .error, .h5peditor-gs-messages p')].map((e) => e.textContent.trim()).filter(Boolean))).forEach((m) => errorsSeen.add(m));
  if (await frame.evaluate(() => !!document.querySelector('.h5peditor-gs-info')?.textContent)) break;
  await page.waitForTimeout(150);
}
console.log('messages during first upload:', [...errorsSeen]);
await page.waitForTimeout(1500);
const canvas = await frame.$('.h5peditor-gs-stage canvas');
await canvas.scrollIntoViewIfNeeded();
// Keyboard only: focus the preview and turn with arrows
await canvas.focus();
for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', '-']) { await page.keyboard.press(k); await page.waitForTimeout(150); }
await page.waitForTimeout(1500);
await frame.focus('.h5peditor-gs-set-view'); await page.keyboard.press('Enter');
const saved = await frame.evaluate(() => window.__w.parent.params.cameraView);
check('start view saved with keyboard', !!saved, saved);
const poseOf = () => frame.evaluate(() => { const v = window.__w.viewer; const g = v.getView(); const r = g.yaw * Math.PI / 180; const pi = g.pitch * Math.PI / 180; const d = [Math.sin(r) * Math.cos(pi), -Math.sin(pi), Math.cos(r) * Math.cos(pi)]; const pos = g.target.map((x, i) => x + d[i] * g.distance); return { pos: v.worldToLocal(pos), tgt: v.worldToLocal(g.target) }; });
const savedPose = await poseOf();
// Change Up direction: the view should turn with the scene, not be reset
const sel = await frame.$('select[id*="upaxis"], .field-name-upAxis select');
await sel.selectOption('+y');
await page.waitForTimeout(1500);
const after = await frame.evaluate(() => window.__w.parent.params.cameraView);
const stateText = await frame.textContent('.h5peditor-gs-view-state');
const pose2 = await poseOf();
console.log('viewer view after change:', JSON.stringify(await frame.evaluate(() => window.__w.viewer.getView())));
console.log('poses', JSON.stringify(savedPose), JSON.stringify(pose2));
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
check('view kept after Up direction change', !!after && after !== saved, `${after} | ${stateText}`);
check('same camera spot in the scene', dist(savedPose.pos, pose2.pos) < 0.05 && dist(savedPose.tgt, pose2.tgt) < 0.05, `Δpos ${dist(savedPose.pos, pose2.pos).toFixed(4)}`);
await sel.selectOption('-y');
await page.waitForTimeout(1500);
// Keyboard hotspot placement
const addBtn = await frame.$('.h5peditor-gs-add-hotspot');
await addBtn.focus(); await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const focusedCanvas = await frame.evaluate(() => document.activeElement?.tagName);
check('pick mode focuses the preview', focusedCanvas === 'CANVAS', focusedCanvas);
check('crosshair shown', !!(await frame.$('.h5peditor-gs-crosshair')));
await page.screenshot({ path: 'test/out/a11y-pick.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const banner = await frame.$('.h5peditor-gs-pick-banner');
const bannerText = banner ? await banner.textContent() : '';
console.log('banner after Enter:', bannerText);
const pos = await frame.evaluate(() => [...document.querySelectorAll('.h5peditor-gs-hotspot-status')].map((e) => e.textContent));
check('hotspot placed by keyboard', !banner && pos.length >= 1, JSON.stringify(pos));
await frame.fill('.field-name-title input', 'Keyboard hotspot').catch(() => {});
await page.screenshot({ path: 'test/out/a11y-placed.png' });
await Promise.all([page.waitForNavigation({ timeout: 120000 }), page.click('button:has-text("Save"), #id_submitbutton')]);
const stored = JSON.parse(execSync(`psql -h /tmp -p 5433 -U postgres moodle -tAc "select jsoncontent from mdl_h5p order by id desc limit 1"`).toString()).params;
check('stored cameraView', !!stored.splat?.cameraView, stored.splat?.cameraView);
check('stored hotspot position', !!stored.hotspots?.hotspots?.[0]?.position, stored.hotspots?.hotspots?.[0]?.position);
await b.close();
process.exit(ok ? 0 : 1);
