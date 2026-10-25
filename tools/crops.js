// Real transparent crops of the extension's badge/panel for the website.
// Run: NODE_PATH=<folder containing puppeteer-core>/node_modules node tools/crops.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXT = path.resolve(__dirname, '..');
const OUT = path.join(process.env.SITE_DIR || path.resolve(__dirname, '..', '..', 'repo-ca-site'), 'img');
const EXE = path.join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe');

const SHOTS = [
  { repo: 'raydium-io/raydium-sdk-V2', file: 'panel-ray.png', panel: true, details: true },
  { repo: 'vybenetwork/solana-swap-api', file: 'panel-bonk.png', panel: true, details: false },
  { repo: 'octocat/Hello-World', file: 'pill-none.png', panel: false },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1100, deviceScaleFactor: 2 });
  for (const s of SHOTS) {
    await page.goto('https://github.com/' + s.repo, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => {
      const h = document.getElementById('gitscan-host');
      const t = h && h.shadowRoot && h.shadowRoot.querySelector('.pill .txt');
      return t && !/Scanning/.test(t.textContent);
    }, { timeout: 45000 });
    await page.evaluate((s) => {
      const sr = document.getElementById('gitscan-host').shadowRoot;
      if (s.panel) { sr.querySelector('.pill').click(); const d = sr.querySelector('details'); if (d) d.open = s.details; }
      const st = document.createElement('style');
      st.textContent = 'html,body{background:transparent !important} body{visibility:hidden !important}';
      document.head.append(st);
    }, s);
    await new Promise((r) => setTimeout(r, 300));
    const box = await page.evaluate(() => {
      const r = document.getElementById('gitscan-host').shadowRoot.querySelector('.root').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const pad = 48;
    await page.screenshot({
      path: path.join(OUT, s.file), omitBackground: true,
      clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
    });
    console.log('wrote', s.file, JSON.stringify(box));
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
