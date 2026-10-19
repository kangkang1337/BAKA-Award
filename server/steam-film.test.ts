import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, test } from 'node:test'
import { createStore, createSteamFilmServer, readConfig, type SteamFilmConfig } from './index.ts'

const OWNER_ID = '76561198000000000'
const OTHER_OWNER_ID = '76561198000000001'
const SESSION_SECRET = 'test-session-secret-with-at-least-32-bytes-long'
const PUBLIC_ORIGIN = 'https://bakaaward.com'
const running: Array<{ close: () => Promise<void> }> = []

function config(overrides: Partial<SteamFilmConfig> = {}): SteamFilmConfig {
  return {
    apiKey: null,
    ownerId: OWNER_ID,
    publicOrigin: PUBLIC_ORIGIN,
    sessionSecret: SESSION_SECRET,
    databasePath: './var/test.sqlite',
    host: '127.0.0.1',
    port: 8788,
    production: false,
    ...overrides,
  }
}

async function startServer(settings: SteamFilmConfig = config(), options: { db?: DatabaseSync; fetcher?: typeof fetch } = {}) {
  const db = options.db ?? createStore(new DatabaseSync(':memory:'))
  const { server } = createSteamFilmServer({ config: settings, db, fetcher: options.fetcher })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  running.push({ close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
  return { baseUrl, db }
}

afterEach(async () => {
  await Promise.all(running.splice(0).map(server => server.close()))
})

test('configuration rejects non-loopback binding and public database locations', () => {
  assert.throws(() => readConfig({ HOST: '0.0.0.0' }), /loopback/)
  assert.throws(() => readConfig({ DATABASE_PATH: 'public/archive.sqlite' }), /public\/ or dist\//)
  assert.throws(() => readConfig({ PUBLIC_ORIGIN: 'https://bakaaward.com/path' }), /site origin/)
})

test('configuration keeps invalid API keys and short session secrets disabled', () => {
  const result = readConfig({
    STEAM_API_KEY: 'not-a-key',
    STEAM_OWNER_ID: OWNER_ID,
    SESSION_SECRET: 'too-short',
    PUBLIC_ORIGIN,
  })
  assert.equal(result.apiKey, null)
  assert.equal(result.ownerId, OWNER_ID)
  assert.equal(result.sessionSecret, null)
})

test('production configuration requires HTTPS and all private credentials', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /Production requires/)
  assert.throws(() => readConfig({
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'http://bakaaward.com',
    STEAM_OWNER_ID: OWNER_ID,
    STEAM_API_KEY: 'a'.repeat(32),
    SESSION_SECRET,
  }), /HTTPS/)
  assert.doesNotThrow(() => readConfig({
    NODE_ENV: 'production',
    PUBLIC_ORIGIN,
    STEAM_OWNER_ID: OWNER_ID,
    STEAM_API_KEY: 'a'.repeat(32),
    SESSION_SECRET,
  }))
})

test('private game endpoint denies anonymous visitors and status omits private counts', async () => {
  const { baseUrl } = await startServer()
  const games = await fetch(`${baseUrl}/api/steam-film/games`)
  assert.equal(games.status, 401)
  assert.equal(games.headers.get('cache-control'), 'no-store')

  const status = await fetch(`${baseUrl}/api/steam-film/status`)
  assert.equal(status.status, 200)
  const body = await status.json() as Record<string, unknown>
  assert.equal(body.authenticated, false)
  assert.equal('gameCount' in body, false)
})

test('login returns a Steam OpenID redirect and an HttpOnly one-time nonce cookie', async () => {
  const { baseUrl } = await startServer()
  const response = await fetch(`${baseUrl}/api/steam-film/login`, { redirect: 'manual' })
  assert.equal(response.status, 302)
  assert.match(response.headers.get('location') || '', /^https:\/\/steamcommunity\.com\/openid\/login\?/)
  const cookie = response.headers.get('set-cookie') || ''
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
  assert.match(cookie, /Path=\/api\/steam-film\/callback/i)
})

test('write endpoints reject requests from a different origin before doing any work', async () => {
  const { baseUrl } = await startServer(config({ apiKey: 'a'.repeat(32) }))
  const response = await fetch(`${baseUrl}/api/steam-film/sync`, {
    method: 'POST',
    headers: { Origin: 'https://attacker.example' },
  })
  assert.equal(response.status, 403)
  assert.match((await response.json() as { error: string }).error, /来源校验失败/)
})

test('Steam OpenID callback cannot reuse a database bound to another owner', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('owner_steam_id', OTHER_OWNER_ID)
  const state = 'one-time-test-state'
  const nonceHash = createHmac('sha256', SESSION_SECRET).update(state).digest('hex')
  db.prepare('INSERT INTO login_nonces(nonce_hash, expires_at) VALUES(?, ?)').run(nonceHash, Date.now() + 60_000)
  const { baseUrl } = await startServer(config(), {
    db,
    fetcher: async () => new Response('is_valid:true\n', { status: 200 }),
  })

  const callback = new URL('/api/steam-film/callback', baseUrl)
  callback.searchParams.set('state', state)
  callback.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0')
  callback.searchParams.set('openid.mode', 'id_res')
  callback.searchParams.set('openid.op_endpoint', 'https://steamcommunity.com/openid/login')
  callback.searchParams.set('openid.return_to', `${PUBLIC_ORIGIN}/api/steam-film/callback?state=${state}`)
  callback.searchParams.set('openid.claimed_id', `https://steamcommunity.com/openid/id/${OWNER_ID}`)
  callback.searchParams.set('openid.identity', `https://steamcommunity.com/openid/id/${OWNER_ID}`)
  callback.searchParams.set('openid.signed', 'claimed_id,identity,return_to,op_endpoint,response_nonce')
  callback.searchParams.set('openid.sig', 'signed-by-steam')
  callback.searchParams.set('openid.response_nonce', '2026-10-19T00:00:00Ztest')

  const response = await fetch(callback, {
    redirect: 'manual',
    headers: { Cookie: `baka_steam_film_nonce=${state}` },
  })
  assert.equal(response.status, 409)
  assert.match((await response.json() as { error: string }).error, /已绑定另一 Steam 账号/)
})

test('a Steam-verified owner receives an HttpOnly session and can read the private archive', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  db.prepare(`
    INSERT INTO steam_games (steam_app_id, name, data_source, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(620, 'Portal 2', 'test fixture', new Date().toISOString())
  const state = 'valid-owner-test-state'
  const nonceHash = createHmac('sha256', SESSION_SECRET).update(state).digest('hex')
  db.prepare('INSERT INTO login_nonces(nonce_hash, expires_at) VALUES(?, ?)').run(nonceHash, Date.now() + 60_000)
  const { baseUrl } = await startServer(config(), {
    db,
    fetcher: async () => new Response('is_valid:true\n', { status: 200 }),
  })

  const callback = new URL('/api/steam-film/callback', baseUrl)
  callback.searchParams.set('state', state)
  callback.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0')
  callback.searchParams.set('openid.mode', 'id_res')
  callback.searchParams.set('openid.op_endpoint', 'https://steamcommunity.com/openid/login')
  callback.searchParams.set('openid.return_to', `${PUBLIC_ORIGIN}/api/steam-film/callback?state=${state}`)
  callback.searchParams.set('openid.claimed_id', `https://steamcommunity.com/openid/id/${OWNER_ID}`)
  callback.searchParams.set('openid.identity', `https://steamcommunity.com/openid/id/${OWNER_ID}`)
  callback.searchParams.set('openid.signed', 'claimed_id,identity,return_to,op_endpoint,response_nonce')
  callback.searchParams.set('openid.sig', 'signed-by-steam')
  callback.searchParams.set('openid.response_nonce', '2026-10-19T00:00:00Ztest')

  const login = await fetch(callback, {
    redirect: 'manual',
    headers: { Cookie: `baka_steam_film_nonce=${state}` },
  })
  assert.equal(login.status, 302)
  assert.equal(db.prepare('SELECT value FROM archive_meta WHERE key = ?').get('owner_steam_id')?.value, OWNER_ID)
  const sessionCookie = login.headers.getSetCookie().find(value => value.startsWith('baka_steam_film='))
  assert.ok(sessionCookie)
  assert.match(sessionCookie, /HttpOnly/i)
  assert.match(sessionCookie, /SameSite=Lax/i)

  const archive = await fetch(`${baseUrl}/api/steam-film/games`, {
    headers: { Cookie: sessionCookie.split(';', 1)[0]! },
  })
  assert.equal(archive.status, 200)
  assert.deepEqual((await archive.json() as { games: Array<{ steamAppId: number; name: string }> }).games, [
    { steamAppId: 620, name: 'Portal 2', headerImage: null, firstPlayedAt: null, firstSeenAt: null,
      firstAchievementAt: null, lastPlayedAt: null, playtimeMinutes: null, playtimeRecentMinutes: null,
      achievementCount: null, achievementTotal: null, personalNote: null, dataSource: 'test fixture' },
  ])
})
