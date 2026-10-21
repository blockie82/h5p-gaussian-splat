// Renders a poster image of the scene: node test/poster.mjs <ws> <out.jpg>
import { chromium } from 'playwright';
const [ws, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1312, height: 800 } });
await p.goto(`http://localhost:8765/index.html?ws=${ws}`);
const f = await (await p.waitForSelector('iframe')).contentFrame();
await f.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 120000 });
await f.addStyleTag({ content: '.h5p-gs-toolbar,.h5p-gs-hotspot-layer{display:none!important}' });
await p.waitForTimeout(3000);
await (await f.$('.h5p-gs-stage')).screenshot({ path: out, type: 'jpeg', quality: 82 });
await b.close();
