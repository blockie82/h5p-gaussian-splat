// Render the scene in ws-<name> from given views: node test/render-view.mjs <ws> <out-prefix> '<json array of views>'
import { chromium } from 'playwright';
const [ws, prefix, viewsJson] = process.argv.slice(2);
const views = JSON.parse(viewsJson);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
await p.goto(`http://localhost:8765/index.html?ws=${ws}`);
const f = await (await p.waitForSelector('iframe')).contentFrame();
await f.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 180000 });
await f.addStyleTag({ content: '.h5p-gs-toolbar{display:none!important}' });
for (let i = 0; i < views.length; i++) {
  await f.evaluate((v) => { const vw = H5P.instances[0].viewer; vw.setView(v, true); vw.requestRender(60); }, views[i]);
  await p.waitForTimeout(2500);
  await (await f.$('.h5p-gs-stage')).screenshot({ path: `${prefix}-${i}.png` });
}
await b.close();
