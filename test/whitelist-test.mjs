// Run with the harness server started as: WHITELIST="json png jpg gltf glb" node test/editor-server.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 1000, height: 500 } });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('http://localhost:8766/harness/editor.html');
await p.waitForFunction(() => window.harnessReady === true);
const c = p.waitForEvent('filechooser'); await p.click('.h5peditor-gaussian-splat .file a'); await (await c).setFiles(process.argv[2]);
await p.waitForTimeout(2500);
console.log(await p.$eval('.h5peditor-gaussian-splat', e => [...e.querySelectorAll('.h5p-errors, .h5peditor-gs-messages')].map(x => x.textContent).join(' | ')));
await p.screenshot({ path: 'test/out/whitelist.png' });
await b.close();
