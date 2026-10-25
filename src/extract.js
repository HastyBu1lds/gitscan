// Finds candidate contract addresses (Solana + EVM) in free text.
// Pure functions, no browser APIs, so it loads in the service worker and in Node tests.
(function (root) {
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const B58_MAP = {};
  for (let i = 0; i < B58.length; i++) B58_MAP[B58[i]] = i;

  // Length of the decoded byte string, or -1 if the input isn't base58.
  function base58DecodedLength(s) {
    const bytes = [];
    for (const ch of s) {
      let carry = B58_MAP[ch];
      if (carry === undefined) return -1;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    let zeros = 0;
    while (zeros < s.length && s[zeros] === '1') zeros++;
    return bytes.length + zeros;
  }

  // Addresses that show up in code constantly and are never what a repo means by "the CA".
  const SOL_IGNORE = new Set([
    '11111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenzQdBNbLqP5VEhdkAS6EUFKFH4S2fc9TnGWPe1y',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'So11111111111111111111111111111111111111112',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    'SysvarRent111111111111111111111111111111111',
    'SysvarC1ock11111111111111111111111111111111',
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
    'ComputeBudget111111111111111111111111111111',
    'BPFLoaderUpgradeab1e11111111111111111111111',
    'Stake11111111111111111111111111111111111111',
    'Vote111111111111111111111111111111111111111',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  ]);
  const EVM_IGNORE = new Set([
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dead',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
    '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
    '0x4200000000000000000000000000000000000006', // WETH on Base/OP
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
    '0x55d398326f99059ff775485246999027b3197955', // USDT on BSC
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC on BSC
  ]);

  const SOL_RE = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
  const EVM_RE = /(?<![0-9A-Za-z])0x[0-9a-fA-F]{40}(?![0-9A-Za-z])/g;

  function looksLikePubkey(s) {
    // Real pubkeys are ~random; a 32+ char string without digits and mixed case is almost
    // always an identifier or a word.
    if (!/[0-9]/.test(s) || !/[a-z]/.test(s) || !/[A-Z]/.test(s)) {
      return /^[1-9A-HJ-NP-Za-km-z]*1{10,}[1-9A-HJ-NP-Za-km-z]*$/.test(s); // vanity "1111…" programs
    }
    return true;
  }

  function snippet(text, index, length) {
    const start = Math.max(0, index - 24);
    const end = Math.min(text.length, index + length + 24);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  // sources: [{ name, text }]  ->  [{ address, chain: 'solana'|'evm', sources: [{ name, snippet }] }]
  function extractAddresses(sources) {
    const found = new Map(); // key -> entry
    const add = (address, chain, key, src, text, index) => {
      let entry = found.get(key);
      if (!entry) {
        entry = { address, chain, sources: [] };
        found.set(key, entry);
      }
      if (entry.sources.length < 3 && !entry.sources.some((s) => s.name === src.name)) {
        entry.sources.push({ name: src.name, snippet: snippet(text, index, address.length) });
      }
    };

    for (const src of sources) {
      const text = src.text || '';
      for (const m of text.matchAll(EVM_RE)) {
        const lower = m[0].toLowerCase();
        if (EVM_IGNORE.has(lower)) continue;
        add(m[0], 'evm', 'evm:' + lower, src, text, m.index);
      }
      for (const m of text.matchAll(SOL_RE)) {
        const s = m[0];
        if (SOL_IGNORE.has(s) || !looksLikePubkey(s)) continue;
        if (base58DecodedLength(s) !== 32) continue;
        add(s, 'solana', 'sol:' + s, src, text, m.index);
      }
    }
    return [...found.values()];
  }

  const api = { extractAddresses, base58DecodedLength };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CAX = Object.assign(root.CAX || {}, api);
})(typeof self !== 'undefined' ? self : globalThis);
