import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');

const banner = {
  js: '/*! H5P.GaussianSplat | MIT. Includes PlayCanvas Engine (MIT, https://github.com/playcanvas/engine) */'
};

const common = {
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  banner,
  logLevel: 'info'
};

const builds = [
  {
    ...common,
    entryPoints: ['src/runtime/index.js'],
    outfile: 'libraries/H5P.GaussianSplat-1.0/dist/h5p-gaussian-splat.js'
  },
  {
    ...common,
    entryPoints: ['src/editor/index.js'],
    outfile: 'libraries/H5PEditor.GaussianSplat-1.0/dist/h5p-editor-gaussian-splat.js'
  },
  {
    // Loaded on demand by the editor widget (not listed in library.json)
    ...common,
    entryPoints: ['src/editor/preview.js'],
    outfile: 'libraries/H5PEditor.GaussianSplat-1.0/dist/h5p-editor-gaussian-splat-preview.js'
  }
];

/**
 * Also embed each bundle's CSS in its JS, injected as a <style> element, so
 * the content type still looks right if a platform fails to load the
 * stylesheet listed in library.json.
 */
import fs from 'node:fs';
const embedCss = (outfile) => {
  const cssFile = outfile.replace(/\.js$/, '.css');
  if (!fs.existsSync(cssFile)) {
    return;
  }
  const id = 'style-' + outfile.split('/').pop().replace(/\.js$/, '');
  const css = fs.readFileSync(cssFile, 'utf8');
  const js = fs.readFileSync(outfile, 'utf8');
  const inject = `(function(){try{if(document.getElementById(${JSON.stringify(id)}))return;var s=document.createElement('style');s.id=${JSON.stringify(id)};s.textContent=${JSON.stringify(css)};(document.head||document.documentElement).appendChild(s);}catch(e){}})();\n`;
  const bannerEnd = js.indexOf('*/') + 2;
  fs.writeFileSync(outfile, js.slice(0, bannerEnd) + '\n' + inject + js.slice(bannerEnd));
};

if (watch) {
  for (const options of builds) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }
}
else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
  builds.forEach((options) => embedCss(options.outfile));
}
