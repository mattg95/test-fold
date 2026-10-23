// Decide which sections may fold. Disabled categories stay visible without controls.
globalThis.TestFoldPolicy = (range, options, savedExpanded) => {
  const implementation = range.kind === 'function' ? options.foldFunctions : range.kind === 'hook' ? options.foldHooks : options.foldTests;
  const cases = !!range.each && options.foldTests && options.foldCases;
  const expanded = !implementation || savedExpanded;
  return {implementation, cases, expanded, active: implementation || cases,
    // Disabling case folding restores the original .each header, while
    // implementation folding can continue to hide just the callback body.
    compact: cases && (!expanded || !implementation)};
};
