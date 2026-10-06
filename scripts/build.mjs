// Bundles the explorer into self-contained single HTML files:
//   dist/index.html     - a complete page; open it straight from disk
//   dist/artifact.html  - the same content without the document wrapper (for hosts
//                         that supply their own <html>/<head>/<body>)
// The page markup is src/ui/app.html; its <link href="./styles.css"> is inlined.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ui = path.join(root, 'src/ui');
const result = await esbuild.build({
  entryPoints: [path.join(ui, 'main.js')],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
});
const js = result.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = fs.readFileSync(path.join(ui, 'styles.css'), 'utf8');
const body = fs.readFileSync(path.join(ui, 'app.html'), 'utf8')
  .replace('<link rel="stylesheet" href="./styles.css">\n', () => `<style>\n${css}</style>\n`);
const content = `${body}\n<script>\n${js}</script>\n`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), content);
const title = (body.match(/<title>.*?<\/title>/) || [''])[0];
fs.writeFileSync(path.join(root, 'dist/index.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${title}\n</head>\n<body>\n${content.replace(title, '')}</body>\n</html>\n`);
console.log(`built dist/index.html (${(content.length / 1024).toFixed(0)} KB)`);
