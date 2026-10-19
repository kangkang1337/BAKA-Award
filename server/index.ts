import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { resolveSteamProxySettings, safeSystemErrorCode, SteamOperationError, createSteamHttpClient } from './steam-film-http.ts'

const OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login'
const STEAM_GAMES_ENDPOINT = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/'
const SESSION_COOKIE = 'baka_steam_film'
const NONCE_COOKIE = 'baka_steam_film_nonce'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const LOGIN_NONCE_TTL_MS = 5 * 60 * 1000
const SYNC_COOLDOWN_MS = 60 * 1000
const MAX_OWNED_GAMES = 20000

export interface SteamFilmConfig {
  apiKey: string | null
  ownerId: string | null
  publicOrigin: string | null
  sessionSecret: string | null
  databasePath: string
  steamHttpsProxy?: string | null
  host: string
  port: number
  production: boolean
}

interface SteamGameApiItem {
  appid?: unknown
  name?: unknown
  playtime_forever?: unknown
  playtime_2weeks?: unknown
  rtime_last_played?: unknown
}

export class SafeHttpError extends Error {
  readonly status: number
  readonly category: string
  readonly systemErrorCode?: string
  readonly failureCode: string

  constructor(message: string, status: number, category = 'request-rejected', systemErrorCode?: string, failureCode?: string) {
    super(message)
    this.status = status
    this.category = category
    this.systemErrorCode = systemErrorCode
    this.failureCode = failureCode ?? (systemErrorCode ? `${category}:${systemErrorCode}` : category)
  }
}

function cleanOrigin(value: string | undefined) {
  if (!value) return null
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_ORIGIN must be a site origin, such as https://bakaaward.com')
  }
  return url.origin
}

export function readConfig(env: Record<string, string | undefined> = process.env): SteamFilmConfig {
  const publicOrigin = cleanOrigin(env.PUBLIC_ORIGIN)
  const production = env.NODE_ENV === 'production'
  if (production && publicOrigin && !publicOrigin.startsWith('https://')) {
    throw new Error('Production PUBLIC_ORIGIN must use HTTPS')
  }

  const requestedHost = env.HOST?.trim() || '127.0.0.1'
  if (requestedHost !== '127.0.0.1' && requestedHost !== '::1') {
    throw new Error('The Steam Film service must bind to loopback only')
  }

  const port = Number(env.PORT || 8788)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535')

  const databasePath = resolve(env.DATABASE_PATH || './var/steam-film.sqlite')
  const publicRoots = [resolve('public'), resolve('dist')]
  if (publicRoots.some(root => {
    const rel = relative(root, databasePath)
    return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  })) throw new Error('DATABASE_PATH cannot be inside public/ or dist/')

  const apiKey = env.STEAM_API_KEY?.trim() || null
  const ownerId = env.STEAM_OWNER_ID?.trim() || null
  const sessionSecret = env.SESSION_SECRET?.trim() || null
  const steamHttpsProxy = resolveSteamProxySettings(env).url
  const validApiKey = apiKey && /^[a-f\d]{32}$/i.test(apiKey) ? apiKey : null
  const validOwnerId = ownerId && /^\d{17}$/.test(ownerId) ? ownerId : null
  const validSessionSecret = sessionSecret && Buffer.byteLength(sessionSecret) >= 32 ? sessionSecret : null
  if (production && (!validApiKey || !validOwnerId || !validSessionSecret || !publicOrigin?.startsWith('https://'))) {
    throw new Error('Production requires a Steam API key, owner SteamID64, 32-byte session secret, and HTTPS PUBLIC_ORIGIN')
  }
  return {
    apiKey: validApiKey,
    ownerId: validOwnerId,
    publicOrigin,
    sessionSecret: validSessionSecret,
    databasePath,
    steamHttpsProxy,
    host: requestedHost,
    port,
    production,
  }
}

export function createStore(db: DatabaseSync) {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS steam_games (
      steam_app_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      header_image TEXT,
      first_played_at TEXT,
      first_seen_at TEXT,
      first_achievement_at TEXT,
      last_played_at TEXT,
      playtime_minutes INTEGER,
      playtime_recent_minutes INTEGER,
      achievement_count INTEGER,
      achievement_total INTEGER,
      personal_note TEXT,
      data_source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      session_hash TEXT PRIMARY KEY,
      steam_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_nonces (
      nonce_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS archive_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_batches (
      batch_id TEXT PRIMARY KEY,
      owner_steam_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('running', 'succeeded', 'failed')),
      sampled_game_count INTEGER NOT NULL DEFAULT 0 CHECK(sampled_game_count >= 0),
      snapshot_count INTEGER NOT NULL DEFAULT 0 CHECK(snapshot_count >= 0),
      regression_count INTEGER NOT NULL DEFAULT 0 CHECK(regression_count >= 0),
      error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS sync_batches_owner_time_idx ON sync_batches(owner_steam_id, completed_at);
    CREATE TABLE IF NOT EXISTS game_playtime_snapshots (
      batch_id TEXT NOT NULL REFERENCES sync_batches(batch_id) ON DELETE CASCADE,
      owner_steam_id TEXT NOT NULL,
      steam_app_id INTEGER NOT NULL,
      captured_at TEXT NOT NULL,
      playtime_minutes INTEGER NOT NULL CHECK(playtime_minutes >= 0),
      regressed INTEGER NOT NULL DEFAULT 0 CHECK(regressed IN (0, 1)),
      previous_playtime_minutes INTEGER CHECK(previous_playtime_minutes IS NULL OR previous_playtime_minutes >= 0),
      PRIMARY KEY(batch_id, steam_app_id)
    );
    CREATE INDEX IF NOT EXISTS game_snapshots_owner_game_time_idx ON game_playtime_snapshots(owner_steam_id, steam_app_id, captured_at);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS login_nonces_expiry_idx ON login_nonces(expires_at);
  `)
  return db
}

export function openStore(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  return createStore(db)
}

function tokenHash(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('hex')
}

function csrfForSession(sessionId: string, secret: string) {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url')
}

function constantTimeEqual(a: string, b: string) {
  const first = Buffer.from(a)
  const second = Buffer.from(b)
  return first.length === second.length && timingSafeEqual(first, second)
}

function cookies(request: IncomingMessage) {
  const result = new Map<string, string>()
  for (const part of (request.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!name) continue
    if (result.has(name)) {
      result.set(name, '')
      continue
    }
    try {
      result.set(name, decodeURIComponent(value))
    } catch {
      result.set(name, '')
    }
  }
  return result
}

function cookieHeader(name: string, value: string, config: SteamFilmConfig, options: { maxAge: number; path: string }) {
  const secure = config.production || config.publicOrigin?.startsWith('https://')
  return `${name}=${encodeURIComponent(value)}; Path=${options.path}; Max-Age=${options.maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  response.end(JSON.stringify(body))
}

function redirect(response: ServerResponse, location: string) {
  response.statusCode = 302
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Location', location)
  response.end()
}

function getSession(request: IncomingMessage, db: DatabaseSync, config: SteamFilmConfig) {
  if (!config.sessionSecret) return null
  const sessionId = cookies(request).get(SESSION_COOKIE)
  if (!sessionId || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) return null
  const session = db.prepare('SELECT steam_id AS steamId, expires_at AS expiresAt FROM sessions WHERE session_hash = ?').get(tokenHash(sessionId, config.sessionSecret)) as { steamId: string; expiresAt: number } | undefined
  if (!session || session.expiresAt <= Date.now() || session.steamId !== config.ownerId || getMeta(db, 'owner_steam_id') !== session.steamId) return null
  return { sessionId, steamId: session.steamId, csrfToken: csrfForSession(sessionId, config.sessionSecret) }
}

function requireSameOrigin(request: IncomingMessage, response: ServerResponse, config: SteamFilmConfig) {
  if (!config.publicOrigin || request.headers.origin !== config.publicOrigin) {
    json(response, 403, { error: '请求来源校验失败。' })
    return false
  }
  return true
}

function requireCsrf(request: IncomingMessage, response: ServerResponse, session: { csrfToken: string }) {
  const supplied = request.headers['x-csrf-token']
  if (typeof supplied !== 'string' || !constantTimeEqual(supplied, session.csrfToken)) {
    json(response, 403, { error: '请求校验已过期，请刷新页面后重试。' })
    return false
  }
  return true
}

function toIsoEpoch(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return null
  const date = new Date(value * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function gameFromRow(row: Record<string, unknown>) {
  return {
    steamAppId: row.steamAppId,
    name: row.name,
    headerImage: row.headerImage,
    firstPlayedAt: row.firstPlayedAt,
    firstSeenAt: row.firstSeenAt,
    firstAchievementAt: row.firstAchievementAt,
    lastPlayedAt: row.lastPlayedAt,
    playtimeMinutes: row.playtimeMinutes,
    playtimeRecentMinutes: row.playtimeRecentMinutes,
    achievementCount: row.achievementCount,
    achievementTotal: row.achievementTotal,
    personalNote: row.personalNote,
    dataSource: row.dataSource,
  }
}

export function getGames(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT steam_app_id AS steamAppId, name, header_image AS headerImage,
      first_played_at AS firstPlayedAt, first_seen_at AS firstSeenAt,
      first_achievement_at AS firstAchievementAt, last_played_at AS lastPlayedAt,
      playtime_minutes AS playtimeMinutes, playtime_recent_minutes AS playtimeRecentMinutes,
      achievement_count AS achievementCount, achievement_total AS achievementTotal,
      personal_note AS personalNote, data_source AS dataSource
    FROM steam_games
    ORDER BY
      CASE WHEN first_played_at IS NOT NULL THEN 0 WHEN first_seen_at IS NOT NULL THEN 1 WHEN first_achievement_at IS NOT NULL THEN 2 ELSE 3 END,
      COALESCE(first_played_at, first_seen_at, first_achievement_at) ASC,
      name COLLATE NOCASE ASC
  `).all() as Record<string, unknown>[]
  return rows.map(gameFromRow)
}

function setMeta(db: DatabaseSync, key: string, value: string) {
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function getMeta(db: DatabaseSync, key: string) {
  return (db.prepare('SELECT value FROM archive_meta WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null
}

async function steamOpenIdCallback(requestUrl: URL, request: IncomingMessage, response: ServerResponse, db: DatabaseSync, config: SteamFilmConfig, fetcher: typeof fetch) {
  const seenParams = new Set<string>()
  for (const key of requestUrl.searchParams.keys()) {
    if (seenParams.has(key)) {
      json(response, 400, { error: 'Steam 登录回调包含重复参数，请重新登录。' })
      return
    }
    seenParams.add(key)
  }
  const state = requestUrl.searchParams.get('state') || ''
  const nonceCookie = cookies(request).get(NONCE_COOKIE) || ''
  if (!config.publicOrigin || !config.ownerId || !config.sessionSecret || !/^[A-Za-z0-9_-]{43}$/.test(state) || !nonceCookie || !constantTimeEqual(state, nonceCookie)) {
    json(response, 400, { error: 'Steam 登录验证已失效，请重新开始。' })
    return
  }

  const nonceHash = tokenHash(state, config.sessionSecret)
  const savedNonce = db.prepare('SELECT expires_at AS expiresAt FROM login_nonces WHERE nonce_hash = ?').get(nonceHash) as { expiresAt: number } | undefined
  db.prepare('DELETE FROM login_nonces WHERE nonce_hash = ? OR expires_at < ?').run(nonceHash, Date.now())
  if (!savedNonce || savedNonce.expiresAt < Date.now()) {
    json(response, 400, { error: 'Steam 登录验证已过期，请重新开始。' })
    return
  }

  const callback = new URL('/api/steam-film/callback', config.publicOrigin)
  callback.searchParams.set('state', state)
  const claimedId = requestUrl.searchParams.get('openid.claimed_id') || ''
  const identity = requestUrl.searchParams.get('openid.identity') || ''
  const signed = (requestUrl.searchParams.get('openid.signed') || '').split(',')
  const steamIdMatch = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimedId)
  if (
    requestUrl.searchParams.get('openid.ns') !== 'http://specs.openid.net/auth/2.0' ||
    requestUrl.searchParams.get('openid.mode') !== 'id_res' ||
    requestUrl.searchParams.get('openid.op_endpoint') !== OPENID_ENDPOINT ||
    requestUrl.searchParams.get('openid.return_to') !== callback.href ||
    identity !== claimedId || !steamIdMatch || steamIdMatch[1] !== config.ownerId ||
    signed.some(key => !key) || new Set(signed).size !== signed.length ||
    !['claimed_id', 'identity', 'return_to', 'op_endpoint', 'response_nonce'].every(key => signed.includes(key)) ||
    !requestUrl.searchParams.get('openid.sig')
  ) {
    json(response, 403, { error: 'Steam OpenID 身份校验未通过。' })
    return
  }

  const proof = new URLSearchParams()
  for (const [key, value] of requestUrl.searchParams) {
    if (key.startsWith('openid.')) proof.set(key, value)
  }
  proof.set('openid.mode', 'check_authentication')
  let valid = false
  try {
    const verification = await fetcher(OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'text/plain' },
      body: proof,
      signal: AbortSignal.timeout(10_000),
    })
    const verificationBody = await verification.text()
    const validityFields = verificationBody.split(/\r?\n/).filter(line => line.startsWith('is_valid:'))
    valid = verification.ok && validityFields.length === 1 && validityFields[0] === 'is_valid:true'
  } catch {
    valid = false
  }
  if (!valid) {
    json(response, 502, { error: 'Steam 未能确认这次登录，请稍后重试。' })
    return
  }

  const sessionId = randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000
  db.exec('BEGIN IMMEDIATE')
  try {
    const databaseOwner = getMeta(db, 'owner_steam_id')
    if (databaseOwner && databaseOwner !== config.ownerId) {
      db.exec('ROLLBACK')
      json(response, 409, { error: '此档案数据库已绑定另一 Steam 账号。请检查服务器的 STEAM_OWNER_ID 配置。' })
      return
    }
    setMeta(db, 'owner_steam_id', config.ownerId)
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
    db.prepare('INSERT INTO sessions(session_hash, steam_id, expires_at) VALUES(?, ?, ?)').run(tokenHash(sessionId, config.sessionSecret), config.ownerId, expiresAt)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  response.setHeader('Set-Cookie', [
    cookieHeader(SESSION_COOKIE, sessionId, config, { maxAge: SESSION_TTL_SECONDS, path: '/api/steam-film' }),
    cookieHeader(NONCE_COOKIE, '', config, { maxAge: 0, path: '/api/steam-film/callback' }),
  ])
  redirect(response, new URL('/steam-film', config.publicOrigin).href)
}

function markSyncBatchFailed(db: DatabaseSync, batchId: string, errorCode: string) {
  try {
    db.prepare(`UPDATE sync_batches SET status = 'failed', completed_at = ?, error_code = ? WHERE batch_id = ? AND status = 'running'`)
      .run(new Date().toISOString(), errorCode, batchId)
  } catch {
    // A persistent database failure may also prevent recording the failed batch.
  }
}

function storedFailureCode(category: string, options: { systemErrorCode?: string; httpStatus?: number } = {}) {
  if (options.systemErrorCode && /^[A-Z0-9_]{2,64}$/.test(options.systemErrorCode)) {
    return `${category}:${options.systemErrorCode}`
  }
  if (options.httpStatus && Number.isInteger(options.httpStatus)) return `${category}:HTTP_${options.httpStatus}`
  return category
}

export async function syncOwnedGames(
  db: DatabaseSync,
  config: SteamFilmConfig,
  session: { steamId: string },
  fetcher: typeof fetch,
  options: { enforceCooldown?: boolean } = {},
) {
  if (!config.apiKey) throw new SafeHttpError('Steam Web API Key 尚未配置。', 503)
  if (config.ownerId && session.steamId !== config.ownerId) throw new SafeHttpError('同步目标与本地配置的 Steam 账号不一致。', 403)
  const storedOwner = getMeta(db, 'owner_steam_id')
  if (storedOwner && storedOwner !== session.steamId) throw new SafeHttpError('此档案数据库已绑定另一 Steam 账号。', 409)

  const startedAt = Date.now()
  const enforceCooldown = options.enforceCooldown !== false
  const lastStartedAt = Number(getMeta(db, 'last_sync_started_at') || 0)
  if (enforceCooldown && lastStartedAt && startedAt - lastStartedAt < SYNC_COOLDOWN_MS) {
    throw new SafeHttpError('刚刚已经同步过，请稍等一分钟再试。', 429)
  }
  if (enforceCooldown) setMeta(db, 'last_sync_started_at', String(startedAt))

  const batchId = randomUUID()
  const batchStartedAt = new Date(startedAt).toISOString()
  try {
    db.prepare(`INSERT INTO sync_batches(batch_id, owner_steam_id, started_at, status) VALUES(?, ?, ?, 'running')`)
      .run(batchId, session.steamId, batchStartedAt)
  } catch (error) {
    const systemErrorCode = safeSystemErrorCode(error)
    const failureCode = storedFailureCode('database-write-failed', { systemErrorCode })
    throw new SafeHttpError('无法创建同步批次；数据库写入失败。', 500, 'database-write-failed', systemErrorCode, failureCode)
  }

  const url = new URL(STEAM_GAMES_ENDPOINT)
  url.searchParams.set('key', config.apiKey)
  url.searchParams.set('steamid', session.steamId)
  url.searchParams.set('include_appinfo', 'true')
  url.searchParams.set('include_played_free_games', 'true')
  url.searchParams.set('format', 'json')

  let result: Response
  try {
    result = await fetcher(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15_000) })
  } catch (error) {
    const operationError = error instanceof SteamOperationError
      ? error
      : new SteamOperationError('steam-network-error', { systemErrorCode: safeSystemErrorCode(error) })
    const failureCode = storedFailureCode(operationError.category, { systemErrorCode: operationError.systemErrorCode })
    markSyncBatchFailed(db, batchId, failureCode)
    const message = operationError.category === 'steam-proxy-connection-error'
      ? 'Steam API 经配置的代理连接失败。请检查本机代理客户端是否运行及代理配置。'
      : 'Steam API 网络请求失败。请检查网络连接与 DNS；本次请求未回退为直连。'
    throw new SafeHttpError(message, 502, operationError.category, operationError.systemErrorCode, failureCode)
  }

  if (!result.ok) {
    const category = result.status === 401 || result.status === 403 ? 'steam-api-rejected' : 'steam-http-error'
    const failureCode = storedFailureCode(category, { httpStatus: result.status })
    markSyncBatchFailed(db, batchId, failureCode)
    const message = result.status === 429
      ? 'Steam API 暂时限制了请求，请稍后再试。'
      : category === 'steam-api-rejected'
        ? 'Steam API 拒绝了请求；请检查 API Key 与游戏详情隐私设置。'
        : 'Steam API 返回了 HTTP 错误；游戏档案未更改。'
    throw new SafeHttpError(message, 502, category, undefined, failureCode)
  }

  let payload: { response?: { games?: SteamGameApiItem[] } }
  try {
    payload = await result.json() as { response?: { games?: SteamGameApiItem[] } }
  } catch (error) {
    if (error instanceof SyntaxError) {
      markSyncBatchFailed(db, batchId, 'steam-response-invalid')
      throw new SafeHttpError('Steam API 返回的内容不是有效 JSON；游戏档案未更改。', 502, 'steam-response-invalid')
    }
    const systemErrorCode = safeSystemErrorCode(error)
    const failureCode = storedFailureCode('steam-network-error', { systemErrorCode })
    markSyncBatchFailed(db, batchId, failureCode)
    throw new SafeHttpError('读取 Steam API 响应时网络连接中断；游戏档案未更改。', 502, 'steam-network-error', systemErrorCode)
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.response?.games)) {
    markSyncBatchFailed(db, batchId, 'steam-response-invalid')
    throw new SafeHttpError('Steam API 返回结构异常；游戏档案未更改。', 422, 'steam-response-invalid')
  }
  if (payload.response.games.length > MAX_OWNED_GAMES) {
    markSyncBatchFailed(db, batchId, 'steam-data-invalid')
    throw new SafeHttpError('Steam 返回的游戏数量超过校验上限；游戏档案未更改。', 422, 'steam-data-invalid')
  }

  const seenAppIds = new Set<number>()
  for (const game of payload.response.games) {
    if (!game || typeof game !== 'object' || Array.isArray(game)) {
      markSyncBatchFailed(db, batchId, 'steam-data-invalid')
      throw new SafeHttpError('Steam 返回了格式异常的游戏记录；已有档案未更改。', 422, 'steam-data-invalid')
    }
    const name = typeof game.name === 'string' ? game.name.trim() : ''
    if (typeof game.appid !== 'number' || !Number.isSafeInteger(game.appid) || game.appid <= 0 || !name) {
      markSyncBatchFailed(db, batchId, 'steam-data-invalid')
      throw new SafeHttpError('Steam 返回了不完整的游戏记录；已有档案未更改。', 422, 'steam-data-invalid')
    }
    if (seenAppIds.has(game.appid)) {
      markSyncBatchFailed(db, batchId, 'steam-data-invalid')
      throw new SafeHttpError('Steam 返回了重复游戏记录；已有档案未更改。', 422, 'steam-data-invalid')
    }
    seenAppIds.add(game.appid)
    for (const field of ['playtime_forever', 'playtime_2weeks', 'rtime_last_played'] as const) {
      const value = game[field]
      if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) {
        markSyncBatchFailed(db, batchId, 'steam-data-invalid')
        throw new SafeHttpError('Steam 返回了格式异常的游玩记录；已有档案未更改。', 422, 'steam-data-invalid')
      }
    }
  }

  const now = new Date().toISOString()
  let snapshotCount = 0
  let regressionCount = 0
  let transactionStarted = false
  try {
    db.exec('BEGIN IMMEDIATE')
    transactionStarted = true
    const databaseOwner = getMeta(db, 'owner_steam_id')
    if (databaseOwner && databaseOwner !== session.steamId) throw new SafeHttpError('此档案数据库已绑定另一 Steam 账号。', 409, 'database-owner-mismatch')
    setMeta(db, 'owner_steam_id', session.steamId)
    const upsert = db.prepare(`
      INSERT INTO steam_games (
        steam_app_id, name, header_image, first_played_at, first_seen_at,
        first_achievement_at, last_played_at, playtime_minutes,
        playtime_recent_minutes, achievement_count, achievement_total,
        personal_note, data_source, updated_at
      ) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(steam_app_id) DO UPDATE SET
        name = excluded.name,
        header_image = excluded.header_image,
        last_played_at = COALESCE(excluded.last_played_at, steam_games.last_played_at),
        playtime_minutes = COALESCE(excluded.playtime_minutes, steam_games.playtime_minutes),
        playtime_recent_minutes = COALESCE(excluded.playtime_recent_minutes, steam_games.playtime_recent_minutes),
        data_source = excluded.data_source,
        updated_at = excluded.updated_at
    `)
    const priorGame = db.prepare('SELECT playtime_minutes AS playtimeMinutes FROM steam_games WHERE steam_app_id = ?')
    const latestSnapshot = db.prepare(`
      SELECT s.playtime_minutes AS playtimeMinutes
      FROM game_playtime_snapshots s
      JOIN sync_batches b ON b.batch_id = s.batch_id
      WHERE s.owner_steam_id = ? AND s.steam_app_id = ? AND b.status = 'succeeded'
      ORDER BY s.captured_at DESC LIMIT 1
    `)
    const saveSnapshot = db.prepare(`
      INSERT INTO game_playtime_snapshots(
        batch_id, owner_steam_id, steam_app_id, captured_at, playtime_minutes,
        regressed, previous_playtime_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const game of payload.response.games) {
      const appId = game.appid
      const name = typeof game.name === 'string' ? game.name.trim().slice(0, 300) : ''
      const playtime = typeof game.playtime_forever === 'number' && Number.isSafeInteger(game.playtime_forever) && game.playtime_forever >= 0 ? game.playtime_forever : null
      const recent = typeof game.playtime_2weeks === 'number' && Number.isSafeInteger(game.playtime_2weeks) && game.playtime_2weeks >= 0 ? game.playtime_2weeks : null
      const image = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
      if (playtime !== null) {
        const previous = latestSnapshot.get(session.steamId, appId) as { playtimeMinutes: number } | undefined
        const baseline = previous?.playtimeMinutes ?? (priorGame.get(appId) as { playtimeMinutes: number | null } | undefined)?.playtimeMinutes ?? null
        const regressed = baseline !== null && playtime < baseline
        saveSnapshot.run(batchId, session.steamId, appId, now, playtime, regressed ? 1 : 0, baseline)
        snapshotCount++
        if (regressed) regressionCount++
      }
      upsert.run(appId, name, image, now, toIsoEpoch(game.rtime_last_played), playtime, recent, 'Steam Web API · IPlayerService/GetOwnedGames', now)
    }
    setMeta(db, 'last_synced_at', now)
    db.prepare(`
      UPDATE sync_batches SET status = 'succeeded', completed_at = ?,
        sampled_game_count = ?, snapshot_count = ?, regression_count = ?, error_code = NULL
      WHERE batch_id = ? AND status = 'running'
    `).run(now, payload.response.games.length, snapshotCount, regressionCount, batchId)
    db.exec('COMMIT')
    transactionStarted = false
  } catch (error) {
    if (transactionStarted) {
      try { db.exec('ROLLBACK') } catch { /* The transaction may already have rolled back. */ }
    }
    const systemErrorCode = error instanceof SafeHttpError ? error.systemErrorCode : safeSystemErrorCode(error)
    const failureCode = error instanceof SafeHttpError
      ? error.failureCode
      : storedFailureCode('database-write-failed', { systemErrorCode })
    markSyncBatchFailed(db, batchId, failureCode)
    if (error instanceof SafeHttpError) throw error
    throw new SafeHttpError('Steam 数据库写入失败；本次事务已回滚。', 500, 'database-write-failed', systemErrorCode, failureCode)
  }
  return { batchId, lastSyncedAt: now, gameCount: getGames(db).length, sampledGameCount: payload.response.games.length, snapshotCount, regressionCount }
}

export function createSteamFilmServer(options: { config: SteamFilmConfig; db?: DatabaseSync; fetcher?: typeof fetch; steamFetcher?: typeof fetch } ) {
  const { config } = options
  const db = options.db ?? openStore(config.databasePath)
  createStore(db)
  const fetcher = options.fetcher ?? fetch
  const steamHttpClient = options.steamFetcher || options.fetcher
    ? null
    : createSteamHttpClient(resolveSteamProxySettings({ STEAM_FILM_HTTPS_PROXY: config.steamHttpsProxy ?? undefined }))
  const steamFetcher = options.steamFetcher ?? options.fetcher ?? steamHttpClient!.fetch

  const server = createHttpServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url || '/', config.publicOrigin || 'http://127.0.0.1')
      const path = requestUrl.pathname.replace(/\/$/, '') || '/'
      if (request.method === 'GET' && path === '/api/steam-film/status') {
        const session = getSession(request, db, config)
        const gameCount = session ? Number((db.prepare('SELECT COUNT(*) AS count FROM steam_games').get() as { count: number }).count) : undefined
        json(response, 200, {
          loginAvailable: Boolean(config.ownerId && config.publicOrigin && config.sessionSecret),
          syncAvailable: Boolean(config.ownerId && config.publicOrigin && config.sessionSecret && config.apiKey),
          authenticated: Boolean(session),
          ...(session ? { csrfToken: session.csrfToken, lastSyncedAt: getMeta(db, 'last_synced_at'), gameCount } : { lastSyncedAt: null }),
        })
        return
      }

      if (request.method === 'GET' && path === '/api/steam-film/login') {
        if (!config.ownerId || !config.publicOrigin || !config.sessionSecret) {
          json(response, 503, { error: '服务器尚未配置 Steam OpenID、STEAM_OWNER_ID 和 SESSION_SECRET。' })
          return
        }
        const state = randomBytes(32).toString('base64url')
        const expiresAt = Date.now() + LOGIN_NONCE_TTL_MS
        db.prepare('DELETE FROM login_nonces WHERE expires_at < ?').run(Date.now())
        db.prepare('INSERT INTO login_nonces(nonce_hash, expires_at) VALUES(?, ?)').run(tokenHash(state, config.sessionSecret), expiresAt)
        const returnTo = new URL('/api/steam-film/callback', config.publicOrigin)
        returnTo.searchParams.set('state', state)
        const login = new URL(OPENID_ENDPOINT)
        login.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0')
        login.searchParams.set('openid.mode', 'checkid_setup')
        login.searchParams.set('openid.return_to', returnTo.href)
        login.searchParams.set('openid.realm', `${config.publicOrigin}/`)
        login.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select')
        login.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select')
        response.setHeader('Set-Cookie', cookieHeader(NONCE_COOKIE, state, config, { maxAge: 300, path: '/api/steam-film/callback' }))
        redirect(response, login.href)
        return
      }

      if (request.method === 'GET' && path === '/api/steam-film/callback') {
        await steamOpenIdCallback(requestUrl, request, response, db, config, fetcher)
        return
      }

      if (request.method === 'GET' && path === '/api/steam-film/games') {
        const session = getSession(request, db, config)
        if (!session) { json(response, 401, { error: '请先使用已绑定的 Steam 账号登录。' }); return }
        json(response, 200, { games: getGames(db) })
        return
      }

      if (request.method === 'POST' && path === '/api/steam-film/sync') {
        if (!requireSameOrigin(request, response, config)) return
        const session = getSession(request, db, config)
        if (!session) { json(response, 401, { error: 'Steam 登录状态已过期，请重新登录。' }); return }
        if (!requireCsrf(request, response, session)) return
        try {
          json(response, 200, await syncOwnedGames(db, config, session, steamFetcher))
        } catch (error) {
          if (error instanceof SafeHttpError) json(response, error.status, {
            error: error.message,
            category: error.category,
            failureCode: error.failureCode,
            ...(error.systemErrorCode ? { systemErrorCode: error.systemErrorCode } : {}),
          })
          else json(response, 500, { error: 'Steam 同步结果未能保存；已有档案已保留，请稍后重试。' })
        }
        return
      }

      if (request.method === 'POST' && path === '/api/steam-film/logout') {
        if (!requireSameOrigin(request, response, config)) return
        const session = getSession(request, db, config)
        if (!session) { json(response, 401, { error: '登录状态已过期。' }); return }
        if (!requireCsrf(request, response, session)) return
        if (config.sessionSecret) db.prepare('DELETE FROM sessions WHERE session_hash = ?').run(tokenHash(session.sessionId, config.sessionSecret))
        response.setHeader('Set-Cookie', cookieHeader(SESSION_COOKIE, '', config, { maxAge: 0, path: '/api/steam-film' }))
        json(response, 200, { loggedOut: true })
        return
      }

      json(response, 404, { error: '未找到 Steam Film Archive 接口。' })
    })().catch(() => {
      if (!response.headersSent) json(response, 500, { error: 'Steam Film Archive 服务暂时不可用。' })
      else response.destroy()
    })
  })

  server.headersTimeout = 10_000
  server.requestTimeout = 20_000
  server.maxHeadersCount = 50
  server.once('close', () => { void steamHttpClient?.close() })
  return { server, db }
}

function isDirectRun() {
  const entry = process.argv[1]
  return Boolean(entry && import.meta.url === pathToFileURL(resolve(entry)).href)
}

if (isDirectRun()) {
  try {
    const config = readConfig()
    const { server } = createSteamFilmServer({ config })
    server.listen(config.port, config.host, () => {
      console.log(`Steam Film Archive API listening on ${config.host}:${config.port}`)
    })
  } catch {
    console.error('Steam Film Archive could not start. Check its local configuration.')
    process.exitCode = 1
  }
}
