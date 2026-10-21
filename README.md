# H5P Gaussian Splat

An H5P content type for 3D Gaussian splats, built along the same lines as
H5P.ThreeDModel (glTF). Authors upload a `.ply` or `.sog` splat, and learners
can orbit, pan and zoom around the scene. Rendering uses the
[PlayCanvas engine](https://github.com/playcanvas/engine) (MIT), which supports
both formats natively.

**Download:** get the latest `.h5p` files from the
[Releases page](https://github.com/blockie82/h5p-gaussian-splat/releases), then follow
[INSTALL.md](INSTALL.md). Upload `gaussian-splat-libraries.h5p` to your platform's H5P
content types page and *Gaussian Splat* appears in the H5P editor.

| Library | Purpose |
| --- | --- |
| `H5P.GaussianSplat 1.0` | Runtime viewer (runnable content type) |
| `H5PEditor.GaussianSplat 1.0` | Editor widget: file checks, live preview, starting view |
| `H5PEditor.ColorSelector 1.3` | H5P's own colour picker (vendored, MIT) |

## Features

**Learners**
- Drag to orbit. Right-drag or Shift-drag to pan. Pinch or scroll to zoom.
- The mouse wheel zooms only after the scene has been clicked (or with Ctrl held, or in full screen), so it doesn't take over page scrolling. A short hint appears if someone scrolls over the scene before clicking it.
- Two camera modes, like the SuperSplat viewer, switched with a toolbar button:
  - **Orbit**: drag rotates around the scene, right/Shift-drag pans, scroll/pinch zooms, arrow keys rotate.
  - **Fly**: drag looks around on the spot (drag right turns right), `W` `A` `S` `D` or the arrow keys move, `Q`/`E` move down/up, and scroll moves forwards/backwards. Movement eases in and out.
  - Pressing a movement key in orbit mode switches to fly. Hold **Shift** to move 4× faster; this also works if pressed mid-move. `Home` resets the view and mode.
  - Keys are matched by physical position, so AZERTY keyboards get ZQSD. Authors choose the *Starting camera mode* and can turn fly mode off.
- Toolbar with auto-rotate, reset view and full screen buttons.
- A progress bar while the file downloads, plus an optional poster image.
- An optional "load on click" mode for large files.
- An xAPI `interacted` statement on first interaction.
- Screen reader label (from the alternative text) and instructions. All UI strings can be translated.
- Rendering pauses when the scene is off-screen or has stopped moving, to save battery.

**Authors (editor widget)**
- The file picker is limited to `.ply` and `.sog`. Other extensions are rejected before upload.
- After upload the file is checked. A PLY without splat properties (an ordinary point cloud or mesh) is removed, with an explanation.
- Live preview showing the format, splat count and file size.
- A warning for `.ply` files over 50 MB, with the command to convert them to `.sog`.
- **Use this view as the starting view**: saves the camera from the preview. It's stored as plain numbers (`x y z yaw pitch distance`), because H5P escapes quotes in text fields when content is saved. Views saved as JSON by 1.0.0/1.0.1 are still read.
- **Up direction** (−Y is the default for 3DGS/COLMAP captures; +Y, +Z and −Z are also available) and **Fine-tune orientation** (tilt and turn in degrees) for scenes that look tilted. The preview updates live.
- If the platform rejects the upload, a hint explains that the administrator must allow the extensions.

**Hotspots**
- Numbered markers fixed to points in the scene. Clicking one opens a popup with any mix of **Text, Image, Video and Audio**, up to six items per hotspot and fifty hotspots. These are H5P's own content types, so you get their usual editors and players.
- **Editor:** *Add hotspot* under the preview, then click the scene. Each hotspot has *Place on scene / Move on scene*, and clicking a marker in the preview opens its settings.
- **Picking:** a ray through the click finds the first dense cluster of splats, so stray splats are ignored. Positions are stored in the file's own coordinates, so they stay put if you change the up direction or orientation.
- **Player:** media pauses when its popup closes. Esc closes a popup, focus returns to its marker, and markers pulse gently (unless reduced motion is on).
- **Hotspot list:** the toolbar has a list of all hotspots, which also reaches markers that are off-screen and turns the camera towards the chosen one.
- **Colour:** H5P blue (#2575BE) by default, changeable under Visual settings.
- **Requirements:** the site needs H5P.AdvancedText 1.1, H5P.Image 1.1, H5P.Video 1.6 and H5P.Audio 1.5. Sites with Interactive Book, Course Presentation and similar types already have them. The editor only offers the ones that are installed. The example package includes H5P.AdvancedText for its three text hotspots.

**Other settings:** background colour or image, aspect ratio, max width, min/max height, auto-rotate speed, and turning panning or zooming on or off.

## Sites that don't allow `ply` and `sog` (e.g. the Moodle sandbox)

The editor first sends a tiny test file to check whether the site accepts the
extension, and remembers the answer for that site. It then uploads the real
file once. If the extension isn't allowed, it uploads the file as `<name>.sog.txt` (`.txt` is on
every H5P allow-list) and tells the author. The viewer detects the real format
from the file's first bytes, so nothing else changes. The example package stores
its scene as `.txt` for the same reason. Allowing `ply sog` (below) is still the
cleaner set-up: files then keep their real extension.

## Allowing `ply` and `sog` (optional)

H5P checks every uploaded file against an extension allow-list. `gltf` and `glb`
are on the default list. **`ply` and `sog` are not.**

On Moodle (core H5P and mod_hvp) and WordPress, the list comes straight from
`H5PCore::$defaultContentWhitelist` in the bundled H5P PHP library. There is no
admin setting for it. Until it is changed:

- editor uploads fail with "File type isn't allowed", and
- `.h5p` packages that contain a splat are rejected.

Fix: add `ply sog` to that line in `h5p.classes.php`. A ready-made patch is in
`platform/h5p-php-library-allow-ply-sog.patch`. The file is at:

- Moodle core: `h5p/h5plib/v1XX/joubel/core/` (`public/h5p/...` in the newest versions)
- mod_hvp: `mod/hvp/library/`
- WordPress: `wp-content/plugins/h5p/h5p-php-library/`

Re-apply the patch after upgrades.

The long-term fix is to propose `ply sog` upstream to
[h5p/h5p-php-library](https://github.com/h5p/h5p-php-library), the way
`gltf glb` were added.

### Node.js platforms (Lumi `@lumieducation/h5p-server`)

These show the error as `not-in-whitelist`. The list is
`H5PConfig.contentWhitelist`, so add the extensions where the server sets up its
config (after `config.load()`, which would otherwise overwrite them with stored
values):

```js
const config = await new H5P.H5PConfig(keyValueStorage).load();
config.contentWhitelist += ' ply sog';
config.maxFileSize = 200 * 1024 * 1024;   // default 16 MB: limits files inside uploaded .h5p packages
config.maxTotalSize = 500 * 1024 * 1024;  // default 64 MB: limits whole .h5p packages
await config.save();                      // only if your setup persists config
```

Also check the upload size limit of your HTTP upload middleware, for example
`express-fileupload`'s `limits.fileSize`. Tested with h5p-server 10.0.4: a `.sog`
upload fails with `not-in-whitelist` by default and succeeds once the
extensions are added.

The libraries themselves contain only js/css/json/svg, so
`build/gaussian-splat-libraries.h5p` installs on any platform without the patch.

## Files to use

- `build/bovisands-gaussian-splat.h5p` contains the libraries plus an example:
  the cove at Bovisand Bay (15 MB `.sog`, stored as `.txt` so it uploads to any
  site). It starts in fly mode on a chosen view and has three text hotspots.
- `build/gaussian-splat-libraries.h5p` contains the libraries and an empty item.
  It installs anywhere.
- `demo/build-demo.py` builds a small content bank demo: the Bovisands splat
  next to an Accordion, Multiple Choice, True/False and an Image. It needs
  those H5P libraries unpacked in a folder you pass to it.

## Converting PLY to SOG

SOG is usually 15–25× smaller than PLY. A 113 MB `.ply` test scene became a
5.7 MB `.sog`.

```bash
npx @playcanvas/splat-transform input.ply output.sog          # keeps view-dependent colour (SH), uses GPU if available
npx @playcanvas/splat-transform input.ply -H 0 output.sog     # drops higher SH bands: much faster on CPU, smaller
```

Compressing the higher spherical-harmonic bands runs k-means. That is quick on
a GPU but can take a very long time on a CPU for scenes with hundreds of
thousands of splats. `-H 0` converts in seconds.

## Development

```bash
npm install
npm run build        # bundles src/ into libraries/*/dist and regenerates language/.en.json
npm run watch        # rebuild on change (unminified, with source maps)
npm run pack         # build + create build/bovisands-gaussian-splat.h5p from example/
node scripts/pack.mjs example-empty build/gaussian-splat-libraries.h5p
```

```
src/viewer/   shared PlayCanvas viewer, orbit controls, format sniffing (used by runtime and editor)
src/runtime/  H5P.GaussianSplat content type
src/editor/   H5PEditor.GaussianSplat widget (wraps H5PEditor.File). The 15 KB widget loads
              dist/h5p-editor-gaussian-splat-preview.js (PlayCanvas, 2 MB) only when a preview is shown
libraries/    the H5P library folders (library.json, semantics.json, language, built dist/)
vendor/       H5PEditor.ColorSelector-1.3
platform/     allow-list patch for the H5P PHP library
test/         test harnesses (see below)
```

### Tests that were run

The browser tests use Playwright (set `CHROMIUM_PATH` to use a specific Chromium) and serve `test/site/` on port 8765 (`python3 -m http.server 8765` inside `test/site`, with `h5p-dist` linked to `node_modules/h5p-standalone/dist` and an extracted `.h5p` in a `ws-*` folder).


- `test/interact.mjs`: runs the real H5P player (h5p-standalone) in headless
  Chromium and loads `.ply` and `.sog`. It checks orbit, zoom, the wheel hint,
  keyboard reset, auto-rotate and full screen.
- `test/editor-test.mjs` with `test/editor-server.mjs`: runs the real widgets
  from `h5p-editor-php-library` with this widget. It covers the extension
  check, rejecting a non-splat PLY, PLY and SOG previews, saving a starting
  view, and the view being reset when the orientation changes.
  `WHITELIST="json png" node test/editor-server.mjs` simulates an unpatched
  server.
- `test/controls-unit.mjs`: unit checks of the camera controller (fly look direction, Shift speed, mode switching).
- `test/moodle/install-libs.php`, `first-load.mjs` and `e2e.mjs`: run against a real Moodle 5.3 with PostgreSQL 17 and Moodle's default H5P allow-list. They install the libraries the way *Manage H5P content types* does, time the first editor load, then cover upload (with the `.txt` fallback), preview, saving a start view, saving the content, and playing it back.
- `test/moodle/hotspots-e2e.mjs` / `hotspots-av.mjs`: create Text, Image, Audio and Video hotspots in the Moodle content bank editor, save, open them in the player, and check that media pauses on close.
- `test/php/validate.php`: validates the built packages with the official
  `H5PValidator` from h5p-php-library.

## Not included (yet)

- Hiding hotspots behind the scene: markers stay visible when the camera looks at them through the splat.
- The unbundled SOG layout (`meta.json` + loose `.webp` files) and `.spz`,
  `.splat`, `.ksplat`. H5P stores one file per field, so bundled `.sog` is the
  right choice. PlayCanvas can read the others if needed.
- Use inside Course Presentation, Interactive Book, etc. Those content types
  must list `H5P.GaussianSplat 1.0` in their semantics before it can be added
  as sub-content.

Requires WebGL 2. A message is shown when it is unavailable.

## Licence

MIT, see [LICENSE](LICENSE). Third-party components are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The Bovisands example scene is
included as demo content.
