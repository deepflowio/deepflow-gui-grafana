const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const assert = require('node:assert/strict')

// Isolate the actual utility body from Grafana and SDK runtime imports.
const source = readFileSync(join(__dirname, 'src/utils/tools.ts'), 'utf8')
const body = source.slice(source.indexOf('export function queryCondsFilter('))
  .replace(/^export function queryCondsFilter\([^\n]+\) \{/, 'function queryCondsFilter(conds, type) {')
const filter = new Function('defaultItem', `${body}; return queryCondsFilter`)(() => ({}))

test('preserves a numeric zero comparison', () => {
  const condition = { key: 'error', op: '>', val: 0 }
  assert.deepEqual(filter([condition], 'metric'), [condition])
})

test('continues to reject empty values', () => {
  for (const val of ['', null, undefined, []]) {
    assert.deepEqual(filter([{ key: 'error', op: '>', val }], 'metric'), [{ type: 'metric' }])
  }
})
