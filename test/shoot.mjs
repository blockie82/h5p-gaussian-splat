// Usage: node test/shoot.mjs <url> <out.png> [waitSelector] [timeoutMs]
import { chromium } from 'playwright';

const [url, out, waitFor = '', timeout = '240000'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1000), height: 700 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
const start = Date.now();
if (waitFor) {
  // Wait inside the H5P iframe (or the page itself)
  const deadline = Date.now() + Number(timeout);
  let found = false;
  while (Date.now() < deadline && !found) {
    for (const frame of page.frames()) {
      try {
        if (await frame.evaluate((s) => !!eval(s), waitFor)) {
          found = true;
          break;
        }
      }
      catch (e) { /* frame not ready */ }
    }
    if (!found) {
      await page.waitForTimeout(500);
    }
  }
  logs.push(`[test] condition ${found ? 'met' : 'NOT met'} after ${((Date.now() - start) / 1000).toFixed(1)}s`);
}
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
