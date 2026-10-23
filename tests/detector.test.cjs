const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

// Run the same bundled scripts Chrome uses, without changing production exports.
const context = vm.createContext({});
for (const file of ['vendor/parser.js', 'detector.js']) {
  vm.runInContext(readFileSync(resolve(__dirname, '..', file), 'utf8'), context);
}
function detect(source, firstLine = 1) {
  const lines = source.split('\n').map((text, index) => ({ text, number: firstLine + index }));
  // Normalize objects from the isolated VM before strict comparisons.
  return JSON.parse(JSON.stringify(context.TestFoldDetect(lines)));
}

const supported = [
  [ 'plain test', "test('works', () => {\n  expect(true).toBe(true);\n});" ],
  [ 'async test with a modifier', "it.only('works', async () => {\n  await run();\n});" ],
  [ 'parameterized TypeScript test', "test.each([1, 2])('value %s', (value: number) => {\n  expect(value).toBeTruthy();\n});" ],
  [ 'nested test', "describe('suite', () => {\n  it('works', () => {\n    run();\n  });\n});" ],
  [ 'JSX inside a test', "it('renders', () => {\n  const element = <div>hello</div>;\n  expect(element).toBeTruthy();\n});" ],
  [ 'braces inside strings and comments', "test('braces', () => {\n  const text = `}`; // {\n  expect(text).toBe('}');\n});" ],
];
for (const [name, source] of supported) {
  test(`detects ${name}`, () => assert.equal(detect(source).length, 1));
}

test('folds only the body of a multiline declaration, preserving its closing line', () => {
  const lines = [ 'test(', "  'multiline',", '  async ({ page }) => {', "    await page.goto('/');", '  }', ');' ];
  const [range] = detect(lines.join('\n'), 120);
  assert.equal(range.header, 0);
  assert.deepEqual(lines.slice(range.start, range.end), ["    await page.goto('/');"]);
  assert.equal(range.description, lines.slice(0, 3).join('\n'));
});

for (const [name, source] of [
  ['suite', "test.describe('suite', () => {\n  setup();\n});"],
  ['incomplete test', "test('partial', () => {\n  run();"],
  ['expression callback', "test('inline', () => run());"],
  ['single-line test', "test('inline', () => { run(); });"],
]) {
  test(`leaves ${name} visible`, () => assert.equal(detect(source).length, 0));
}

test('does not fold across a gap in GitHub diff context', () => {
  const lines = [
    {number: 20, text: "it('gap', () => {"},
    {number: 24, text: '  run();'},
    {number: 25, text: '});'},
  ];
  assert.equal(context.TestFoldDetect(lines).length, 0);
});

test('finds adjacent tests without folding their separating lines', () => {
  const source = "it('first', () => {\n  run();\n});\n\nit('second', () => {\n  runAgain();\n});";
  const ranges = detect(source);
  assert.deepEqual(ranges.map(({header, start, end}) => ({header, start, end})), [
    {header: 0, start: 1, end: 2}, {header: 4, start: 5, end: 6},
  ]);
});

// Both global Jest/Vitest/Mocha hooks and Playwright's qualified hooks fold.
for (const hook of ['beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'before', 'after', 'setup', 'teardown', 'suiteSetup', 'suiteTeardown', 'test.beforeAll', 'test.afterAll', 'test.beforeEach', 'test.afterEach', 'it.beforeEach']) {
  test(`folds ${hook} as a hook`, () => {
    const source = `${hook}(async () => {\n  await initialize();\n  await cleanup();\n});`;
    const [range] = detect(source);
    assert.equal(range.kind, 'hook');
    assert.equal(range.header, 0);
    assert.deepEqual(source.split('\n').slice(range.start, range.end), ['  await initialize();', '  await cleanup();']);
  });
}

test('detects a named multiline hook while keeping its declaration visible', () => {
  const [range] = detect("test.beforeAll(\n  'initialize database',\n  async () => {\n    await initialize();\n  }\n);");
  assert.equal(range.kind, 'hook');
  assert.equal(range.start, 3);
  assert.equal(range.end, 4);
});

test('keeps an incomplete hook visible', () => {
  assert.equal(detect('afterAll(async () => {\n  await cleanup();').length, 0);
});

test('does not classify application lifecycle methods as test hooks', () => {
  assert.equal(detect('database.beforeAll(() => {\n  initialize();\n});').length, 0);
});

test('includes hooks and tests in one collection for bulk folding', () => {
  const ranges = detect("beforeEach(() => {\n  initialize();\n});\nit('works', () => {\n  run();\n});\nafterAll(() => {\n  cleanup();\n});");
  assert.deepEqual(ranges.map(range => range.kind), ['hook', 'test', 'hook']);
});

// Case counts come from syntax, and placeholders are removed only from the compact display.
test('summarizes a multiline each table by description and case count', () => {
  const [range] = detect("it.each([\n  { locationId: -1 },\n  { cursor: 'no' },\n])('rejects invalid query values: %j', async (input) => {\n  await validate(input);\n});");
  assert.deepEqual(range.each, {title: 'rejects invalid query values', count: 2, casesSource: "[\n  { locationId: -1 },\n  { cursor: 'no' },\n]", casesDisplay: "[\n  { locationId: -1 },\n  { cursor: 'no' },\n]"});
  assert.equal(range.header, 0);
  assert.equal(range.start, 4);
  assert.equal(range.end, 5);
});

test('counts TypeScript constant arrays in parameterized tests', () => {
  const [range] = detect("test.each(['start', 'end'] as const)('requires %s', field => {\n  validate(field);\n});");
  assert.deepEqual(range.each, {title: 'requires', count: 2, casesSource: "['start', 'end']", casesDisplay: "['start', 'end']"});
});

for (const table of ['cases', '[...cases]', '[makeCase()]']) {
  test(`never evaluates ${table} to count cases`, () => {
    const [range] = detect(`it.each(${table})('checks input', input => {\n  validate(input);\n});`);
    assert.equal(range.each.count, table === '[makeCase()]' ? 1 : null);
  });
}

test('ordinary tests do not get separate case sections', () => {
  const [range] = detect("it('ordinary', () => {\n  run();\n});");
  assert.equal(range.each, undefined);
});


test('removes runtime placeholders from summaries while preserving original code', () => {
  const [range] = detect("it.each([1])('requires %s', input => {\n  validate(input);\n});");
  assert.equal(range.each.title, 'requires');
  assert.match(range.description, /requires %s/);
});

test('keeps literal percentages in parameterized descriptions', () => {
  const [range] = detect("it.each([1])('supports 100%% coverage for %s', input => {\n  validate(input);\n});");
  assert.equal(range.each.title, 'supports 100% coverage for');
});


test('expanded cases contain only the input array, excluding call and implementation', () => {
  const [range] = detect("it.each([\n  { limit: 0 },\n  { cursor: 'no' },\n])('rejects %j', async input => {\n  await request(input);\n});");
  assert.equal(range.each.casesSource, "[\n  { limit: 0 },\n  { cursor: 'no' },\n]");
  assert.doesNotMatch(range.each.casesSource, /it\.each|rejects|async|request/);
  assert.equal(range.closingEnd, 6);
});


test('formats tab-indented cases consistently without changing raw source', () => {
  const [range] = detect("it.each([\n\t\t{ locationId: -1 },\n\t\t{ cursor: 'no' },\n\t])('rejects %j', input => {\n  validate(input);\n});");
  assert.equal(range.each.casesDisplay, "[\n  { locationId: -1 },\n  { cursor: 'no' },\n]");
  assert.match(range.each.casesSource, /\t\t/);
});

test('retains nested indentation in the case preview', () => {
  const [range] = detect("it.each([\n        {\n            input: { id: 1 },\n        },\n    ])('nested %j', input => {\n  validate(input);\n});");
  assert.equal(range.each.casesDisplay, "[\n  {\n    input: { id: 1 },\n  },\n]");
});
