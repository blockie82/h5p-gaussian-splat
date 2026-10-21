// Minimal stand-in for an H5P host, enough to run the real H5P editor field
// widgets (from h5p-editor-php-library) with our gaussianSplat widget.
// Mimics the server-side extension whitelist check of H5PEditorFile.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// Clone https://github.com/h5p/h5p-php-library and https://github.com/h5p/h5p-editor-php-library
// next to this project (or point H5P_CORE / H5P_EDITOR at them).
const MOUNTS = {
  '/core/': (process.env.H5P_CORE ?? path.join(ROOT, '..', 'h5p-php-library')) + '/',
  '/editor/': (process.env.H5P_EDITOR ?? path.join(ROOT, '..', 'h5p-editor-php-library')) + '/',
  '/libs/': path.join(ROOT, 'libraries') + '/',
  '/ref/': path.join(ROOT, 'vendor') + '/',
  '/harness/': path.join(ROOT, 'test', 'harness') + '/',
  '/editor-files/': path.join(ROOT, 'test', 'out', 'editor-files') + '/'
};
// Default H5P whitelist + the two extensions an admin must add
const WHITELIST = (process.env.WHITELIST ??
  'json png jpg jpeg gif bmp tif tiff eot ttf woff woff2 otf webm mp4 ogg mp3 m4a wav txt pdf rtf doc docx xls xlsx ppt pptx odt ods odp csv diff patch swf md textile vtt webvtt gltf glb ply sog').split(' ');

fs.mkdirSync(MOUNTS['/editor-files/'] + 'files', { recursive: true });

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const parseMultipart = (body, boundary) => {
  const parts = {};
  const sep = Buffer.from(`--${boundary}`);
  let start = body.indexOf(sep) + sep.length + 2;
  while (start > sep.length) {
    const end = body.indexOf(sep, start);
    if (end < 0) {
      break;
    }
    const part = body.subarray(start, end - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    const headers = part.subarray(0, headerEnd).toString();
    const name = headers.match(/name="([^"]+)"/)?.[1];
    const filename = headers.match(/filename="([^"]*)"/)?.[1];
    parts[name] = { filename, data: part.subarray(headerEnd + 4) };
    start = end + sep.length + 2;
  }
  return parts;
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/ajax/files') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const boundary = req.headers['content-type'].split('boundary=')[1];
      const parts = parseMultipart(Buffer.concat(chunks), boundary);
      const file = parts.file;
      const ext = path.extname(file.filename).slice(1).toLowerCase();
      res.setHeader('content-type', 'application/json');
      if (!WHITELIST.includes(ext)) {
        res.end(JSON.stringify({ success: false, message: `File type .${ext} is not allowed (whitelist)` }));
        return;
      }
      const name = `files/file-${Date.now().toString(16)}.${ext}`;
      fs.writeFileSync(MOUNTS['/editor-files/'] + name, file.data);
      res.end(JSON.stringify({ path: `${name}#tmp`, mime: 'application/octet-stream' }));
    });
    return;
  }
  const mount = Object.keys(MOUNTS).find((m) => url.pathname.startsWith(m));
  if (!mount) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const file = MOUNTS[mount] + decodeURIComponent(url.pathname.slice(mount.length));
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('content-length', stat.size);
    fs.createReadStream(file).pipe(res);
  });
}).listen(8766, () => console.log('editor harness on http://localhost:8766/harness/editor.html'));
