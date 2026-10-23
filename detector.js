// Identify complete test and lifecycle-hook callbacks without depending on GitHub’s page structure.
// Input: source lines with original file line numbers. Output: foldable array ranges.
(function () {
  // Follow chained calls such as test.only(...) and test.each(...)(...)
  // back to their base identifier, so modifiers still count as tests.
  function root(node) {
    if (!node) return '';
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression') return root(node.object);
    if (node.type === 'CallExpression') return root(node.callee);
    return '';
  }
  const hooks = new Set(['beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'before', 'after', 'setup', 'teardown', 'suiteSetup', 'suiteTeardown']);
  function isHook(callee) {
    // Recognize imported/global hooks and framework hooks such as test.beforeAll.
    // Other objects' similarly named methods are ordinary application code.
    if (callee.type === 'Identifier') return hooks.has(callee.name);
    return callee.type === 'MemberExpression' && !callee.computed &&
      ['test', 'it'].includes(root(callee.object)) && hooks.has(callee.property.name);
  }
  // Extract .each metadata from syntax only; never evaluate test data or titles.
  function eachDetails(call, source) {
    const factory = call.callee;
    const method = factory.type === 'CallExpression' ? factory.callee : null;
    if (method?.type !== 'MemberExpression' || method.computed || method.property.name !== 'each') return null;
    const titleNode = call.arguments[0];
    if (!titleNode) return null;
    let data = factory.arguments[0];
    while (data && ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'].includes(data.type)) data = data.expression;
    // Spread expressions and variable tables have an unknown runtime case count.
    const count = data?.type === 'ArrayExpression' && data.elements.every(n => n && n.type !== 'SpreadElement') ? data.elements.length : null;
    const rawTitle = titleNode.type === 'StringLiteral' ? titleNode.value : source.slice(titleNode.start, titleNode.end);
    // Formatting placeholders describe runtime case values, which are hidden in
    // the compact view. Preserve escaped %% and the original source declaration.
    let removedPlaceholder = false;
    const title = rawTitle.replace(/%%|%[sdifjoO#$]/g, token => {
      if (token === '%%') return '%';
      removedPlaceholder = true;
      return '';
    }).replace(/[ \t]{2,}/g, ' ').trim();
    return {title: removedPlaceholder ? title.replace(/:\s*$/, '').trim() : title, count};
  }
  function detect(lines) {
    const ranges = [];
    for (let i = 0; i < lines.length; i++) {
      // Quickly skip lines that cannot begin a supported test or hook declaration.
      if (!/^\s*(?:await\s+)?(?:test|it|fit|xit|xtest|beforeAll|afterAll|beforeEach|afterEach|before|after|setup|teardown|suiteSetup|suiteTeardown)\b/.test(lines[i].text)) continue;
      // Add contiguous lines until Babel can parse a complete statement.
      // Stop at missing diff context; folding across a gap could hide unrelated code.
      // Cap the search to avoid spending too long on incomplete or unusually large tests.
      let source = '';
      for (let j = i; j < Math.min(lines.length, i + 1500); j++) {
        if (j > i && lines[j].number !== lines[j - 1].number + 1) break;
        source += lines[j].text + '\n';
        let ast;
        try {
          ast = TestFoldParser.parse(source, {
            sourceType: 'unambiguous', allowAwaitOutsideFunction: true,
            plugins: ['typescript', 'jsx'],
          });
        // A partial test normally fails to parse; try again with the next line.
        } catch (_) { continue; }
        // Accept a single test call, optionally preceded by await.
        const statement = ast.program.body[0];
        let call = statement?.expression;
        if (call?.type === 'AwaitExpression') call = call.argument;
        if (ast.program.body.length !== 1 || call?.type !== 'CallExpression') break;
        const kind = isHook(call.callee) ? 'hook' : 'test';
        if (kind !== 'hook' && !['test', 'it', 'fit', 'xit', 'xtest'].includes(root(call.callee))) break;
        // Suites and framework configuration must stay visible.
        if (/\.(?:describe|use|extend|step|skipIf|runIf)\b/.test(source.slice(0, call.arguments[0]?.start ?? 0))) break;
        // Only callbacks with a brace-delimited body can have interior lines folded.
        const callback = call.arguments.find(n => ['ArrowFunctionExpression', 'FunctionExpression'].includes(n.type));
        if (!callback || callback.body.type !== 'BlockStatement') break;
        // Babel locations are one-based within the candidate source. Convert them
        // into zero-based indices in lines; end is exclusive and excludes the closing line.
        const start = i + callback.body.loc.start.line;
        const end = i + callback.body.loc.end.line - 1;
        // Hide only whole interior lines. Keep header and closing syntax intact.
        if (end > start) {
          const range = {kind, header: i, start, end, description: source.split('\n').slice(0, callback.body.loc.start.line).join('\n').trim()};
          const each = kind === 'test' ? eachDetails(call, source) : null;
          if (each) range.each = each;
          ranges.push(range);
        }
        // Skip the recognized block so nested calls are not treated as separate tests.
        i = j;
        break;
      }
    }
    return ranges;
  }
  // Manifest script order makes this function available to content.js.
  globalThis.TestFoldDetect = detect;
})();
