const test = require('node:test');
const assert = require('node:assert');
const { scanRepo, validNwo, readCapped } = require('../src/core.js');

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

test('validNwo accepts real names and rejects traversal / junk', () => {
  for (const ok of ['vybenetwork/solana-swap-api', 'a/b', 'octocat/Hello-World', 'foo/.github', 'foo/bar.js']) assert.ok(validNwo(ok), ok);
  for (const bad of ['../..', 'a/..', 'a/.', '../x', 'a b/c', 'a/b/c', '/x', 'x/', '-a/b', 'a/b?x=1', 'a/b#c', '', null, 5, 'a'.repeat(200) + '/b']) assert.ok(!validNwo(bad), String(bad));
});

test('readCapped stops downloading an endless body', async () => {
  let pulls = 0;
  const body = new ReadableStream({
    pull(c) {
      pulls++;
      c.enqueue(new TextEncoder().encode('x'.repeat(10000)));
    },
  });
  const text = await readCapped(new Response(body), 50000);
  assert.equal(text.length, 50000);
  assert.ok(pulls < 20, 'pulled ' + pulls + ' chunks');
});

function fakeWeb({ dexPair, readmeBody }) {
  const seen = [];
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const fetchFn = async (url, init = {}) => {
    seen.push({ url, auth: init.headers && init.headers.Authorization, signal: !!init.signal });
    const u = new URL(url);
    if (u.host === 'api.github.com' && u.pathname === '/repos/acme/coin') return json({ default_branch: 'main', description: '', topics: [] });
    if (u.host === 'api.github.com' && u.pathname === '/repos/acme/coin/contents/') return json([{ type: 'file', name: 'README.md', path: 'README.md', size: 10 }]);
    if (u.host === 'raw.githubusercontent.com') return new Response(readmeBody());
    if (u.host === 'api.dexscreener.com') return json({ pairs: [dexPair] });
    throw new Error('unexpected host ' + u.host);
  };
  return { fetchFn, seen };
}

test('hostile README and Dexscreener data are bounded and sanitized', async () => {
  const hostilePair = {
    chainId: 'solana',
    dexId: 'raydium',
    url: 'javascript:alert(document.cookie)',
    pairAddress: '"><img src=x onerror=alert(1)>',
    baseToken: { address: BONK, symbol: 'S'.repeat(500), name: '<script>alert(1)</script>'.repeat(50) },
    priceUsd: { evil: true },
    marketCap: '1e9',
    liquidity: { usd: 'lots' },
    volume: { h24: [1, 2] },
  };
  // endless README with the CA near the top
  const readmeBody = () =>
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`CA: ${BONK}\n`));
      },
      pull(c) {
        c.enqueue(new TextEncoder().encode('lorem ipsum '.repeat(2000)));
      },
    });
  const { fetchFn, seen } = fakeWeb({ dexPair: hostilePair, readmeBody });

  const out = await scanRepo('acme/coin', { fetch: fetchFn, githubToken: 'github_pat_SECRET' });
  const t = out.candidates[0].token;
  assert.equal(out.candidates[0].kind, 'token');
  assert.equal(t.pairUrl, null, 'javascript: and odd pair addresses must not become links');
  assert.ok(t.symbol.length <= 24 && t.name.length <= 48);
  assert.equal(t.priceUsd, null);
  assert.equal(t.marketCap, 1e9);
  assert.equal(t.liquidityUsd, 0);
  assert.equal(t.volume24h, 0);

  // the token only ever goes to api.github.com, and every request has a timeout
  for (const r of seen) {
    const host = new URL(r.url).host;
    if (host !== 'api.github.com') assert.equal(r.auth, undefined, 'token leaked to ' + host);
    assert.ok(r.signal, 'no timeout on ' + r.url);
  }
  assert.ok(seen.some((r) => r.auth === 'Bearer github_pat_SECRET'));
});

test('a normal https dexscreener url is kept, a lookalike host is not', async () => {
  const base = { chainId: 'solana', dexId: 'x', pairAddress: 'AbC123', baseToken: { address: BONK, symbol: 'B', name: 'B' } };
  const run = async (url) => {
    const { fetchFn } = fakeWeb({ dexPair: { ...base, url }, readmeBody: () => `CA ${BONK}` });
    return (await scanRepo('acme/coin', { fetch: fetchFn })).candidates[0].token.pairUrl;
  };
  assert.equal(await run('https://dexscreener.com/solana/AbC123'), 'https://dexscreener.com/solana/AbC123');
  assert.equal(await run('https://dexscreener.com.evil.io/solana/AbC123'), 'https://dexscreener.com/solana/AbC123'); // rebuilt from safe parts
  assert.equal(await run('http://dexscreener.com/solana/AbC123'), 'https://dexscreener.com/solana/AbC123');
});

test('scanRepo refuses a bad repo name before any request', async () => {
  let called = false;
  await assert.rejects(scanRepo('../..', { fetch: async () => ((called = true), new Response('{}')) }), { code: 'bad_repo' });
  assert.equal(called, false);
});
