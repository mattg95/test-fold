// Chrome creates this popup when the toolbar icon is clicked and closes it
// when the user clicks elsewhere. Keep folding state in the content script.
const toggle = document.getElementById('enabled');
const foldToggle = document.getElementById('fold-toggle');
const status = document.getElementById('status');
let tabId;
const settings = Object.fromEntries(['foldTests', 'foldHooks', 'foldCases'].map(key => [key, document.getElementById(key)]));
for (const [key, input] of Object.entries(settings)) {
  input.disabled = true;
  input.addEventListener('change', async () => {
    const values = {[key]: input.checked};
    if (key === 'foldTests' && !input.checked) {
      values.foldCases = false;
      settings.foldCases.checked = false;
    }
    settings.foldCases.disabled = !settings.foldTests.checked;
    await chrome.storage.local.set(values);
    render(await command('set-settings', {settings: values}));
  });
}

function render(page) {
  const available = page?.isPR && page.enabled && page.detected > 0;
  foldToggle.disabled = !available;
  foldToggle.textContent = page?.allExpanded ? 'Collapse tests' : 'Expand tests';
  if (!page) status.textContent = 'Open a GitHub PR diff, or refresh the tab after updating Test Fold.';
  else if (!page.isPR) status.textContent = 'Open a PR’s Files changed tab to fold tests.';
  else if (!page.enabled) status.textContent = 'Test folding is off.';
  else status.textContent = page.detected ? '' : 'No folding controls available in this diff.';
  status.hidden = !status.textContent;
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
// Decide the next action in the content script so reopening the popup or
// individually expanding a test cannot leave the button out of sync.
foldToggle.addEventListener('click', async () => render(await command('toggle')));

(async () => {
  toggle.disabled = true;
  const saved = await chrome.storage.local.get({enabled: true, foldTests: true, foldHooks: true, foldCases: true});
  toggle.checked = saved.enabled;
  for (const [key, input] of Object.entries(settings)) { input.checked = saved[key] !== false; input.disabled = false; }
  settings.foldCases.disabled = !settings.foldTests.checked;
  if (!settings.foldTests.checked) {
    settings.foldCases.checked = false;
    if (saved.foldCases !== false) await chrome.storage.local.set({foldCases: false});
  }
  // Querying the active tab's ID requires no tabs or broad host permission.
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  tabId = tab?.id;
  render(await command('status'));
  toggle.disabled = false;
})();
