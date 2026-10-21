// Hotspots end-to-end in a real Moodle content bank.
// Usage: node test/moodle/hotspots-e2e.mjs <splat file> <image file>
import { chromium } from 'playwright';
const BASE = process.env.MOODLE || 'http://localhost:8800';
const [splatFile, imageFile] = process.argv.slice(2);
const shot = (p, name) => p.screenshot({ path: `test/out/hs-${name}.png` });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1300, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
for (let i = 0; i < 4 && !page.url().includes('/my/'); i++) {
  await page.goto(`${BASE}/login/index.php`); await page.waitForLoadState('networkidle');
  await page.fill('#username', 'admin'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#loginbtn')]); await page.waitForLoadState('networkidle');
}
await page.goto(`${BASE}/contentbank/edit.php?contextid=${process.env.CTX || 12}&plugin=h5p&library=${encodeURIComponent('H5P.GaussianSplat 1.0')}`);
const frame = await (await page.waitForSelector('iframe.h5p-editor-iframe')).contentFrame();
await frame.waitForSelector('.h5peditor-gaussian-splat .file a', { timeout: 120000 });
await frame.fill('.field-name-extraTitle input, input[id^="field-extratitle"]', 'Strawberry hotspots');

// Upload the splat
let chooser = page.waitForEvent('filechooser');
await frame.click('.h5peditor-gaussian-splat .file a');
await (await chooser).setFiles(splatFile);
await frame.waitForFunction(() => document.querySelector('.h5peditor-gs-info')?.textContent, null, { timeout: 300000 });
await page.waitForTimeout(2000);
console.log('preview:', await frame.textContent('.h5peditor-gs-info'));
console.log('actions:', await frame.$$eval('.h5peditor-gs-actions button', (bs) => bs.map((b) => b.textContent.trim())));

// --- Hotspot 1: click "Add hotspot", then the centre of the scene
const canvasBox = async () => (await frame.$('.h5peditor-gs-stage canvas')).boundingBox();
await frame.click('.h5peditor-gs-add-hotspot');
console.log('banner:', await frame.textContent('.h5peditor-gs-pick-banner span'));
let box = await canvasBox();
await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5);
await frame.waitForSelector('.h5p-gs-hotspot', { timeout: 10000 }).catch(() => {});
console.log('markers after 1st:', await frame.$$eval('.h5p-gs-hotspot', (m) => m.length));
const items = () => frame.$$('.field-name-hotspot');
console.log('list items:', (await items()).length);
await page.waitForTimeout(800);
await shot(page, '1-added');

// Fill title + choose Text
const li1 = (await items())[0];
await (await li1.$('.field-name-title input')).fill('Seeds');
const sel1 = await li1.$('.field.library select');
const options = await sel1.$$eval('option', (os) => os.map((o) => `${o.value}=${o.textContent}`));
console.log('content options:', options.join(' | '));
await sel1.selectOption({ label: 'Text' });
const editable = await li1.waitForSelector('.field-name-text .ckeditor, .field-name-text [contenteditable]', { timeout: 30000 });
await editable.click();
await page.keyboard.type('Each little seed on a strawberry is actually a fruit.');
await page.waitForTimeout(500);

// --- Hotspot 2 via "Add hotspot", with an image
await frame.click('.h5peditor-gs-add-hotspot');
box = await canvasBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.38);
await page.waitForTimeout(800);
console.log('markers after 2nd:', await frame.$$eval('.h5p-gs-hotspot', (m) => m.map((x) => x.textContent + ':' + x.getAttribute('aria-label'))));
const li2 = (await items())[1];
await (await li2.$('.field-name-title input')).fill('Leaves');
await (await li2.$('.field.library select')).selectOption({ label: 'Image' });
const addImage = await li2.waitForSelector('.field-name-file .file a, .field.image .file a', { timeout: 30000 });
chooser = page.waitForEvent('filechooser');
await addImage.click();
await (await chooser).setFiles(imageFile);
await li2.waitForSelector('.field-name-file img[src*="images"], .file img', { timeout: 60000 }).catch(() => {});
const alt = await li2.$('.field-name-alt input');
await alt?.fill('Close-up of the strawberry leaves');
console.log('statuses:', await frame.$$eval('.h5peditor-gs-hotspot-status', (s) => s.map((x) => x.textContent)));
await page.waitForTimeout(500);
await shot(page, '2-editor');

// Clicking a marker in the preview jumps to its settings
await frame.click('.h5p-gs-hotspot >> nth=0');
await page.waitForTimeout(800);
console.log('focused after marker click:', await frame.evaluate(() => document.activeElement?.closest('.field')?.className));

// Save
await Promise.all([page.waitForNavigation({ timeout: 120000 }), page.click('button:has-text("Save"), #id_submitbutton')]);
console.log('after save:', page.url().replace(BASE, ''));
const outer = await (await page.waitForSelector('iframe.h5p-player, iframe[id^="h5p-iframe"], .h5p-iframe', { timeout: 60000 })).contentFrame();
const player = outer.childFrames()[0] ?? outer;
await player.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 180000 });
await page.waitForTimeout(2500);
console.log('player markers:', await player.$$eval('.h5p-gs-hotspot', (m) => m.map((x) => `${x.textContent}:${x.getAttribute('aria-label')}:${x.style.visibility}`)));
await shot(page, '3-player');

// Open hotspot 1 (text)
await player.click('.h5p-gs-hotspot >> nth=0');
await player.waitForSelector('.h5p-gs-dialog:not(.h5p-gs-hidden)');
await page.waitForTimeout(800);
console.log('dialog 1:', await player.textContent('.h5p-gs-dialog-title'), '|', (await player.textContent('.h5p-gs-dialog-content')).trim().slice(0, 80));
console.log('focus on close button:', await player.evaluate(() => document.activeElement?.className));
await shot(page, '4-text');
await page.keyboard.press('Escape');
console.log('closed with Esc:', await player.$eval('.h5p-gs-dialog', (d) => d.classList.contains('h5p-gs-hidden')));

// Open hotspot 2 (image) through the list menu
await player.click('.h5p-gs-toolbar .h5p-gs-button >> nth=0');
console.log('menu:', await player.$$eval('.h5p-gs-hotspot-menu button', (bs) => bs.map((x) => x.textContent)));
await player.click('.h5p-gs-hotspot-menu li:nth-child(2) button');
await player.waitForSelector('.h5p-gs-dialog:not(.h5p-gs-hidden) img', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);
console.log('dialog 2:', await player.textContent('.h5p-gs-dialog-title'), '| img:', await player.$eval('.h5p-gs-dialog img', (i) => `${i.naturalWidth}x${i.naturalHeight} alt="${i.alt}"`).catch(() => 'none'));
await shot(page, '5-image');
await b.close();
