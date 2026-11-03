const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const source = readFileSync(join(__dirname, 'src/utils/tools.ts'), 'utf8')
const text = source.slice(source.indexOf('export function getParamByName('), source.indexOf('function roundToStrNotWithDecimalZero'))
  .replace('export function getParamByName(name: string)', 'function getParamByName(name)')
  .replace('const searchObj: Record<string, string>', 'const searchObj')
  .replace('(e: string)', '(e)')
const read = (query, name) => new Function('window', `${text}; return getParamByName` )({ location: { search: query } })(name)

test('decodes encoded debug flags and parameter names', () => {
  assert.equal(read('?debug=%74rue', 'debug'), 'true')
  assert.equal(read('?%64ebug=true', 'debug'), 'true')
})
test('retains equals signs and decodes form values', () => {
  assert.equal(read('?value=a=b%3Dc+d', 'value'), 'a=b=c d')
})
test('preserves last duplicate and absent parameter behavior', () => {
  assert.equal(read('?debug=false&debug=true', 'debug'), 'true')
  assert.equal(read('?other=true', 'debug'), undefined)
  assert.equal(read('?debug=', 'debug'), '')
})
