// Floating badge on GitHub repo pages: "does this repo contain a CA, and is it real?"
(function () {
  const HOST_ID = 'gitscan-host';

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e6efe9;
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .pill { display: inline-flex; align-items: center; gap: 8px; max-width: 320px; cursor: pointer;
      background: #0f1412; border: 1px solid #26332d; border-radius: 999px; padding: 7px 12px 7px 10px;
      box-shadow: 0 6px 24px rgba(0,0,0,.35); color: inherit; font: inherit; }
    .pill:hover { border-color: #3a4d44; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #66756d; flex: none; }
    .pill.ok .dot { background: #3ddc84; }
    .pill.warn .dot { background: #f2b84b; }
    .pill.err .dot { background: #ef6a5b; }
    .pill.busy .dot { animation: pulse 1s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .25; } }
    .pill .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pill .x { margin-left: 2px; color: #7f8f87; padding: 0 2px; }
    .pill .x:hover { color: #e6efe9; }
    .panel { width: 360px; max-width: calc(100vw - 32px); max-height: min(70vh, 640px); overflow-y: auto; overflow-x: hidden;
      background: #0f1412; border: 1px solid #26332d; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.45); }
    .panel[hidden] { display: none; }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #1c2823; position: sticky; top: 0; background: #0f1412; }
    .head .t { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .btn { background: #17211d; color: #cfe0d6; border: 1px solid #26332d; border-radius: 6px; padding: 3px 8px; font: inherit; font-size: 12px; cursor: pointer; }
    .btn:hover { background: #1e2c26; }
    .card { padding: 12px; border-bottom: 1px solid #1c2823; }
    .card:last-child { border-bottom: 0; }
    .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .sym { font-weight: 700; font-size: 15px; }
    .nm { color: #8fa197; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
    .chip { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid #26332d; color: #9db0a5; }
    .chip.good { color: #3ddc84; border-color: #1f5a3a; background: #11261b; }
    .chip.mid { color: #f2b84b; border-color: #5a4619; background: #261f0e; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0; }
    .stat .k { font-size: 11px; color: #7f8f87; }
    .stat .v { font-weight: 600; }
    .addr { display: flex; align-items: center; gap: 6px; font: 11.5px ui-monospace, "Cascadia Mono", Consolas, monospace; color: #b9cbc0; }
    .addr span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .addr .btn { flex: none; }
    .src { margin-top: 8px; color: #7f8f87; font-size: 12px; }
    .src q { display: block; margin-top: 2px; color: #93a69b; font: 11px ui-monospace, Consolas, monospace; quotes: none;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .links { margin-top: 8px; display: flex; gap: 12px; }
    a { color: #6fb8ff; text-decoration: none; font-size: 12px; }
    a:hover { text-decoration: underline; }
    .note { padding: 12px; color: #93a69b; }
    .err { color: #ef9a90; }
    details { padding: 10px 12px; }
    summary { cursor: pointer; color: #93a69b; }
    .other { margin-top: 8px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .foot { padding: 8px 12px; color: #66756d; font-size: 11px; border-top: 1px solid #1c2823; }
  `;

  const KIND_LABEL = {
    wallet: 'Wallet / system account',
    program: 'Program',
    programaccount: 'Program-owned account (pool, config…)',
    tokenaccount: 'Token account (not a mint)',
    missing: 'No account on-chain',
    unknown: 'Not found on Dexscreener',
    unverified: 'Couldn’t check on-chain',
  };

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
        else if (k === 'href') {
          // Only ever link out to the two sites this extension knows about.
          if (/^https:\/\/(dexscreener\.com|solscan\.io)\//.test(String(v))) n.setAttribute('href', v);
        }
        else if (v !== undefined && v !== null) n.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) if (kid) n.append(kid);
    return n;
  }

  function usd(n) {
    if (n === null || n === undefined) return '–';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toPrecision(2);
  }

  function price(n) {
    if (n === null || n === undefined) return '–';
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toPrecision(3);
  }

  function copyBtn(text) {
    const b = el('button', { class: 'btn', text: 'Copy', type: 'button' });
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        b.textContent = 'Copied';
      } catch (_) {
        b.textContent = 'Failed';
      }
      setTimeout(() => (b.textContent = 'Copy'), 1200);
    });
    return b;
  }

  function addrRow(c) {
    return el('div', { class: 'addr' }, el('span', { text: c.address, title: c.address }), copyBtn(c.address));
  }

  function sourcesBlock(c) {
    return el(
      'div',
      { class: 'src' },
      'Found in ' + c.sources.map((s) => s.name).join(', '),
      c.sources[0] ? el('q', { text: c.sources[0].snippet, title: c.sources[0].snippet }) : null
    );
  }

  function linkChip(c) {
    if (c.linkedBack === 'repo') return el('span', { class: 'chip good', text: '✓ token links to this repo' });
    if (c.linkedBack === 'owner') return el('span', { class: 'chip mid', text: 'links to repo owner only' });
    return el('span', { class: 'chip', text: 'no link back to this repo' });
  }

  function tokenCard(c) {
    const t = c.token;
    const links = t.pairUrl ? [el('a', { href: t.pairUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Dexscreener' })] : [];
    if (c.chain === 'solana') {
      links.push(el('a', { href: 'https://solscan.io/token/' + c.address, target: '_blank', rel: 'noopener noreferrer', text: 'Solscan' }));
    }
    return el(
      'div',
      { class: 'card' },
      el('div', { class: 'row' }, el('span', { class: 'sym', text: '$' + t.symbol }), el('span', { class: 'nm', text: t.name }), el('span', { class: 'chip', text: t.chainId })),
      el('div', { class: 'row', style: 'margin-top:6px' }, linkChip(c)),
      el(
        'div',
        { class: 'stats' },
        ...[
          ['Price', price(t.priceUsd)],
          ['MCap', usd(t.marketCap)],
          ['Liq', usd(t.liquidityUsd)],
          ['24h vol', usd(t.volume24h)],
        ].map(([k, v]) => el('div', { class: 'stat' }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })))
      ),
      addrRow(c),
      sourcesBlock(c),
      el('div', { class: 'links' }, ...links)
    );
  }

  function mintCard(c) {
    const m = c.mint;
    const renounced = (v) => (v ? 'set' : 'renounced');
    return el(
      'div',
      { class: 'card' },
      el('div', { class: 'row' }, el('span', { class: 'sym', text: 'Token mint' }), el('span', { class: 'chip', text: m.token2022 ? 'solana · Token-2022' : 'solana' }), el('span', { class: 'chip mid', text: 'no market yet' })),
      el(
        'div',
        { class: 'stats' },
        ...[
          ['Decimals', String(m.decimals)],
          ['Mint auth', renounced(m.mintAuthority)],
          ['Freeze auth', renounced(m.freezeAuthority)],
        ].map(([k, v]) => el('div', { class: 'stat' }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })))
      ),
      addrRow(c),
      sourcesBlock(c),
      el('div', { class: 'links' }, el('a', { href: 'https://solscan.io/token/' + c.address, target: '_blank', rel: 'noopener noreferrer', text: 'Solscan' }))
    );
  }

  function summarize(result) {
    const tokens = result.candidates.filter((c) => c.kind === 'token');
    const mints = result.candidates.filter((c) => c.kind === 'mint');
    if (tokens.length === 1) {
      const c = tokens[0];
      const mark = c.linkedBack === 'repo' ? ' ✓' : '';
      return { cls: c.linkedBack === 'repo' ? 'ok' : 'warn', text: `$${c.token.symbol} · ${usd(c.token.marketCap)}${mark}` };
    }
    if (tokens.length > 1) {
      const linked = tokens.some((c) => c.linkedBack === 'repo');
      return { cls: linked ? 'ok' : 'warn', text: `${tokens.length} tokens found${linked ? ' ✓' : ''}` };
    }
    if (mints.length) return { cls: 'warn', text: mints.length === 1 ? 'Token mint found (no market)' : `${mints.length} token mints found` };
    return { cls: '', text: 'No CA found' };
  }

  // ---- mounting -------------------------------------------------------------

  let current = null; // nwo currently shown
  let host = null;
  let dismissed = new Set();
  let settings = { hideWhenEmpty: false };

  try {
    chrome.storage.local.get({ hideWhenEmpty: false }).then((s) => (settings = s));
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.hideWhenEmpty) settings.hideWhenEmpty = ch.hideWhenEmpty.newValue;
    });
  } catch (_) {}

  function unmount() {
    if (host) host.remove();
    host = null;
  }

  function mount(nwo) {
    unmount();
    if (dismissed.has(nwo)) return;

    host = el('div', { id: HOST_ID });
    const shadow = host.attachShadow({ mode: 'open' });
    const pill = el('button', { class: 'pill busy', type: 'button' }, el('span', { class: 'dot' }), el('span', { class: 'txt', text: 'Scanning for CA…' }));
    const panel = el('div', { class: 'panel', hidden: '' });
    const root = el('div', { class: 'root' }, panel, pill);
    shadow.append(el('style', { text: CSS }), root);
    document.documentElement.append(host);

    let state = null; // { response }
    const setPill = (cls, text, withClose) => {
      pill.className = 'pill ' + cls;
      pill.replaceChildren(el('span', { class: 'dot' }), el('span', { class: 'txt', text }));
      if (withClose) {
        const x = el('span', { class: 'x', text: '×', title: 'Hide for this repo' });
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          dismissed.add(nwo);
          unmount();
        });
        pill.append(x);
      }
    };

    const render = (response) => {
      state = response;
      panel.replaceChildren();
      const rescan = el('button', { class: 'btn', type: 'button', text: 'Rescan' });
      rescan.addEventListener('click', () => run(true));
      panel.append(el('div', { class: 'head' }, el('div', { class: 't', text: nwo }), rescan));

      if (!response.ok) {
        setPill('err', 'CA scan failed', true);
        panel.append(el('div', { class: 'note err', text: response.message }));
        return;
      }
      const result = response.result;
      const sum = summarize(result);
      if (!result.candidates.length && settings.hideWhenEmpty) {
        unmount();
        return;
      }
      setPill(sum.cls, sum.text, true);

      const main = result.candidates.filter((c) => c.kind === 'token' || c.kind === 'mint');
      const other = result.candidates.filter((c) => c.kind !== 'token' && c.kind !== 'mint');
      if (!result.candidates.length) {
        panel.append(el('div', { class: 'note', text: 'No Solana or EVM address in the description, README, or root config files (' + result.files.join(', ') + ').' }));
      }
      for (const c of main) panel.append(c.kind === 'token' ? tokenCard(c) : mintCard(c));
      if (other.length) {
        panel.append(
          el(
            'details',
            null,
            el('summary', { text: `Other addresses (${other.length})` }),
            el('div', { class: 'other' }, ...other.map((c) => el('div', null, el('div', { class: 'src', text: (KIND_LABEL[c.kind] || c.kind) + ' · ' + c.sources[0].name }), addrRow(c))))
          )
        );
      }
      panel.append(
        el('div', { class: 'foot', text: 'A CA in a repo is a claim, not proof. “Links to this repo” means the token’s own Dexscreener profile points back here. Market data is informational, not financial advice.' })
      );
    };

    const run = (force) => {
      setPill('busy', 'Scanning for CA…', false);
      chrome.runtime.sendMessage({ type: 'scan', nwo, force: !!force }).then(
        (response) => {
          if (current !== nwo || !host) return;
          render(response || { ok: false, message: 'No response from the extension.' });
        },
        () => {
          if (current !== nwo || !host) return;
          render({ ok: false, message: 'Extension was reloaded. Refresh this page.' });
        }
      );
    };

    pill.addEventListener('click', () => {
      if (state) panel.hidden = !panel.hidden;
    });
    run(false);
  }

  function repoNwo() {
    const meta = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]');
    const nwo = meta && meta.content;
    return nwo && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[\w.-]{1,100}$/.test(nwo) && !/\/\.+$/.test(nwo) ? nwo : null;
  }

  function tick() {
    const nwo = repoNwo();
    if (nwo === current) return;
    current = nwo;
    if (nwo) mount(nwo);
    else unmount();
  }

  tick();
  document.addEventListener('turbo:render', tick);
  document.addEventListener('turbo:load', tick);
  window.addEventListener('popstate', () => setTimeout(tick, 50));
  setInterval(tick, 1000); // fallback for navigations that fire no event
})();
