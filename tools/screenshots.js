// Needs puppeteer-core (e.g. via NODE_PATH) and the Playwright Chromium build.
// Loads the real unpacked extension in Chromium and takes 1280x800 store screenshots.
const puppeteer = require('puppeteer-core');
const path = require('path');
const EXT = path.resolve(__dirname, '..');
const OUT = path.join(EXT, 'store');
const EXE = path.join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe');

const SHOTS = [
  { repo: 'raydium-io/raydium-sdk-V2', file: '1-token-found.png', panel: true, details: true },
  { repo: 'vybenetwork/solana-swap-api', file: '2-token-details.png', panel: true, details: false },
  { repo: 'octocat/Hello-World', file: '3-no-ca.png', panel: false },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  for (const s of SHOTS) {
    await page.goto('https://github.com/' + s.repo, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => {
      const h = document.getElementById('gitscan-host');
      const t = h && h.shadowRoot && h.shadowRoot.querySelector('.pill .txt');
      return t && !/Scanning/.test(t.textContent);
    }, { timeout: 45000 });
    const label = await page.evaluate(() => document.getElementById('gitscan-host').shadowRoot.querySelector('.pill .txt').textContent);
    console.log(s.repo, '->', label);
    if (s.panel) {
      await page.evaluate((details) => {
        const sr = document.getElementById('gitscan-host').shadowRoot;
        sr.querySelector('.pill').click();
        const d = sr.querySelector('details');
        if (d) d.open = details;
      }, s.details);
    }
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: path.join(OUT, s.file), type: 'png' });
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
