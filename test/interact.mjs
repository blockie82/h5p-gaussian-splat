// Interaction smoke test for the runtime inside h5p-standalone.
// Usage: node test/interact.mjs <ws> <outPrefix>
import { chromium } from 'playwright';

const [ws = 'ws-ply', prefix = 'test/out/i'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:8765/index.html?ws=${ws}`);

const frameEl = await page.waitForSelector('iframe');
const frame = await frameEl.contentFrame();
await frame.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden), .h5p-gs-message:not(.h5p-gs-hidden)', { timeout: 300000 });
const msg = await frame.$eval('.h5p-gs-message', (e) => e.classList.contains('h5p-gs-hidden') ? '' : e.textContent);
if (msg) {
  console.log('MESSAGE:', msg);
}
await page.waitForTimeout(3000);
await page.screenshot({ path: `${prefix}-0-loaded.png` });

const box = await frameEl.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

// Wheel without focus -> hint, page should not zoom
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(150);
const hintVisible = await frame.$eval('.h5p-gs-hint', (e) => e.classList.contains('visible'));
console.log('wheel hint shown without focus:', hintVisible);

// Drag to orbit
await page.mouse.down();
await page.mouse.move(cx + 220, cy + 60, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-1-orbit.png` });

// Now focused: wheel zooms
const focused = await frame.evaluate(() => document.activeElement?.className);
console.log('focused element after click:', focused);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-2-zoom.png` });

// Keyboard: Home resets
await page.keyboard.press('Home');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-3-reset.png` });

// Auto-rotate toggle
await frame.click('.h5p-gs-toolbar .h5p-gs-button:first-child');
const pressed = await frame.$eval('.h5p-gs-toolbar .h5p-gs-button:first-child', (b) => [b.getAttribute('aria-pressed'), b.getAttribute('aria-label')]);
console.log('auto-rotate button:', pressed);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${prefix}-4-rotating.png` });

// xAPI interacted was triggered?
console.log(logs.filter((l) => !l.includes('favicon')).join('\n'));
await browser.close();
