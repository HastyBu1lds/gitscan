// Scans one GitHub repo for contract addresses and checks them on-chain / on Dexscreener.
// Takes an injectable fetch so it runs in the service worker and in Node tests.
(function (root) {
  const extract = typeof require === 'function' ? require('./extract.js') : root.CAX;

  const MAX_FILE_BYTES = 200 * 1024;
  const MAX_TEXT_CHARS = 300000;
  const MAX_EXTRA_FILES = 5;
  const SOLANA_RPC = 'https://solana-rpc.publicnode.com';

  // Root-level files that tend to hold a deployed address.
  const INTERESTING = /^(anchor\.toml|package\.json|\.env\.(example|sample)|deployments?\.(json|md|toml)|addresses\.(json|md|toml)|contracts?\.(json|md|toml)|config\.(json|toml|ts|js)|constants\.(ts|js|rs|py)|token\.(md|json|toml)|tokenomics\.md|about\.md)$/i;

  class ScanError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  const FETCH_TIMEOUT_MS = 10000;

  // owner/name as GitHub defines them; rejects "..", "." and anything with odd characters.
  function validNwo(s) {
    if (typeof s !== 'string' || s.length > 140) return false;
    const m = s.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([\w.-]{1,100})$/);
    return !!m && !/^\.+$/.test(m[2]);
  }

  // Everything we fetch is untrusted input: bound how long we wait.
  function withTimeout(fetchFn) {
    return (url, init) => fetchFn(url, { ...(init || {}), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  }

  // Reads at most maxChars of a response body, then stops downloading. A hostile repo can serve a README of any size.
  async function readCapped(res, maxChars) {
    if (!res.body || !res.body.getReader) {
      const t = await res.text();
      return t.slice(0, maxChars);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let out = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
      if (out.length >= maxChars) {
        await reader.cancel();
        return out.slice(0, maxChars);
      }
    }
    return out + dec.decode();
  }

  // Values below come from third-party APIs and end up in the page, so coerce them to plain types.
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');

  // Only ever link to dexscreener.com; rebuild the URL from known-safe parts if the API's url is odd.
  function dexUrl(pair) {
    if (typeof pair.url === 'string' && /^https:\/\/dexscreener\.com\/[\w\-/]+$/.test(pair.url)) return pair.url;
    if (/^[\w-]+$/.test(str(pair.chainId, 40)) && /^[\w-]+$/.test(str(pair.pairAddress, 100))) {
      return `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`;
    }
    return null;
  }

  async function ghJson(fetchFn, url, token) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetchFn(url, { headers });
    if (res.status === 404) throw new ScanError('not_found', 'Repo not found or private.');
    if (res.status === 403 || res.status === 429) {
      throw new ScanError('rate_limit', 'GitHub rate limit hit. Add a token in the extension options.');
    }
    if (res.status === 409 || res.status === 204) return []; // empty repo
    if (!res.ok) throw new ScanError('github', 'GitHub returned ' + res.status + '.');
    return res.json();
  }

  async function rawText(fetchFn, nwo, branch, path) {
    const url = `https://raw.githubusercontent.com/${nwo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetchFn(url);
    if (!res.ok) return null;
    return readCapped(res, MAX_TEXT_CHARS);
  }

  async function gatherSources(fetchFn, nwo, token) {
    const repo = await ghJson(fetchFn, `https://api.github.com/repos/${nwo}`, token);
    const root = await ghJson(fetchFn, `https://api.github.com/repos/${nwo}/contents/`, token);
    const branch = repo.default_branch || 'main';
    const files = Array.isArray(root) ? root.filter((f) => f.type === 'file') : [];

    const sources = [];
    const meta = [repo.description, repo.homepage, (repo.topics || []).join(' ')].filter(Boolean).join('\n');
    if (meta) sources.push({ name: 'repo description', text: meta });

    const readme = files.find((f) => /^readme(\.|$)/i.test(f.name));
    const wanted = [];
    if (readme) wanted.push(readme);
    for (const f of files) {
      if (wanted.length > MAX_EXTRA_FILES) break;
      if (f !== readme && INTERESTING.test(f.name) && f.size <= MAX_FILE_BYTES) wanted.push(f);
    }
    const texts = await Promise.all(wanted.map((f) => rawText(fetchFn, nwo, branch, f.path)));
    wanted.forEach((f, i) => {
      if (texts[i]) sources.push({ name: f.name, text: texts[i] });
    });
    return { repo, sources };
  }

  // ---- Dexscreener -------------------------------------------------------

  async function dexLookup(fetchFn, candidates) {
    const byKey = new Map(); // lower-case address -> pairs where it is the base token
    for (let i = 0; i < candidates.length; i += 30) {
      const chunk = candidates.slice(i, i + 30);
      const url = 'https://api.dexscreener.com/latest/dex/tokens/' + chunk.map((c) => c.address).join(',');
      const res = await fetchFn(url);
      if (!res.ok) continue;
      const body = await res.json();
      for (const pair of body.pairs || []) {
        const key = (pair.baseToken && pair.baseToken.address || '').toLowerCase();
        if (!key) continue;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(pair);
      }
    }
    return byKey;
  }

  function linkBack(pairs, nwo) {
    const [owner, name] = nwo.toLowerCase().split('/');
    let level = false;
    for (const p of pairs) {
      const info = p.info || {};
      const urls = [...(info.websites || []).map((w) => w.url), ...(info.socials || []).map((s) => s.url)];
      for (const raw of urls) {
        const u = String(raw || '').toLowerCase();
        const m = u.match(/github\.com\/([^/?#\s]+)(?:\/([^/?#\s]+))?/);
        if (!m || m[1] !== owner) continue;
        if (m[2] && m[2].replace(/\.git$/, '') === name) return 'repo';
        level = 'owner';
      }
    }
    return level;
  }

  function summarizePairs(pairs) {
    const liq = (p) => num(p.liquidity && p.liquidity.usd) || 0;
    const best = pairs.slice().sort((a, b) => liq(b) - liq(a))[0];
    return {
      symbol: str(best.baseToken.symbol, 24),
      name: str(best.baseToken.name, 48),
      chainId: str(best.chainId, 24),
      dexId: str(best.dexId, 24),
      pairUrl: dexUrl(best),
      priceUsd: num(best.priceUsd),
      marketCap: num(best.marketCap) || num(best.fdv),
      liquidityUsd: liq(best),
      volume24h: num(best.volume && best.volume.h24) || 0,
      pairCreatedAt: num(best.pairCreatedAt),
      pairCount: pairs.length,
    };
  }

  // ---- Solana RPC (for mints that have no market yet) ----------------------

  async function solanaAccounts(fetchFn, addresses) {
    const res = await fetchFn(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getMultipleAccounts',
        params: [addresses, { encoding: 'jsonParsed' }],
      }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.result && body.result.value ? body.result.value : null;
  }

  function classifySolana(acct) {
    if (!acct) return { kind: 'missing' };
    if (acct.executable) return { kind: 'program' };
    const parsed = acct.data && acct.data.parsed;
    if (parsed && parsed.type === 'mint') {
      const i = parsed.info || {};
      return {
        kind: 'mint',
        mint: {
          decimals: num(i.decimals),
          supply: str(i.supply, 30),
          mintAuthority: str(i.mintAuthority, 60) || null,
          freezeAuthority: str(i.freezeAuthority, 60) || null,
          token2022: acct.owner === 'TokenzQdBNbLqP5VEhdkAS6EUFKFH4S2fc9TnGWPe1y',
        },
      };
    }
    if (parsed && parsed.type === 'account') return { kind: 'tokenaccount' };
    // Plain wallets are owned by the System Program; anything else is state belonging to some program (pool, config, PDA...).
    if (acct.owner === '11111111111111111111111111111111') return { kind: 'wallet' };
    return { kind: 'programaccount' };
  }

  // ---- Public entry --------------------------------------------------------

  const KIND_ORDER = { token: 0, mint: 1, unknown: 2, unverified: 2, program: 3, programaccount: 4, tokenaccount: 5, wallet: 6, missing: 7 };

  async function scanRepo(nwo, opts) {
    if (!validNwo(nwo)) throw new ScanError('bad_repo', 'Not a valid repository name.');
    const fetchFn = withTimeout(opts.fetch);
    const { sources } = await gatherSources(fetchFn, nwo, opts.githubToken);
    const candidates = extract.extractAddresses(sources).slice(0, 30);

    const pairsByKey = candidates.length ? await dexLookup(fetchFn, candidates) : new Map();

    const unresolvedSol = [];
    for (const c of candidates) {
      const pairs = pairsByKey.get(c.address.toLowerCase());
      if (pairs && pairs.length) {
        c.kind = 'token';
        c.token = summarizePairs(pairs);
        c.linkedBack = linkBack(pairs, nwo);
      } else if (c.chain === 'solana') {
        unresolvedSol.push(c);
      } else {
        c.kind = 'unknown';
      }
    }

    if (unresolvedSol.length) {
      let accounts = null;
      try {
        accounts = await solanaAccounts(fetchFn, unresolvedSol.slice(0, 20).map((c) => c.address));
      } catch (_) {
        accounts = null;
      }
      unresolvedSol.forEach((c, i) => {
        if (!accounts || i >= accounts.length) {
          c.kind = 'unverified'; // RPC unreachable or rate-limited: say so rather than guess
          return;
        }
        Object.assign(c, classifySolana(accounts[i]));
      });
    }

    const linkRank = { repo: 0, owner: 1 };
    candidates.sort((a, b) => {
      const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      if (k) return k;
      const l = (linkRank[a.linkedBack] ?? 2) - (linkRank[b.linkedBack] ?? 2);
      if (l) return l;
      return ((b.token && b.token.liquidityUsd) || 0) - ((a.token && a.token.liquidityUsd) || 0);
    });

    return {
      nwo,
      scannedAt: Date.now(),
      files: sources.map((s) => s.name),
      candidates,
    };
  }

  const api = { scanRepo, ScanError, linkBack, classifySolana, validNwo, readCapped };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CAX = Object.assign(root.CAX || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
