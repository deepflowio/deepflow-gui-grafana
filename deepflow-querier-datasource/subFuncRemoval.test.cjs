const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const source = readFileSync(join(__dirname, 'src/components/SubFuncsEditor.tsx'), 'utf8')
const text = source.match(/function onRemoveBtnClick\(index: number\) \{[\s\S]*?\n  \}/)[0]
  .replace('index: number', 'index')
const remove = new Function('props', `${text}; return onRemoveBtnClick`)
test('removal emits a new array without changing parent props', () => {
  const input = [{ func: 'a' }, { func: 'b' }]
  let output
  remove({ subFuncs: input, onSubFuncsChange: value => { output = value } })(0)
  assert.deepEqual(input, [{ func: 'a' }, { func: 'b' }])
  assert.deepEqual(output, [{ func: 'b' }])
  assert.notEqual(output, input)
})
