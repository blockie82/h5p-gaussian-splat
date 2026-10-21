/**
 * The 3D preview for the editor, in its own file so the (large) PlayCanvas
 * engine is only downloaded when a preview is actually shown.
 */
import SplatViewer from '../viewer/splat-viewer.js';
import '../viewer/viewer.css';

window.H5PEditor = window.H5PEditor || {};
window.H5PEditor.GaussianSplatPreview = { SplatViewer };
