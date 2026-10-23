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
  ['setup hook', 'test.beforeEach(() => {\n  setup();\n});'],
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
