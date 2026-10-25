// Final logo: the owl of scan lines. Writes SVGs (master + small-size) and the PNG icons.
// Run: NODE_PATH=<folder containing puppeteer-core>/node_modules node tools/make-logo.js
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const O = '#ee5a1c', INK = '#141414', PAPER = '#ebe9e0';

const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${inner}</svg>\n`;
const tile = `<rect x="4" y="4" width="120" height="120" rx="22" fill="${O}"/>`;
const bar = (x1, x2, y, h) => `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="${h}" rx="${h / 2}" fill="${INK}"/>`;
const eyes = (cy, cut, ring, pupil) => [45, 83].map((cx) => `<circle cx="${cx}" cy="${cy}" r="${cut}" fill="${O}"/><circle cx="${cx}" cy="${cy}" r="${ring}" fill="${PAPER}"/><circle cx="${cx}" cy="${cy}" r="${pupil}" fill="${INK}"/>`).join('');

// Master (128 / 48 px and anywhere large): eight lines, eyes cut through them.
const master = svg(`${tile}${[
  [20, [[26, 42], [86, 102]]], [32, [[24, 104]]], [44, [[20, 108]]], [56, [[16, 112]]],
  [68, [[18, 110]]], [80, [[24, 104]]], [92, [[36, 92]]], [104, [[56, 72]]],
].map(([y, segs]) => segs.map(([a, b]) => bar(a, b, y, 8)).join('')).join('')}${eyes(62, 17, 13, 6)}`);

// Small (16 / 32 px and the website header): fewer, thicker lines so they don't blur together.
const small = svg(`${tile}${bar(24, 46, 14, 14)}${bar(82, 104, 14, 14)}${bar(18, 110, 32, 14)}${bar(40, 88, 86, 12)}${bar(56, 72, 104, 12)}${eyes(62, 22, 18, 9)}`);

fs.writeFileSync(path.join(ROOT, 'logo', 'final-master.svg'), master);
fs.writeFileSync(path.join(ROOT, 'logo', 'final-small.svg'), small);

(async () => {
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: path.join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'), headless: 'new' });
  const page = await browser.newPage();
  const render = async (s, size, file) => {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}">`);
    await page.screenshot({ path: file, omitBackground: true });
  };
  const out = path.join(ROOT, 'logo', 'png');
  fs.mkdirSync(out, { recursive: true });
  await render(master, 128, path.join(out, '128.png'));
  await render(master, 48, path.join(out, '48.png'));
  await render(small, 32, path.join(out, '32.png'));
  await render(small, 16, path.join(out, '16.png'));
  // inspection sheet: the real PNGs, magnified so pixels are visible
  const b = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(out, f)).toString('base64');
  await page.setViewport({ width: 760, height: 330, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0;display:flex;gap:28px;align-items:flex-end;padding:24px;background:#f4f3ef;font:12px sans-serif}div{text-align:center}img{display:block;image-rendering:pixelated;margin-bottom:6px}.d{background:#2b2b2b;color:#fff;padding:10px;margin:0 -10px}</style>
   <div><img src="${b('128.png')}" width="128"><span>128</span></div>
   <div><img src="${b('48.png')}" width="96"><span>48 (x2)</span></div>
   <div><img src="${b('32.png')}" width="128"><span>32 (x4)</span></div>
   <div><img src="${b('16.png')}" width="128"><span>16 (x8)</span></div>
   <div class="d"><img src="${b('16.png')}" width="16"><img src="${b('32.png')}" width="32"><span>actual size, dark</span></div>`);
  await page.screenshot({ path: path.join(ROOT, 'logo', 'final-check.png') });
  await browser.close();
  console.log('done');
})();
