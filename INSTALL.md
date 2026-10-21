# Installing H5P Gaussian Splat 1.0.9

## What's in this release

| Folder | File | What it's for |
| --- | --- | --- |
| `1-content-type/` | `gaussian-splat-libraries.h5p` | Installs the Gaussian Splat content type. **Start here.** |
| `2-example/` | `bovisands-gaussian-splat.h5p` | One ready-made example: the cove at Bovisand Bay with three hotspots. It also installs the content type. |
| `3-content-bank-demo/` | 5 × `.h5p` | A small demo set: the Bovisands splat next to an Accordion, Multiple Choice, True/False and an Image. |
| `platform/` | `h5p-php-library-allow-ply-sog.patch` | Optional server change so `.ply`/`.sog` keep their real extension (see step 4). |
| `source/` | `h5p-gaussian-splat-source.zip` | Full source, build scripts and tests. |

Requirements: H5P core API 1.19 or newer (Moodle 3.9+, mod_hvp, WordPress, Drupal, Lumi). Learners need a browser with WebGL 2, which all current desktop and mobile browsers have.

## 1. Install the content type

**Moodle** (built-in H5P, 3.9 and later):
1. Go to *Site administration → H5P → Manage H5P content types*.
2. Upload `1-content-type/gaussian-splat-libraries.h5p`.
3. Go to *Site administration → Development → Purge caches* (purge all caches).

**Moodle with the Interactive Content plugin (mod_hvp):** go to *Site administration → Plugins → Activity modules → Interactive Content → Content types* and upload the same file.

**WordPress (H5P plugin):** go to *H5P Content → Libraries* and upload the same file.

**Other platforms:** use the platform's "upload libraries / content types" page, or upload `2-example/bovisands-gaussian-splat.h5p` as content, which installs the libraries too.

Gaussian Splat then appears under *Add* in the content bank, or in the H5P activity editor, with the cube icon.

## 2. Try the example (optional)

In a course's *Content bank*, choose *Upload* and pick `2-example/bovisands-gaussian-splat.h5p`. For the full demo set, upload the five files in `3-content-bank-demo/` the same way.

The splat inside these packages is stored as `.txt`, so they upload even where `.ply`/`.sog` aren't allowed. The demo packages also carry the Accordion, Multiple Choice, True/False, Image and Text content types. If your site already has newer versions of these, it keeps them.

## 3. Hotspots need H5P's Text, Image, Video and Audio

Hotspot popups use H5P.AdvancedText 1.1, H5P.Image 1.1, H5P.Video 1.6 and H5P.Audio 1.5. Most sites already have them, for example any site with Interactive Book or Course Presentation. The editor only offers the ones that are installed. The example package includes Text.

## 4. Allowing `.ply` and `.sog` (optional)

H5P only accepts uploads with extensions on its allow-list, and `ply`/`sog` aren't on it. **You don't have to change this:** the editor detects it and stores splats as `.txt` instead, and they work the same way. If you'd like files to keep their real extension:

- **Moodle, mod_hvp, WordPress (PHP):** there's no admin setting for this. Apply `platform/h5p-php-library-allow-ply-sog.patch`, which adds `ply sog` to `$defaultContentWhitelist` in `h5p.classes.php`. The file is at:
  - Moodle core: `h5p/h5plib/v1XX/joubel/core/h5p.classes.php` (newer versions put it under `public/`)
  - mod_hvp: `mod/hvp/library/h5p.classes.php`
  - WordPress: `wp-content/plugins/h5p/h5p-php-library/h5p.classes.php`

  Re-apply the patch after each Moodle or plugin upgrade.
- **Lumi / `@lumieducation/h5p-server` (Node.js):** after `config.load()`, add `config.contentWhitelist += ' ply sog'`. Also raise `config.maxFileSize` (default 16 MB) and `config.maxTotalSize` (default 64 MB) for large splats.

## 5. Updating

Upload a newer `gaussian-splat-libraries.h5p` in the same place, then purge caches. H5P only replaces a library when its version number is higher, so re-uploading the same version changes nothing. Existing content keeps working: start views and hotspots saved by earlier versions are read as before.

## Preparing splat files

- **Formats:** `.sog` (recommended) or `.ply`, including compressed `.ply`.
- **Converting:** SOG files are usually 15–25× smaller than PLY. To convert:
  ```bash
  npx @playcanvas/splat-transform input.ply output.sog
  npx @playcanvas/splat-transform input.ply -H 0 output.sog   # much faster on CPU, slightly less view-dependent colour
  ```
- **Upload limits:** keep files within your site's maximum upload size. Large `.ply` files load slowly for learners.
- **Large scenes:** for scenes learners move through, set *Behaviour settings → Starting camera mode* to *Fly*, then save a starting view from the editor preview.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "File type isn't allowed" / `not-in-whitelist` | `.ply`/`.sog` aren't on the allow-list. Since 1.0.1 the editor stores the file as `.txt` automatically. To keep real extensions, see step 4. |
| "Unsupported redirect detected" when uploading | Your Moodle session has expired. This happens hourly on sandbox.moodledemo.net. Reload the page, log in and try again. |
| Editor or styles look wrong after an update | Purge caches and reload the page. |
| Scene upside down or on its side | In the editor, change *Up direction in the file*, or use *Fine-tune orientation*. |
| "WebGL 2 is not available" | The learner's browser or device can't display 3D. Update the browser or try another device. |
