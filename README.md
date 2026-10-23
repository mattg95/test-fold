# Test Fold for GitHub

A local Chrome extension that folds complete JavaScript and TypeScript test bodies in GitHub pull request diffs. The test declaration stays visible; click its arrow to expand the original code.

## Install

1. Keep this entire `test-fold` folder in a permanent location.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. Refresh a GitHub PR's **Files changed** page.

The controls appear in the bottom right. Use **Expand tests**, **Collapse tests**, or **Test Fold: on/off**. The on/off preference is saved locally. Individual choices are kept while this page remains open and reset when switching PR routes or refreshing.

## Supported behavior

- Recognizes `test`, `it`, `fit`, `xit`, and `xtest`, including common `.only`, `.skip`, `.each` and `.todo` forms with block callbacks.
- Parses JavaScript, TypeScript and JSX using a bundled Babel parser.
- Leaves suites, setup hooks and helper functions visible.
- Retains multiline test declarations and closing syntax.
- Handles added/deleted lines and traditional table-based unified/split GitHub diffs.
- Leaves comment rows in place and keeps partial or unparseable tests expanded.
- Automatically rescans when GitHub loads more diff content.
- Makes no network requests and does not mark files as viewed or change the PR.

## Limitations

This first version folds only complete tests present in loaded, contiguous diff lines. Expand GitHub's hidden context to make more tests eligible. A test whose opening and closing lines are absent stays expanded. Single-line tests and expression callbacks stay visible.

GitHub has multiple diff renderers. This version targets table-based diffs (`.blob-code` rows), whose markup was checked on a public Playwright PR; a different or virtualized renderer may show no fold controls. It does not replace GitHub's viewer or fetch full file source. Installing and running the extension in Chrome has not yet been verified because a Chrome connection was unavailable.

Folded split-view cells can leave blank space where the opposite side has visible changes. Review comments remain on screen, but their associated code may need manual expansion. Parameterized tests fold their shared callback, rather than expanding into individual generated cases.

## Files and privacy

`manifest.json` declares a Manifest V3 content script restricted to `github.com`. `detector.js` identifies complete tests; `content.js` adapts the diff and controls; `style.css` styles folding. `vendor/parser.js` is a locally bundled Babel parser with its license in `vendor/LICENSE`.

The only extension API permission is `storage`. Code remains in your browser. No analytics, remote code, authentication tokens, or external services are used.

## Remove

Remove the extension at `chrome://extensions` and refresh the PR page to restore GitHub's original view.
