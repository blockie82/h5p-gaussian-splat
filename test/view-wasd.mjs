// Checks that a saved start view is applied (new + legacy escaped format) and that WASD moves.
import { chromium } from 'playwright';
import fs from 'node:fs';
const WS = process.env.WS || 'ws-txt';
const ws = `test/site/${WS}/content/content.json`;
const base = JSON.parse(fs.readFileSync(ws, 'utf8'));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const run = async (label, cameraView, keys) => {
  fs.writeFileSync(ws, JSON.stringify({ ...base, splat: { ...base.splat, cameraView } }));
  const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(`http://localhost:8765/index.html?ws=${WS}`);
  const f = await (await p.waitForSelector('iframe')).contentFrame();
  await f.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 120000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `test/out/vw-${label}.png` });
  if (keys) {
    await f.click('canvas');
    for (const k of keys) {
      await p.keyboard.down(k); await p.waitForTimeout(900); await p.keyboard.up(k);
      await p.waitForTimeout(1200);
      await p.screenshot({ path: `test/out/vw-${label}-${k}.png` });
    }
  }
  await p.close();
};
await run('default', undefined, ['w', 'd']);
await run('new', '0.02 0.02 0.0 60 -35 0.9');
await run('legacy', '{&quot;target&quot;:[0.02,0.02,0.0],&quot;yaw&quot;:60,&quot;pitch&quot;:-35,&quot;distance&quot;:0.9}');
fs.writeFileSync(ws, JSON.stringify(base));
await b.close();
