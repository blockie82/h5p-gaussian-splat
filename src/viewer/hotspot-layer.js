/**
 * Numbered hotspot markers drawn over the 3D scene. Each marker is a real
 * <button> (keyboard and screen reader friendly) that follows its 3D point.
 */
export default class HotspotLayer {
  /**
   * @param {SplatViewer} viewer
   * @param {HTMLElement} container Positioned element that holds the canvas.
   * @param {object} [options]
   * @param {function} [options.onActivate] Called with the hotspot id.
   * @param {string} [options.className]
   */
  constructor(viewer, container, options = {}) {
    this.viewer = viewer;
    this.options = { onActivate: () => {}, ...options };
    this.items = [];
    this.activeId = null;

    this.layer = document.createElement('div');
    this.layer.className = `h5p-gs-hotspot-layer ${this.options.className ?? ''}`;
    Object.assign(this.layer.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'hidden', zIndex: '2'
    });
    // Directly after the canvas, so markers come before the toolbar in tab order
    container.insertBefore(this.layer, viewer.canvas.nextSibling);

    this.unsubscribe = viewer.onFrame(() => this.update());
  }

  /**
   * @param {object[]} hotspots [{id, position:[x,y,z] (file coordinates), label}]
   */
  setHotspots(hotspots) {
    const valid = hotspots.filter((h) => Array.isArray(h.position) && h.position.length === 3 &&
      h.position.every(Number.isFinite));
    // Rebuild markers (lists are short)
    this.items.forEach((item) => item.button.remove());
    this.items = valid.map((hotspot, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h5p-gs-hotspot';
      button.textContent = String(hotspot.number ?? index + 1);
      button.setAttribute('aria-label', hotspot.label || `${index + 1}`);
      button.title = hotspot.label || '';
      Object.assign(button.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'auto' });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.options.onActivate(hotspot.id);
      });
      // Don't let pointer events reach the camera controls
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      this.layer.appendChild(button);
      return { ...hotspot, button, last: '' };
    });
    this.setActive(this.activeId);
    this.viewer.requestRender(2);
    this.update();
  }

  setActive(id) {
    this.activeId = id;
    this.items.forEach((item) => item.button.classList.toggle('active', item.id === id));
  }

  getButton(id) {
    return this.items.find((item) => item.id === id)?.button ?? null;
  }

  update() {
    if (!this.items.length || !this.viewer.splat) {
      return;
    }
    for (const item of this.items) {
      const screen = this.viewer.worldToScreen(this.viewer.localToWorld(item.position));
      const key = screen.onScreen ? `${Math.round(screen.x)},${Math.round(screen.y)}` : 'hidden';
      if (key === item.last) {
        continue;
      }
      item.last = key;
      if (screen.onScreen) {
        item.button.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -50%)`;
        item.button.style.visibility = 'visible';
      }
      else {
        item.button.style.visibility = 'hidden';
      }
    }
  }

  destroy() {
    this.unsubscribe?.();
    this.layer.remove();
  }
}
