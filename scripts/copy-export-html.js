/**
 * Copies the single-file HTML export from ui/export/ to project root export/.
 * Run via: npm run export:html
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'ui', 'export', 'index.html');
const outDir = path.join(__dirname, '..', 'export');
const dest = path.join(outDir, 'chscanner.html');

if (!fs.existsSync(src)) {
  console.error('Single-file build not found. Run "npm run build:single" from the ui folder first.');
  process.exit(1);
}
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Exported:', path.relative(path.join(__dirname, '..'), dest));
console.log('Open export/chscanner.html in a browser. (API/Socket.IO need the backend for full functionality.)');
