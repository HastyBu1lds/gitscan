// Rebuilds the zip, copies it into the website, and updates the SHA-256 shown on the page.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const { execFileSync } = require('child_process');
const site = process.env.SITE_DIR || path.resolve(__dirname, '..', '..', 'repo-ca-site'); // the website folder, next to this one by default
execFileSync(process.execPath, [path.join(__dirname, 'pack.js')], { stdio: 'inherit' });
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).version;
const zip = path.join(__dirname, '..', 'dist', `gitscan-${version}.zip`);
for (const f of fs.readdirSync(path.join(site, 'download'))) if (f.endsWith('.zip') && f !== path.basename(zip)) fs.rmSync(path.join(site, 'download', f)); // stale versions or old names
fs.copyFileSync(zip, path.join(site, 'download', path.basename(zip)));
const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
let html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
html = html.replace(/\b[0-9a-f]{64}\b|__SHA__/g, sha);
fs.writeFileSync(path.join(site, 'index.html'), html);
console.log('site updated:', path.basename(zip), sha, '(version text on the page is not auto-updated)');
