import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { bindLoopback, LOCAL_LOOPBACK_HOST } from './loopback.ts'

test('local manager listener binds to IPv4 loopback only', async () => {
  const server = createServer((_request, response) => response.end('ok'))
  bindLoopback(server, 0)
  await once(server, 'listening')
  try {
    const address = server.address() as AddressInfo
    assert.equal(address.address, '127.0.0.1')
    assert.equal(LOCAL_LOOPBACK_HOST, '127.0.0.1')
    assert.equal(address.family, 'IPv4')
  } finally {
    server.close()
    await once(server, 'close')
  }
})
