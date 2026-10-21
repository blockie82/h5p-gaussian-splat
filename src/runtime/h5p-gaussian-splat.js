import SplatViewer, { isWebGL2Available, parseView, SUPPORTED_EXTENSIONS, FALLBACK_EXTENSION } from '../viewer/splat-viewer.js';
import { ICONS } from '../viewer/icons.js';
import HotspotLayer from '../viewer/hotspot-layer.js';
import HotspotDialog from './hotspot-dialog.js';
import '../viewer/viewer.css';
import './h5p-gaussian-splat.css';

const DEFAULTS = {
  splat: { upAxis: '-y', orientation: { tiltX: 0, tiltZ: 0, turnY: 0 }, cameraView: '', alt: '' },
  behaviour: {
    loadOn: 'auto',
    autoRotate: false,
    autoRotateSpeed: 10,
    allowPan: true,
    allowZoom: true,
    allowMove: true,
    startMode: 'orbit'
  },
  hotspots: { hotspots: [] },
  visuals: { backgroundColor: 'rgba(30, 31, 34, 1)', hotspotColor: 'rgba(37, 117, 190, 1)' },
  size: { aspectRatio: '16:9' },
  l10n: {
    noSplat: 'Could not load a Gaussian splat. Did someone forget to upload one?',
    loading: 'Loading 3D scene…',
    preparing: 'Preparing 3D scene…',
    loadButton: 'Load 3D scene',
    loadError: 'The 3D scene could not be loaded.',
    unsupportedFormat: 'This file is not a supported Gaussian splat. Please use a .ply or .sog file.',
    notSplat: 'This PLY file does not contain Gaussian splat data.',
    noWebGL: 'Your browser does not support WebGL 2, which is needed to display this 3D scene.',
    wheelHint: 'Click the scene or hold Ctrl to zoom with the mouse wheel',
    noHotspotContent: 'This hotspot has no content yet.'
  },
  a11y: {
    sceneLabel: '3D Gaussian splat scene',
    interactionPrompt: 'Orbit mode: drag to rotate, right-drag or Shift-drag to pan, scroll or pinch to zoom, arrow keys rotate. Pressing W, A, S or D switches to fly mode: W, A, S, D and the arrow keys move, Q and E move down and up, drag to look around, scroll to move forwards or backwards. Hold Shift to move faster. Home resets the view.',
    buttonFullscreenEnter: 'Enter full screen mode',
    buttonFullscreenExit: 'Exit full screen mode',
    buttonResetView: 'Reset view',
    buttonAutoRotateStart: 'Start auto-rotation',
    buttonAutoRotateStop: 'Stop auto-rotation',
    buttonFlyMode: 'Switch to fly mode (W, A, S, D to move, drag to look around)',
    buttonOrbitMode: 'Switch to orbit mode (drag to rotate around the scene)',
    buttonClose: 'Close',
    buttonHotspots: 'List of hotspots',
    hotspotLabel: 'Hotspot :num'
  }
};

/** "x y z" (file coordinates) -> [x, y, z] or null */
const parsePosition = (text) => {
  const n = String(text ?? '').trim().split(/[\s,]+/).map(Number);
  return n.length === 3 && n.every(Number.isFinite) ? n : null;
};

const merge = (defaults, params) => {
  const out = { ...defaults };
  for (const key of Object.keys(params ?? {})) {
    const value = params[key];
    if (value && typeof value === 'object' && !Array.isArray(value) &&
      defaults[key] && typeof defaults[key] === 'object') {
      out[key] = merge(defaults[key], value);
    }
    else if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return out;
};

/** Strip HTML that H5P may have encoded into text fields. */
const decode = (html) => {
  const div = document.createElement('div');
  div.innerHTML = html ?? '';
  return div.textContent ?? '';
};

const parseAspect = (text) => {
  const m = String(text ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/i);
  if (m && Number(m[1]) > 0 && Number(m[2]) > 0) {
    return `${m[1]} / ${m[2]}`;
  }
  const n = Number(text);
  return n > 0 ? String(n) : '16 / 9';
};

/** Only allow plain CSS lengths for user-provided sizes. */
const cssLength = (value) => {
  const v = String(value ?? '').trim();
  return /^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/.test(v) ? v : '';
};

let idCounter = 0;

export default class GaussianSplat extends H5P.EventDispatcher {
  /**
   * @param {object} params Parameters from semantics.
   * @param {number} contentId Content id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super();
    this.params = merge(DEFAULTS, params);
    this.contentId = contentId;
    this.extras = extras;
    this.uid = `h5p-gaussian-splat-${++idCounter}`;
    this.viewer = null;
    this.loaded = false;
    this.interacted = false;

    const { hotspots, a11y } = this.params;
    this.hotspots = (Array.isArray(hotspots.hotspots) ? hotspots.hotspots : [])
      .map((h, i) => ({
        id: i,
        number: i + 1,
        position: parsePosition(h?.position),
        label: decode(h?.title) || decode(a11y.hotspotLabel).replace(':num', i + 1),
        params: h
      }))
      .filter((h) => h.position);
    this.hotspots.forEach((h, i) => {
      h.number = i + 1;
    });

    this.buildDOM();

    this.on('resize', () => this.viewer?.resize());
    this.on('enterFullScreen', () => this.handleFullscreenChange(true));
    this.on('exitFullScreen', () => this.handleFullscreenChange(false));
  }

  buildDOM() {
    const { visuals, size, a11y, l10n, splat } = this.params;

    this.dom = document.createElement('div');
    this.dom.className = 'h5p-gaussian-splat';

    const maxWidth = cssLength(size.maxWidth);
    if (maxWidth) {
      this.dom.style.setProperty('--h5p-gs-max-width', maxWidth);
    }

    this.stage = document.createElement('div');
    this.stage.className = 'h5p-gs-stage';
    this.stage.style.aspectRatio = parseAspect(size.aspectRatio);
    const minHeight = cssLength(size.minHeight);
    const maxHeight = cssLength(size.maxHeight);
    if (minHeight) {
      this.stage.style.minHeight = minHeight;
    }
    if (maxHeight) {
      this.stage.style.maxHeight = maxHeight;
    }
    this.stage.style.backgroundColor = visuals.backgroundColor;
    // 1.0.7 used red as the default; content saved with that default gets H5P blue
    const hotspotColor = visuals.hotspotColor === 'rgba(214, 47, 75, 1)' ?
      DEFAULTS.visuals.hotspotColor : visuals.hotspotColor;
    if (hotspotColor) {
      this.stage.style.setProperty('--h5p-gs-hotspot-color', hotspotColor);
    }
    if (visuals.backgroundImage?.path) {
      this.stage.style.backgroundImage =
        `url("${H5P.getPath(visuals.backgroundImage.path, this.contentId)}")`;
      this.stage.classList.add('has-background-image');
    }
    this.dom.appendChild(this.stage);

    // Instructions for assistive technologies
    this.instructions = document.createElement('p');
    this.instructions.className = 'h5p-gs-visually-hidden';
    this.instructions.id = `${this.uid}-instructions`;
    this.instructions.textContent = decode(a11y.interactionPrompt);
    this.dom.appendChild(this.instructions);

    // Poster / click-to-load
    this.poster = document.createElement('div');
    this.poster.className = 'h5p-gs-poster';
    if (visuals.poster?.path) {
      const img = document.createElement('img');
      img.src = H5P.getPath(visuals.poster.path, this.contentId);
      img.alt = '';
      this.poster.appendChild(img);
    }
    this.stage.appendChild(this.poster);

    // Progress
    this.progress = document.createElement('div');
    this.progress.className = 'h5p-gs-progress h5p-gs-hidden';
    this.progress.setAttribute('role', 'progressbar');
    this.progress.setAttribute('aria-label', decode(l10n.loading));
    this.progress.setAttribute('aria-valuemin', '0');
    this.progress.setAttribute('aria-valuemax', '100');
    this.progress.innerHTML =
      `<div class="h5p-gs-progress-label">${l10n.loading}</div>` +
      '<div class="h5p-gs-progress-track"><div class="h5p-gs-progress-bar"></div></div>';
    this.progressBar = this.progress.querySelector('.h5p-gs-progress-bar');
    this.stage.appendChild(this.progress);

    // Wheel hint
    this.hint = document.createElement('div');
    this.hint.className = 'h5p-gs-hint';
    this.hint.setAttribute('aria-hidden', 'true');
    this.hint.textContent = decode(l10n.wheelHint);
    this.stage.appendChild(this.hint);

    // Message area
    this.message = document.createElement('div');
    this.message.className = 'h5p-gs-message h5p-gs-hidden';
    this.message.setAttribute('role', 'alert');
    this.stage.appendChild(this.message);

    // Toolbar
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'h5p-gs-toolbar h5p-gs-hidden';
    this.stage.appendChild(this.toolbar);

    if (this.hotspots.length) {
      this.buttonHotspots = this.createButton('list', a11y.buttonHotspots, () => this.toggleHotspotMenu());
      this.buttonHotspots.setAttribute('aria-haspopup', 'true');
      this.buttonHotspots.setAttribute('aria-expanded', 'false');
      this.buildHotspotMenu();
    }
    if (this.params.behaviour.allowMove) {
      this.buttonMode = this.createButton('fly', a11y.buttonFlyMode, () => {
        this.viewer?.setMode(this.viewer.mode === 'fly' ? 'orbit' : 'fly');
        this.viewer?.focus();
      });
    }
    this.buttonAutoRotate = this.createButton('rotateStart', a11y.buttonAutoRotateStart, () => {
      this.viewer?.setAutoRotate(!this.viewer.autoRotate);
      this.updateAutoRotateButton();
    });
    this.buttonReset = this.createButton('reset', a11y.buttonResetView, () => this.resetView());
    if (H5P.fullscreenSupported !== false && H5P.fullScreen) {
      this.buttonFullscreen = this.createButton('fullscreenEnter', a11y.buttonFullscreenEnter, () => {
        this.toggleFullscreen();
      });
    }

    if (!splat.file?.path) {
      this.showMessage(l10n.noSplat);
      return;
    }

    const ext = splat.file.path.split('#')[0].split('?')[0].split('.').pop().toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext) && ext !== FALLBACK_EXTENSION) {
      this.showMessage(l10n.unsupportedFormat);
      return;
    }

    if (this.params.behaviour.loadOn === 'click') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h5p-gs-load-button';
      button.innerHTML = `${ICONS.play}<span>${l10n.loadButton}</span>`;
      button.addEventListener('click', () => {
        button.remove();
        this.start();
      });
      this.poster.appendChild(button);
    }
  }

  createButton(icon, label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h5p-gs-button';
    button.innerHTML = ICONS[icon];
    this.setButtonLabel(button, label);
    button.addEventListener('click', onClick);
    this.toolbar.appendChild(button);
    return button;
  }

  setButtonLabel(button, label) {
    const text = decode(label);
    button.setAttribute('aria-label', text);
    button.title = text;
  }

  /**
   * Attach library to wrapper.
   * @param {H5P.jQuery} $wrapper Content's container.
   */
  attach($wrapper) {
    this.$wrapper = $wrapper;
    $wrapper.get(0).classList.add('h5p-gaussian-splat-wrapper');
    $wrapper.get(0).appendChild(this.dom);

    if (this.params.splat.file?.path && this.params.behaviour.loadOn !== 'click' && !this.viewer &&
      this.message.classList.contains('h5p-gs-hidden')) {
      // Wait until the content is actually laid out before creating a GL context
      window.requestAnimationFrame(() => this.start());
    }
    this.trigger('resize');
  }

  async start() {
    const { l10n, a11y, splat, behaviour } = this.params;
    if (this.viewer) {
      return;
    }
    if (!isWebGL2Available()) {
      this.showMessage(l10n.noWebGL);
      return;
    }

    const alt = decode(splat.alt) || decode(a11y.sceneLabel);
    this.viewer = new SplatViewer(this.stage, {
      upAxis: splat.upAxis,
      rotation: [splat.orientation.tiltX, splat.orientation.turnY, splat.orientation.tiltZ],
      allowPan: behaviour.allowPan,
      allowZoom: behaviour.allowZoom,
      allowMove: behaviour.allowMove,
      mode: behaviour.startMode,
      onModeChange: () => {
        this.updateModeButton();
        this.updateAutoRotateButton();
      },
      autoRotate: behaviour.autoRotate && behaviour.startMode !== 'fly',
      autoRotateSpeed: Number(behaviour.autoRotateSpeed) || 10,
      ariaLabel: alt,
      canUseWheel: () => this.isFullscreen() || document.activeElement === this.viewer?.canvas,
      onWheelBlocked: () => this.flashHint(),
      onInteract: () => this.handleInteraction()
    });
    // Keep overlays above the canvas
    this.stage.insertBefore(this.viewer.canvas, this.stage.firstChild);
    this.viewer.canvas.setAttribute('aria-describedby', this.instructions.id);
    this.viewer.canvas.addEventListener('keydown', (event) => {
      if (event.key === 'Home' || event.key === '0') {
        event.preventDefault();
        this.resetView();
      }
    });

    this.setProgress(0);
    this.progress.classList.remove('h5p-gs-hidden');

    try {
      await this.viewer.load(H5P.getPath(splat.file.path, this.contentId), {
        onProgress: (fraction) => this.setProgress(fraction)
      });
      this.loaded = true;
      this.viewer.setView(parseView(splat.cameraView));
      this.poster.classList.add('h5p-gs-hidden');
      this.toolbar.classList.remove('h5p-gs-hidden');
      this.updateAutoRotateButton();
      this.updateModeButton();
      this.setupHotspots();
      this.trigger('loaded');
    }
    catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.warn('H5P.GaussianSplat:', error);
      const text = error?.code === 'unsupported' ? l10n.unsupportedFormat :
        error?.code === 'notSplat' ? l10n.notSplat : l10n.loadError;
      this.showMessage(text);
      this.viewer.destroy();
      this.viewer = null;
    }
    finally {
      this.progress.classList.add('h5p-gs-hidden');
      this.trigger('resize');
    }
  }

  setupHotspots() {
    if (!this.hotspots.length) {
      return;
    }
    this.hotspotLayer = new HotspotLayer(this.viewer, this.stage, {
      onActivate: (id) => this.openHotspot(id)
    });
    this.hotspotLayer.setHotspots(this.hotspots);
    this.dialog = new HotspotDialog(this.stage, {
      closeLabel: decode(this.params.a11y.buttonClose),
      emptyText: decode(this.params.l10n.noHotspotContent),
      contentId: this.contentId,
      parent: this,
      onClose: () => this.hotspotLayer.setActive(null)
    });
  }

  /**
   * @param {number} id
   * @param {boolean} [lookAt=false] Turn the camera towards the hotspot.
   */
  openHotspot(id, lookAt = false) {
    const hotspot = this.hotspots.find((h) => h.id === id);
    if (!hotspot || !this.dialog) {
      return;
    }
    if (this.dialog.openId === id) {
      this.dialog.close();
      return;
    }
    if (lookAt) {
      this.lookAtHotspot(hotspot);
    }
    this.hotspotLayer.setActive(id);
    this.dialog.open(hotspot, this.hotspotLayer.getButton(id) ?? this.viewer.canvas);
    this.handleInteraction();
  }

  lookAtHotspot(hotspot) {
    const world = this.viewer.localToWorld(hotspot.position);
    const view = this.viewer.getView();
    this.viewer.setMode('orbit');
    const radius = this.viewer.bounds?.radius ?? 1;
    this.viewer.setView({ ...view, target: world, distance: Math.min(view.distance, radius * 0.8) }, false);
  }

  buildHotspotMenu() {
    this.hotspotMenu = document.createElement('ul');
    this.hotspotMenu.className = 'h5p-gs-hotspot-menu h5p-gs-hidden';
    this.hotspotMenu.setAttribute('aria-label', decode(this.params.a11y.buttonHotspots));
    this.hotspots.forEach((hotspot) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = '<span class="h5p-gs-hotspot-menu-number"></span><span class="h5p-gs-hotspot-menu-label"></span>';
      button.firstChild.textContent = String(hotspot.number);
      button.lastChild.textContent = hotspot.label;
      button.addEventListener('click', () => {
        this.toggleHotspotMenu(false);
        this.openHotspot(hotspot.id, true);
      });
      li.appendChild(button);
      this.hotspotMenu.appendChild(li);
    });
    this.hotspotMenu.addEventListener('keydown', (event) => {
      event.stopPropagation();
      const items = [...this.hotspotMenu.querySelectorAll('button')];
      const index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        this.toggleHotspotMenu(false);
        this.buttonHotspots.focus();
      }
      else if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(index + 1) % items.length].focus();
      }
      else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      }
    });
    this.stage.appendChild(this.hotspotMenu);
  }

  toggleHotspotMenu(force) {
    const open = force ?? this.hotspotMenu.classList.contains('h5p-gs-hidden');
    this.hotspotMenu.classList.toggle('h5p-gs-hidden', !open);
    this.buttonHotspots.setAttribute('aria-expanded', String(open));
    if (open) {
      this.hotspotMenu.querySelector('button')?.focus();
    }
  }

  setProgress(fraction) {
    // Once downloaded, the scene still has to be decoded and prepared
    const preparing = fraction >= 1;
    if (preparing !== this.preparing) {
      this.preparing = preparing;
      this.progress.querySelector('.h5p-gs-progress-label').textContent =
        decode(preparing ? this.params.l10n.preparing : this.params.l10n.loading);
    }
    const indeterminate = fraction < 0 || preparing;
    this.progress.classList.toggle('indeterminate', indeterminate);
    if (!indeterminate) {
      const percent = Math.round(fraction * 100);
      this.progressBar.style.width = `${percent}%`;
      this.progress.setAttribute('aria-valuenow', String(percent));
    }
  }

  showMessage(text) {
    this.message.textContent = decode(text);
    this.message.classList.remove('h5p-gs-hidden');
    this.poster.classList.add('h5p-gs-hidden');
  }

  flashHint() {
    this.hint.classList.add('visible');
    clearTimeout(this.hintTimeout);
    this.hintTimeout = setTimeout(() => this.hint.classList.remove('visible'), 1500);
  }

  handleInteraction() {
    if (this.interacted) {
      return;
    }
    this.interacted = true;
    this.hint.classList.remove('visible');
    this.triggerXAPI('interacted');
  }

  resetView() {
    this.viewer?.setMode(this.params.behaviour.startMode);
    this.viewer?.setView(parseView(this.params.splat.cameraView), false);
  }

  updateModeButton() {
    if (!this.buttonMode || !this.viewer) {
      return;
    }
    const fly = this.viewer.mode === 'fly';
    // The button shows the mode you switch to
    this.buttonMode.innerHTML = fly ? ICONS.orbit : ICONS.fly;
    this.setButtonLabel(this.buttonMode, fly ? this.params.a11y.buttonOrbitMode : this.params.a11y.buttonFlyMode);
  }

  updateAutoRotateButton() {
    const on = !!this.viewer?.autoRotate;
    this.buttonAutoRotate.innerHTML = on ? ICONS.rotateStop : ICONS.rotateStart;
    this.buttonAutoRotate.setAttribute('aria-pressed', String(on));
    this.setButtonLabel(this.buttonAutoRotate,
      on ? this.params.a11y.buttonAutoRotateStop : this.params.a11y.buttonAutoRotateStart);
  }

  isFullscreen() {
    return !!H5P.isFullscreen;
  }

  toggleFullscreen() {
    if (!this.$wrapper) {
      return;
    }
    if (H5P.isFullscreen) {
      H5P.exitFullScreen();
    }
    else {
      H5P.fullScreen(this.$wrapper, this);
    }
  }

  handleFullscreenChange(isFullscreen) {
    this.dom.classList.toggle('h5p-gs-fullscreen', isFullscreen);
    if (this.buttonFullscreen) {
      this.buttonFullscreen.innerHTML = isFullscreen ? ICONS.fullscreenExit : ICONS.fullscreenEnter;
      this.setButtonLabel(this.buttonFullscreen, isFullscreen ?
        this.params.a11y.buttonFullscreenExit : this.params.a11y.buttonFullscreenEnter);
    }
    window.requestAnimationFrame(() => this.viewer?.resize());
  }

  /**
   * Title for H5P metadata / reporting.
   * @returns {string}
   */
  getTitle() {
    return H5P.createTitle(this.extras?.metadata?.title || 'Gaussian Splat');
  }

  /**
   * Copyright information for the H5P "Rights of use" dialog.
   * @returns {H5P.ContentCopyrights}
   */
  getCopyrights() {
    const info = new H5P.ContentCopyrights();
    const add = (file) => {
      if (file?.copyright) {
        info.addMedia(new H5P.MediaCopyright(file.copyright));
      }
    };
    add(this.params.splat.file);
    add(this.params.visuals.backgroundImage);
    add(this.params.visuals.poster);
    try {
      H5P.findCopyrights(info, this.params.hotspots, this.contentId);
    }
    catch (e) {
      // Copyright info for hotspot content is optional
    }
    return info;
  }
}
