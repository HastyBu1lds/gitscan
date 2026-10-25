const test = require('node:test');
const assert = require('node:assert');
const { extractAddresses, base58DecodedLength } = require('../src/extract.js');

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PEPE = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';

test('decodes real Solana pubkeys to 32 bytes', () => {
  assert.equal(base58DecodedLength(BONK), 32);
  assert.equal(base58DecodedLength(WIF), 32);
  assert.equal(base58DecodedLength('0OIl'), -1);
});

test('finds Solana and EVM addresses with their source', () => {
  const out = extractAddresses([
    { name: 'README.md', text: `# Token\nCA: ${BONK}\nBase: ${PEPE}` },
    { name: 'Anchor.toml', text: `mint = "${WIF}"` },
  ]);
  const byAddr = Object.fromEntries(out.map((e) => [e.address, e]));
  assert.equal(out.length, 3);
  assert.equal(byAddr[BONK].chain, 'solana');
  assert.equal(byAddr[PEPE].chain, 'evm');
  assert.equal(byAddr[WIF].sources[0].name, 'Anchor.toml');
  assert.match(byAddr[BONK].sources[0].snippet, /CA:/);
});

test('dedupes across files and case for EVM', () => {
  const out = extractAddresses([
    { name: 'a', text: PEPE },
    { name: 'b', text: PEPE.toLowerCase() },
    { name: 'c', text: BONK + ' ' + BONK },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find((e) => e.chain === 'evm').sources.length, 2);
});

test('ignores well-known infrastructure addresses', () => {
  const out = extractAddresses([
    { name: 'a', text: `${USDC} 11111111111111111111111111111111 So11111111111111111111111111111111111111112 0x0000000000000000000000000000000000000000` },
  ]);
  assert.deepEqual(out, []);
});

test('ignores hashes, identifiers and tx hashes', () => {
  const out = extractAddresses([
    {
      name: 'a',
      text: [
        'commit 3b18e512dba79e4c8300dd08aeb37f8e728b8dad',
        'sha256 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        'const SomeVeryLongCamelCaseIdentifierNameHere = 1',
        '0x' + 'a'.repeat(64),
        'abcdefghijkmnopqrstuvwxyzabcdefghijkmnopqrstuvwxyz',
      ].join('\n'),
    },
  ]);
  assert.deepEqual(out, []);
});

test('does not match inside a longer base58 run', () => {
  assert.deepEqual(extractAddresses([{ name: 'a', text: 'x' + BONK + 'y' }]), []);
});

test('matches addresses inside URLs and quotes', () => {
  const out = extractAddresses([
    { name: 'a', text: `https://solscan.io/token/${BONK}?cluster=mainnet "${WIF}"` },
  ]);
  assert.equal(out.length, 2);
});

test('linkBack recognises repo and owner links on a Dexscreener profile', () => {
  const { linkBack } = require('../src/core.js');
  const pair = (urls) => ({ info: { websites: urls.map((url) => ({ url })), socials: [] } });
  assert.equal(linkBack([pair(['https://github.com/Acme/Coin'])], 'acme/coin'), 'repo');
  assert.equal(linkBack([pair(['https://github.com/acme/coin.git'])], 'acme/coin'), 'repo');
  assert.equal(linkBack([pair(['https://github.com/acme'])], 'acme/coin'), 'owner');
  assert.equal(linkBack([pair(['https://github.com/acme/other'])], 'acme/coin'), 'owner');
  assert.equal(linkBack([pair(['https://github.com/evil/coin'])], 'acme/coin'), false);
  assert.equal(linkBack([{}], 'acme/coin'), false);
});
