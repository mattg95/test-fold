// Filename/path rules stay separate from rendering so they can be tested locally.
globalThis.TestFoldFileTags = path => {
  const p = path.toLowerCase().replace(/\\/g, '/');
  const name = p.split('/').pop();
  // The legacy cache path retains its Generated classification.
  if (/(^|\/)yarn\/\.cache\//.test(p)) return ['Generated'];
  let primary = null;
  const generated = /(^|\/)(generated|__generated__|dist|build)\//.test(p) || /(?:\.gen\.|\.generated\.|\.min\.)/.test(name) || /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|poetry\.lock|uv\.lock|\.terraform\.lock\.hcl)$/.test(name);
  if (/(^|\/)(__tests__|tests?|e2e|specs?)\//.test(p) || /\.(test|spec|e2e-spec)\.[^.]+$|_test\.py$|^test_.*\.py$|test\.php$/.test(name)) primary = 'Tests';
  // Explicit config filenames take priority over broad directory classifications.
  else if (/^configs\.ts$|config\.[^.]+$|^tsconfig.*\.json$|^\.(eslint|prettier|babel)|^\.env(?:\..*)?$|\.env$|\.ini$/.test(name)) primary = 'Config';
  else if (/(^|\/)(migrations|alembic\/versions)\//.test(p) || /\.migration\.[^.]+$/.test(name)) primary = 'Migrations';
  else if (/^(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|composer\.(json|lock)|pyproject\.toml|poetry\.lock|uv\.lock|requirements.*\.txt|pipfile(?:\.lock)?)$/.test(name)) primary = 'Dependencies';
  else if (/\.(tf|tfvars)(\.json)?$/.test(name) || /(^|\/)(terraform|cloudformation|cdk|k8s|kubernetes|helm)\//.test(p) || /^(dockerfile(?:\..*)?|docker-compose.*\.ya?ml|compose\.ya?ml|cdk\.json|samconfig\.toml|\.terraform\.lock\.hcl)$/.test(name)) primary = 'Infra';
  else if (/(^|\/)(\.github\/workflows|\.circleci|scripts)\//.test(p) || /^(jenkinsfile|makefile|\.gitlab-ci\.yml)$/.test(name)) primary = 'Automation';
  else if (/\.d\.ts$|(^|\.)(types|interfaces?|dto)\.tsx?$/.test(name) || /(^|\/)(types|interfaces|dtos?)\//.test(p)) primary = 'Interfaces';
  else if (/(^|\/)(validators?|validation|schemas?)\//.test(p) || /\.(schema|validator)\.[^.]+$/.test(name)) primary = 'Validation';
  else if (/^index\.[cm]?[jt]s$|\.module\.[jt]s$/.test(name)) primary = 'Wiring';
  else if (/\.(md|mdx|rst)$/.test(name) || /(^|\/)(docs|documentation)\//.test(p)) primary = 'Docs';
  else if (/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp[34]|wav|pdf)$/.test(name) || /(^|\/)assets\//.test(p)) primary = 'Assets';
  else if (/\.(tsx|jsx|css|scss|sass|less|vue|svelte|blade\.php)$/.test(name) || /(^|\/)(components|screens|views|templates)\//.test(p)) primary = 'UI';
  return [...(primary ? [primary] : []), ...(generated ? ['Generated'] : [])];
};

if (typeof document !== 'undefined') (() => {
  let timer, enabled = true, tagsEnabled = true;
  const initializedCacheFolders = new Set();
  function collapseCacheFolders() {
    const pr = location.pathname.match(/^(.*\/pull\/\d+)\/(files|changes)/)?.[1];
    if (!pr) return;
    for (const item of document.querySelectorAll('[role="tree"] [role="treeitem"][aria-expanded]')) {
      const path = item.id.replace(/\\/g, '/').replace(/\/$/, '');
      if (!/(^|\/)(\.yarn\/cache|yarn\/\.cache)$/.test(path)) continue;
      const key = `${pr}:${path}`;
      if (initializedCacheFolders.has(key)) continue;
      if (item.getAttribute('aria-expanded') === 'false') {
        initializedCacheFolders.add(key);
        continue;
      }
      // Use GitHub's own toggle so its tree state stays in sync. Only do this
      // once per folder per PR, allowing subsequent manual expansion.
      const toggle = item.querySelector(':scope > .PRIVATE_TreeView-item-container .PRIVATE_TreeView-item-toggle');
      if (toggle) {
        initializedCacheFolders.add(key);
        toggle.click();
      }
    }
  }
  const observer = new MutationObserver(() => {
    clearTimeout(timer); timer = setTimeout(render, 180);
  });
  function render() {
    observer.disconnect();
    try {
      if (enabled) collapseCacheFolders();
      if (!enabled || !tagsEnabled) {
        document.querySelectorAll('.tf-file-tags').forEach(n => n.remove());
        document.querySelectorAll('.tf-tagged-filename').forEach(n => n.classList.remove('tf-tagged-filename'));
        return;
      }
      if (!/\/pull\/\d+\/(files|changes)/.test(location.pathname)) return;
      // GitHub's React tree items carry the repository-relative path as their ID.
      for (const link of document.querySelectorAll('[role="tree"] a[href*="#diff-"]')) {
        const item = link.closest('[role="treeitem"]');
        const path = item?.id || link.textContent.trim();
        const tags = TestFoldFileTags(path);
        const signature = tags.join('|');
        const parent = link.parentElement;
        let group = parent.querySelector('.tf-file-tags');
        if (group?.dataset.tags === signature && group.previousElementSibling === link) continue;
        group?.remove();
        if (!tags.length) { parent.classList.remove('tf-tagged-filename'); continue; }
        group = document.createElement('span'); group.className = 'tf-file-tags';
        group.dataset.tags = signature;
        for (const tag of tags) {
          const badge = document.createElement('span'); badge.className = `tf-file-tag tf-tag-${tag.toLowerCase()}`;
          badge.textContent = tag;
          badge.title = `${tag}: classified by filename/path`;
          group.append(badge);
        }
        // Explicit flex order avoids GitHub's grid auto-placement putting badges first.
        parent.classList.add('tf-tagged-filename');
        link.after(group);
      }
    } finally { observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded']}); }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.enabled || changes.fileTags)) {
      if (changes.enabled) enabled = changes.enabled.newValue !== false;
      if (changes.fileTags) tagsEnabled = changes.fileTags.newValue !== false;
      clearTimeout(timer); render();
    }
  });
  chrome.storage.local.get({enabled: true, fileTags: true}, saved => {
    enabled = saved.enabled !== false;
    tagsEnabled = saved.fileTags !== false;
    render();
  });
})();
