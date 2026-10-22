// On-screen navigation buttons: toggle, tap, press-and-hold, keyboard, labels per mode, pulse limit.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const opts = process.env.TOUCH ? { viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } };
const p = await b.newPage(opts);
await p.goto(`http://localhost:8765/index.html?ws=${process.env.WS || 'ws-pkg'}`);
const f = await (await p.waitForSelector('iframe')).contentFrame();
await f.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 180000 });
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`); ok = ok && cond; };
const view = () => f.evaluate(() => H5P.instances[0].viewer.getView());
const pad = () => f.evaluate(() => { const d = document.querySelector('.h5p-gs-navpad'); return { hidden: d.hidden, pressed: document.querySelector('.h5p-gs-toolbar .h5p-gs-button[aria-pressed]').getAttribute('aria-pressed') }; });
const initial = await pad();
check(`initially ${process.env.TOUCH ? 'shown (touch)' : 'hidden (mouse)'}`, initial.hidden === !process.env.TOUCH, JSON.stringify(initial));
if (initial.hidden) {
  await f.click('.h5p-gs-toolbar .h5p-gs-button[aria-pressed]');
}
check('toggle shows pad, aria-pressed=true', JSON.stringify(await pad()) === '{"hidden":false,"pressed":"true"}');
const labels = await f.$$eval('.h5p-gs-navpad button:not([hidden])', (bs) => bs.map((x) => x.getAttribute('aria-label')));
console.log('labels:', labels.join(', '));
// Tap = one step
let v0 = await view();
await f.click('.h5p-gs-navpad-left');
await p.waitForTimeout(300);
let v1 = await view();
const dyaw = ((v1.yaw - v0.yaw + 540) % 360) - 180;
check('tap turn left = 15°', Math.abs(dyaw - 15) < 0.5, `Δyaw ${dyaw.toFixed(2)}`);
// Hold = continuous
const box = await (await f.$('.h5p-gs-navpad-up')).boundingBox();
v0 = await view();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
const fr = await f.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const go = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(go); else r(n); }; requestAnimationFrame(go); }));
console.log('frames per second in this test browser:', fr);
await p.mouse.down(); await p.waitForTimeout(1350); await p.mouse.up();
await p.waitForTimeout(200);
v1 = await view();
check('hold look up keeps turning (more than one tap)', v1.pitch - v0.pitch > 20 || v1.pitch > 80, `pitch ${v0.pitch} -> ${v1.pitch}`);
const v2 = await view(); await p.waitForTimeout(400);
check('stops on release', (await view()).pitch === v2.pitch);
// Keyboard: Tab focus + Enter on zoom
await f.focus('.h5p-gs-navpad-out');
v0 = await view();
await p.keyboard.press('Enter'); await p.waitForTimeout(200);
v1 = await view();
const mode = await f.evaluate(() => H5P.instances[0].viewer.mode);
if (mode === 'orbit') check('Enter on zoom out increases distance', v1.distance > v0.distance, `${v0.distance} -> ${v1.distance}`);
else check('Enter on move backwards moves camera', JSON.stringify(v1.target) !== JSON.stringify(v0.target));
// Labels follow the mode
await f.evaluate(() => H5P.instances[0].viewer.setMode('orbit'));
const inOrbit = await f.getAttribute('.h5p-gs-navpad-in', 'aria-label');
await f.evaluate(() => H5P.instances[0].viewer.setMode('fly'));
const inFly = await f.getAttribute('.h5p-gs-navpad-in', 'aria-label');
check('labels follow mode', inOrbit === 'Zoom in' && inFly === 'Move forwards', `${inOrbit} / ${inFly}`);
// Pulse limited
const anim = await f.$eval('.h5p-gs-hotspot', (el) => { const s = getComputedStyle(el, '::after'); return `${s.animationDuration} x ${s.animationIterationCount}`; });
check('hotspot pulse runs at most 5 s', /2\.4s x 2/.test(anim), anim);
await p.screenshot({ path: `build/navpad${process.env.TOUCH ? '-touch' : ''}.png` });
await b.close();
process.exit(ok ? 0 : 1);
