importScripts('extract.js', 'core.js');

const CACHE_TTL_MS = 30 * 60 * 1000;
const inflight = new Map();

async function getSettings() {
  const s = await chrome.storage.local.get({ githubToken: '' });
  return s;
}

const MAX_CACHE_ENTRIES = 150;

// Keep the cache bounded: drop expired entries, then the oldest beyond the cap.
async function pruneCache() {
  const all = await chrome.storage.local.get(null);
  const entries = Object.keys(all)
    .filter((k) => k.startsWith('scan:'))
    .map((k) => [k, all[k].scannedAt || 0])
    .sort((a, b) => b[1] - a[1]);
  const drop = entries.filter(([, t], i) => i >= MAX_CACHE_ENTRIES || Date.now() - t > CACHE_TTL_MS).map(([k]) => k);
  if (drop.length) await chrome.storage.local.remove(drop);
}

async function cached(key, force, produce) {
  if (!force) {
    const hit = (await chrome.storage.local.get(key))[key];
    if (hit && Date.now() - (hit.scannedAt || hit.fetchedAt) < CACHE_TTL_MS) return hit;
  }
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const { githubToken } = await getSettings();
    const result = await produce({ fetch: (...a) => fetch(...a), githubToken });
    await chrome.storage.local.set({ [key]: result });
    await pruneCache();
    return result;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only our own content script on github.com may ask for scans.
  if (sender.id !== chrome.runtime.id || !sender.url || !/^https:\/\/github\.com\//.test(sender.url)) return false;
  if (!msg || !CAX.validNwo(msg.nwo)) return false;
  const lower = msg.nwo.toLowerCase();
  let job;
  if (msg.type === 'scan') job = cached('scan:' + lower, !!msg.force, (o) => CAX.scanRepo(msg.nwo, o));
  else return false;
  job.then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, code: err.code || 'error', message: err.message || String(err) })
  );
  return true; // async response
});

// Drop stale cache entries on startup so storage doesn't grow forever.
chrome.runtime.onStartup.addListener(pruneCache);
