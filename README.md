# Github Fold

A local Chrome extension that folds complete JavaScript and TypeScript test bodies in GitHub pull request diffs. The test declaration stays visible; click its arrow to expand the original code.

## Install

1. Keep this entire `test-fold` folder in a permanent location.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. Refresh a GitHub PR's **Files changed** page.

Click the **Github Fold** icon in Chrome’s toolbar to open its popup. Use **On/off** and the single **Expand tests / Collapse tests** button. The button expands/collapses hooks along with tests. It offers collapse when all detected tests and hooks are expanded, and expand otherwise. Use the visible **Settings → Enable folding for** controls to enable folding for tests, hooks and test cases. Turning **Tests** off also turns **Test cases** off and disables that checkbox. Turning **Tests** back on makes the checkbox available again; test cases stay off until selected. Turning a category off keeps its code visible and removes its inline folding controls. With **Test cases** off, the original `.each(...)` declaration stays visible, and the callback body can still be folded. All categories start enabled; newly enabled categories start collapsed. Preferences are saved and apply to open tabs and newly loaded blocks. Individual fold controls and the bulk toggle can still override the current view. Click outside the popup to close it. No floating bar covers the PR. The on/off preference is saved locally and synchronized across open GitHub tabs. Individual choices are kept while this page remains open and reset when switching PR routes or refreshing.

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

Folded split-view cells can leave blank space where the opposite side has visible changes. Review comments remain on screen, but their associated code may need manual expansion. Parameterized `.each([...])` tests show the description first, with separate **N test cases** and **Expand test** controls. Both start collapsed and participate in the popup bulk toggle. Expanding cases reveals only the input array, without the `.each` wrapper or callback; expanding implementation shows the full original test code beneath a stable description and controls. The header stays visible in both states. **Collapse test** returns to the compact summary with both cases and implementation collapsed. Literal arrays provide the case count; variable tables and spreads show **Test cases** without guessing a count. Runtime-generated cases are not evaluated.

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


## Stable toggling

Individual toggles reuse parsed diff ranges and update the clicked test’s controls, preserving controls on other tests and keyboard focus. The clicked control’s screen position is preserved by correcting its nearest scrolling pane after the layout changes. Bulk expand/collapse anchors the test control nearest the top of the visible page. GitHub-driven diff changes still trigger a source rescan.

The local suite includes DOM-fixture regression tests for individual/bulk toggles and parameterized cases, plus scroll-anchor tests for window and nested-pane scrolling. Browser scroll limits can prevent exact position preservation near the end of a document; live GitHub layout behavior should still be checked in Chrome.

Only parameterized `.each` tests use stable summary headers. Ordinary tests and hooks use inline controls beside their original declarations; their button elements are retained while toggling. For parameterized tests, case inputs appear below both controls so opening cases does not move the implementation button.


## Functions and methods

Enable **Functions and methods** in the popup to fold JavaScript/TypeScript function bodies. This option starts off and is saved independently of test/hook settings. Named functions, exported/async functions, function expressions, block arrow functions, class/object methods, constructors, getters/setters and arrow class properties are supported when their complete body is present in the loaded diff.

JSDoc and decorators remain visible above the declaration. Names, parameters, generics and return types stay visible, including multiline signatures. Interfaces, type declarations and overload signatures remain untouched. Collapsed bodies show **X lines**; expanded bodies show **Collapse function**. The bulk popup action also includes enabled function folds. Incomplete bodies and expression-only arrows stay visible.

## Sidebar file tags

GitHub's PR file tree shows badges immediately beside filenames. Tests are yellow; Wiring, Interfaces and Generated use light backgrounds. Other tags include Infra, Dependencies, Migrations, Validation, Config, Automation, Docs, Assets and UI. API, Logic and Data tags are omitted.

Rules live in `file-tags.js` and use filename/path conventions. Generated may accompany a primary tag. Unknown files stay untagged. Wiring currently identifies conventional `index.js`/`index.ts` barrels, `register.ts` files and module registration filenames by name; it does not inspect their contents. GitHub's React sidebar is supported; folder roll-ups and repository-specific overrides are not included.

The Interfaces tag covers `*.interface.ts`, `*.interfaces.ts`, `*.types.ts`, `*.d.ts`, `*.dto.ts`, and files in `types/`, `interfaces/`, `dto/` or `dtos/` directories.

Config covers `config.ts`, `configs.ts`, `*.config.ts`, `.env`, `.env.*` and `*.env`. ZIP files are not classified as Assets based on their extension. Files in `yarn/.cache/` receive only Generated. Files in `.yarn/cache/` use the normal filename rules; ZIP files there remain untagged unless another rule matches.

The PR sidebar starts `.yarn/cache/` and `yarn/.cache/` folders collapsed. You can expand them normally; the extension only collapses each folder once per PR per page load, independently of the File tags setting.

Explicit Config filenames take priority over general directory tags, while test files retain Tests.

The On/off switch controls all extension features: folding, file tags and automatic cache-folder collapsing. Individual feature preferences are retained while off.
