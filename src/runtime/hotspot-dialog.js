/**
 * Accessible popup panel for a hotspot. Lives inside the stage so it also
 * works in full screen. Sub-content (text, image, video, audio) is created
 * with H5P.newRunnable the first time a hotspot is opened, then reused.
 */
export default class HotspotDialog {
  /**
   * @param {HTMLElement} stage
   * @param {object} options
   * @param {string} options.closeLabel
   * @param {string} options.emptyText
   * @param {number} options.contentId
   * @param {object} options.parent H5P instance (for sub-content).
   * @param {function} [options.onClose] Called with the hotspot id.
   */
  constructor(stage, options) {
    this.options = options;
    this.cache = new Map(); // hotspot id -> {body, instances}
    this.openId = null;

    this.dom = document.createElement('div');
    this.dom.className = 'h5p-gs-dialog h5p-gs-hidden';
    this.dom.setAttribute('role', 'dialog');
    this.dom.setAttribute('aria-modal', 'false');

    this.header = document.createElement('div');
    this.header.className = 'h5p-gs-dialog-header';
    this.title = document.createElement('h2');
    this.title.className = 'h5p-gs-dialog-title';
    this.title.id = `h5p-gs-dialog-title-${Math.random().toString(36).slice(2)}`;
    this.dom.setAttribute('aria-labelledby', this.title.id);

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'h5p-gs-dialog-close';
    this.closeButton.setAttribute('aria-label', options.closeLabel);
    this.closeButton.title = options.closeLabel;
    this.closeButton.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    this.closeButton.addEventListener('click', () => this.close());

    this.header.append(this.title, this.closeButton);
    this.content = document.createElement('div');
    this.content.className = 'h5p-gs-dialog-content';
    this.dom.append(this.header, this.content);

    this.dom.addEventListener('keydown', (event) => this.handleKeyDown(event));
    // Keep pointer/wheel events away from the camera controls
    ['pointerdown', 'wheel', 'keydown'].forEach((type) => {
      this.dom.addEventListener(type, (event) => event.stopPropagation());
    });

    stage.appendChild(this.dom);
  }

  get isOpen() {
    return this.openId !== null;
  }

  /**
   * @param {object} hotspot {id, label, params:{content:[]}}
   * @param {HTMLElement} [returnFocus] Element to focus when closed.
   */
  open(hotspot, returnFocus) {
    if (this.openId !== null) {
      this.close(false);
    }
    this.openId = hotspot.id;
    this.returnFocus = returnFocus;
    this.title.textContent = hotspot.label;

    let entry = this.cache.get(hotspot.id);
    if (!entry) {
      entry = this.build(hotspot);
      this.cache.set(hotspot.id, entry);
    }
    this.content.replaceChildren(entry.body);
    this.dom.classList.remove('h5p-gs-hidden');
    this.content.scrollTop = 0;

    // Let sub-content (images, video) size itself now that it is visible
    window.requestAnimationFrame(() => {
      entry.instances.forEach((instance) => instance?.trigger?.('resize'));
    });
    this.closeButton.focus({ preventScroll: true });
  }

  build(hotspot) {
    const body = document.createElement('div');
    body.className = 'h5p-gs-dialog-body';
    const items = (hotspot.params?.content ?? []).filter((item) => item?.library);
    const instances = [];
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'h5p-gs-dialog-empty';
      p.textContent = this.options.emptyText;
      body.appendChild(p);
    }
    items.forEach((item) => {
      const wrapper = document.createElement('div');
      const machineName = item.library.split(' ')[0];
      wrapper.className = `h5p-gs-dialog-item h5p-gs-item-${machineName.replace(/\W+/g, '-').toLowerCase()}`;
      body.appendChild(wrapper);
      try {
        instances.push(H5P.newRunnable(item, this.options.contentId, H5P.jQuery(wrapper), false,
          { parent: this.options.parent }));
      }
      catch (error) {
        console.warn('H5P.GaussianSplat: could not create hotspot content', error);
      }
    });
    return { body, instances };
  }

  /**
   * @param {boolean} [restoreFocus=true]
   */
  close(restoreFocus = true) {
    if (this.openId === null) {
      return;
    }
    const entry = this.cache.get(this.openId);
    // Stop any playing media
    entry?.instances.forEach((instance) => {
      try {
        instance?.pause?.();
        instance?.stop?.();
      }
      catch (e) {
        // ignore
      }
    });
    entry?.body.querySelectorAll('video, audio').forEach((media) => media.pause());

    const id = this.openId;
    this.openId = null;
    this.dom.classList.add('h5p-gs-hidden');
    if (restoreFocus && this.returnFocus?.isConnected) {
      this.returnFocus.focus({ preventScroll: true });
    }
    this.options.onClose?.(id);
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
  }

  /** Copyright info for all sub-content (opened or not). */
  getInstances() {
    return [...this.cache.values()].flatMap((entry) => entry.instances);
  }
}
