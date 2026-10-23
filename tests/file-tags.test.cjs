const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(__dirname, '..', 'file-tags.js'), 'utf8'), context);
for (const [path, tags] of [
  ['src/leave.test.ts', ['Tests']], ['tests/test_leave.py', ['Tests']], ['tests/LeaveTest.php', ['Tests']],
  ['src/index.ts', ['Wiring']], ['src/interface.d.ts', ['Interfaces']],
  ['package.json', ['Dependencies']], ['package-lock.json', ['Dependencies', 'Generated']],
  ['infra/main.tf', ['Infra']], ['.github/workflows/test.yml', ['Automation']],
  ['tsconfig.json', ['Config']], ['src/generated/types.gen.ts', ['Generated']],
  ['db/migrations/001.sql', ['Migrations']], ['src/validation/leave.ts', ['Validation']],
  ['src/components/Leave.tsx', ['UI']], ['README.md', ['Docs']], ['assets/logo.svg', ['Assets']],
  ['src/unknown.ts', []],
]) test(`tags ${path}`, () => assert.deepEqual(Array.from(context.TestFoldFileTags(path)), tags));
