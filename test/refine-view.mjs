// Refine a start view so the real render matches a target screenshot (coordinate descent).
// node test/refine-view.mjs <ws> <target.png 160x90> '<start view json>' <rounds>
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const [ws, targetPath, startJson, roundsArg = '3'] = process.argv.slice(2);
const target = PNG.sync.read(fs.readFileSync(targetPath));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
await p.goto(`http://localhost:8765/index.html?ws=${ws}`);
const f = await (await p.waitForSelector('iframe')).contentFrame();
await f.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 180000 });
await f.addStyleTag({ content: '.h5p-gs-toolbar{display:none!important}' });
const stage = await f.$('.h5p-gs-stage');
// Small square-ish downscale in the browser via an offscreen canvas of the screenshot
const score = async (v) => {
  await f.evaluate((view) => { const vw = H5P.instances[0].viewer; vw.setView(view, true); vw.requestRender(40); }, v);
  await p.waitForTimeout(1600);
  const buf = await stage.screenshot();
  const img = PNG.sync.read(buf);
  // box-downsample to 160x90 and compare with the target
  let err = 0;
  const W = 160, H = 90;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx0 = Math.floor(x * img.width / W), sy0 = Math.floor(y * img.height / H);
    const sx1 = Math.floor((x + 1) * img.width / W), sy1 = Math.floor((y + 1) * img.height / H);
    const acc = [0, 0, 0]; let n = 0;
    for (let yy = sy0; yy < sy1; yy += 2) for (let xx = sx0; xx < sx1; xx += 2) {
      const i = (yy * img.width + xx) * 4; acc[0] += img.data[i]; acc[1] += img.data[i + 1]; acc[2] += img.data[i + 2]; n++;
    }
    const j = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) err += Math.abs(acc[c] / n - target.data[j + c]);
  }
  return err / (W * H * 3);
};
const pos = (v) => { const r = Math.PI / 180, cp = Math.cos(v.pitch * r); return [v.target[0] + Math.sin(v.yaw * r) * cp * v.distance, v.target[1] - Math.sin(v.pitch * r) * v.distance, v.target[2] + Math.cos(v.yaw * r) * cp * v.distance]; };
const fromPos = (P, yaw, pitch, d) => { const r = Math.PI / 180, cp = Math.cos(pitch * r); const dir = [Math.sin(yaw * r) * cp, -Math.sin(pitch * r), Math.cos(yaw * r) * cp]; return { target: P.map((x, i) => x - dir[i] * d), yaw, pitch, distance: d }; };
let v = JSON.parse(startJson);
let P = pos(v), yaw = v.yaw, pitch = v.pitch; const d = v.distance;
let best = await score(fromPos(P, yaw, pitch, d));
console.log('start error', best.toFixed(2));
let steps = JSON.parse(process.env.STEPS || '{"x":0.4,"y":0.3,"z":0.4,"yaw":3,"pitch":2}');
for (let round = 0; round < Number(roundsArg); round++) {
  for (const key of ['yaw', 'pitch', 'x', 'y', 'z']) {
    for (const sign of [1, -1]) {
      const P2 = P.slice(); let yaw2 = yaw, pitch2 = pitch;
      if (key === 'yaw') yaw2 += sign * steps.yaw; else if (key === 'pitch') pitch2 += sign * steps.pitch;
      else P2['xyz'.indexOf(key)] += sign * steps[key];
      const e = await score(fromPos(P2, yaw2, pitch2, d));
      if (e < best) { best = e; P = P2; yaw = yaw2; pitch = pitch2; console.log(`round ${round} ${key}${sign > 0 ? '+' : '-'} -> ${e.toFixed(2)}`); break; }
    }
  }
  for (const k in steps) steps[k] *= 0.6;
}
const final = fromPos(P, yaw, pitch, d);
console.log('FINAL', JSON.stringify(final), 'error', best.toFixed(2));
await score(final);
await stage.screenshot({ path: 'test/out/bov-refined.png' });
await b.close();
