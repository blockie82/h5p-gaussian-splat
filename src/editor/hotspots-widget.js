import HotspotLayer from '../viewer/hotspot-layer.js';
import { ICONS } from '../viewer/icons.js';

const formatPosition = (p) => p.map((v) => Number(v.toPrecision(6))).join(' ');
const parsePosition = (text) => {
  const n = String(text ?? '').trim().split(/[\s,]+/).map(Number);
  return n.length === 3 && n.every(Number.isFinite) ? n : null;
};
const plainText = (html) => {
  const div = document.createElement('div');
  div.innerHTML = html ?? '';
  return (div.textContent ?? '').trim();
};

/**
 * Register the editor widget for the "hotspots" group. It renders the normal
 * H5P group/list, and adds:
 * - an "Add hotspot" button under the splat preview (click the scene to place),
 * - a "Place on scene" / "Move on scene" button in each hotspot,
 * - numbered markers in the preview (click one to jump to its settings).
 *
 * @param {function} t Translation function of the editor library.
 */
export const registerHotspotsWidget = (t) => {
  class HotspotsWidget {
    constructor(parent, field, params, setValue) {
      this.parent = parent;
      this.group = new H5PEditor.Group(parent, field, params, setValue);
      this.field = this.group.field;
      this.passReadies = true;
      this.decorated = new WeakSet();
    }

    get params() {
      return this.group.params;
    }

    get children() {
      return this.group.children;
    }

    appendTo($wrapper) {
      this.group.appendTo($wrapper);
      this.parent.ready(() => window.setTimeout(() => this.init(), 0));
    }

    init() {
      this.list = this.group.children?.find((child) => child.field?.name === 'hotspots');
      this.fileWidget = H5PEditor.findField('splat/file', this.parent);
      if (!this.list) {
        return;
      }

      this.list.on('addedItem', (event) => {
        this.decorate(event.data);
        this.refresh();
      });
      this.list.on('removedItem', () => this.refresh());
      this.list.on('movedItem', () => this.refresh());
      this.list.forEachChild((child) => this.decorate(child));

      // Titles changed: update marker labels
      this.group.$group?.get(0)?.addEventListener('input', () => {
        window.clearTimeout(this.inputTimer);
        this.inputTimer = window.setTimeout(() => this.refresh(), 300);
      });

      // "Add hotspot" button under the preview
      if (this.fileWidget?.getActions) {
        this.addButton = document.createElement('button');
        this.addButton.type = 'button';
        this.addButton.className = 'h5peditor-button h5peditor-button-textual h5peditor-gs-add-hotspot';
        this.addButton.innerHTML = `${ICONS.pin}<span>${t('addHotspot')}</span>`;
        this.addButton.addEventListener('click', () => this.addHotspot());
        this.fileWidget.getActions()?.prepend(this.addButton);

        this.fileWidget.onViewer((viewer) => {
          this.layer?.destroy();
          this.layer = null;
          if (viewer) {
            this.layer = new HotspotLayer(viewer, this.fileWidget.stage, {
              onActivate: (id) => this.focusItem(id)
            });
          }
          this.refresh();
        });
      }
      this.refresh();
    }

    getItems() {
      const items = [];
      this.list?.forEachChild((child, index) => items.push({ child, index }));
      return items;
    }

    /** Add the place/move button and status to a hotspot's settings. */
    decorate(child) {
      if (!child || this.decorated.has(child) || !child.$content) {
        return;
      }
      this.decorated.add(child);
      const tools = document.createElement('div');
      tools.className = 'h5peditor-gs-hotspot-tools';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h5peditor-button h5peditor-button-textual';
      const status = document.createElement('span');
      status.className = 'h5peditor-gs-hotspot-status';
      status.setAttribute('aria-live', 'polite');
      tools.append(button, status);
      child.$content.get(0).prepend(tools);
      child.gsTools = { button, status };

      button.addEventListener('click', () => {
        const index = this.getItems().find((item) => item.child === child)?.index ?? 0;
        const ok = this.fileWidget?.startPick({
          message: t('placeExisting', { ':num': index + 1 }),
          onPick: (local) => {
            this.setPosition(child, local);
            button.focus();
          }
        });
        if (!ok) {
          status.textContent = t('needPreview');
        }
      });
    }

    setPosition(child, local) {
      const value = formatPosition(local);
      const field = H5PEditor.findField('position', child);
      if (field && typeof field.setValue === 'function') {
        field.params = value;
        field.setValue(field.field, value);
      }
      if (child.params) {
        child.params.position = value;
      }
      this.refresh();
    }

    addHotspot() {
      const ok = this.fileWidget?.startPick({
        message: t('placeNew'),
        onPick: (local) => {
          if (!this.list.addItem({ position: formatPosition(local) })) {
            return; // maximum reached
          }
          const items = this.getItems();
          const last = items[items.length - 1];
          this.decorate(last?.child);
          this.refresh();
          this.focusItem(last.index);
        }
      });
      if (!ok) {
        this.showNotice(t('needPreview'));
      }
    }

    showNotice(text) {
      const actions = this.fileWidget?.getActions?.();
      const state = actions?.querySelector('.h5peditor-gs-view-state');
      if (state) {
        state.textContent = text;
      }
      else {
        window.alert(text); // eslint-disable-line no-alert
      }
    }

    /** Open a hotspot's settings and focus its title. */
    focusItem(index) {
      const item = this.getItems().find((i) => i.index === index);
      const child = item?.child;
      if (!child) {
        return;
      }
      // Open the Hotspots section as well as this hotspot
      if (!this.group.$group?.hasClass('expanded')) {
        this.group.expand?.();
      }
      child.expand?.();
      const element = child.$group?.get(0) ?? child.$content?.get(0);
      element?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const input = child.$content?.get(0)?.querySelector('.field-name-title input');
      window.setTimeout(() => input?.focus({ preventScroll: true }), 300);
    }

    refresh() {
      const items = this.getItems();
      const hotspots = [];
      items.forEach(({ child, index }) => {
        this.decorate(child);
        const position = parsePosition(child.params?.position);
        const label = plainText(child.params?.title) || t('hotspotFallback', { ':num': index + 1 });
        if (child.gsTools) {
          child.gsTools.button.innerHTML = `${ICONS.pin}<span>${t(position ? 'moveOnScene' : 'placeOnScene')}</span>`;
          child.gsTools.status.textContent = t(position ? 'hotspotPlaced' : 'hotspotNotPlaced');
          child.gsTools.status.classList.toggle('missing', !position);
        }
        if (position) {
          // Same numbering as the player: placed hotspots in list order
          hotspots.push({ id: index, number: hotspots.length + 1, position, label });
        }
      });
      this.layer?.setHotspots(hotspots);
    }

    validate() {
      return this.group.validate();
    }

    ready(callback) {
      this.group.ready(callback);
    }

    remove() {
      this.layer?.destroy();
      this.addButton?.remove();
      this.group.remove();
    }
  }

  H5PEditor.widgets.gaussianSplatHotspots = HotspotsWidget;
};
