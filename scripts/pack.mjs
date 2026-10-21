// Packs the libraries (and optionally an example) into an installable .h5p file.
// Usage: node scripts/pack.mjs [exampleDir] [out.h5p]
//   exampleDir contains h5p.json and content/ (defaults to example/)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const exampleDir = path.resolve(process.argv[2] ?? path.join(root, 'example'));
const out = path.resolve(process.argv[3] ?? path.join(root, 'build', 'bovisands-gaussian-splat.h5p'));
const extraLibDirs = [path.join(root, 'vendor')]; // e.g. H5PEditor.ColorSelector-1.3
// Libraries the example content itself uses (e.g. H5P.AdvancedText for hotspot text)
if (fs.existsSync(path.join(exampleDir, '..', 'vendor-example')) && path.basename(exampleDir) === 'example') {
  extraLibDirs.push(path.join(root, 'vendor-example'));
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'h5p-pack-'));
const copy = (from, to) => fs.cpSync(from, to, { recursive: true, dereference: true });

copy(path.join(exampleDir, 'h5p.json'), path.join(staging, 'h5p.json'));
copy(path.join(exampleDir, 'content'), path.join(staging, 'content'));
for (const lib of fs.readdirSync(path.join(root, 'libraries'))) {
  copy(path.join(root, 'libraries', lib), path.join(staging, lib));
}
for (const dir of extraLibDirs.filter((d) => fs.existsSync(d))) {
  for (const lib of fs.readdirSync(dir)) {
    copy(path.join(dir, lib), path.join(staging, lib));
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
// -D: no directory entries (H5P rejects them). H5P ignores files starting with "." (e.g. the .en.json translation template), so that's fine to include.
execFileSync('zip', ['-r', '-D', '-X', '-q', out, '.', '-x', '*.DS_Store'], { cwd: staging });
fs.rmSync(staging, { recursive: true, force: true });
console.log(`Wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
