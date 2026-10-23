// Connect the test detector to GitHub’s loaded PR diff and manage folding controls.
(() => {
  let enabled = true, timer, applying = false;
  // Expansion choices last for this page session; only the global on/off setting
  // is persisted in Chrome storage. Map values are true when a test is expanded.
  const states = new Map();
  const categories = new Map();
  const defaults = {foldTests: true, foldHooks: true, foldCases: true};
  // Settings enable folding per category; reenabled categories start collapsed.
  function updateSettings(values) {
    values = {...values};
    if (values.foldTests === false || (values.foldTests === undefined && !defaults.foldTests)) values.foldCases = false;
    for (const key of Object.keys(defaults)) {
      if (typeof values[key] !== 'boolean') continue;
      defaults[key] = values[key];
      for (const [id, category] of categories) if (category === key) states.set(id, false);
    }
  }
  let route = '';
  // Parsed source is reused for toggles; rescan only when GitHub changes the diff.
  let sourceCache = new WeakMap();
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
    // Mixed states offer Expand tests; only a fully expanded diff offers Collapse.
    const controls = [...document.querySelectorAll('.tf-fold')];
    const allExpanded = controls.length > 0 && controls.every(b => b.getAttribute('aria-expanded') === 'true');
    return {enabled, detected, allExpanded, isPR: /\/pull\/\d+\/(?:files|changes)(?:\/|$)/.test(location.pathname)};
  }
  // Debounce bursts of GitHub DOM updates into one scan.
  function schedule() { clearTimeout(timer); timer = setTimeout(apply, 180); }
  // Undo our previous display changes before reading source text again.
  // Original code nodes stay in place, preserving GitHub’s syntax highlighting.
  function cleanup(keys = null) {
    // Keyed toggles reuse the existing header and buttons in place.
    if (keys) return;
    document.querySelectorAll('.tf-each-ui, .tf-fold').forEach(n => n.remove());
    // Restore original syntax nodes before rescanning or turning folding off.
    document.querySelectorAll('.tf-each-source').forEach(n => n.replaceWith(...n.childNodes));
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
  function apply({keys = null, anchor = null} = {}) {
    clearTimeout(timer);
    anchor ||= TestFoldViewport.nearest(document.querySelectorAll('.tf-fold'));
    const restorePosition = TestFoldViewport.capture(anchor);
    const anchorKey = anchor?.dataset.key;
    const hadFocus = anchor && document.activeElement === anchor;
    if (applying) return;
    // Disconnect while changing the DOM so our own buttons/classes do not
    // trigger a continuous cycle of rescanning. The finally block reconnects it.
    applying = true; observer.disconnect();
    try {
      // GitHub can navigate without reloading. Reset test choices on route changes.
      if (route !== location.pathname) { states.clear(); categories.clear(); route = location.pathname; }
      cleanup(keys);
      if (!keys) sourceCache = new WeakMap();
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
          const cached = keys ? sourceCache.get(file)?.[side] : null;
          const lines = cached?.lines || [];
          const occurrences = new Map();
          if (!cached) for (const cell of cells) {
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
            copy.querySelectorAll('.tf-each-ui, .tf-fold').forEach(n => n.remove());
            lines.push({number, text: copy.textContent, cell, row, inner});
            if (!present.has(cell)) present.set(cell, new Set());
            present.get(cell).add(side);
          }
          if (cached) for (const {cell} of lines) {
            if (!present.has(cell)) present.set(cell, new Set());
            present.get(cell).add(side);
          }
          const ranges = cached?.ranges || TestFoldDetect(lines);
          if (!cached) {
            if (!sourceCache.has(file)) sourceCache.set(file, {});
            sourceCache.get(file)[side] = {lines, ranges};
          }
          for (const range of ranges) {
            const header = lines[range.header];
            // Pair matching declarations across diff sides and distinguish
            // repeated descriptions using their occurrence within this file/side.
            const occurrence = occurrences.get(range.description) || 0;
            occurrences.set(range.description, occurrence + 1);
            const key = `${path}:${range.description}:${occurrence}`;
            const category = range.kind === 'hook' ? 'foldHooks' : 'foldTests';
            categories.set(key, category);
            if (!states.has(key)) states.set(key, false);
            if (range.each) {
              categories.set(`${key}:cases`, 'foldCases');
              if (!states.has(`${key}:cases`)) states.set(`${key}:cases`, false);
            }
            const policy = TestFoldPolicy(range, defaults, states.get(key));
            if (!policy.active) continue;
            const expanded = policy.expanded;
            const b = button(`${expanded ? '▾' : '▸'} ${expanded ? (range.kind === 'hook' ? 'Collapse hook' : 'Collapse test') : `${range.end - range.start} lines`}`, () => {
              const nextExpanded = !states.get(key);
              states.set(key, nextExpanded);
              // Collapsing the full test also resets its independently opened cases.
              if (range.each && !nextExpanded) states.set(`${key}:cases`, false);
              apply({keys: new Set([key]), anchor: b});
            });
            b.className = 'tf-fold'; b.setAttribute('aria-expanded', String(expanded));
            b.title = range.description;
            // Shared context headers need only one control for the same test.
            if (![...header.inner.querySelectorAll('.tf-fold')].some(n => n.dataset.key === key)) {
              b.dataset.key = key;
              if (range.each && policy.cases) {
                // Only parameterized summaries have a persistent header.
                // Ordinary tests and hooks retain their original inline layout.
                const casesKey = `${key}:cases`;
                if (range.each && !states.has(casesKey)) states.set(casesKey, false);
                const casesExpanded = !policy.cases || states.get(casesKey);
                let original = header.inner.querySelector('.tf-each-source');
                if (!original) {
                  original = document.createElement('span'); original.className = 'tf-each-source';
                  original.append(...header.inner.childNodes); header.inner.append(original);
                }
                const ui = document.createElement('span'); ui.className = 'tf-each-ui';
                const title = document.createElement('span'); title.className = 'tf-each-title';
                title.textContent = range.each && policy.cases ? range.each.title : range.title;
                const caseLabel = range.each?.count == null ? 'Test cases' : `${range.each.count} test ${range.each.count === 1 ? 'case' : 'cases'}`;
                const casesButton = button(`${casesExpanded ? '▾' : '▸'} ${caseLabel}`, () => {
                  states.set(casesKey, !states.get(casesKey));
                  apply({keys: new Set([key]), anchor: casesButton});
                });
                casesButton.className = 'tf-fold tf-cases';
                casesButton.dataset.key = casesKey;
                casesButton.setAttribute('aria-expanded', String(casesExpanded));
                b.textContent = `${expanded ? '▾' : '▸'} ${range.kind === 'hook' ? (expanded ? 'Collapse hook' : 'Expand hook') : (expanded ? 'Collapse test' : 'Expand tests')}`;
                // Render only the parsed input expression, never the .each call
                // wrapper or callback. textContent keeps source text inert.
                const casesCode = document.createElement('pre'); casesCode.className = 'tf-each-cases';
                casesCode.textContent = range.each?.casesDisplay || range.each?.casesSource || '';
                // Animate an intrinsic-height grid, keeping the stable controls
                // above it stationary. No guessed maximum height is required.
                const reveal = document.createElement('div'); reveal.className = 'tf-cases-reveal';
                const clip = document.createElement('div'); clip.className = 'tf-cases-clip';
                clip.append(casesCode); reveal.append(clip);
                reveal.classList.toggle('tf-cases-open', !!casesExpanded);
                reveal.setAttribute('aria-hidden', String(!casesExpanded));
                reveal.inert = !casesExpanded;
                ui.append(title);
                if (policy.cases) { ui.append(casesButton); found++; }
                if (policy.implementation) { ui.append(b); found++; }
                if (policy.cases) ui.append(reveal);
                header.inner.prepend(ui);
              } else { header.inner.prepend(b); found++; }
            }
            // Preserve header/button identity and focus during ordinary toggles.
            // Settings or GitHub source changes still trigger a full rebuild.
            const liveButton = [...header.inner.querySelectorAll('.tf-fold')].find(n => n.dataset.key === key);
            if (liveButton) {
              liveButton.setAttribute('aria-expanded', String(expanded));
              liveButton.textContent = `${expanded ? '▾' : '▸'} ${expanded ? (range.kind === 'hook' ? 'Collapse hook' : 'Collapse test') : (range.each && policy.cases ? 'Expand tests' : `${range.end - range.start} lines`)}`;
            }
            if (range.each && policy.cases) {
              const liveCases = [...header.inner.querySelectorAll('.tf-cases')].find(n => n.dataset.key === `${key}:cases`);
              const open = states.get(`${key}:cases`);
              if (liveCases) {
                liveCases.setAttribute('aria-expanded', String(open));
                const label = range.each.count === null ? 'Test cases' : `${range.each.count} test ${range.each.count === 1 ? 'case' : 'cases'}`;
                liveCases.textContent = `${open ? '▾' : '▸'} ${label}`;
                const reveal = liveCases.parentElement.querySelector('.tf-cases-reveal');
                reveal.classList.toggle('tf-cases-open', !!open);
                reveal.setAttribute('aria-hidden', String(!open));
                reveal.inert = !open;
              }
            }
            // Cases alone reveal only their array. Expanding implementation
            // instead restores every original line, including the .each wrapper.
            const hideDeclaration = !expanded && !!range.each && policy.cases;
            if (hideDeclaration) {
              for (let k = range.header + 1; k < range.start; k++) {
                const cell = lines[k].cell;
                if (!hidden.has(cell)) hidden.set(cell, new Set());
                hidden.get(cell).add(side);
              }
            }
            // The callback/call closing syntax belongs to the hidden wrapper.
            if (hideDeclaration) for (let k = range.end; k < range.closingEnd; k++) {
              const cell = lines[k].cell;
              if (!hidden.has(cell)) hidden.set(cell, new Set());
              hidden.get(cell).add(side);
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
        // Original headers are restored by cleanup when folding is disabled.
        for (const original of file.querySelectorAll('.tf-each-source')) {
          // Unified headers can be shared by both versions. An expanded
          // original-code control takes precedence over the compact view.
          const controls = [...original.parentElement.querySelectorAll('.tf-fold')];
          const expandedControl = controls.some(n => !n.classList.contains('tf-cases') && n.getAttribute('aria-expanded') === 'true');
          // When case folding is disabled, preserve the original .each header.
          const keepEachDeclaration = !defaults.foldCases && original.textContent.includes('.each');
          original.classList.toggle('tf-each-source-hidden', !expandedControl && !keepEachDeclaration);
        }
        for (const [cell, sides] of present) {
          cell.classList.toggle('tf-hidden', [...sides].every(side => hidden.get(cell)?.has(side)));
        }
        // Remove the row’s vertical space only when all its code is hidden or
        // empty. Preserve rows containing review comments. In split view, a
        // folded cell stays blank if its opposite cell still needs to be visible.
        for (const row of file.querySelectorAll('tr')) {
          const code = [...row.querySelectorAll(codeSelector)];
          row.classList.toggle('tf-row-hidden', !!(code.length && code.every(c => c.classList.contains('tf-hidden') || !c.textContent.trim()) && !row.querySelector('.review-comment, .js-inline-comments-container, [data-testid*="comment"]')));
        }
      }
      detected = document.querySelectorAll('.tf-fold').length;
      const controls = [...document.querySelectorAll('.tf-fold')];
      const replacement = anchorKey ? controls.find(n => n.dataset.key === anchorKey) || controls.find(n => n.dataset.key === anchorKey.replace(/:cases$/, '')) : anchor;
      if (hadFocus && replacement) replacement.focus({preventScroll: true});
      restorePosition(replacement);
    } finally {
      applying = false;
      observer.observe(document.body, {childList: true, subtree: true});
    }
  }
  // Watch lazy-loaded files/context and GitHub navigation. Load the saved
  // preference before the initial scan to avoid briefly folding when disabled.
  const observer = new MutationObserver(schedule);
  chrome.storage.local.get({enabled: true, ...defaults}, value => { enabled = value.enabled; updateSettings(value); apply(); });
  // Synchronize the global preference across already-open GitHub tabs.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    updateSettings(Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue ?? false])));
    schedule();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'test-fold') return;
    // Opening the popup only reads state; it must not rebuild the diff.
    if (message.action === 'status') { respond(pageStatus()); return; }
    if (message.action === 'set-settings') updateSettings(message.settings || {});
    if (message.action === 'set-enabled') enabled = message.enabled === true;
    if (message.action === 'expand' || message.action === 'collapse' || message.action === 'toggle') {
      const anchor = TestFoldViewport.nearest(document.querySelectorAll('.tf-fold'));
      const keys = new Set(states.keys());
      const expand = message.action === 'toggle' ? !pageStatus().allExpanded : message.action === 'expand';
      for (const key of keys) states.set(key, expand);
      clearTimeout(timer);
      apply({keys, anchor});
      respond(pageStatus());
      return;
    }
    clearTimeout(timer);
    apply();
    respond(pageStatus());
  });
  window.addEventListener('popstate', schedule);
  document.addEventListener('turbo:load', schedule);
})();
