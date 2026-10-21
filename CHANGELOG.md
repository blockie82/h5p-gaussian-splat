# Changelog

## 1.0.9
- New cube icon for the content type.
- New example: the cove at Bovisand Bay, opening in fly mode on a chosen view, with three text hotspots.

## 1.0.8
- Uploads happen once: a tiny check first finds out whether the site accepts `.ply`/`.sog`, so a rejected file is no longer sent twice.
- After the download finishes, the progress bar shows "Preparing 3D scene…" instead of sitting at 100%.
- Hotspots use H5P blue (#2575BE) by default.

## 1.0.6 – 1.0.7
- Hotspots: numbered markers on the scene that open popups with Text, Image, Video and Audio.
- Placing hotspots: *Add hotspot* / *Move on scene* by clicking the preview.
- Hotspot list in the toolbar, with keyboard support.
- Media pauses when its popup closes.

## 1.0.5
- The editor script is now 15 KB. The 3D preview code (2 MB) loads only when a preview is shown, which fixes slow first editor loads.

## 1.0.4
- SuperSplat-style fly mode: drag to look around, W/A/S/D and the arrow keys to move, Q/E for down/up, Shift for 4× speed.
- Orbit/fly toggle in the toolbar, plus a *Starting camera mode* setting.

## 1.0.3
- The editor preview keeps a fixed size even if the platform doesn't load the editor stylesheet (it used to grow endlessly). Styles are now built into the scripts.

## 1.0.2
- The starting view is stored as plain numbers, so H5P's save step no longer breaks it. Views saved by earlier versions are still read.
- W/A/S/D movement.

## 1.0.1
- Sites that don't allow `.ply`/`.sog` uploads (e.g. Moodle by default) store the file as `.txt`. The format is detected from the file contents.

## 1.0.0
- First version: `.ply` and `.sog` viewer with orbit controls, editor preview, starting view, up direction and orientation, poster, load on click, background and size settings.
