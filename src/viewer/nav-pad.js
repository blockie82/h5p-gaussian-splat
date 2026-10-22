/**
 * On-screen navigation buttons: a single-pointer alternative to dragging,
 * pinching and the keyboard (WCAG 2.5.1 Pointer Gestures, 2.5.7 Dragging
 * Movements). Tap for one step, press and hold to keep moving.
 */

const ARROW = (rotate) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="transform:rotate(${rotate}deg)">` +
  '<path d="M12 6l-7 8h14z" fill="currentColor"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor"/></svg>';
const MINUS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M5 11h14v2H5z" fill="currentColor"/></svg>';

const TURN_STEP = 15; // degrees per tap / key press
const TURN_RATE = 60; // degrees per second while held
const ZOOM_STEP = 0.8; // factor per tap
const ZOOM_RATE = 0.4; // factor per second while held
const HOLD_DELAY = 350; // ms before a press starts repeating

export default class NavPad {
  /**
   * @param {SplatViewer} viewer
   * @param {HTMLElement} container Element to add the pad to.
   * @param {object} labels { group, turnLeft, turnRight, lookUp, lookDown, zoomIn, zoomOut, moveForward, moveBackward }
   * @param {object} [options]
   * @param {function} [options.onUse] Called when a button is used.
   * @param {HTMLElement} [options.before] Insert the pad before this element.
   */
  constructor(viewer, container, labels, options = {}) {
    this.viewer = viewer;
    this.labels = labels;
    this.onUse = options.onUse ?? (() => {});
    this.hold = null;

    this.dom = document.createElement('div');
    this.dom.className = 'h5p-gs-navpad';
    this.dom.setAttribute('role', 'group');
    this.dom.setAttribute('aria-label', labels.group);

    const turn = (yaw, pitch) => (scale) => this.viewer.turn(yaw * scale, pitch * scale);
    const zoom = (dir) => (scale, held) => {
      const factor = held ? Math.pow(ZOOM_RATE, scale) : ZOOM_STEP;
      this.viewer.zoomBy(dir > 0 ? factor : 1 / factor);
    };

    this.buttons = {
      up: this.addButton('up', ARROW(0), labels.lookUp, turn(0, 1)),
      left: this.addButton('left', ARROW(-90), labels.turnLeft, turn(1, 0)),
      right: this.addButton('right', ARROW(90), labels.turnRight, turn(-1, 0)),
      down: this.addButton('down', ARROW(180), labels.lookDown, turn(0, -1)),
      in: this.addButton('in', PLUS, labels.zoomIn, zoom(1)),
      out: this.addButton('out', MINUS, labels.zoomOut, zoom(-1))
    };

    // Optionally before another element, to keep a sensible Tab order
    container.insertBefore(this.dom, options.before ?? null);
    this.update();
  }

  /**
   * @param {string} name
   * @param {string} icon
   * @param {string} label
   * @param {function(number, boolean)} action Called with a scale (degrees
   *   factor for turning, seconds for zooming) and whether the button is held.
   */
  addButton(name, icon, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `h5p-gs-navpad-button h5p-gs-navpad-${name}`;
    button.innerHTML = icon;
    this.setLabel(button, label);

    const step = () => action(name === 'in' || name === 'out' ? 1 : TURN_STEP, false);

    // Keyboard activation (Enter / Space) gives a single step
    button.addEventListener('click', (event) => {
      if (event.detail === 0) {
        step();
        this.onUse();
      }
    });
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      event.preventDefault(); // no text selection / focus loss on long press
      this.stopHold();
      step();
      this.onUse();
      try {
        button.setPointerCapture(event.pointerId);
      }
      catch (e) {
        // ignore: synthetic events have no active pointer
      }
      this.startHold(button, action, name);
    });
    const stop = () => this.stopHold();
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
    button.addEventListener('contextmenu', (event) => event.preventDefault());

    this.dom.appendChild(button);
    return button;
  }

  startHold(button, action, name) {
    const isZoom = name === 'in' || name === 'out';
    // A timer rather than requestAnimationFrame, so slow frames don't slow
    // the movement down; the viewer renders on its own loop.
    const hold = { button, interval: 0, last: 0 };
    const tick = () => {
      if (this.hold !== hold) {
        return;
      }
      const now = performance.now();
      const dt = Math.min((now - hold.last) / 1000, 0.25);
      hold.last = now;
      if (dt > 0) {
        action(isZoom ? dt : TURN_RATE * dt, true);
      }
    };
    hold.timer = window.setTimeout(() => {
      hold.last = performance.now();
      hold.interval = window.setInterval(tick, 30);
    }, HOLD_DELAY);
    this.hold = hold;
  }

  stopHold() {
    if (!this.hold) {
      return;
    }
    window.clearTimeout(this.hold.timer);
    window.clearInterval(this.hold.interval);
    this.hold = null;
  }

  setLabel(button, label) {
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  /** Update labels and availability for the current camera mode. */
  update() {
    const fly = this.viewer.mode === 'fly';
    const l = this.labels;
    this.setLabel(this.buttons.in, fly ? l.moveForward : l.zoomIn);
    this.setLabel(this.buttons.out, fly ? l.moveBackward : l.zoomOut);
    const canZoom = this.viewer.canZoom;
    this.buttons.in.hidden = !canZoom;
    this.buttons.out.hidden = !canZoom;
  }

  setVisible(visible) {
    this.dom.hidden = !visible;
    if (!visible) {
      this.stopHold();
    }
  }

  get visible() {
    return !this.dom.hidden;
  }

  destroy() {
    this.stopHold();
    this.dom.remove();
  }
}
