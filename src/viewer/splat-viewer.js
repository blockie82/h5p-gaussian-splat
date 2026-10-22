import {
  Application,
  Asset,
  Color,
  Entity,
  FILLMODE_NONE,
  Mat4,
  Quat,
  Vec3,
  RESOLUTION_AUTO
} from 'playcanvas';
import OrbitControls from './orbit-controls.js';
import { UP_AXIS_ROTATIONS } from './view-utils.js';

// Re-export the lightweight helpers (they live in view-utils.js so the
// editor can use them without loading PlayCanvas)
export {
  UP_AXIS_ROTATIONS, SUPPORTED_EXTENSIONS, FALLBACK_EXTENSION, serializeView, parseView, isWebGL2Available
} from './view-utils.js';

let instanceCounter = 0;

/**
 * Detect format from the first bytes of a file.
 * @param {Uint8Array} bytes
 * @returns {'ply'|'sog'|null}
 */
export const sniffFormat = (bytes) => {
  if (bytes.length >= 4 && bytes[0] === 0x70 && bytes[1] === 0x6c && bytes[2] === 0x79 &&
    (bytes[3] === 0x0a || bytes[3] === 0x0d)) {
    return 'ply';
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'sog'; // Zip archive (bundled SOG)
  }
  return null;
};

/**
 * Inspect a PLY header and check that it contains Gaussian splat data.
 * @param {string} header Text up to and including "end_header".
 * @returns {{ok:boolean, count:number, compressed:boolean, shBands:number}}
 */
export const inspectPlyHeader = (header) => {
  const vertex = header.match(/element\s+vertex\s+(\d+)/);
  const compressed = /element\s+chunk\s+\d+/.test(header) && /packed_position/.test(header);
  const props = [...header.matchAll(/property\s+\S+\s+(\S+)/g)].map((m) => m[1]);
  const has = (name) => props.includes(name);
  const isSplat = compressed ||
    (has('x') && has('opacity') && has('scale_0') && has('rot_0') && (has('f_dc_0') || has('red')));
  const rest = props.filter((p) => p.startsWith('f_rest_')).length;
  const shBands = { 0: 0, 9: 1, 24: 2, 45: 3 }[rest] ?? 0;
  return { ok: isSplat, count: vertex ? Number(vertex[1]) : 0, compressed, shBands };
};

/**
 * Fetch a splat file, detect its format and return a Response the
 * PlayCanvas parsers can consume (the sniffed bytes are re-inserted).
 * @param {string} url
 * @param {AbortSignal} signal
 * @returns {Promise<{format:string, response:Response, size:number, header:object|null}>}
 */
export const fetchSplat = async (url, signal) => {
  const response = await fetch(url, { signal, credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const size = parseInt(response.headers.get('content-length') ?? '0', 10);
  const reader = response.body.getReader();

  // Read enough bytes to identify format (and the PLY header if possible)
  const head = [];
  let headLength = 0;
  let done = false;
  while (headLength < 65536) {
    const result = await reader.read();
    if (result.done) {
      done = true;
      break;
    }
    head.push(result.value);
    headLength += result.value.byteLength;
    if (headLength >= 4 && sniffFormat(result.value) === 'sog') {
      break;
    }
    const text = new TextDecoder().decode(concat(head, headLength));
    if (text.includes('end_header')) {
      break;
    }
  }
  const headBytes = concat(head, headLength);
  const format = sniffFormat(headBytes);

  let header = null;
  if (format === 'ply') {
    const text = new TextDecoder().decode(headBytes);
    const end = text.indexOf('end_header');
    header = inspectPlyHeader(end >= 0 ? text.slice(0, end) : text);
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(headBytes);
      if (done) {
        controller.close();
      }
    },
    async pull(controller) {
      const { value, done: finished } = await reader.read();
      if (finished) {
        controller.close();
      }
      else {
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      reader.cancel(reason);
    }
  });

  return {
    format,
    size,
    header,
    response: new Response(stream, { headers: { 'content-length': String(size) } })
  };
};

const concat = (chunks, length) => {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

/**
 * Robust bounds of splat centres (ignores floaters by using percentiles).
 * @param {Float32Array} centers xyz triples.
 * @param {number[]} m Row-major 3x3 rotation applied to the entity.
 * @returns {{center:number[], radius:number, min:number[], max:number[]}|null}
 */
export const robustBounds = (centers, m = [1, 0, 0, 0, 1, 0, 0, 0, 1]) => {
  if (!centers || centers.length < 3) {
    return null;
  }
  const count = centers.length / 3;
  const step = Math.max(1, Math.floor(count / 200000));
  const xs = [];
  const ys = [];
  const zs = [];
  for (let i = 0; i < count; i += step) {
    const x = centers[i * 3];
    const y = centers[i * 3 + 1];
    const z = centers[i * 3 + 2];
    if (!Number.isFinite(x + y + z)) {
      continue;
    }
    xs.push(m[0] * x + m[1] * y + m[2] * z);
    ys.push(m[3] * x + m[4] * y + m[5] * z);
    zs.push(m[6] * x + m[7] * y + m[8] * z);
  }
  if (!xs.length) {
    return null;
  }
  const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))];
  const range = (arr) => {
    const sorted = Float32Array.from(arr).sort();
    return [pct(sorted, 0.05), pct(sorted, 0.95)];
  };
  const [x0, x1] = range(xs);
  const [y0, y1] = range(ys);
  const [z0, z1] = range(zs);
  const min = [x0, y0, z0];
  const max = [x1, y1, z1];
  const center = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const radius = Math.max(1e-3, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2);
  return { center, radius, min, max };
};

/**
 * Minimal Gaussian splat viewer around a PlayCanvas application.
 */
export default class SplatViewer {
  /**
   * @param {HTMLElement} container Element the canvas is appended to.
   * @param {object} [options]
   * @param {string} [options.upAxis='-y']
   * @param {number[]} [options.rotation=[0,0,0]] Extra rotation (degrees) after the up axis correction.
   * @param {boolean} [options.allowPan=true]
   * @param {boolean} [options.allowZoom=true]
   * @param {boolean} [options.allowMove=true] Fly mode and WASD/QE movement.
   * @param {string} [options.mode='orbit'] Starting camera mode: 'orbit' or 'fly'.
   * @param {function} [options.onModeChange] Called with the new mode.
   * @param {boolean} [options.autoRotate=false]
   * @param {number} [options.autoRotateSpeed=10] Degrees per second.
   * @param {string} [options.ariaLabel]
   * @param {function} [options.canUseWheel]
   * @param {function} [options.onWheelBlocked]
   * @param {function} [options.onInteract]
   * @param {function} [options.onViewChange]
   */
  constructor(container, options = {}) {
    this.options = {
      upAxis: '-y',
      rotation: [0, 0, 0],
      allowPan: true,
      allowZoom: true,
      allowMove: true,
      mode: 'orbit',
      onModeChange: () => {},
      autoRotate: false,
      autoRotateSpeed: 10,
      ariaLabel: '',
      canUseWheel: () => true,
      onWheelBlocked: () => {},
      onInteract: () => {},
      onViewChange: () => {},
      ...options
    };
    this.id = ++instanceCounter;
    this.container = container;
    this.visible = true;
    this.settleFrames = 0;
    this.destroyed = false;
    this.frameListeners = new Set();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'h5p-gaussian-splat-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    if (this.options.ariaLabel) {
      this.canvas.setAttribute('aria-label', this.options.ariaLabel);
    }
    // Inline layout so the canvas can never size its own container, even if
    // the stylesheet fails to load (otherwise canvas -> container -> canvas
    // resizing grows the page forever).
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block'
    });
    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    if (!container.style.height && !container.style.aspectRatio &&
      window.getComputedStyle(container).aspectRatio === 'auto') {
      container.style.aspectRatio = '16 / 9';
    }
    container.style.overflow = 'hidden';
    container.appendChild(this.canvas);

    this.app = new Application(this.canvas, {
      graphicsDeviceOptions: {
        alpha: true,
        antialias: false,
        depth: true,
        powerPreference: 'high-performance'
      }
    });
    this.app.setCanvasFillMode(FILLMODE_NONE);
    this.app.setCanvasResolution(RESOLUTION_AUTO);
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.app.autoRender = false;

    this.camera = new Entity('camera');
    this.camera.addComponent('camera', {
      clearColor: new Color(0, 0, 0, 0),
      fov: 60,
      nearClip: 0.01,
      farClip: 1000
    });
    this.app.root.addChild(this.camera);

    this.controls = new OrbitControls(this.canvas, {
      allowPan: this.options.allowPan,
      allowZoom: this.options.allowZoom,
      allowMove: this.options.allowMove,
      mode: this.options.mode,
      onModeChange: (mode) => {
        this.requestRender();
        this.options.onModeChange(mode);
      },
      canUseWheel: this.options.canUseWheel,
      onWheelBlocked: this.options.onWheelBlocked,
      onInteract: this.options.onInteract,
      onChange: () => {
        this.requestRender();
        this.options.onViewChange();
      }
    });
    this.controls.autoRotate = this.options.autoRotate;
    this.controls.autoRotateSpeed = (this.options.autoRotateSpeed * Math.PI) / 180;

    this.app.on('update', (dt) => this.update(dt));
    this.app.start();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
      if (this.visible) {
        this.requestRender();
      }
    });
    this.intersectionObserver.observe(container);

    this.resize();
  }

  /** Keep rendering for a while (lets async splat sorting catch up). */
  requestRender(frames = 45) {
    this.settleFrames = Math.max(this.settleFrames, frames);
  }

  update(dt) {
    if (this.destroyed) {
      return;
    }
    const moving = this.controls.update(Math.min(dt, 0.25));
    if (moving) {
      this.requestRender();
    }
    const pose = this.controls.getPose();
    this.camera.setPosition(pose.position[0], pose.position[1], pose.position[2]);
    this.camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);

    // Keep clipping planes proportional to the viewing distance
    const dist = this.controls.current.distance;
    const radius = this.controls.sceneRadius;
    this.camera.camera.nearClip = Math.max(dist * 0.002, radius * 0.0005);
    this.camera.camera.farClip = dist + radius * 50;

    if (this.visible && this.settleFrames > 0 && !document.hidden) {
      this.settleFrames--;
      this.app.renderNextFrame = true;
    }
    if (this.visible) {
      this.frameListeners.forEach((fn) => fn());
    }
  }

  /**
   * Call a function every frame after the camera has been updated
   * (used to position hotspot markers).
   * @param {function} fn
   * @returns {function} Unsubscribe.
   */
  onFrame(fn) {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  /**
   * Convert a point in the splat file's own coordinates to world space.
   * @param {number[]} p
   * @returns {number[]}
   */
  localToWorld(p) {
    if (!this.splat) {
      return p.slice();
    }
    const out = new Vec3();
    this.splat.getWorldTransform().transformPoint(new Vec3(p[0], p[1], p[2]), out);
    return [out.x, out.y, out.z];
  }

  /**
   * Convert a world point to the splat file's own coordinates.
   * @param {number[]} p
   * @returns {number[]}
   */
  worldToLocal(p) {
    if (!this.splat) {
      return p.slice();
    }
    const out = new Vec3();
    new Mat4().copy(this.splat.getWorldTransform()).invert().transformPoint(new Vec3(p[0], p[1], p[2]), out);
    return [out.x, out.y, out.z];
  }

  /**
   * Project a world point to canvas pixels (CSS units).
   * @param {number[]} p
   * @returns {{x:number, y:number, depth:number, onScreen:boolean}}
   */
  worldToScreen(p) {
    const out = new Vec3();
    this.camera.camera.worldToScreen(new Vec3(p[0], p[1], p[2]), out);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // Depth along the view direction (negative = behind the camera)
    const camPos = this.camera.getPosition();
    const fwd = this.camera.forward;
    const depth = (p[0] - camPos.x) * fwd.x + (p[1] - camPos.y) * fwd.y + (p[2] - camPos.z) * fwd.z;
    const onScreen = depth > 0 && out.x >= 0 && out.x <= w && out.y >= 0 && out.y <= h;
    return { x: out.x, y: out.y, depth, onScreen };
  }

  /**
   * Find the point on the splat under a screen position by casting a ray
   * through the splat centres and taking the first dense cluster (so stray
   * floaters are ignored).
   * @param {number} clientX
   * @param {number} clientY
   * @param {number} [tolerancePx=6]
   * @returns {{local:number[], world:number[]}|null}
   */
  pick(clientX, clientY, tolerancePx = 6) {
    const centers = this.asset?.resource?.centers;
    if (!this.splat || !centers) {
      return null;
    }
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cam = this.camera.camera;
    const near = new Vec3();
    const far = new Vec3();
    cam.screenToWorld(sx, sy, cam.nearClip, near);
    cam.screenToWorld(sx, sy, cam.farClip, far);

    // Ray in the splat's local coordinates
    const inv = new Mat4().copy(this.splat.getWorldTransform()).invert();
    const o = new Vec3();
    const f = new Vec3();
    inv.transformPoint(near, o);
    inv.transformPoint(far, f);
    const d = new Vec3().sub2(f, o).normalize();

    const tanTol = (tolerancePx / Math.max(1, rect.height / 2)) * Math.tan((cam.fov * Math.PI) / 360);
    const ts = [];
    const n = centers.length / 3;
    for (let i = 0; i < n; i++) {
      const vx = centers[i * 3] - o.x;
      const vy = centers[i * 3 + 1] - o.y;
      const vz = centers[i * 3 + 2] - o.z;
      const t = vx * d.x + vy * d.y + vz * d.z;
      if (t <= 0) {
        continue;
      }
      const perp2 = vx * vx + vy * vy + vz * vz - t * t;
      const tol = t * tanTol;
      if (perp2 < tol * tol) {
        ts.push(t);
      }
    }
    if (ts.length < 3) {
      return null;
    }
    ts.sort((a, b) => a - b);
    const k = Math.min(6, ts.length);
    const radius = this.bounds?.radius ?? 1;
    let t = ts[Math.floor(ts.length / 2)];
    for (let i = 0; i + k - 1 < ts.length; i++) {
      const window = ts[i] * 0.03 + radius * 0.005;
      if (ts[i + k - 1] - ts[i] < window) {
        t = ts[i + Math.floor(k / 2)];
        break;
      }
    }
    const local = [o.x + d.x * t, o.y + d.y * t, o.z + d.z * t];
    return { local, world: this.localToWorld(local) };
  }

  resize() {
    if (this.destroyed) {
      return;
    }
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth > 0 && clientHeight > 0) {
      this.app.resizeCanvas(clientWidth, clientHeight);
      this.requestRender();
    }
  }

  /**
   * Load a .ply or .sog file.
   * @param {string} url
   * @param {object} [callbacks]
   * @param {function} [callbacks.onProgress] (fraction 0..1 or -1 when unknown)
   * @returns {Promise<{format:string, count:number, size:number}>}
   */
  async load(url, callbacks = {}) {
    const onProgress = callbacks.onProgress ?? (() => {});
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.unloadSplat();

    const fetched = await fetchSplat(url, this.abortController.signal);
    if (!fetched.format) {
      throw Object.assign(new Error('Unsupported file format'), { code: 'unsupported' });
    }
    if (fetched.format === 'ply' && fetched.header && !fetched.header.ok) {
      throw Object.assign(new Error('PLY file has no Gaussian splat properties'), { code: 'notSplat' });
    }

    const asset = new Asset(`splat-${this.id}`, 'gsplat', {
      // Fake URL with the right extension selects the parser; data comes from `contents`
      url: `h5p-splat-${this.id}-${Date.now()}.${fetched.format}`,
      filename: `scene.${fetched.format}`,
      contents: fetched.response
    });
    asset.on('progress', (received, total) => {
      onProgress(total > 0 ? Math.min(1, received / total) : -1);
    });

    await new Promise((resolve, reject) => {
      asset.once('load', resolve);
      asset.once('error', (err) => reject(err instanceof Error ? err : new Error(String(err))));
      this.app.assets.add(asset);
      this.app.assets.load(asset);
    });

    if (this.destroyed) {
      return null;
    }

    this.asset = asset;
    this.splat = new Entity('splat');
    this.splat.addComponent('gsplat', { asset });
    this.app.root.addChild(this.splat);
    this.setOrientation(this.options.upAxis, this.options.rotation, false);

    this.computeBounds();
    this.requestRender(120);

    return {
      format: fetched.format,
      count: asset.resource?.numSplats ?? asset.resource?.gsplatData?.numSplats ?? fetched.header?.count ?? 0,
      size: fetched.size
    };
  }

  computeBounds() {
    const resource = this.asset?.resource;
    let bounds = null;
    try {
      const d = this.splat.getWorldTransform().data; // column-major
      bounds = robustBounds(resource?.centers, [d[0], d[4], d[8], d[1], d[5], d[9], d[2], d[6], d[10]]);
    }
    catch (e) {
      bounds = null;
    }
    if (!bounds && resource?.aabb) {
      const c = resource.aabb.center;
      const h = resource.aabb.halfExtents;
      bounds = { center: [c.x, c.y, c.z], radius: Math.hypot(h.x, h.y, h.z) };
    }
    this.bounds = bounds ?? { center: [0, 0, 0], radius: 1 };
    this.controls.setSceneRadius(this.bounds.radius);
  }

  /**
   * Default framing: look at the robust centre from slightly above.
   * @returns {object} View.
   */
  getDefaultView() {
    const { center, radius } = this.bounds ?? { center: [0, 0, 0], radius: 1 };
    const fov = (this.camera.camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 0.9;
    return { target: center.slice(), yaw: 0, pitch: -15, distance };
  }

  /**
   * @param {object|null} view Stored view, or null for default framing.
   * @param {boolean} [immediate=true]
   */
  setView(view, immediate = true) {
    const valid = view && Array.isArray(view.target) && view.target.length === 3 &&
      view.target.every(Number.isFinite) && Number.isFinite(view.distance);
    this.controls.setView(valid ? view : this.getDefaultView(), immediate);
    this.requestRender();
  }

  getView() {
    return this.controls.getView();
  }

  /**
   * Orient the splat: first bring the file's up axis to +Y, then apply an
   * extra rotation (degrees, around the world X, Y and Z axes).
   * @param {string} upAxis One of UP_AXIS_ROTATIONS keys.
   * @param {number[]} [rotation=[0,0,0]]
   * @param {boolean} [reframe=true] Recompute bounds and reset to default view.
   */
  setOrientation(upAxis, rotation = [0, 0, 0], reframe = true) {
    this.options.upAxis = UP_AXIS_ROTATIONS[upAxis] ? upAxis : '-y';
    this.options.rotation = [0, 1, 2].map((i) => Number(rotation?.[i]) || 0);
    if (this.splat) {
      const up = UP_AXIS_ROTATIONS[this.options.upAxis];
      const [rx, ry, rz] = this.options.rotation;
      const qUp = new Quat().setFromEulerAngles(up[0], up[1], up[2]);
      // Apply as world-axis rotations: first X, then Z (tilts), then Y (turn)
      const qx = new Quat().setFromEulerAngles(rx, 0, 0);
      const qy = new Quat().setFromEulerAngles(0, ry, 0);
      const qz = new Quat().setFromEulerAngles(0, 0, rz);
      const q = new Quat().mul2(qy, new Quat().mul2(qz, new Quat().mul2(qx, qUp)));
      this.splat.setLocalRotation(q);
      this.computeBounds();
      if (reframe) {
        this.setView(null);
      }
    }
    this.requestRender();
  }

  /** @param {string} mode 'orbit' or 'fly' */
  setMode(mode) {
    this.controls.setMode(mode);
  }

  /**
   * Turn the camera (on-screen buttons).
   * @param {number} yawDeg Positive turns left.
   * @param {number} pitchDeg Positive looks up.
   */
  turn(yawDeg, pitchDeg) {
    this.controls.turn((yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180);
  }

  /**
   * Zoom (orbit) or move forwards/backwards (fly).
   * @param {number} factor < 1 zooms in / moves forwards.
   */
  zoomBy(factor) {
    this.controls.zoom(factor);
  }

  get canZoom() {
    return this.controls.mode === 'fly' || !!this.controls.options.allowZoom;
  }

  get mode() {
    return this.controls.mode;
  }

  setAutoRotate(enabled) {
    if (enabled) {
      this.controls.setMode('orbit'); // auto-rotation orbits the scene
    }
    this.controls.autoRotate = !!enabled;
    this.requestRender();
  }

  get autoRotate() {
    return this.controls.autoRotate;
  }

  focus() {
    this.canvas.focus({ preventScroll: true });
  }

  unloadSplat() {
    if (this.splat) {
      this.splat.destroy();
      this.splat = null;
    }
    if (this.asset) {
      this.app.assets.remove(this.asset);
      this.asset.unload();
      this.asset = null;
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.abortController?.abort();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.controls.destroy();
    try {
      this.unloadSplat();
      this.app.destroy();
    }
    catch (e) {
      // Ignore errors during teardown
    }
    this.canvas.remove();
  }
}
