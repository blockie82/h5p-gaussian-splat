/**
 * Camera controller with two modes, modelled on the SuperSplat viewer:
 *
 * - orbit: drag rotates the camera around a target point, right/Shift-drag
 *   pans, wheel/pinch zooms towards the target, arrow keys orbit.
 * - fly:   drag turns the camera on the spot (mouse look), W/A/S/D and the
 *   arrow keys move, Q/E move down/up, wheel/pinch moves forwards/backwards.
 *
 * Pressing a movement key in orbit mode switches to fly mode. Shift moves
 * 4x faster. Both modes share one representation (target, yaw, pitch,
 * distance), so switching keeps the current view.
 *
 * Independent of PlayCanvas so it can be unit tested.
 */

const DEG = Math.PI / 180;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const MAX_PITCH = 89 * DEG;

/** Exponential damping like SuperSplat: fraction to move this frame. */
const damp = (damping, dt) => 1 - Math.pow(damping, dt * 1000);

const MOVE_KEYS = {
  KeyW: [0, 0, 1],
  KeyS: [0, 0, -1],
  KeyA: [-1, 0, 0],
  KeyD: [1, 0, 0],
  KeyQ: [0, -1, 0],
  KeyE: [0, 1, 0]
};
const ARROW_MOVE_KEYS = {
  ArrowUp: [0, 0, 1],
  ArrowDown: [0, 0, -1],
  ArrowLeft: [-1, 0, 0],
  ArrowRight: [1, 0, 0]
};

export default class OrbitControls {
  /**
   * @param {HTMLElement} element Element receiving pointer and key events.
   * @param {object} [options]
   * @param {string} [options.mode='orbit'] 'orbit' or 'fly'.
   * @param {boolean} [options.allowPan=true]
   * @param {boolean} [options.allowZoom=true]
   * @param {boolean} [options.allowMove=true] Fly mode and WASD movement.
   * @param {function} [options.onChange] Called when the user changes the view.
   * @param {function} [options.onInteract] Called on first real interaction.
   * @param {function} [options.onModeChange] Called with the new mode.
   * @param {function} [options.onWheelBlocked] Called when wheel was ignored.
   * @param {function} [options.canUseWheel] Return true if wheel may be used.
   */
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      mode: 'orbit',
      allowPan: true,
      allowZoom: true,
      allowMove: true,
      onChange: () => {},
      onInteract: () => {},
      onModeChange: () => {},
      onWheelBlocked: () => {},
      canUseWheel: () => true,
      ...options
    };
    this.mode = this.options.mode === 'fly' && this.options.allowMove ? 'fly' : 'orbit';

    // Goal state
    this.target = [0, 0, 0];
    this.yaw = 0; // radians, around world up
    this.pitch = -15 * DEG; // radians, negative looks down
    this.distance = 5;

    // Smoothed state
    this.current = { target: [0, 0, 0], yaw: 0, pitch: this.pitch, distance: 5 };

    this.minDistance = 0.01;
    this.maxDistance = 1000;
    this.sceneRadius = 1;
    this.damping = 0.18; // fraction of remaining distance travelled per 1/60 s

    this.autoRotate = false;
    this.autoRotateSpeed = 10 * DEG; // radians per second

    // Fly movement (speeds in scene radii per second, like SuperSplat's m/s)
    this.moveSpeed = 0.5;
    this.fastMultiplier = 4;
    this.lookSpeed = 0.15 * DEG; // radians per pixel in fly mode
    this.velocity = [0, 0, 0]; // camera-relative [right, up, forward]

    this.pointers = new Map();
    this.keysDown = new Set(); // physical key codes held for movement
    this.shiftDown = false;
    this.lastPinch = null;
    this.interacted = false;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.releaseKeys = () => {
      this.keysDown.clear();
      this.shiftDown = false;
    };
    this.handleContextMenu = (e) => e.preventDefault();

    element.addEventListener('pointerdown', this.handlePointerDown);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerup', this.handlePointerUp);
    element.addEventListener('pointercancel', this.handlePointerUp);
    element.addEventListener('wheel', this.handleWheel, { passive: false });
    element.addEventListener('keydown', this.handleKeyDown);
    element.addEventListener('keyup', this.handleKeyUp);
    element.addEventListener('blur', this.releaseKeys);
    window.addEventListener('blur', this.releaseKeys);
    element.addEventListener('contextmenu', this.handleContextMenu);
    element.style.touchAction = 'none';
  }

  destroy() {
    const el = this.element;
    el.removeEventListener('pointerdown', this.handlePointerDown);
    el.removeEventListener('pointermove', this.handlePointerMove);
    el.removeEventListener('pointerup', this.handlePointerUp);
    el.removeEventListener('pointercancel', this.handlePointerUp);
    el.removeEventListener('wheel', this.handleWheel);
    el.removeEventListener('keydown', this.handleKeyDown);
    el.removeEventListener('keyup', this.handleKeyUp);
    el.removeEventListener('blur', this.releaseKeys);
    window.removeEventListener('blur', this.releaseKeys);
    el.removeEventListener('contextmenu', this.handleContextMenu);
  }

  /**
   * Switch between 'orbit' and 'fly'. The view itself does not change.
   * @param {string} mode
   */
  setMode(mode) {
    const next = mode === 'fly' && this.options.allowMove ? 'fly' : 'orbit';
    if (next === this.mode) {
      return;
    }
    this.mode = next;
    this.velocity = [0, 0, 0];
    if (next === 'orbit') {
      // Orbit around a point a sensible distance in front of the camera
      const position = this.goalPosition();
      this.distance = clamp(this.distance, this.sceneRadius * 0.1, this.maxDistance);
      const dir = this.direction(this.yaw, this.pitch);
      this.target = position.map((v, i) => v - dir[i] * this.distance);
      this.snapKeepingPose();
    }
    this.options.onModeChange(this.mode);
    this.options.onChange();
  }

  /**
   * Set view. Missing fields keep their current value.
   * @param {object} view {target:[x,y,z], yaw, pitch, distance} (angles in degrees)
   * @param {boolean} [immediate=false] Skip smoothing.
   */
  setView(view, immediate = false) {
    if (view.target) {
      this.target = view.target.slice(0, 3).map(Number);
    }
    if (typeof view.yaw === 'number') {
      this.yaw = view.yaw * DEG;
    }
    if (typeof view.pitch === 'number') {
      this.pitch = clamp(view.pitch * DEG, -MAX_PITCH, MAX_PITCH);
    }
    if (typeof view.distance === 'number') {
      this.distance = clamp(view.distance, this.minDistance, this.maxDistance);
    }
    this.velocity = [0, 0, 0];
    if (immediate) {
      this.snap();
    }
    this.options.onChange();
  }

  /**
   * @returns {object} View with angles in degrees, rounded for storage.
   */
  getView() {
    const r = (v, d = 4) => Number(v.toFixed(d));
    return {
      target: this.target.map((v) => r(v)),
      yaw: r(((this.yaw / DEG) % 360 + 360) % 360, 2),
      pitch: r(this.pitch / DEG, 2),
      distance: r(this.distance)
    };
  }

  snap() {
    this.current.target = this.target.slice();
    this.current.yaw = this.yaw;
    this.current.pitch = this.pitch;
    this.current.distance = this.distance;
  }

  /** Re-derive the smoothed target so the smoothed camera position is unchanged. */
  snapKeepingPose() {
    const c = this.current;
    const position = this.positionOf(c.target, c.yaw, c.pitch, c.distance);
    c.distance = this.distance;
    const dir = this.direction(c.yaw, c.pitch);
    c.target = position.map((v, i) => v - dir[i] * c.distance);
  }

  /**
   * Set limits relative to scene size.
   * @param {number} radius Approximate scene radius.
   */
  setSceneRadius(radius) {
    this.sceneRadius = Math.max(radius, 1e-4);
    this.minDistance = this.sceneRadius * 0.02;
    this.maxDistance = this.sceneRadius * 20;
  }

  /* --- Geometry helpers --- */

  /** Unit vector from the target to the camera. */
  direction(yaw, pitch) {
    const cp = Math.cos(pitch);
    return [Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp];
  }

  positionOf(target, yaw, pitch, distance) {
    const dir = this.direction(yaw, pitch);
    return target.map((v, i) => v + dir[i] * distance);
  }

  goalPosition() {
    return this.positionOf(this.target, this.yaw, this.pitch, this.distance);
  }

  /** Camera basis: forward (view direction), right and up. */
  basis(yaw, pitch) {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    return {
      forward: [-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp],
      right: [Math.cos(yaw), 0, -Math.sin(yaw)],
      up: [Math.sin(yaw) * sp, cp, Math.cos(yaw) * sp]
    };
  }

  /** Move camera and target together (no smoothing lag). */
  translate(offset) {
    for (let i = 0; i < 3; i++) {
      this.target[i] += offset[i];
      this.current.target[i] += offset[i];
    }
  }

  /**
   * Advance smoothing.
   * @param {number} dt Seconds since last frame.
   * @returns {boolean} True if the view is still moving.
   */
  update(dt) {
    const rotating = this.autoRotate && this.mode === 'orbit' && this.pointers.size === 0;
    if (rotating) {
      this.yaw += this.autoRotateSpeed * dt;
    }

    const moved = this.applyKeyboardMovement(dt);

    const k = 1 - Math.pow(1 - this.damping, dt * 60);
    const c = this.current;
    let moving = false;
    const lerp = (a, b) => {
      const v = a + (b - a) * k;
      if (Math.abs(b - v) > 1e-6 * Math.max(1, Math.abs(b))) {
        moving = true;
        return v;
      }
      return b;
    };

    if (this.mode === 'fly') {
      // Smooth the camera position and angles, then derive the target, so
      // looking around turns the camera on the spot.
      const goalPos = this.goalPosition();
      const pos = this.positionOf(c.target, c.yaw, c.pitch, c.distance);
      const newPos = pos.map((v, i) => lerp(v, goalPos[i]));
      c.yaw = lerp(c.yaw, this.yaw);
      c.pitch = lerp(c.pitch, this.pitch);
      c.distance = this.distance;
      const dir = this.direction(c.yaw, c.pitch);
      c.target = newPos.map((v, i) => v - dir[i] * c.distance);
    }
    else {
      c.yaw = lerp(c.yaw, this.yaw);
      c.pitch = lerp(c.pitch, this.pitch);
      c.distance = lerp(c.distance, this.distance);
      c.target = c.target.map((v, i) => lerp(v, this.target[i]));
    }
    return moving || moved || rotating;
  }

  /**
   * SuperSplat-style keyboard flying with smooth acceleration.
   * @param {number} dt Seconds.
   * @returns {boolean} True if the view moved.
   */
  applyKeyboardMovement(dt) {
    if (!this.options.allowMove) {
      return false;
    }
    const keys = this.mode === 'fly' ? { ...MOVE_KEYS, ...ARROW_MOVE_KEYS } : MOVE_KEYS;
    const axis = [0, 0, 0];
    this.keysDown.forEach((code) => {
      const a = keys[code];
      if (a) {
        axis[0] += a[0];
        axis[1] += a[1];
        axis[2] += a[2];
      }
    });
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    const speed = this.sceneRadius * this.moveSpeed * (this.shiftDown ? this.fastMultiplier : 1);
    const desired = len > 0 ? axis.map((v) => (v / len) * speed) : [0, 0, 0];

    const accelerating = Math.hypot(...desired) > Math.hypot(...this.velocity);
    const t = damp(accelerating ? 0.992 : 0.993, dt);
    this.velocity = this.velocity.map((v, i) => v + (desired[i] - v) * t);
    if (len === 0 && Math.hypot(...this.velocity) < speed * 0.005) {
      this.velocity = [0, 0, 0];
      return false;
    }

    const { forward, right } = this.basis(this.current.yaw, this.current.pitch);
    const [vr, vu, vf] = this.velocity;
    this.translate([0, 1, 2].map((i) => (right[i] * vr + forward[i] * vf + (i === 1 ? vu : 0)) * dt));
    this.changed();
    return true;
  }

  /**
   * @returns {{position:number[], target:number[]}} Smoothed camera pose.
   */
  getPose() {
    const { yaw, pitch, distance, target } = this.current;
    return {
      position: this.positionOf(target, yaw, pitch, distance),
      target: target.slice()
    };
  }

  /* --- Interaction primitives --- */

  /** Drag: orbit around the target, or look around in fly mode. */
  rotate(dxPixels, dyPixels) {
    if (this.mode === 'fly') {
      const position = this.goalPosition();
      this.yaw -= dxPixels * this.lookSpeed;
      this.pitch = clamp(this.pitch - dyPixels * this.lookSpeed, -MAX_PITCH, MAX_PITCH);
      const dir = this.direction(this.yaw, this.pitch);
      this.target = position.map((v, i) => v - dir[i] * this.distance);
    }
    else {
      const h = this.element.clientHeight || 400;
      const speed = Math.PI / h; // half turn per element height
      this.yaw -= dxPixels * speed;
      this.pitch = clamp(this.pitch - dyPixels * speed, -MAX_PITCH, MAX_PITCH);
    }
    this.changed();
  }

  /**
   * Turn by angles (on-screen buttons). Positive yaw turns left, positive
   * pitch looks up; matches dragging and the arrow keys.
   * @param {number} dYaw Radians.
   * @param {number} dPitch Radians.
   */
  turn(dYaw, dPitch) {
    if (this.mode === 'fly') {
      const position = this.goalPosition();
      this.yaw += dYaw;
      this.pitch = clamp(this.pitch + dPitch, -MAX_PITCH, MAX_PITCH);
      const dir = this.direction(this.yaw, this.pitch);
      this.target = position.map((v, i) => v - dir[i] * this.distance);
    }
    else {
      this.yaw += dYaw;
      this.pitch = clamp(this.pitch + dPitch, -MAX_PITCH, MAX_PITCH);
    }
    this.changed();
  }

  pan(dxPixels, dyPixels) {
    if (!this.options.allowPan) {
      return;
    }
    const h = this.element.clientHeight || 400;
    // World units per pixel at target distance for a ~60° vertical FOV
    const scale = (2 * this.distance * Math.tan(30 * DEG)) / h;
    const { right, up } = this.basis(this.yaw, this.pitch);
    for (let i = 0; i < 3; i++) {
      this.target[i] += (-dxPixels * right[i] + dyPixels * up[i]) * scale;
    }
    this.changed();
  }

  /**
   * Zoom (orbit) or move forwards/backwards (fly).
   * @param {number} factor < 1 zooms in / moves forwards.
   */
  zoom(factor) {
    if (!this.options.allowZoom && this.mode === 'orbit') {
      return;
    }
    if (this.mode === 'fly') {
      const { forward } = this.basis(this.yaw, this.pitch);
      const step = -Math.log(factor) * this.sceneRadius * 0.6;
      this.target = this.target.map((v, i) => v + forward[i] * step);
    }
    else {
      this.distance = clamp(this.distance * factor, this.minDistance, this.maxDistance);
    }
    this.changed();
  }

  changed() {
    if (!this.interacted) {
      this.interacted = true;
      this.options.onInteract();
    }
    this.options.onChange();
  }

  /* --- Event handlers --- */

  handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button > 2) {
      return;
    }
    this.element.focus({ preventScroll: true });
    this.element.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      pan: event.button === 1 || event.button === 2 || event.shiftKey || event.ctrlKey || event.metaKey
    });
    this.lastPinch = null;
  }

  handlePointerMove(event) {
    const p = this.pointers.get(event.pointerId);
    if (!p) {
      return;
    }
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;

    if (this.pointers.size === 1) {
      p.x = event.clientX;
      p.y = event.clientY;
      if (p.pan) {
        this.pan(dx, dy);
      }
      else {
        this.rotate(dx, dy);
      }
      return;
    }

    // Two (or more) pointers: pinch zoom and pan using the first two
    p.x = event.clientX;
    p.y = event.clientY;
    const [a, b] = [...this.pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (this.lastPinch) {
      if (dist > 0 && this.lastPinch.dist > 0) {
        this.zoom(this.lastPinch.dist / dist);
      }
      this.pan(mid.x - this.lastPinch.mid.x, mid.y - this.lastPinch.mid.y);
    }
    this.lastPinch = { mid, dist };
  }

  handlePointerUp(event) {
    this.pointers.delete(event.pointerId);
    this.lastPinch = null;
  }

  handleWheel(event) {
    if (!this.options.allowZoom && this.mode === 'orbit') {
      return;
    }
    if (!event.ctrlKey && !this.options.canUseWheel()) {
      this.options.onWheelBlocked();
      return; // Let the page scroll
    }
    event.preventDefault();
    let delta = event.deltaY;
    if (event.deltaMode === 1) {
      delta *= 16;
    }
    else if (event.deltaMode === 2) {
      delta *= 400;
    }
    this.zoom(Math.exp(clamp(delta, -200, 200) * 0.0015));
  }

  handleKeyUp(event) {
    if (event.key === 'Shift') {
      this.shiftDown = false;
    }
    this.keysDown.delete(event.code);
  }

  handleKeyDown(event) {
    if (event.key === 'Shift') {
      this.shiftDown = true;
      return;
    }
    this.shiftDown = event.shiftKey;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const isMoveKey = MOVE_KEYS[event.code] || (this.mode === 'fly' && ARROW_MOVE_KEYS[event.code]);
    if (isMoveKey && this.options.allowMove) {
      if (this.mode === 'orbit') {
        this.setMode('fly');
      }
      this.keysDown.add(event.code);
      event.preventDefault();
      this.changed();
      return;
    }

    // Orbit-mode keyboard navigation
    const step = event.shiftKey ? 40 : 0;
    const orbitStep = 25;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':
        step ? this.pan(-step, 0) : this.rotate(-orbitStep, 0);
        break;
      case 'ArrowRight':
        step ? this.pan(step, 0) : this.rotate(orbitStep, 0);
        break;
      case 'ArrowUp':
        step ? this.pan(0, -step) : this.rotate(0, -orbitStep);
        break;
      case 'ArrowDown':
        step ? this.pan(0, step) : this.rotate(0, orbitStep);
        break;
      case '+':
      case '=':
      case 'PageUp':
        this.zoom(0.85);
        break;
      case '-':
      case '_':
      case 'PageDown':
        this.zoom(1 / 0.85);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
    }
  }
}
