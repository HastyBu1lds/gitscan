// Live smoke test: node test/live.js owner/repo [githubToken]
const { scanRepo } = require('../src/core.js');
(async () => {
  const nwo = process.argv[2];
  const out = await scanRepo(nwo, { fetch, githubToken: process.argv[3] });
  console.log('files:', out.files.join(', '));
  for (const c of out.candidates) {
    const t = c.token;
    console.log(c.kind.padEnd(8), c.chain.padEnd(6), c.address, t ? `${t.symbol} ${t.chainId} mcap=${t.marketCap} liq=${t.liquidityUsd} link=${c.linkedBack}` : (c.mint ? JSON.stringify(c.mint) : ''), '|', c.sources.map((s) => s.name).join(','));
  }
})().catch((e) => { console.error('ERR', e.code, e.message); process.exit(1); });
