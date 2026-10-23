// Preserve an existing element's screen position across a synchronous DOM update.
// Work with GitHub's nested scroll panes as well as ordinary document scrolling.
globalThis.TestFoldViewport = {
  capture(element) {
    if (!element?.isConnected) return () => {};
    const top = element.getBoundingClientRect().top;
    let scroller = element.parentElement;
    while (scroller) {
      const overflow = getComputedStyle(scroller).overflowY;
      if (/(auto|scroll)/.test(overflow) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    return replacement => {
      const target = replacement?.isConnected ? replacement : element;
      if (!target.isConnected) return;
      const delta = target.getBoundingClientRect().top - top;
      if (Math.abs(delta) < 1) return;
      (scroller || window).scrollBy({top: delta, left: 0, behavior: 'instant'});
    };
  },
  nearest(controls) {
    // Only choose rendered controls in the viewport. Prefer the topmost visible
    // test, so bulk folding retains a recognizable test rather than a hidden line.
    let best = null, distance = Infinity;
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) continue;
      if (Math.abs(rect.top) < distance) { best = control; distance = Math.abs(rect.top); }
    }
    return best;
  },
};
