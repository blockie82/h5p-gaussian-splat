// Runs axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on the player: idle, with a hotspot popup open, and with the hotspot list open.
import { chromium } from 'playwright';
import fs from 'node:fs';
const axeSource = fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
await p.goto(`http://localhost:8765/index.html?ws=${process.env.WS || 'ws-pkg'}`);
const f = await (await p.waitForSelector('iframe')).contentFrame();
await f.waitForSelector('.h5p-gs-toolbar:not(.h5p-gs-hidden)', { timeout: 180000 });
await f.addScriptTag({ content: axeSource });
const run = async (label) => {
  const r = await f.evaluate(async () => {
    const res = await axe.run(document.querySelector('.h5p-content') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return { violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })), passes: res.passes.length, incomplete: res.incomplete.map((v) => v.id) };
  });
  console.log(`--- ${label}: ${r.violations.length} violations, ${r.passes} rules passed, needs review: ${r.incomplete.join(', ') || 'none'}`);
  r.violations.forEach((v) => console.log(`  [${v.impact}] ${v.id}: ${v.help}\n     ${v.nodes.join(' | ')}`));
};
await run('player');
await f.click('.h5p-gs-toolbar .h5p-gs-button[aria-pressed]');
await p.waitForTimeout(300);
await run('navigation buttons shown');
await f.click('.h5p-gs-hotspot >> nth=0');
await p.waitForTimeout(600);
await run('hotspot popup open');
await p.keyboard.press('Escape');
await f.click('.h5p-gs-toolbar .h5p-gs-button >> nth=0');
await p.waitForTimeout(300);
await run('hotspot list open');
await b.close();
