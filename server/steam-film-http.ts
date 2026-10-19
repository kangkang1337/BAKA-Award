import { ProxyAgent, type Dispatcher } from 'undici'

export const STEAM_SERVER_INFO_ENDPOINT = 'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/'

export type SteamProxySource = 'STEAM_FILM_HTTPS_PROXY' | 'HTTPS_PROXY' | 'https_proxy' | 'direct'

export interface SteamProxySettings {
  url: string | null
  source: SteamProxySource
}

export class SteamOperationError extends Error {
  readonly category: string
  readonly systemErrorCode?: string
  readonly httpStatus?: number

  constructor(category: string, options: { systemErrorCode?: string; httpStatus?: number } = {}) {
    super(category === 'steam-proxy-configuration-error'
      ? 'Steam HTTPS proxy configuration is invalid.'
      : category === 'steam-proxy-connection-error'
        ? 'Steam API request through the configured proxy failed.'
        : category === 'steam-network-error'
          ? 'Steam API network request failed.'
          : category === 'steam-http-error'
            ? 'Steam API returned an unsuccessful HTTP status.'
            : category === 'steam-response-invalid'
              ? 'Steam API response could not be parsed or validated.'
              : 'Steam API operation failed.')
    this.name = 'SteamOperationError'
    this.category = category
    this.systemErrorCode = options.systemErrorCode
    this.httpStatus = options.httpStatus
  }
}

export function safeSystemErrorCode(error: unknown): string | undefined {
  const pending: unknown[] = [error]
  const visited = new Set<object>()
  while (pending.length > 0) {
    const current = pending.shift()
    if (!current || typeof current !== 'object' || visited.has(current)) continue
    visited.add(current)
    const value = current as { code?: unknown; cause?: unknown; errors?: unknown }
    if (typeof value.code === 'string' && /^[A-Z0-9_]{2,64}$/.test(value.code)) return value.code
    if (value.cause) pending.push(value.cause)
    if (Array.isArray(value.errors)) pending.push(...value.errors)
  }
  return undefined
}

function validateProxyUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new SteamOperationError('steam-proxy-configuration-error')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new SteamOperationError('steam-proxy-configuration-error')
  }
  // Proxy credentials may be present in the URL; never expose the normalized value.
  return parsed.href
}

export function resolveSteamProxySettings(env: Record<string, string | undefined> = process.env): SteamProxySettings {
  const candidates: Array<[SteamProxySource, string | undefined]> = [
    ['STEAM_FILM_HTTPS_PROXY', env.STEAM_FILM_HTTPS_PROXY],
    ['HTTPS_PROXY', env.HTTPS_PROXY],
    ['https_proxy', env.https_proxy],
  ]
  for (const [source, raw] of candidates) {
    const value = raw?.trim()
    if (value) return { url: validateProxyUrl(value), source }
  }
  return { url: null, source: 'direct' }
}

export interface SteamHttpClient {
  mode: 'direct' | 'proxy'
  proxySource: SteamProxySource
  fetch: typeof fetch
  close: () => Promise<void>
}

export function createSteamHttpClient(
  settings: SteamProxySettings,
  fetchImplementation: typeof fetch = fetch,
): SteamHttpClient {
  let dispatcher: ProxyAgent | undefined
  if (settings.url) {
    try {
      dispatcher = new ProxyAgent(settings.url)
    } catch {
      throw new SteamOperationError('steam-proxy-configuration-error')
    }
  }

  const steamFetch: typeof fetch = async (input, init) => {
    const requestInit = dispatcher
      ? { ...init, dispatcher } as RequestInit & { dispatcher: Dispatcher }
      : init
    try {
      return await fetchImplementation(input, requestInit)
    } catch (error) {
      throw new SteamOperationError(settings.url ? 'steam-proxy-connection-error' : 'steam-network-error', {
        systemErrorCode: safeSystemErrorCode(error),
      })
    }
  }

  return {
    mode: settings.url ? 'proxy' : 'direct',
    proxySource: settings.source,
    fetch: steamFetch,
    close: async () => { await dispatcher?.close() },
  }
}

export async function checkSteamNetwork(fetcher: typeof fetch): Promise<void> {
  let response: Response
  try {
    response = await fetcher(STEAM_SERVER_INFO_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    if (error instanceof SteamOperationError) throw error
    throw new SteamOperationError('steam-network-error', { systemErrorCode: safeSystemErrorCode(error) })
  }

  if (!response.ok) {
    throw new SteamOperationError('steam-http-error', { httpStatus: response.status })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new SteamOperationError('steam-response-invalid')
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SteamOperationError('steam-response-invalid')
  }
  const info = payload as { servertime?: unknown; servertimestring?: unknown }
  if (!(typeof info.servertime === 'number' && Number.isFinite(info.servertime)) && typeof info.servertimestring !== 'string') {
    throw new SteamOperationError('steam-response-invalid')
  }
}
