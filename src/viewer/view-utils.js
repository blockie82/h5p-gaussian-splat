/**
 * Small helpers shared by the runtime and the editor. No PlayCanvas here,
 * so the editor widget stays small.
 */

/** Rotations (Euler degrees) that bring each source "up" axis to +Y. */
export const UP_AXIS_ROTATIONS = {
  '-y': [0, 0, 180], // Typical for 3DGS / COLMAP captures (Inria .ply)
  '+y': [0, 0, 0],
  '+z': [-90, 0, 0],
  '-z': [90, 0, 0]
};

export const SUPPORTED_EXTENSIONS = ['ply', 'sog'];

/**
 * Extension used when a platform's H5P file allow-list rejects .ply/.sog.
 * The viewer detects the real format from the file's first bytes.
 */
export const FALLBACK_EXTENSION = 'txt';


/**
 * Store a view as plain numbers: "x y z yaw pitch distance".
 * (H5P escapes quotes in text fields on save, so JSON would not survive.)
 * @param {object} view
 * @returns {string}
 */
export const serializeView = (view) =>
  [...view.target, view.yaw, view.pitch, view.distance].map((v) => Number(Number(v).toFixed(4))).join(' ');

/**
 * Read a stored view. Also accepts the older JSON format, including JSON
 * whose quotes were HTML-escaped by the H5P server.
 * @param {string} text
 * @returns {object|null}
 */
export const parseView = (text) => {
  const raw = String(text ?? '').trim();
  if (!raw) {
    return null;
  }
  if (raw.startsWith('{')) {
    try {
      const json = raw.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
      const view = JSON.parse(json);
      return Array.isArray(view?.target) ? view : null;
    }
    catch (e) {
      return null;
    }
  }
  const n = raw.split(/[\s,]+/).map(Number);
  if (n.length !== 6 || !n.every(Number.isFinite) || n[5] <= 0) {
    return null;
  }
  return { target: n.slice(0, 3), yaw: n[3], pitch: n[4], distance: n[5] };
};

/**
 * @returns {boolean} True if WebGL 2 is available.
 */
export const isWebGL2Available = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  }
  catch (e) {
    return false;
  }
};
