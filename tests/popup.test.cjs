const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(resolve(__dirname, '..', 'popup.js'), 'utf8');

// Minimal browser boundary: actual popup event handlers run unchanged. Chrome
// storage, messaging and DOM elements are fakes, so no browser/install is needed.
async function openPopup({page = {}, missingReceiver = false, noTab = false} = {}) {
  const elements = Object.fromEntries(['enabled', 'fold-toggle', 'status', 'foldTests', 'foldHooks', 'foldCases', 'foldFunctions', 'fileTags'].map(id => [id, {
    checked: false, disabled: false, textContent: '',
    handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; },
  }]));
  let current = {enabled: true, isPR: true, detected: 3, allExpanded: false, ...page};
  const messages = [], writes = [];
  const context = vm.createContext({
    document: {getElementById: id => elements[id]},
    chrome: {
      storage: {local: {
        get: async () => ({enabled: current.enabled}),
        set: async value => writes.push(JSON.parse(JSON.stringify(value))),
      }},
      tabs: {
        query: async () => noTab ? [] : [{id: 42}],
        sendMessage: async (id, message) => {
          messages.push({id, ...JSON.parse(JSON.stringify(message))});
          if (missingReceiver) throw Error('No receiving content script');
          // Simulate page responses; test assertions verify the outgoing commands.
          if (message.action === 'toggle') current.allExpanded = !current.allExpanded;
          if (message.action === 'set-enabled') current.enabled = message.enabled;
          return {...current};
        },
      },
    },
  });
  vm.runInContext(source, context);
  // Wait for the popup's asynchronous startup/storage/query/message chain.
  await new Promise(resolve => setImmediate(resolve));
  return {elements, messages, writes};
}

test('offers Expand tests when the diff is collapsed or mixed', async () => {
  const {elements, messages} = await openPopup();
  assert.equal(elements['fold-toggle'].textContent, 'Expand tests');
  assert.equal(elements['fold-toggle'].disabled, false);
  assert.equal(messages[0].action, 'status');
  assert.equal(elements.status.textContent, '');
  assert.equal(elements.status.hidden, true);
});

test('toggles one button from expand to collapse and back', async () => {
  const {elements, messages} = await openPopup();
  await elements['fold-toggle'].handlers.click();
  assert.equal(elements['fold-toggle'].textContent, 'Collapse tests');
  await elements['fold-toggle'].handlers.click();
  assert.equal(elements['fold-toggle'].textContent, 'Expand tests');
  assert.deepEqual(messages.slice(1).map(m => m.action), ['toggle', 'toggle']);
  assert(messages.every(m => m.id === 42 && m.type === 'test-fold'));
});

test('reopening the popup uses the page’s existing expanded state', async () => {
  const {elements} = await openPopup({page: {allExpanded: true}});
  assert.equal(elements['fold-toggle'].textContent, 'Collapse tests');
});

test('on/off toggle persists the preference and updates the active page', async () => {
  const {elements, messages, writes} = await openPopup();
  elements.enabled.checked = false;
  await elements.enabled.handlers.change();
  assert.deepEqual(writes, [{enabled: false}]);
  assert.equal(messages.at(-1).action, 'set-enabled');
  assert.equal(messages.at(-1).enabled, false);
  assert.equal(elements['fold-toggle'].disabled, true);
  assert.equal(elements.status.textContent, 'Test folding is off.');
  elements.enabled.checked = true;
  await elements.enabled.handlers.change();
  assert.equal(elements['fold-toggle'].disabled, false);
});

for (const [name, options, expected] of [
  ['disabled extension', {page: {enabled: false}}, /off/],
  ['empty diff', {page: {detected: 0}}, /No folding controls/],
  ['non-PR tab', {page: {isPR: false}}, /Files changed/],
  ['missing content script', {missingReceiver: true}, /refresh the tab/],
  ['no active tab', {noTab: true}, /Open a GitHub PR diff/],
]) {
  test(`disables the fold button for ${name}`, async () => {
    const {elements} = await openPopup(options);
    assert.equal(elements['fold-toggle'].disabled, true);
    assert.equal(elements.enabled.disabled, false);
    assert.match(elements.status.textContent, expected);
  });
}


for (const key of ['foldHooks', 'foldCases']) {
  test(`saves and applies the ${key} folding setting independently`, async () => {
    const {elements, messages, writes} = await openPopup();
    assert.equal(elements[key].checked, true);
    elements[key].checked = false;
    await elements[key].handlers.change();
    assert.deepEqual(writes, [{[key]: false}]);
    assert.equal(messages.at(-1).action, 'set-settings');
    assert.deepEqual(messages.at(-1).settings, {[key]: false});
  });
}


test('disabling tests switches off and disables test cases', async () => {
  const {elements, writes, messages} = await openPopup();
  elements.foldTests.checked = false;
  await elements.foldTests.handlers.change();
  assert.equal(elements.foldCases.checked, false);
  assert.equal(elements.foldCases.disabled, true);
  assert.deepEqual(writes.at(-1), {foldTests: false, foldCases: false});
  assert.deepEqual(messages.at(-1).settings, {foldTests: false, foldCases: false});
  elements.foldTests.checked = true;
  await elements.foldTests.handlers.change();
  assert.equal(elements.foldCases.disabled, false);
  assert.equal(elements.foldCases.checked, false);
});


test('function folding has an independent saved popup setting', async () => {
  const {elements, writes, messages} = await openPopup();
  assert.equal(elements.foldFunctions.checked, false);
  elements.foldFunctions.checked = true;
  await elements.foldFunctions.handlers.change();
  assert.deepEqual(writes.at(-1), {foldFunctions: true});
  assert.deepEqual(messages.at(-1).settings, {foldFunctions: true});
});


test('file tags can be switched off independently and the preference is saved', async () => {
  const {elements, writes} = await openPopup();
  assert.equal(elements.fileTags.checked, true);
  elements.fileTags.checked = false;
  await elements.fileTags.handlers.change();
  assert.deepEqual(writes.at(-1), {fileTags: false});
  assert.equal(elements.enabled.checked, true);
});
