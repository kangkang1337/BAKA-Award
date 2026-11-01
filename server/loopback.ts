import type { Server } from 'node:http'

export const LOCAL_LOOPBACK_HOST = '127.0.0.1'

export function bindLoopback(server: Server, port: number) {
  server.listen(port, LOCAL_LOOPBACK_HOST)
  return server
}
