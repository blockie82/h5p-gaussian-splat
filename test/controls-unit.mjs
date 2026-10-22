// Unit checks for the camera controller (no browser needed).
import OrbitControls from '../src/viewer/orbit-controls.js';
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const el = { clientHeight: 400, style: {}, addEventListener() {}, removeEventListener() {}, focus() {}, setPointerCapture() {} };
const key = (type, code, extra = {}) => c[type === 'down' ? 'handleKeyDown' : 'handleKeyUp']({ code, key: extra.key ?? code, shiftKey: !!extra.shift, preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false });
const step = (secs) => { for (let i = 0; i < secs * 60; i++) c.update(1 / 60); };
const pose = () => c.getPose();
const fwd = () => { const p = pose(); const d = p.target.map((v, i) => v - p.position[i]); const l = Math.hypot(...d); return d.map((v) => +(v / l).toFixed(3)); };
const f = (a) => a.map((v) => +v.toFixed(3));
let ok = true;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`); ok = ok && cond; };

let c = new OrbitControls(el);
c.setSceneRadius(10);
c.setView({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 20 }, true);
check('starts in orbit', c.mode === 'orbit');
key('down', 'KeyW'); 
check('W switches to fly', c.mode === 'fly');
const p0 = pose().position; step(1); key('up', 'KeyW'); step(1);
const p1 = pose().position;
check('W moves forward (-Z at yaw 0)', p1[2] < p0[2] - 3, `z ${p0[2].toFixed(2)} -> ${p1[2].toFixed(2)}`);
// Shift pressed AFTER W must speed up
c.setView({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 20 }, true);
key('down', 'KeyW'); step(1); const a = pose().position[2];
step(1); const slow = a - pose().position[2];
key('down', 'ShiftLeft', { key: 'Shift' }); step(1); const b = pose().position[2]; step(1); const fast = b - pose().position[2];
key('up', 'ShiftLeft', { key: 'Shift' }); key('up', 'KeyW'); step(2);
check('Shift pressed while moving is ~4x faster', fast / slow > 3.5, `ratio ${(fast / slow).toFixed(2)}`);
// Mouse look: drag right turns view right, camera stays put
c.setView({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 20 }, true);
const before = f(pose().position);
c.rotate(200, 0); step(2);
check('fly drag keeps camera position', JSON.stringify(f(pose().position)) === JSON.stringify(before), `${before} -> ${f(pose().position)}`);
check('fly drag right turns view right (+X)', fwd()[0] > 0.3, `forward ${fwd()}`);
c.rotate(0, 100); step(2);
check('fly drag down looks down', fwd()[1] < -0.1, `forward ${fwd()}`);
// D strafes right relative to view
c.setView({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 20 }, true);
const s0 = pose().position; key('down', 'KeyD'); step(1); key('up', 'KeyD'); step(1);
check('D strafes right (+X)', pose().position[0] > s0[0] + 3);
// Wheel in fly moves forward
const w0 = pose().position[2]; c.zoom(0.85); step(2);
check('wheel/zoom in fly moves forward', pose().position[2] < w0);
// Back to orbit keeps the view
const pf = f(pose().position); const ff = fwd();
c.setMode('orbit'); step(1);
check('switching to orbit keeps camera pose', JSON.stringify(f(pose().position)) === JSON.stringify(pf) && JSON.stringify(fwd()) === JSON.stringify(ff));
const t0 = f(c.target); c.rotate(100, 0); step(2);
check('orbit drag rotates around target', JSON.stringify(f(c.current.target)) === JSON.stringify(t0));
// On-screen buttons: turn(+yaw) turns left, turn(+pitch) looks up, in fly mode on the spot
c.setMode('fly');
c.setView({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 20 }, true);
const tb = f(pose().position);
c.turn(0.5, 0); step(2);
check('button turn left keeps position (fly)', JSON.stringify(f(pose().position)) === JSON.stringify(tb));
check('button turn left looks left (-X)', fwd()[0] < -0.3, `forward ${fwd()}`);
c.turn(0, 0.3); step(2);
check('button look up looks up', fwd()[1] > 0.1, `forward ${fwd()}`);
// allowMove false: WASD ignored
c = new OrbitControls(el, { allowMove: false }); c.setSceneRadius(10); c.setView({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 20 }, true);
key('down', 'KeyW'); step(1);
check('allowMove=false ignores WASD', c.mode === 'orbit' && Math.abs(pose().position[2] - 20) < 1e-6);
process.exit(ok ? 0 : 1);
