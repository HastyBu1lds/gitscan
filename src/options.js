const tokenEl = document.getElementById('token');
const hideEl = document.getElementById('hide');
const statusEl = document.getElementById('status');

chrome.storage.local.get({ githubToken: '', hideWhenEmpty: false }).then((s) => {
  tokenEl.value = s.githubToken;
  hideEl.checked = s.hideWhenEmpty;
});

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ githubToken: tokenEl.value.trim(), hideWhenEmpty: hideEl.checked });
  statusEl.textContent = 'Saved';
  setTimeout(() => (statusEl.textContent = ''), 1500);
});

document.getElementById('clear').addEventListener('click', async () => {
  await chrome.storage.local.remove('githubToken');
  tokenEl.value = '';
  statusEl.textContent = 'Token removed';
  setTimeout(() => (statusEl.textContent = ''), 1500);
});
