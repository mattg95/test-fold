const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
function setup() {
  const windowMoves = [];
  const context = vm.createContext({
    innerHeight: 800, window: {scrollBy: options => windowMoves.push(options.top)},
    getComputedStyle: node => ({overflowY: node.overflow || 'visible'}),
  });
  vm.runInContext(readFileSync(resolve(__dirname, '..', 'viewport.js'), 'utf8'), context);
  return {viewport: context.TestFoldViewport, windowMoves};
}
function control(top, parentElement = null) {
  return {isConnected: true, top, parentElement,
    getBoundingClientRect() { return {top: this.top, bottom: this.top + 24, width: 100, height: 24}; }};
}
test('keeps an individual control at its previous position', () => {
  const {viewport, windowMoves} = setup();
  const before = control(300);
  const restore = viewport.capture(before);
  const replacement = control(180);
  before.isConnected = false;
  restore(replacement);
  assert.deepEqual(windowMoves, [-120]);
});
test('corrects the nearest scrollable GitHub pane instead of the window', () => {
  const {viewport, windowMoves} = setup();
  const moves = [];
  const pane = {overflow: 'auto', scrollHeight: 2000, clientHeight: 500,
    scrollBy: options => moves.push(options.top)};
  const target = control(250, {parentElement: pane});
  const restore = viewport.capture(target);
  target.top = 400; restore();
  assert.deepEqual(moves, [150]); assert.deepEqual(windowMoves, []);
});
test('avoids extra scrolling if browser anchoring already maintained position', () => {
  const {viewport, windowMoves} = setup();
  const target = control(250); viewport.capture(target)();
  assert.deepEqual(windowMoves, []);
});
test('safely ignores disconnected controls without a replacement', () => {
  const {viewport, windowMoves} = setup();
  const target = control(250); const restore = viewport.capture(target);
  target.isConnected = false; restore();
  assert.deepEqual(windowMoves, []);
});
test('bulk changes anchor the topmost visible control', () => {
  const {viewport} = setup();
  const top = control(120), lower = control(400), offscreen = control(-100), below = control(900);
  const hidden = control(10); hidden.getBoundingClientRect = () => ({top: 10, bottom: 10, height: 0, width: 0});
  assert.equal(viewport.nearest([lower, offscreen, below, hidden, top]), top);
});
