// Audio + video hotspots in a real Moodle: upload, save, play, close -> media paused.
// Usage: node test/moodle/hotspots-av.mjs <splat> <audio.mp3> <video.mp4>
import { chromium } from 'playwright';
const BASE = process.env.MOODLE || 'http://localhost:8800';
const [splatFile, audioFile, videoFile] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1300, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (let i = 0; i < 4 && !page.url().includes('/my/'); i++) {
  await page.goto(`${BASE}/login/index.php`); await page.waitForLoadState('networkidle');
  await page.fill('#username', 'admin'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#loginbtn')]); await page.waitForLoadState('networkidle');
}
await page.goto(`${BASE}/contentbank/edit.php?contextid=${process.env.CTX || 12}&plugin=h5p&library=${encodeURIComponent('H5P.GaussianSplat 1.0')}`);
const frame = await (await page.waitForSelector('iframe.h5p-editor-iframe')).contentFrame();
await frame.waitForSelector('.h5peditor-gaussian-splat .file a', { timeout: 120000 });
await frame.fill('.field-name-extraTitle input, input[id^="field-extratitle"]', 'AV hotspots');
let chooser = page.waitForEvent('filechooser');
await frame.click('.h5peditor-gaussian-splat .file a');
await (await chooser).setFiles(splatFile);
await frame.waitForFunction(() => document.querySelector('.h5peditor-gs-info')?.textContent, null, { timeout: 300000 });
await page.waitForTimeout(1500);
const items = () => frame.$$('.field-name-hotspot');

const addHotspot = async (fx, fy, title, label, file) => {
  await frame.click('.h5peditor-gs-add-hotspot');
  const box = await (await frame.$('.h5peditor-gs-stage canvas')).boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(800);
  const all = await items();
  const li = all[all.length - 1];
  await (await li.$('.field-name-title input')).fill(title);
  await (await li.$('.field.library select')).selectOption({ label });
  const add = await li.waitForSelector('.h5p-add-file', { timeout: 30000 });
  await add.click();
  const upload = await li.waitForSelector('.h5p-add-dialog .h5p-file-drop-upload', { timeout: 10000 });
  const fc = page.waitForEvent('filechooser');
  await upload.click();
  await (await fc).setFiles(file);
  await li.waitForSelector('.h5p-av-row, .h5p-av-cell', { timeout: 60000 });
  console.log(`${label} uploaded:`, await li.$eval('.h5p-type', (t) => t.title));
};
await addHotspot(0.55, 0.5, 'Listen', 'Audio', audioFile);
await addHotspot(0.4, 0.38, 'Watch', 'Video', videoFile);
console.log('markers:', await frame.$$eval('.h5p-gs-hotspot', (m) => m.map((x) => x.getAttribute('aria-label'))));

await Promise.all([page.waitForNavigation({ timeout: 120000 }), page.click('button:has-text("Save"), #id_submitbutton')]);
console.log('after save:', page.url().replace(BASE, ''));
const outer = await (await page.waitForSelector('iframe.h5p-player, iframe[id^="h5p-iframe"], .h5p-iframe', { timeout: 60000 })).contentFrame();
const player = outer.childFrames()[0] ?? outer;
await player.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 180000 });
await page.waitForTimeout(1500);

const tryHotspot = async (n, selector) => {
  await player.click(`.h5p-gs-hotspot >> nth=${n}`);
  await player.waitForSelector('.h5p-gs-dialog:not(.h5p-gs-hidden)');
  await page.waitForTimeout(800);
  // H5P.Audio's compact player keeps its <audio> out of the page, so look it up via the instances
  const media = await player.evaluateHandle((sel) => {
    const inDom = document.querySelector(`.h5p-gs-dialog:not(.h5p-gs-hidden) ${sel}`);
    if (inDom) return inDom;
    const gs = H5P.instances.find((i) => i.dialog);
    for (const inst of gs.dialog.getInstances()) {
      const m = inst?.audio ?? inst?.video;
      if (m instanceof HTMLMediaElement) return m;
    }
    return null;
  }, selector);
  if (!(await media.evaluate((m) => !!m))) {
    console.log(`hotspot ${n + 1}: no ${selector} element`);
    return;
  }
  await media.evaluate((m) => { m.muted = true; return m.play(); }).catch((e) => console.log('play() failed', e.message));
  await page.waitForTimeout(1500);
  const playing = await media.evaluate((m) => ({ paused: m.paused, t: +m.currentTime.toFixed(2) }));
  await page.screenshot({ path: `test/out/hs-av-${n + 1}.png` });
  await player.click('.h5p-gs-dialog-close');
  await page.waitForTimeout(400);
  const after = await media.evaluate((m) => ({ paused: m.paused }));
  console.log(`hotspot ${n + 1} (${selector}): while open ${JSON.stringify(playing)}, after close ${JSON.stringify(after)}`);
};
await tryHotspot(0, 'audio');
await tryHotspot(1, 'video');
await b.close();
