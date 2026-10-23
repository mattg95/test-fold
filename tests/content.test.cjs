const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');

// Small DOM fixture for the classic unified diff adapter. Run production scripts
// unchanged and assert retained control identity, parser calls and row visibility.
class Element {
  constructor(tag = 'div', text = '') {
    this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {};
    this.className = ''; this.text = text; this.listeners = {};
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
      remove: (...names) => { this.className = this.className.split(' ').filter(n => !names.includes(n)).join(' '); },
      toggle: (name, on) => on ? this.classList.add(name) : this.classList.remove(name),
    };
  }
  get childNodes() { return [...this.children]; }
  get isConnected() { return this.tag === 'body' || !!this.parentElement?.isConnected; }
  get textContent() { return this.text + this.children.map(n => n.textContent).join(''); }
  set textContent(value) { this.text = value; this.children = []; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  prepend(node) { node.remove(); node.parentElement = this; this.children.unshift(node); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this);
    this.parentElement = null;
  }
  replaceWith(...nodes) {
    const parent = this.parentElement, index = parent.children.indexOf(this);
    this.remove(); for (const n of nodes) n.remove();
    parent.children.splice(index, 0, ...nodes); nodes.forEach(n => { n.parentElement = parent; });
  }
  matches(selector) {
    return selector.split(',').some(raw => {
      const s = raw.trim();
      const tag = s.match(/^[a-z]+/); if (tag && tag[0] !== this.tag) return false;
      for (const match of s.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
      for (const match of s.matchAll(/\[([\w-]+)(?:([*]?=)["']([^"']*)["'])?\]/g)) {
        const value = this.getAttribute(match[1]);
        if (value === null || (match[2] === '=' && value !== match[3]) || (match[2] === '*=' && !value.includes(match[3]))) return false;
      }
      return true;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) {
    return this.children.flatMap(n => [...(n.matches(selector) ? [n] : []), ...n.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  focus() { fixtureDocument.activeElement = this; }
  getBoundingClientRect() { return {top: 200, bottom: 224, width: 100, height: 24}; }
  cloneNode(deep) {
    const n = new Element(this.tag, this.text); n.className = this.className; n.attrs = {...this.attrs};
    if (deep) n.append(...this.children.map(child => child.cloneNode(true)));
    return n;
  }
}
let fixtureDocument;
function fixture(source = null) {
  const body = new Element('body'), file = new Element('div'); file.className = 'file'; body.append(file);
  const lines = ["it('first', () => {", '  first();', '});', '', "it('second', () => {", '  second();', '});'];
  const rows = (source ? source.split('\n') : lines).map((text, index) => {
    const row = new Element('tr'); file.append(row);
    for (let side = 0; side < 2; side++) {
      const num = new Element('td'); num.className = 'blob-num'; num.setAttribute('data-line-number', index + 1); row.append(num);
    }
    const cell = new Element('td'); cell.className = 'blob-code';
    const inner = new Element('span', text); inner.className = 'blob-code-inner';
    cell.append(inner); row.append(cell); return row;
  });
  const document = fixtureDocument = {
    body, activeElement: null, createElement: tag => new Element(tag),
    querySelectorAll: selector => body.querySelectorAll(selector), addEventListener() {},
  };
  let parserCalls = 0, receive;
  const context = vm.createContext({document, location: {pathname: '/owner/repo/pull/1/files'},
    window: {addEventListener() {}, scrollBy() {}}, innerHeight: 800,
    getComputedStyle: () => ({overflowY: 'visible'}),
    setTimeout: () => 0, clearTimeout() {},
    MutationObserver: class {disconnect() {} observe() {}},
    chrome: {storage: {local: {get: (defaults, fn) => fn(defaults)}, onChanged: {addListener() {}}},
      runtime: {onMessage: {addListener: fn => {receive = fn;}}}},
  });
  for (const name of ['vendor/parser.js', 'detector.js', 'policy.js', 'viewport.js']) vm.runInContext(readFileSync(resolve(__dirname, '..', name), 'utf8'), context);
  const detector = context.TestFoldDetect;
  context.TestFoldDetect = lines => { parserCalls++; return detector(lines); };
  vm.runInContext(readFileSync(resolve(__dirname, '..', 'content.js'), 'utf8'), context);
  return {document, rows, controls: () => body.querySelectorAll('.tf-fold'), calls: () => parserCalls,
    click: button => { document.activeElement = button; button.listeners.click({stopPropagation() {}}); },
    command: action => receive({type: 'test-fold', action}, {}, () => {})};
}

test('individual toggle preserves unrelated controls and avoids reparsing the diff', () => {
  const f = fixture(); const [first, second] = f.controls(); const calls = f.calls();
  assert.equal(f.rows[1].classList.contains('tf-row-hidden'), true);
  f.click(first);
  assert.equal(f.rows[1].classList.contains('tf-row-hidden'), false);
  assert.equal(f.rows[5].classList.contains('tf-row-hidden'), true);
  assert.equal(f.controls()[0], first);
  assert.equal(f.controls()[1], second);
  assert.equal(f.calls(), calls);
  assert.equal(f.document.activeElement, f.controls()[0]);
  f.click(f.controls()[0]);
  assert.equal(f.rows[1].classList.contains('tf-row-hidden'), true);
});

test('bulk expand and collapse update all bodies using cached source', () => {
  const f = fixture(); const calls = f.calls();
  f.command('toggle');
  assert(f.controls().every(b => b.getAttribute('aria-expanded') === 'true'));
  assert.equal(f.rows[1].classList.contains('tf-row-hidden'), false);
  assert.equal(f.rows[5].classList.contains('tf-row-hidden'), false);
  f.command('toggle');
  assert(f.controls().every(b => b.getAttribute('aria-expanded') === 'false'));
  assert.equal(f.rows[1].classList.contains('tf-row-hidden'), true);
  assert.equal(f.calls(), calls);
});


test('parameterized cases and full implementation toggle without reparsing', () => {
  const f = fixture("it.each([\n  { limit: 0 },\n])('rejects %j', input => {\n  validate(input);\n});");
  const calls = f.calls();
  const header = f.document.querySelectorAll('.tf-each-ui')[0];
  const description = header.querySelector('.tf-each-title').textContent;
  assert.equal(f.controls().length, 2);
  assert.equal(header.querySelector('.tf-cases-reveal').getAttribute('aria-hidden'), 'true');
  assert.match(f.controls().find(b => b.classList.contains('tf-cases')).textContent, /^▸ 1 test case$/);
  f.click(f.controls().find(b => b.classList.contains('tf-cases')));
  assert.match(f.controls().find(b => b.classList.contains('tf-cases')).textContent, /^▾ 1 test case$/);
  assert.equal(header.querySelector('.tf-cases-reveal').classList.contains('tf-cases-open'), true);
  assert.equal(header.querySelector('.tf-cases-reveal').getAttribute('aria-hidden'), 'false');
  assert.equal(f.controls().find(b => b.classList.contains('tf-cases')).getAttribute('aria-expanded'), 'true');
  f.click(f.controls().find(b => !b.classList.contains('tf-cases')));
  assert.equal(f.controls().length, 2);
  assert.equal(f.controls().find(b => !b.classList.contains('tf-cases')).textContent, '▾ Collapse test');
  assert.equal(f.rows[3].classList.contains('tf-row-hidden'), false);
  assert.equal(f.document.querySelectorAll('.tf-each-ui')[0], header);
  assert.equal(header.querySelector('.tf-each-title').textContent, description);
  f.click(f.controls().find(b => !b.classList.contains('tf-cases')));
  assert.equal(f.controls().length, 2);
  assert(f.controls().every(b => b.getAttribute('aria-expanded') === 'false'));
  assert.equal(f.calls(), calls);
});


test('ordinary tests and hooks use inline controls without summary headers', () => {
  for (const name of ["it('ordinary',", 'beforeAll(']) {
    const source = name.startsWith('it') ? "it('ordinary', () => {\n  run();\n});" : 'beforeAll(() => {\n  setup();\n});';
    const f = fixture(source);
    assert.equal(f.document.querySelectorAll('.tf-each-ui').length, 0);
    assert.equal(f.document.querySelectorAll('.tf-each-source').length, 0);
    assert.equal(f.rows[2].classList.contains('tf-row-hidden'), false);
    const control = f.controls()[0];
    f.click(control);
    assert.equal(f.controls()[0], control);
    assert.equal(f.document.querySelectorAll('.tf-each-ui').length, 0);
  }
});
