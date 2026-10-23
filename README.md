# Test Fold for GitHub

A local Chrome extension that folds complete JavaScript and TypeScript test bodies in GitHub pull request diffs. The test declaration stays visible; click its arrow to expand the original code.

## Install

1. Keep this entire `test-fold` folder in a permanent location.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. Refresh a GitHub PR's **Files changed** page.

Click the **Test Fold** icon in Chrome’s toolbar to open its popup. Use **Enable test folding** and the single **Expand tests / Collapse tests** button. The button expands/collapses hooks along with tests. It offers collapse when all detected tests and hooks are expanded, and expand otherwise. Click outside the popup to close it. No floating bar covers the PR. The on/off preference is saved locally and synchronized across open GitHub tabs. Individual choices are kept while this page remains open and reset when switching PR routes or refreshing.

## Supported behavior

- Recognizes `test`, `it`, `fit`, `xit`, and `xtest`, including common `.only`, `.skip`, `.each` and `.todo` forms with block callbacks.
- Parses JavaScript, TypeScript and JSX using a bundled Babel parser.
- Folds setup and teardown hooks by default (`beforeAll`, `afterAll`, `beforeEach`, `afterEach`, Mocha aliases and `test.*` forms). Expanded hooks show **Collapse hook**. Suites and helper functions stay visible.
- Retains multiline test declarations and closing syntax.
- Handles added/deleted lines in classic and React table-based GitHub diffs.
- Leaves comment rows in place and keeps partial or unparseable tests expanded.
- Automatically rescans when GitHub loads more diff content.
- Makes no network requests and does not mark files as viewed or change the PR.

## Limitations

This first version folds only complete tests present in loaded, contiguous diff lines. Expand GitHub's hidden context to make more tests eligible. A test whose opening and closing lines are absent stays expanded. Single-line tests and expression callbacks stay visible.

Supports classic `.blob-code` diffs and the React `/changes` viewer’s `.diff-text-cell` structure. Version 0.2.0 was verified in Chrome against a private PR: ten test controls were detected; toolbar-popup expansion, collapse and on/off controls worked. The floating bar was absent. Only complete tests currently present in the DOM are eligible; loading or scrolling to more code triggers a rescan. It does not replace GitHub's viewer or fetch full file source.

Folded split-view cells can leave blank space where the opposite side has visible changes. Review comments remain on screen, but their associated code may need manual expansion. Parameterized `.each([...])` tests show the description first, with separate **N test cases** and **Test implementation** controls. Both start collapsed and participate in the popup bulk toggle. Expanding cases reveals only the input array, without the `.each` wrapper or callback; expanding implementation replaces the compact view with the full original test code. **Collapse test** returns to the compact summary with both cases and implementation collapsed. Literal arrays provide the case count; variable tables and spreads show **Test cases** without guessing a count. Runtime-generated cases are not evaluated.

## Files and privacy

`manifest.json` declares a Manifest V3 content script restricted to `github.com`. `detector.js` identifies complete tests; `content.js` adapts the diff and controls; `style.css` styles folding. `popup.html`, `popup.js` and `popup.css` implement the toolbar popup and send commands to the active tab. `vendor/parser.js` is a locally bundled Babel parser with its license in `vendor/LICENSE`.

The only extension API permission is `storage`. Code remains in your browser. No analytics, remote code, authentication tokens, or external services are used.

## Remove

Remove the extension at `chrome://extensions` and refresh the PR page to restore GitHub's original view.

## Run tests locally

Requires Node.js 20 or newer. From this folder, run:

```sh
npm test
```

No `npm install` or extension build step is required. To rerun tests automatically when files change:

```sh
npm run test:watch
```

The suite uses Node’s built-in test runner. `tests/detector.test.cjs` runs the real bundled parser and detector against test declarations, modifiers, TypeScript/JSX, multiline headers and missing diff context. `tests/popup.test.cjs` runs the real popup event handlers with fake DOM elements and Chrome APIs, checking the single expand/collapse button, saved on/off preference and unavailable-page states.

These are local unit tests. They do not launch Chrome or verify GitHub’s live diff markup; check that separately in the installed extension after changing `content.js` selectors or folding behavior.
