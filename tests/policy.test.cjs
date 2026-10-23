const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(__dirname, '..', 'policy.js'), 'utf8'), context);
const policy = (range, options, expanded = false) => context.TestFoldPolicy(range,
  {foldTests: true, foldHooks: true, foldCases: true, ...options}, expanded);

test('disabling tests also disables case folding', () => {
  const p = policy({kind: 'test', each: {}}, {foldTests: false, foldCases: true});
  assert.equal(p.active, false); assert.equal(p.implementation, false);
  assert.equal(p.cases, false); assert.equal(p.compact, false);
  assert.equal(p.expanded, true);
});
test('disabled hook folding leaves hooks visible independently of tests', () => {
  assert.equal(policy({kind: 'hook'}, {foldHooks: false}).active, false);
  assert.equal(policy({kind: 'test'}, {foldHooks: false}).implementation, true);
});
test('disabled case folding restores the original header with body folding enabled', () => {
  const p = policy({kind: 'test', each: {}}, {foldCases: false});
  assert.equal(p.cases, false); assert.equal(p.implementation, true);
  assert.equal(p.compact, false); assert.equal(p.expanded, false);
  const expanded = policy({kind: 'test', each: {}}, {foldCases: false}, true);
  assert.equal(expanded.compact, false); assert.equal(expanded.expanded, true);
});
test('turning off case folding still allows test body folding', () => {
  const p = policy({kind: 'test', each: {}}, {foldTests: true, foldCases: false});
  assert.equal(p.implementation, true); assert.equal(p.active, true);
  assert.equal(p.cases, false); assert.equal(p.compact, false);
});
test('enabled categories start collapsed and can show the full implementation', () => {
  assert.equal(policy({kind: 'test', each: {}}, {}).expanded, false);
  assert.equal(policy({kind: 'test', each: {}}, {}, true).compact, false);
});
