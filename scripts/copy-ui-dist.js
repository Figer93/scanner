const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'ui', 'dist');
const dest = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(src)) {
  console.error('Run "npm run build" from the ui folder first (or "cd ui && npm run build")');
  process.exit(1);
}
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Copied ui/dist to dist/');
