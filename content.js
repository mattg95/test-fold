// Connect the test detector to GitHub’s loaded PR diff and manage folding controls.
(() => {
  let enabled = true, timer, applying = false;
  // Expansion choices last for this page session; only the global on/off setting
  // is persisted in Chrome storage. Map values are true when a test is expanded.
  const states = new Map();
  let route = '';
  // Keep GitHub-specific markup selectors together. Line handling below expects
  // classic and React table-based diffs; unsupported renderers are left untouched.
  const fileSelector = '.file, [data-file-path], [data-testid="diff-file"], table[data-diff-anchor]';
  const codeSelector = '.blob-code, [data-testid="diff-line-code"], td.diff-text-cell[data-line-number]';
  // The browser-action popup asks for status and sends bulk commands by message.
  // Inline disclosure buttons remain part of the diff; no floating bar is injected.
  let detected = 0;
  function button(label, action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', event => { event.stopPropagation(); action(); });
    return b;
  }
  function pageStatus() {
    return {enabled, detected, isPR: /\/pull\/\d+\/(?:files|changes)(?:\/|$)/.test(location.pathname)};
  }
  // Bulk actions affect tests discovered so far. Newly loaded tests start collapsed.
  function setAll(value) { for (const key of states.keys()) states.set(key, value); schedule(); }
  // Debounce bursts of GitHub DOM updates into one scan.
  function schedule() { clearTimeout(timer); timer = setTimeout(apply, 180); }
  // Undo our previous display changes before reading source text again.
  // Original code nodes stay in place, preserving GitHub’s syntax highlighting.
  function cleanup() {
    document.querySelectorAll('.tf-fold').forEach(n => n.remove());
    document.querySelectorAll('.tf-hidden, .tf-row-hidden').forEach(n => n.classList.remove('tf-hidden', 'tf-row-hidden'));
  }
  // Unified diffs have two line-number cells before one code cell. Split diffs
  // put each side’s line number immediately before its corresponding code cell.
  function lineNumber(cell, side) {
    const row = cell.closest('tr');
    if (!row) return null;
    // React diffs put both source coordinates in the line key, even when
    // a unified context cell displays only the right-hand line number.
    const key = cell.getAttribute('data-diff-line-key');
    if (key) {
      const match = key.match(/-l:(null|\d+)-r:(null|\d+)(?:$|[^0-9])/);
      if (match) {
        const value = match[side === 'old' ? 1 : 2];
        return value === 'null' ? null : Number(value);
      }
    }
    const nums = [...row.querySelectorAll('.blob-num')];
    const split = row.querySelectorAll(codeSelector).length > 1;
    const num = split ? cell.previousElementSibling : nums[side === 'old' ? 0 : nums.length - 1];
    const n = num?.getAttribute('data-line-number');
    return n && /^\d+$/.test(n) ? Number(n) : null;
  }
  function apply() {
    if (applying) return;
    // Disconnect while changing the DOM so our own buttons/classes do not
    // trigger a continuous cycle of rescanning. The finally block reconnects it.
    applying = true; observer.disconnect();
    try {
      // GitHub can navigate without reloading. Reset test choices on route changes.
      if (route !== location.pathname) { states.clear(); route = location.pathname; }
      cleanup();
      const {isPR} = pageStatus();
      detected = 0;
      if (!enabled || !isPR) return;
      // Process only outermost file containers to avoid scanning nested matches twice.
      const files = [...document.querySelectorAll(fileSelector)].filter(f => !f.parentElement.closest(fileSelector));
      let found = 0;
      for (const file of files) {
        const path = file.getAttribute('aria-label') || file.getAttribute('data-tagsearch-path') || file.getAttribute('data-path') || file.getAttribute('data-file-path') || file.querySelector('[title]')?.getAttribute('title') || String(files.indexOf(file));
        const cells = [...file.querySelectorAll(codeSelector)].filter(c => c.closest('tr'));
        // A unified context cell belongs to both versions of the file. Record
        // which sides use each cell and which sides want it hidden.
        const present = new Map(), hidden = new Map();
        // Reconstruct old and new source separately: parsing a mixture of deleted
        // and added lines could invent invalid code or incorrect test boundaries.
        for (const side of ['old', 'new']) {
          const lines = [];
          const occurrences = new Map();
          for (const cell of cells) {
            const row = cell.closest('tr');
            const rowCells = [...row.querySelectorAll(codeSelector)];
            const split = rowCells.length > 1;
            const removed = (cell.classList.contains('blob-code-deletion') || !!cell.querySelector('.diff-text.deletion'));
            const added = (cell.classList.contains('blob-code-addition') || !!cell.querySelector('.diff-text.addition'));
            if (split ? cell !== rowCells[side === 'old' ? 0 : rowCells.length - 1] : (side === 'old' ? added : removed)) continue;
            const number = lineNumber(cell, side);
            if (!number) continue;
            const inner = cell.querySelector('.blob-code-inner, .diff-text-inner') || cell;
            // The old-side scan may already have inserted a button. Remove
            // extension controls from the clone so they never become parser input.
            const copy = inner.cloneNode(true);
            copy.querySelectorAll('.tf-fold').forEach(n => n.remove());
            lines.push({number, text: copy.textContent, cell, row, inner});
            if (!present.has(cell)) present.set(cell, new Set());
            present.get(cell).add(side);
          }
          for (const range of TestFoldDetect(lines)) {
            const header = lines[range.header];
            // Pair matching declarations across diff sides and distinguish
            // repeated descriptions using their occurrence within this file/side.
            const occurrence = occurrences.get(range.description) || 0;
            occurrences.set(range.description, occurrence + 1);
            const key = `${path}:${range.description}:${occurrence}`;
            if (!states.has(key)) states.set(key, false);
            const expanded = states.get(key);
            const b = button(`${expanded ? '▾' : '▸'} ${expanded ? 'Collapse test' : `${range.end - range.start} lines`}`, () => {
              states.set(key, !states.get(key)); schedule();
            });
            b.className = 'tf-fold'; b.setAttribute('aria-expanded', String(expanded));
            b.title = range.description;
            // Shared context headers need only one control for the same test.
            if (![...header.inner.querySelectorAll('.tf-fold')].some(n => n.dataset.key === key)) {
              b.dataset.key = key; header.inner.prepend(b); found++;
            }
            if (!expanded) for (let k = range.start; k < range.end; k++) {
              const cell = lines[k].cell;
              if (!hidden.has(cell)) hidden.set(cell, new Set());
              hidden.get(cell).add(side);
            }
          }
        }
        // Hide shared cells only when every side that uses them is folded.
        // This keeps an expanded side visible in a unified diff.
        for (const [cell, sides] of present) {
          if ([...sides].every(side => hidden.get(cell)?.has(side))) cell.classList.add('tf-hidden');
        }
        // Remove the row’s vertical space only when all its code is hidden or
        // empty. Preserve rows containing review comments. In split view, a
        // folded cell stays blank if its opposite cell still needs to be visible.
        for (const row of file.querySelectorAll('tr')) {
          const code = [...row.querySelectorAll(codeSelector)];
          if (code.length && code.every(c => c.classList.contains('tf-hidden') || !c.textContent.trim()) && !row.querySelector('.review-comment, .js-inline-comments-container, [data-testid*="comment"]')) row.classList.add('tf-row-hidden');
        }
      }
      detected = found;
    } finally {
      applying = false;
      observer.observe(document.body, {childList: true, subtree: true});
    }
  }
  // Watch lazy-loaded files/context and GitHub navigation. Load the saved
  // preference before the initial scan to avoid briefly folding when disabled.
  const observer = new MutationObserver(schedule);
  chrome.storage.local.get({enabled: true}, value => { enabled = value.enabled; apply(); });
  // Synchronize the global preference across already-open GitHub tabs.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      schedule();
    }
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'test-fold') return;
    if (message.action === 'set-enabled') enabled = message.enabled === true;
    if (message.action === 'expand' || message.action === 'collapse') {
      // Scan first so a just-loaded file participates in the bulk action.
      apply();
      setAll(message.action === 'expand');
    }
    clearTimeout(timer);
    apply();
    respond(pageStatus());
  });
  window.addEventListener('popstate', schedule);
  document.addEventListener('turbo:load', schedule);
})();
