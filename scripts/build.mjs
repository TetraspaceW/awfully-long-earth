// Bundles the app into self-contained single HTML files:
//   dist/index.html     - a complete page; open it straight from disk
//   dist/artifact.html  - the same content without the document wrapper (for hosts
//                         that supply their own <html>/<head>/<body>)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
});
const js = result.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const body = fs.readFileSync(path.join(root, 'src/app.html'), 'utf8');
const content = `${body}\n<script>\n${js}</script>\n`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), content);
const title = (body.match(/<title>.*?<\/title>/) || [''])[0];
fs.writeFileSync(path.join(root, 'dist/index.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${title}\n</head>\n<body>\n${content.replace(title, '')}</body>\n</html>\n`);
console.log(`built dist/index.html (${(content.length / 1024).toFixed(0)} KB)`);
