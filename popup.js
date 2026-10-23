// Chrome creates this popup when the toolbar icon is clicked and closes it
// when the user clicks elsewhere. Keep folding state in the content script.
const toggle = document.getElementById('enabled');
const expand = document.getElementById('expand');
const collapse = document.getElementById('collapse');
const status = document.getElementById('status');
let tabId;

function render(page) {
  const available = page?.isPR && page.enabled && page.detected > 0;
  expand.disabled = collapse.disabled = !available;
  if (!page) status.textContent = 'Open a GitHub PR diff, or refresh the tab after updating Test Fold.';
  else if (!page.isPR) status.textContent = 'Open a PR’s Files changed tab to fold tests.';
  else if (!page.enabled) status.textContent = 'Test folding is off.';
  else status.textContent = page.detected ? `${page.detected} test controls available in this diff.` : 'No complete tests found in the loaded diff.';
}

async function command(action, extra = {}) {
  if (tabId === undefined) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, {type: 'test-fold', action, ...extra});
  } catch (_) {
    // Non-GitHub pages and tabs opened before installation have no receiver.
    return null;
  }
}

toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  await chrome.storage.local.set({enabled});
  render(await command('set-enabled', {enabled}));
});
expand.addEventListener('click', async () => render(await command('expand')));
collapse.addEventListener('click', async () => render(await command('collapse')));

(async () => {
  toggle.disabled = true;
  const {enabled} = await chrome.storage.local.get({enabled: true});
  toggle.checked = enabled;
  // Querying the active tab's ID requires no tabs or broad host permission.
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  tabId = tab?.id;
  render(await command('status'));
  toggle.disabled = false;
})();
