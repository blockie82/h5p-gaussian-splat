// Drives the real H5P editor widgets with the gaussianSplat widget.
// Usage: node test/editor-test.mjs <splatFile> <outPrefix>
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
const TMP = os.tmpdir();

const [splatFile, prefix = 'test/out/editor'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:8766/harness/editor.html');
await page.waitForFunction(() => window.harnessReady === true);

const upload = async (file) => {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.click('.h5peditor-gaussian-splat .file a');
  const chooser = await chooserPromise;
  const accept = await page.evaluate(() => document.querySelector('input[type=file]')?.accept);
  console.log('file input accept =', accept);
  await chooser.setFiles(file);
};

const messages = () => page.$$eval('.h5peditor-gs-messages p', (ps) => ps.map((p) => `${p.className}: ${p.textContent}`));

// 1. Wrong extension is rejected before upload
fs.writeFileSync(`${TMP}/model.glb`, 'glTF fake');
await upload(`${TMP}/model.glb`);
await page.waitForTimeout(500);
console.log('after .glb:', await messages(), 'file param:', await page.evaluate(() => JSON.stringify(window.harness.params.splat.file)));

// 2. A PLY that is a plain point cloud, not a splat
fs.writeFileSync(`${TMP}/points.ply`,
  'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 0 0\n0 1 0\n');
await upload(`${TMP}/points.ply`);
await page.waitForSelector('.h5peditor-gs-error', { timeout: 30000 });
console.log('after points.ply:', await messages());

// 3. Real splat
await upload(splatFile);
await page.waitForFunction(() => document.querySelector('.h5peditor-gs-info')?.textContent.length > 0 ||
  document.querySelector('.h5peditor-gs-error'), null, { timeout: 300000 });
await page.waitForTimeout(3000);
console.log('info:', await page.textContent('.h5peditor-gs-info'));
console.log('messages:', await messages());
console.log('view state:', await page.textContent('.h5peditor-gs-view-state'));
await page.screenshot({ path: `${prefix}-1-uploaded.png`, fullPage: true });

// Orbit and zoom in the preview, then save the starting view
const canvas = await page.$('.h5peditor-gs-stage canvas');
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 30, { steps: 10 });
await page.mouse.up();
await page.mouse.wheel(0, -400);
await page.waitForTimeout(2500);
await page.click('.h5peditor-gs-set-view');
console.log('view state:', await page.textContent('.h5peditor-gs-view-state'));
console.log('saved cameraView:', await page.evaluate(() => window.harness.params.splat.cameraView));
await page.screenshot({ path: `${prefix}-2-view-saved.png`, clip: { x: 0, y: 0, width: 1100, height: 1000 } });

// Change the up axis: the stored view must be cleared
await page.selectOption('.field-name-upAxis select', '+y');
await page.waitForTimeout(2500);
console.log('after up axis change:', await page.textContent('.h5peditor-gs-view-state'),
  '| cameraView =', await page.evaluate(() => window.harness.params.splat.cameraView));
await page.screenshot({ path: `${prefix}-3-upaxis.png`, clip: { x: 0, y: 0, width: 1100, height: 1000 } });

// Fine-tune orientation updates the preview live
await page.selectOption('.field-name-upAxis select', '-y');
await page.waitForTimeout(1500);
await page.click('.field-name-orientation .title').catch(() => {});
for (const [name, value] of Object.entries(JSON.parse(process.env.TILT ?? '{"tiltZ":10}'))) {
  await page.fill(`.field-name-${name} input`, String(value));
  await page.press(`.field-name-${name} input`, 'Tab');
}
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-4-tilt.png`, clip: { x: 0, y: 0, width: 1100, height: 1300 } });
console.log('orientation params:', await page.evaluate(() => JSON.stringify(window.harness.params.splat.orientation)));

console.log('final params:', await page.evaluate(() => JSON.stringify(window.harness.params.splat)));
console.log(logs.filter((l) => !l.includes('favicon')).join('\n'));
await browser.close();
