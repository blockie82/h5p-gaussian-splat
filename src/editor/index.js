import {
  isWebGL2Available, parseView, serializeView, viewToPose, poseToView, UP_AXIS_ROTATIONS, FALLBACK_EXTENSION
} from '../viewer/view-utils.js';
import { ICONS } from '../viewer/icons.js';
import { registerHotspotsWidget } from './hotspots-widget.js';
import '../viewer/viewer.css';
import './h5p-editor-gaussian-splat.css';

// URL of this script, used to find the preview bundle next to it
const SCRIPT_SRC = document.currentScript?.src ?? '';
const PREVIEW_FILE = 'h5p-editor-gaussian-splat-preview.js';
let previewPromise = null;

/* --- Remember per site whether .ply/.sog uploads are allowed --- */
const storageKey = (ext) => `h5p-gaussian-splat-upload-${ext}:${window.location.host}`;
const memoryAllowed = {};

/** @returns {boolean|null} null if unknown */
const recallExtensionAllowed = (ext) => {
  if (ext in memoryAllowed) {
    return memoryAllowed[ext];
  }
  try {
    const v = window.localStorage.getItem(storageKey(ext));
    return v === null ? null : v === '1';
  }
  catch (e) {
    return null;
  }
};

const rememberExtensionAllowed = (ext, allowed) => {
  memoryAllowed[ext] = allowed;
  try {
    window.localStorage.setItem(storageKey(ext), allowed ? '1' : '0');
  }
  catch (e) {
    // Storage unavailable: remember for this page only
  }
};

/**
 * Upload a tiny test file to see if the site accepts this extension.
 * @param {object} field Semantics of the file field.
 * @param {string} ext
 * @returns {Promise<boolean|null>} null if it could not be determined.
 */
const probeExtension = (field, ext) => new Promise((resolve) => {
  try {
    const uploader = new H5PEditor.FileUploader(field);
    uploader.on('uploadComplete', (event) => {
      const error = event.data?.error;
      if (!error) {
        resolve(true);
      }
      else {
        // Only treat it as "not allowed" for allow-list errors, not e.g. network problems
        resolve(/allowed|whitelist|file type/i.test(String(error)) ? false : null);
      }
    });
    uploader.upload(new Blob(['h5p-gaussian-splat upload check'], { type: 'application/octet-stream' }),
      `upload-check.${ext}`);
  }
  catch (e) {
    resolve(null);
  }
});

/**
 * Load the 3D preview (PlayCanvas) only when it is needed.
 * @returns {Promise<{SplatViewer: Function}>}
 */
const loadPreview = () => {
  if (window.H5PEditor?.GaussianSplatPreview) {
    return Promise.resolve(window.H5PEditor.GaussianSplatPreview);
  }
  if (!previewPromise) {
    previewPromise = new Promise((resolve, reject) => {
      const src = SCRIPT_SRC.replace(/h5p-editor-gaussian-splat\.js(?=[?#]|$)/, PREVIEW_FILE);
      if (!src || src === SCRIPT_SRC) {
        reject(new Error('Preview script location unknown'));
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => (window.H5PEditor?.GaussianSplatPreview ?
        resolve(window.H5PEditor.GaussianSplatPreview) : reject(new Error('Preview script did not load')));
      script.onerror = () => reject(new Error('Preview script could not be downloaded'));
      document.head.appendChild(script);
    });
    previewPromise.catch(() => {
      previewPromise = null; // allow a retry
    });
  }
  return previewPromise;
};

const LIBRARY = 'H5PEditor.GaussianSplat';
const LARGE_FILE_BYTES = 50 * 1024 * 1024;

const FALLBACK_STRINGS = {
  preview: 'Preview',
  previewHelp: 'Drag to rotate, right-drag or Shift-drag to pan, scroll to zoom. Click the preview and press W, A, S or D to fly (Q/E down/up, drag to look around, hold Shift to go faster). Keyboard: Tab to the preview, then use the arrow keys to turn and + / − to zoom. Then save the view learners will start from.',
  addHotspot: 'Add hotspot',
  placeNew: 'Click on the scene where the new hotspot should go, or aim the crosshair at it and press Enter.',
  placeExisting: 'Click on the scene to place hotspot :num, or aim the crosshair at it and press Enter.',
  pickMissed: 'There is no splat at that point. Click directly on the scene.',
  pickMissedCentre: 'There is no splat under the crosshair. Turn the view (arrow keys, or W, A, S, D) so the crosshair is on the scene.',
  placeAtCentre: 'Place at crosshair',
  cancel: 'Cancel',
  placeOnScene: 'Place on scene',
  moveOnScene: 'Move on scene',
  hotspotPlaced: 'Placed on the scene.',
  hotspotNotPlaced: 'Not placed yet: learners will not see it.',
  needPreview: 'Upload a splat file first: hotspots are placed by clicking on its preview.',
  hotspotFallback: 'Hotspot :num',
  flyMode: 'Fly mode',
  orbitMode: 'Orbit mode',
  setStartView: 'Use this view as the starting view',
  clearStartView: 'Use automatic starting view',
  startViewCustom: 'Starting view: custom',
  startViewAuto: 'Starting view: automatic (fits the whole scene)',
  startViewSaved: 'Starting view saved.',
  startViewCleared: 'Automatic starting view restored.',
  startViewResetOrientation: 'The orientation changed, so the starting view was reset.',
  startViewAdjusted: 'The starting view was turned with the scene.',
  loading: 'Loading preview…',
  loadingPercent: 'Loading preview… :percent %',
  preparing: 'Preparing preview…',
  fileInfo: ':format file, :count splats, :size',
  wrongExtension: 'The file \':name\' cannot be used. Please upload a Gaussian splat file with the extension .ply or .sog.',
  notSplat: 'The file was removed because it does not seem to contain Gaussian splat data (it has no scale, rotation and opacity properties). It may be an ordinary point cloud or mesh.',
  unsupported: 'The file was removed because it could not be recognised as a .ply or .sog Gaussian splat.',
  loadError: 'The preview could not be loaded. The file may be damaged. (:error)',
  largeFile: 'This .ply file is :size. Learners will need to download all of it before they see anything. Converting it to .sog usually makes it 10–20 times smaller, for example with the free command line tool: npx @playcanvas/splat-transform input.ply output.sog',
  uploadRejected: 'The upload was rejected, also when stored with a .txt extension. Check the error above (for example the maximum upload size).',
  storedAsFallback: 'This site does not allow .:ext uploads, so the file was stored with a .:fallback extension instead. It works the same way. (An administrator can add ply and sog to the H5P allowed file extensions to keep the original extension.)',
  noWebGL: 'This browser does not support WebGL 2, so no preview can be shown. The file has still been uploaded.'
};

const t = (key, vars) => {
  let text;
  try {
    text = H5PEditor.t(LIBRARY, key, vars);
  }
  catch (e) {
    text = undefined;
  }
  if (!text || text.indexOf('Missing translation') !== -1 || text.indexOf('[Missing') === 0) {
    text = FALLBACK_STRINGS[key] ?? key;
    for (const name of Object.keys(vars ?? {})) {
      text = text.split(name).join(vars[name]);
    }
  }
  return text;
};

const formatBytes = (bytes) => {
  if (!bytes) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

const extensionOf = (path) =>
  String(path ?? '').split('#')[0].split('?')[0].split('.').pop().toLowerCase();

/**
 * Editor widget for the Gaussian splat file field. Wraps the standard H5P
 * file field, restricts the file picker to .ply/.sog, validates uploads and
 * shows a live preview where the author can choose the starting view.
 */
export class GaussianSplatWidget {
  /**
   * @param {object} parent Parent field (group).
   * @param {object} field Semantics of the file field.
   * @param {object} params File params.
   * @param {function} setValue Callback to store params.
   */
  constructor(parent, field, params, setValue) {
    this.parent = parent;
    this.field = field;
    this.config = {
      fileTypeExtensions: ['ply', 'sog'],
      upAxisField: 'upAxis',
      orientationField: 'orientation',
      cameraViewField: 'cameraView',
      ...(field.gaussianSplat ?? {})
    };
    this.extensions = this.config.fileTypeExtensions.map((e) => e.toLowerCase());
    this.viewerListeners = new Set();
    this.actionsListeners = new Set();

    this.fileField = new H5PEditor.File(parent, field, params, setValue);
    this.changes = this.fileField.changes;
    this.passReadies = this.fileField.passReadies;

    // Restrict the file picker to splat files
    this.fileField.openFileSelector = () => this.openFileSelector();

    this.fileField.changes.push((file) => this.handleFileChanged(file));

    // Most H5P platforms don't allow .ply/.sog uploads until an administrator adds them
    // Most H5P platforms (e.g. Moodle) don't allow .ply/.sog uploads. If the
    // upload is rejected, retry once with an allowed extension; the viewer
    // detects the real format from the file contents.
    this.fileField.on('uploadComplete', (event) => {
      const pending = this.pendingUpload;
      if (!pending) {
        return;
      }
      if (event.data?.error && !pending.fallback) {
        rememberExtensionAllowed(extensionOf(pending.file.name), false);
        this.startUpload(pending.file, true);
        return;
      }
      if (!event.data?.error && !pending.fallback) {
        rememberExtensionAllowed(extensionOf(pending.file.name), true);
      }
      this.pendingUpload = null;
      if (event.data?.error) {
        this.clearMessages();
        this.showWarning(t('uploadRejected'));
      }
      else if (pending.fallback) {
        this.fallbackNotice = t('storedAsFallback', {
          ':ext': extensionOf(pending.file.name),
          ':fallback': FALLBACK_EXTENSION
        });
      }
    });

    this.orientationKey = JSON.stringify(this.getOrientation());

    // Note: H5PEditor.followField can't be used here: select widgets keep their
    // value in `value` (not `params`) and number widgets have no change hooks.
    parent.ready(() => {
      const upAxisField = H5PEditor.findField(this.config.upAxisField, parent);
      if (upAxisField?.changes) {
        upAxisField.changes.push(() => this.handleOrientationChanged());
      }
      ['tiltX', 'tiltZ', 'turnY'].forEach((name) => {
        const numberField = H5PEditor.findField(`${this.config.orientationField}/${name}`, parent);
        numberField?.$input?.on('change', () => this.handleOrientationChanged());
      });
    });
  }

  get params() {
    return this.fileField.params;
  }

  openFileSelector() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.extensions.map((e) => `.${e}`).join(',');
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        return;
      }
      if (!this.extensions.includes(extensionOf(file.name))) {
        this.showError(t('wrongExtension', { ':name': H5PEditor.htmlspecialchars?.(file.name) ?? file.name }));
        return;
      }
      this.clearMessages();
      this.uploadWithCheck(file);
    });
    document.body.appendChild(input);
    input.click();
  }

  /**
   * Upload a splat file, optionally under the fallback extension.
   * @param {File} file
   * @param {boolean} fallback
   */
  /**
   * Upload once, under a name the site accepts. The site's H5P allow-list
   * only rejects a file after receiving all of it, so check first with a
   * tiny test file (and remember the answer for this site).
   * @param {File} file
   */
  async uploadWithCheck(file) {
    const ext = extensionOf(file.name);
    let allowed = recallExtensionAllowed(ext);
    if (allowed === null) {
      this.fileField.$file?.html(`<div class="h5peditor-uploading h5p-throbber">${H5PEditor.t('core', 'uploading')}</div>`);
      allowed = await probeExtension(this.field, ext);
      if (allowed !== null) {
        rememberExtensionAllowed(ext, allowed);
      }
    }
    // If the check was inconclusive (e.g. a network or server hiccup), use the
    // .txt route, which every site accepts, instead of risking an error.
    this.startUpload(file, allowed !== true);
  }

  startUpload(file, fallback) {
    this.pendingUpload = { file, fallback };
    const name = fallback ? `${file.name}.${FALLBACK_EXTENSION}` : file.name;
    this.fileField.upload(file, name);
  }

  /**
   * Append the field to the editor form.
   * @param {H5P.jQuery} $wrapper
   */
  appendTo($wrapper) {
    this.fileField.appendTo($wrapper);
    const fileContainer = this.fileField.$file.get(0).closest('.field') ?? this.fileField.$file.get(0).parentNode;
    fileContainer.classList.add('h5peditor-gaussian-splat');

    this.messages = document.createElement('div');
    this.messages.className = 'h5peditor-gs-messages';
    this.messages.setAttribute('role', 'status');
    fileContainer.appendChild(this.messages);

    this.previewWrapper = document.createElement('div');
    this.previewWrapper.className = 'h5peditor-gs-preview h5p-gs-hidden';
    this.previewWrapper.innerHTML = `
      <div class="h5peditor-label">${t('preview')}</div>
      <div class="h5peditor-field-description">${t('previewHelp')}</div>
      <div class="h5peditor-gs-stage" style="position:relative;width:100%;max-width:48rem;aspect-ratio:16/9;overflow:hidden;background:#1e1f22;">
        <div class="h5peditor-gs-loading" role="status"></div>
      </div>
      <div class="h5peditor-gs-info"></div>
      <div class="h5peditor-gs-actions">
        <button type="button" class="h5peditor-button h5peditor-button-textual h5peditor-gs-set-view">${ICONS.camera}<span>${t('setStartView')}</span></button>
        <button type="button" class="h5peditor-button h5peditor-button-textual h5peditor-gs-clear-view">${t('clearStartView')}</button>
        <button type="button" class="h5peditor-button h5peditor-button-textual h5peditor-gs-mode">${ICONS.fly}<span>${t('flyMode')}</span></button>
        <span class="h5peditor-gs-view-state" aria-live="polite"></span>
      </div>`;
    fileContainer.appendChild(this.previewWrapper);

    this.stage = this.previewWrapper.querySelector('.h5peditor-gs-stage');
    this.loading = this.previewWrapper.querySelector('.h5peditor-gs-loading');
    this.info = this.previewWrapper.querySelector('.h5peditor-gs-info');
    this.viewState = this.previewWrapper.querySelector('.h5peditor-gs-view-state');
    this.previewWrapper.querySelector('.h5peditor-gs-set-view')
      .addEventListener('click', () => this.saveStartView());
    this.previewWrapper.querySelector('.h5peditor-gs-clear-view')
      .addEventListener('click', () => this.clearStartView());
    this.modeButton = this.previewWrapper.querySelector('.h5peditor-gs-mode');
    this.modeButton.addEventListener('click', () => {
      if (this.viewer) {
        this.viewer.setMode(this.viewer.mode === 'fly' ? 'orbit' : 'fly');
        this.viewer.focus();
      }
    });

    if (this.params?.path) {
      this.handleFileChanged(this.params, true);
    }
  }

  /**
   * @param {object|undefined} file File params (undefined when removed).
   * @param {boolean} [initial=false] True when called for existing content.
   */
  handleFileChanged(file, initial = false) {
    if (!this.previewWrapper) {
      return;
    }
    if (!initial) {
      this.clearMessages();
    }
    this.destroyViewer();

    if (!file?.path) {
      this.previewWrapper.classList.add('h5p-gs-hidden');
      return;
    }

    const ext = extensionOf(file.path);
    if (!this.extensions.includes(ext) && ext !== FALLBACK_EXTENSION) {
      // The server accepted a file type we cannot display: remove it again
      this.showError(t('wrongExtension', { ':name': file.path.split('/').pop().split('#')[0] }));
      this.removeFile();
      return;
    }

    if (!initial) {
      // A new file invalidates any saved starting view
      this.setCameraView('');
    }
    this.showPreview(file);
  }

  removeFile() {
    const fileField = this.fileField;
    delete fileField.params;
    fileField.setValue(fileField.field);
    // H5PEditor.File re-renders after the change callbacks have run
    setTimeout(() => fileField.addFile(), 0);
    this.previewWrapper.classList.add('h5p-gs-hidden');
  }

  /**
   * @param {object} file
   * @param {number} [attempt=0] Retries after a failed load (a just-uploaded
   *   file or the preview code can briefly be unavailable on some servers).
   */
  async showPreview(file, attempt = 0) {
    this.previewFile = file;
    this.previewWrapper.classList.remove('h5p-gs-hidden');
    this.updateViewState();

    if (!isWebGL2Available()) {
      this.showWarning(t('noWebGL'));
      this.stage.classList.add('h5p-gs-hidden');
      return;
    }
    this.stage.classList.remove('h5p-gs-hidden');

    const orientation = this.getOrientation();
    this.loading.textContent = t('loading');
    this.loading.classList.remove('h5p-gs-hidden');
    let SplatViewer;
    try {
      ({ SplatViewer } = await loadPreview());
    }
    catch (error) {
      if (attempt < 1 && this.previewFile === file) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (this.previewFile === file) {
          this.showPreview(file, attempt + 1);
        }
        return;
      }
      this.loading.classList.add('h5p-gs-hidden');
      this.showError(t('loadError', { ':error': String(error?.message ?? error) }));
      return;
    }
    if (this.previewFile !== file) {
      return; // file changed while the preview code was loading
    }

    const viewer = new SplatViewer(this.stage, {
      onModeChange: (mode) => this.updateModeButton(mode),
      upAxis: orientation.upAxis,
      rotation: orientation.rotation,
      canUseWheel: () => document.activeElement === viewer.canvas
    });
    this.viewer = viewer;
    this.stage.insertBefore(viewer.canvas, this.stage.firstChild);

    this.loading.textContent = t('loading');
    this.loading.classList.remove('h5p-gs-hidden');

    try {
      const url = H5P.getPath(file.path, H5PEditor.contentId);
      const result = await viewer.load(url, {
        onProgress: (fraction) => {
          this.loading.textContent = fraction >= 0 ?
            (fraction >= 1 ? t('preparing') : t('loadingPercent', { ':percent': Math.round(fraction * 100) })) :
            t('loading');
        }
      });
      if (viewer !== this.viewer || !result) {
        return;
      }
      viewer.setView(this.getCameraView());
      this.viewerListeners.forEach((fn) => fn(viewer));
      this.info.textContent = t('fileInfo', {
        ':format': result.format.toUpperCase(),
        ':count': Number(result.count).toLocaleString(),
        ':size': formatBytes(result.size)
      });
      if (this.fallbackNotice) {
        this.showInfo(this.fallbackNotice);
        this.fallbackNotice = null;
      }
      if (result.format === 'ply' && result.size > LARGE_FILE_BYTES) {
        this.showWarning(t('largeFile', { ':size': formatBytes(result.size) }));
      }
    }
    catch (error) {
      if (viewer !== this.viewer || error?.name === 'AbortError') {
        return;
      }
      if (error?.code === 'notSplat' || error?.code === 'unsupported') {
        this.showError(t(error.code));
        this.destroyViewer();
        this.removeFile();
        return;
      }
      this.destroyViewer();
      if (attempt < 1) {
        this.loading.textContent = t('loading');
        this.loading.classList.remove('h5p-gs-hidden');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (this.previewFile === file && !this.viewer) {
          this.showPreview(file, attempt + 1);
        }
        return;
      }
      this.showError(t('loadError', { ':error': H5PEditor.htmlspecialchars?.(String(error?.message ?? error)) ?? '' }));
      this.stage.classList.add('h5p-gs-hidden');
    }
    finally {
      if (viewer === this.viewer) {
        this.loading.classList.add('h5p-gs-hidden');
      }
    }
  }

  /**
   * @returns {{upAxis:string, rotation:number[]}} Orientation from the form.
   */
  getOrientation() {
    const params = this.parent.params ?? {};
    const upAxis = UP_AXIS_ROTATIONS[params[this.config.upAxisField]] ? params[this.config.upAxisField] : '-y';
    const o = params[this.config.orientationField] ?? {};
    return { upAxis, rotation: [Number(o.tiltX) || 0, Number(o.turnY) || 0, Number(o.tiltZ) || 0] };
  }

  handleOrientationChanged() {
    const orientation = this.getOrientation();
    const key = JSON.stringify(orientation);
    if (key === this.orientationKey) {
      return;
    }
    this.orientationKey = key;
    const saved = this.getCameraView();
    if (saved && this.viewer?.splat) {
      // Keep looking at the same part of the scene from the same spot: move
      // the saved camera along with the scene.
      const pose = viewToPose(saved);
      const position = this.viewer.worldToLocal(pose.position);
      const target = this.viewer.worldToLocal(pose.target);
      this.viewer.setOrientation(orientation.upAxis, orientation.rotation, false);
      const view = poseToView(this.viewer.localToWorld(position), this.viewer.localToWorld(target));
      this.setCameraView(serializeView(view));
      this.viewer.setView(view);
      this.updateViewState(t('startViewAdjusted'));
      return;
    }
    if (saved) {
      // No preview to convert it with: the old view would not fit any more
      this.setCameraView('');
      this.updateViewState(t('startViewResetOrientation'));
    }
    this.viewer?.setOrientation(orientation.upAxis, orientation.rotation, true);
  }

  updateModeButton(mode) {
    if (!this.modeButton) {
      return;
    }
    const fly = mode === 'fly';
    this.modeButton.innerHTML = `${fly ? ICONS.orbit : ICONS.fly}<span>${t(fly ? 'orbitMode' : 'flyMode')}</span>`;
  }

  saveStartView() {
    if (!this.viewer) {
      return;
    }
    this.setCameraView(serializeView(this.viewer.getView()));
    this.updateViewState(t('startViewSaved'));
  }

  clearStartView() {
    this.setCameraView('');
    this.viewer?.setView(null, false);
    this.updateViewState(t('startViewCleared'));
  }

  getCameraView() {
    return parseView(this.parent.params?.[this.config.cameraViewField]);
  }

  setCameraView(value) {
    const child = H5PEditor.findField(this.config.cameraViewField, this.parent);
    if (child && typeof child.setValue === 'function') {
      child.params = value || undefined;
      child.setValue(child.field, value || undefined);
    }
    else if (this.parent.params) {
      if (value) {
        this.parent.params[this.config.cameraViewField] = value;
      }
      else {
        delete this.parent.params[this.config.cameraViewField];
      }
    }
    this.updateViewState();
  }

  updateViewState(announcement) {
    if (!this.viewState) {
      return;
    }
    const state = this.getCameraView() ? t('startViewCustom') : t('startViewAuto');
    this.viewState.textContent = announcement ? `${announcement} ${state}` : state;
  }

  showError(html) {
    this.messages.insertAdjacentHTML('beforeend', `<p class="h5peditor-gs-error">${html}</p>`);
  }

  showInfo(html) {
    this.messages.insertAdjacentHTML('beforeend', `<p class="h5peditor-gs-info-message">${html}</p>`);
  }

  showWarning(html) {
    this.messages.insertAdjacentHTML('beforeend', `<p class="h5peditor-gs-warning">${html}</p>`);
  }

  clearMessages() {
    if (this.messages) {
      this.messages.innerHTML = '';
    }
  }

  /**
   * Get notified when the preview viewer is ready (with the viewer) or
   * removed (with null). Called immediately if a preview is showing.
   * @param {function} fn
   */
  onViewer(fn) {
    this.viewerListeners.add(fn);
    if (this.viewer?.splat) {
      fn(this.viewer);
    }
  }

  /** @returns {HTMLElement|null} The preview's button row. */
  getActions() {
    return this.previewWrapper?.querySelector('.h5peditor-gs-actions') ?? null;
  }

  /**
   * Let the author click a point on the preview.
   * @param {object} options
   * @param {string} options.message
   * @param {function} options.onPick Called with [x, y, z] in file coordinates.
   * @returns {boolean} False if there is no preview to click on.
   */
  startPick({ message, onPick }) {
    const viewer = this.viewer;
    if (!viewer?.splat) {
      return false;
    }
    this.cancelPick();
    this.previewWrapper.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const returnFocus = document.activeElement;
    const banner = document.createElement('div');
    banner.className = 'h5peditor-gs-pick-banner';
    banner.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = message;
    // Keyboard alternative to clicking: aim the crosshair, then place
    const centre = document.createElement('button');
    centre.type = 'button';
    centre.className = 'h5peditor-gs-pick-cancel h5peditor-gs-pick-centre';
    centre.textContent = t('placeAtCentre');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'h5peditor-gs-pick-cancel';
    cancel.textContent = t('cancel');
    cancel.addEventListener('click', () => {
      this.cancelPick();
      returnFocus?.focus?.();
    });
    banner.append(text, centre, cancel);
    const crosshair = document.createElement('div');
    crosshair.className = 'h5peditor-gs-crosshair';
    crosshair.setAttribute('aria-hidden', 'true');
    this.stage.append(crosshair, banner);
    this.stage.classList.add('picking');

    const placeAtCentre = () => {
      const rect = viewer.canvas.getBoundingClientRect();
      const hit = viewer.pick(rect.left + rect.width / 2, rect.top + rect.height / 2, 10);
      if (!hit) {
        text.textContent = t('pickMissedCentre');
        return;
      }
      this.cancelPick();
      onPick(hit.local);
    };
    centre.addEventListener('click', placeAtCentre);

    let down = null;
    const onDown = (event) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) {
        return; // that was a drag, not a click
      }
      const hit = viewer.pick(event.clientX, event.clientY);
      if (!hit) {
        text.textContent = t('pickMissed');
        return;
      }
      this.cancelPick();
      onPick(hit.local);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        const inStage = this.stage.contains(document.activeElement);
        this.cancelPick();
        if (inStage) {
          returnFocus?.focus?.();
        }
      }
    };
    const onCanvasKey = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        placeAtCentre();
      }
    };
    viewer.canvas.addEventListener('pointerdown', onDown);
    viewer.canvas.addEventListener('pointerup', onUp);
    document.addEventListener('keydown', onKey);
    viewer.canvas.addEventListener('keydown', onCanvasKey);
    // Keyboard users can aim straight away
    viewer.canvas.focus({ preventScroll: true });
    this.pickCleanup = () => {
      viewer.canvas.removeEventListener('keydown', onCanvasKey);
      crosshair.remove();
      viewer.canvas.removeEventListener('pointerdown', onDown);
      viewer.canvas.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onKey);
      banner.remove();
      this.stage.classList.remove('picking');
    };
    return true;
  }

  cancelPick() {
    this.pickCleanup?.();
    this.pickCleanup = null;
  }

  destroyViewer() {
    this.cancelPick();
    if (this.viewer) {
      this.viewerListeners.forEach((fn) => fn(null));
    }
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
    this.updateModeButton('orbit');
    if (this.info) {
      this.info.textContent = '';
    }
  }

  validate() {
    return this.fileField.validate();
  }

  ready(callback) {
    this.fileField.ready(callback);
  }

  remove() {
    this.destroyViewer();
    this.fileField.remove();
  }
}

H5PEditor.GaussianSplat = GaussianSplatWidget;
H5PEditor.widgets.gaussianSplat = GaussianSplatWidget;
registerHotspotsWidget(t);
