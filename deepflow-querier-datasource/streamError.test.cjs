const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const source = readFileSync(join(__dirname, 'src/datasource.ts'), 'utf8').replace(/\r\n/g, '\n')
const body = source.slice(source.indexOf("    let answer = ''", source.indexOf('async askGPTRequest(')), source.lastIndexOf('\n  }\n}'))
  .replace('(res: any)', '(res)').replace(' as BackendSrvRequest', '')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

test('ends the output timer when the AI request rejects', async () => {
  let ended = 0
  class Stream {
    output() {}
    write() {}
    end() { ended++ }
  }
  const error = new Error('network failure')
  const request = new AsyncFunction('DataStreamer', 'getBackendSrv', 'DATA_SOURCE_SETTINGS', 'engine', 'postData', 'receiveFn', body)
  await assert.rejects(request(Stream, () => ({ fetch: () => ({ toPromise: () => Promise.reject(error) }) }),
    { basicUrl: '' }, { platform: 'test', engine_name: 'test' }, {}, () => {}), error)
  assert.equal(ended, 1)
})
