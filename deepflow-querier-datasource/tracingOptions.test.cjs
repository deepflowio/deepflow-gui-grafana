const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const source = readFileSync(join(__dirname, 'src/components/TracingIdSelector.tsx'), 'utf8')
const expression = source.match(/options=\{([\s\S]*?)\}\s+onChange/)[1].replace('(item: LabelItem)', '(item)')
const options = new Function('selectInputOpts', 'templateVariableOpts', `return (${expression})`)
test('uses current template variables without losing custom values', () => {
  const custom = [{ value: 'trace-id', label: 'trace-id' }]
  assert.deepEqual(options(custom, []), custom)
  const variables = [{ value: 'trace', label: 'trace' }]
  assert.deepEqual(options(custom, variables), [...custom, { value: '$trace', label: 'trace' }])
  assert.deepEqual(options(custom, []), custom)
})
