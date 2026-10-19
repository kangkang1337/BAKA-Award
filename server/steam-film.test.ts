import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, test } from 'node:test'
import { createStore, createSteamFilmServer, readConfig, type SteamFilmConfig } from './index.ts'

const OWNER_ID = '76561198000000000'
const OTHER_OWNER_ID = '76561198000000001'
const SESSION_SECRET = 'test-session-secret-with-at-least-32-bytes-long'
const PUBLIC_ORIGIN = 'https://bakaaward.com'
const VALID_STATE = 'A'.repeat(43)
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

function seedNonce(db: DatabaseSync, state = VALID_STATE, expiresAt = Date.now() + 60_000) {
  const nonceHash = createHmac('sha256', SESSION_SECRET).update(state).digest('hex')
  db.prepare('INSERT INTO login_nonces(nonce_hash, expires_at) VALUES(?, ?)').run(nonceHash, expiresAt)
}

function openIdCallback(baseUrl: string, state = VALID_STATE, overrides: Record<string, string> = {}) {
  const callback = new URL('/api/steam-film/callback', baseUrl)
  const params: Record<string, string> = {
    state,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.return_to': `${PUBLIC_ORIGIN}/api/steam-film/callback?state=${state}`,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${OWNER_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${OWNER_ID}`,
    'openid.signed': 'claimed_id,identity,return_to,op_endpoint,response_nonce',
    'openid.sig': 'signed-by-steam-test-fixture',
    'openid.response_nonce': '2026-10-19T00:00:00Ztest-fixture',
    ...overrides,
  }
  for (const [key, value] of Object.entries(params)) callback.searchParams.set(key, value)
  return callback
}

function nonceCookie(state = VALID_STATE) {
  return `baka_steam_film_nonce=${state}`
}

function seedSession(db: DatabaseSync, options: { steamId?: string; ownerId?: string; expiresAt?: number; suffix?: string } = {}) {
  const sessionId = (options.suffix || 'S').repeat(43)
  const steamId = options.steamId || OWNER_ID
  const expiresAt = options.expiresAt ?? Date.now() + 60_000
  const sessionHash = createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex')
  db.prepare('INSERT INTO sessions(session_hash, steam_id, expires_at) VALUES(?, ?, ?)').run(sessionHash, steamId, expiresAt)
  if (options.ownerId) db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('owner_steam_id', options.ownerId)
  return {
    cookie: `baka_steam_film=${sessionId}`,
    csrfToken: createHmac('sha256', SESSION_SECRET).update(`csrf:${sessionId}`).digest('base64url'),
  }
}

function seedGame(db: DatabaseSync, appId = 620) {
  db.prepare(`
    INSERT INTO steam_games (
      steam_app_id, name, last_played_at, playtime_minutes, playtime_recent_minutes,
      data_source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(appId, 'Portal 2', '2025-12-01T12:00:00.000Z', 1250, 37, 'existing archive', '2025-12-02T12:00:00.000Z')
}

async function postSync(baseUrl: string, session: { cookie: string; csrfToken: string }, options: { origin?: string; csrfToken?: string } = {}) {
  return fetch(`${baseUrl}/api/steam-film/sync`, {
    method: 'POST',
    headers: {
      Origin: options.origin ?? PUBLIC_ORIGIN,
      Cookie: session.cookie,
      'X-CSRF-Token': options.csrfToken ?? session.csrfToken,
    },
  })
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

test('missing login configuration disables the login endpoint without exposing private data', async () => {
  const { baseUrl } = await startServer(config({ ownerId: null, sessionSecret: null }))
  const status = await fetch(`${baseUrl}/api/steam-film/status`)
  assert.deepEqual(await status.json(), { loginAvailable: false, syncAvailable: false, authenticated: false, lastSyncedAt: null })
  const login = await fetch(`${baseUrl}/api/steam-film/login`)
  assert.equal(login.status, 503)
})

test('login returns a Steam OpenID redirect and a secure HttpOnly one-time nonce cookie', async () => {
  const { baseUrl } = await startServer()
  const response = await fetch(`${baseUrl}/api/steam-film/login`, { redirect: 'manual' })
  assert.equal(response.status, 302)
  assert.match(response.headers.get('location') || '', /^https:\/\/steamcommunity\.com\/openid\/login\?/)
  const cookie = response.headers.get('set-cookie') || ''
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /Secure/i)
  assert.match(cookie, /SameSite=Lax/i)
  assert.match(cookie, /Path=\/api\/steam-film\/callback/i)
  assert.match(cookie, /Max-Age=300/i)
  const location = new URL(response.headers.get('location')!)
  const returnTo = new URL(location.searchParams.get('openid.return_to')!)
  assert.equal(returnTo.origin, PUBLIC_ORIGIN)
  assert.equal(returnTo.pathname, '/api/steam-film/callback')
  assert.match(returnTo.searchParams.get('state') || '', /^[A-Za-z0-9_-]{43}$/)
})

test('write endpoints reject requests from a different or missing origin before doing any work', async () => {
  let fetchCalled = false
  const { baseUrl } = await startServer(config({ apiKey: 'a'.repeat(32) }), { fetcher: async () => { fetchCalled = true; return Response.json({}) } })
  for (const origin of ['https://attacker.example', null]) {
    const response = await fetch(`${baseUrl}/api/steam-film/sync`, {
      method: 'POST',
      headers: origin ? { Origin: origin } : {},
    })
    assert.equal(response.status, 403)
    assert.match((await response.json() as { error: string }).error, /来源校验失败/)
  }
  assert.equal(fetchCalled, false)
})

test('invalid and expired OpenID states are rejected', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedNonce(db, VALID_STATE, Date.now() - 1)
  const { baseUrl } = await startServer(config(), { db, fetcher: async () => { throw new Error('must not contact Steam') } })

  const malformed = await fetch(openIdCallback(baseUrl, 'not-a-valid-state'), {
    redirect: 'manual', headers: { Cookie: nonceCookie('not-a-valid-state') },
  })
  assert.equal(malformed.status, 400)

  const expired = await fetch(openIdCallback(baseUrl), { redirect: 'manual', headers: { Cookie: nonceCookie() } })
  assert.equal(expired.status, 400)
  assert.match((await expired.json() as { error: string }).error, /过期/)
})

test('OpenID callback rejects duplicate parameters and a SteamID other than the configured owner', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedNonce(db)
  let verificationCalls = 0
  const { baseUrl } = await startServer(config(), { db, fetcher: async () => { verificationCalls++; return new Response('is_valid:true\n') } })

  const duplicate = openIdCallback(baseUrl)
  duplicate.searchParams.append('openid.claimed_id', `https://steamcommunity.com/openid/id/${OTHER_OWNER_ID}`)
  const duplicateResponse = await fetch(duplicate, { redirect: 'manual', headers: { Cookie: nonceCookie() } })
  assert.equal(duplicateResponse.status, 400)

  seedNonce(db, 'B'.repeat(43))
  const wrongId = await fetch(openIdCallback(baseUrl, 'B'.repeat(43), {
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${OTHER_OWNER_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${OTHER_OWNER_ID}`,
    'openid.return_to': `${PUBLIC_ORIGIN}/api/steam-film/callback?state=${'B'.repeat(43)}`,
  }), { redirect: 'manual', headers: { Cookie: nonceCookie('B'.repeat(43)) } })
  assert.equal(wrongId.status, 403)
  assert.equal(verificationCalls, 0)
})

test('OpenID parameters are sent to Steam for verification and a failed proof creates no session', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedNonce(db)
  const { baseUrl } = await startServer(config(), {
    db,
    fetcher: async (input, init) => {
      assert.equal(String(input), 'https://steamcommunity.com/openid/login')
      assert.equal(init?.method, 'POST')
      const proof = new URLSearchParams(String(init?.body))
      assert.equal(proof.get('openid.mode'), 'check_authentication')
      assert.equal(proof.get('openid.claimed_id'), `https://steamcommunity.com/openid/id/${OWNER_ID}`)
      return new Response('is_valid:false\n', { status: 200 })
    },
  })

  const response = await fetch(openIdCallback(baseUrl), { redirect: 'manual', headers: { Cookie: nonceCookie() } })
  assert.equal(response.status, 502)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count, 0)
  const replay = await fetch(openIdCallback(baseUrl), { redirect: 'manual', headers: { Cookie: nonceCookie() } })
  assert.equal(replay.status, 400)
})

test('Steam OpenID callback refuses a database already bound to another Steam account', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('owner_steam_id', OTHER_OWNER_ID)
  seedNonce(db)
  const { baseUrl } = await startServer(config(), {
    db,
    fetcher: async () => new Response('is_valid:true\n', { status: 200 }),
  })

  const response = await fetch(openIdCallback(baseUrl), { redirect: 'manual', headers: { Cookie: nonceCookie() } })
  assert.equal(response.status, 409)
  assert.match((await response.json() as { error: string }).error, /已绑定另一 Steam 账号/)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count, 0)
})

test('failed session insertion rolls back the initial account binding', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedNonce(db)
  db.exec(`CREATE TRIGGER reject_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'private session diagnostic'); END`)
  const { baseUrl } = await startServer(config(), {
    db,
    fetcher: async () => new Response('is_valid:true\n', { status: 200 }),
  })

  const response = await fetch(openIdCallback(baseUrl), { redirect: 'manual', headers: { Cookie: nonceCookie() } })
  assert.equal(response.status, 500)
  assert.equal((await response.text()).includes('private session diagnostic'), false)
  assert.equal(db.prepare('SELECT value FROM archive_meta WHERE key = ?').get('owner_steam_id'), undefined)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count, 0)
})

test('a Steam-verified owner receives a secure session and can read the private archive once', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  db.prepare(`
    INSERT INTO steam_games (steam_app_id, name, data_source, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(620, 'Portal 2', 'test fixture', new Date().toISOString())
  seedNonce(db)
  const { baseUrl } = await startServer(config(), {
    db,
    fetcher: async () => new Response('is_valid:true\n', { status: 200 }),
  })

  const callback = openIdCallback(baseUrl)
  const login = await fetch(callback, { redirect: 'manual', headers: { Cookie: nonceCookie() } })
  assert.equal(login.status, 302)
  assert.equal(db.prepare('SELECT value FROM archive_meta WHERE key = ?').get('owner_steam_id')?.value, OWNER_ID)
  const sessionCookie = login.headers.getSetCookie().find(value => value.startsWith('baka_steam_film='))
  assert.ok(sessionCookie)
  assert.match(sessionCookie, /HttpOnly/i)
  assert.match(sessionCookie, /Secure/i)
  assert.match(sessionCookie, /SameSite=Lax/i)
  assert.match(sessionCookie, /Path=\/api\/steam-film/i)
  assert.match(sessionCookie, /Max-Age=2592000/i)

  const archive = await fetch(`${baseUrl}/api/steam-film/games`, { headers: { Cookie: sessionCookie.split(';', 1)[0]! } })
  assert.equal(archive.status, 200)
  assert.deepEqual((await archive.json() as { games: Array<{ steamAppId: number; name: string }> }).games, [
    { steamAppId: 620, name: 'Portal 2', headerImage: null, firstPlayedAt: null, firstSeenAt: null,
      firstAchievementAt: null, lastPlayedAt: null, playtimeMinutes: null, playtimeRecentMinutes: null,
      achievementCount: null, achievementTotal: null, personalNote: null, dataSource: 'test fixture' },
  ])
  const replay = await fetch(callback, { redirect: 'manual', headers: { Cookie: nonceCookie() } })
  assert.equal(replay.status, 400)
})

test('expired sessions, malformed cookies, wrong Steam IDs, and database binding mismatches cannot read games', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedGame(db)
  const expired = seedSession(db, { suffix: 'E', expiresAt: Date.now() - 1, ownerId: OWNER_ID })
  const wrongSteam = seedSession(db, { suffix: 'W', steamId: OTHER_OWNER_ID })
  const { baseUrl } = await startServer(config(), { db })

  for (const cookie of [expired.cookie, wrongSteam.cookie, 'baka_steam_film=malformed', 'baka_steam_film=%ZZ']) {
    const response = await fetch(`${baseUrl}/api/steam-film/games`, { headers: { Cookie: cookie } })
    assert.equal(response.status, 401)
  }

  db.prepare('UPDATE archive_meta SET value = ? WHERE key = ?').run(OTHER_OWNER_ID, 'owner_steam_id')
  const mismatchedBinding = seedSession(db, { suffix: 'M', steamId: OWNER_ID })
  const mismatchResponse = await fetch(`${baseUrl}/api/steam-film/games`, { headers: { Cookie: mismatchedBinding.cookie } })
  assert.equal(mismatchResponse.status, 401)
})

test('write endpoints reject missing or invalid CSRF tokens even for a valid session', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  const session = seedSession(db, { ownerId: OWNER_ID })
  let fetchCalled = false
  const { baseUrl } = await startServer(config({ apiKey: 'a'.repeat(32) }), { db, fetcher: async () => { fetchCalled = true; return Response.json({ response: { games: [] } }) } })

  for (const csrfToken of ['', 'wrong-token']) {
    const response = await postSync(baseUrl, session, { csrfToken })
    assert.equal(response.status, 403)
    assert.match((await response.json() as { error: string }).error, /校验/)
  }
  assert.equal(fetchCalled, false)

  const badOrigin = await postSync(baseUrl, session, { origin: 'https://attacker.example' })
  assert.equal(badOrigin.status, 403)
  assert.equal(fetchCalled, false)
})

test('Steam API timeout, error, invalid JSON, and malformed records preserve the old archive', async () => {
  const failures: Array<{ label: string; fetcher: typeof fetch; status: number }> = [
    { label: 'timeout', fetcher: async () => { throw new DOMException('simulated timeout', 'TimeoutError') }, status: 502 },
    { label: 'HTTP error', fetcher: async () => new Response('key=private-api-key-value', { status: 503 }), status: 502 },
    { label: 'invalid JSON', fetcher: async () => new Response('{not-json', { status: 200 }), status: 502 },
    { label: 'missing games array', fetcher: async () => Response.json({ response: {} }), status: 422 },
    { label: 'null response body', fetcher: async () => Response.json(null), status: 422 },
    { label: 'null game row', fetcher: async () => Response.json({ response: { games: [null] } }), status: 422 },
    { label: 'invalid playtime', fetcher: async () => Response.json({ response: { games: [{ appid: 620, name: 'Portal 2', playtime_forever: -4 }] } }), status: 422 },
    { label: 'invalid playtime type', fetcher: async () => Response.json({ response: { games: [{ appid: 620, name: 'Portal 2', playtime_forever: '25' }] } }), status: 422 },
    { label: 'duplicate app id', fetcher: async () => Response.json({ response: { games: [{ appid: 620, name: 'Portal 2' }, { appid: 620, name: 'Portal 2 copy' }] } }), status: 422 },
  ]

  for (const failure of failures) {
    const db = createStore(new DatabaseSync(':memory:'))
    seedGame(db)
    db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('last_synced_at', '2025-12-02T12:00:00.000Z')
    const session = seedSession(db, { ownerId: OWNER_ID })
    const { baseUrl } = await startServer(config({ apiKey: 'a'.repeat(32) }), { db, fetcher: failure.fetcher })

    const response = await postSync(baseUrl, session)
    assert.equal(response.status, failure.status, failure.label)
    const body = await response.text()
    assert.equal(body.includes('private-api-key-value'), false, failure.label)
    assert.equal(body.includes('simulated timeout'), false, failure.label)
    const game = db.prepare('SELECT name, playtime_minutes AS playtimeMinutes, playtime_recent_minutes AS recent FROM steam_games WHERE steam_app_id = 620').get() as { name: string; playtimeMinutes: number; recent: number }
    assert.deepEqual({ ...game }, { name: 'Portal 2', playtimeMinutes: 1250, recent: 37 }, failure.label)
    assert.equal(db.prepare('SELECT value FROM archive_meta WHERE key = ?').get('last_synced_at')?.value, '2025-12-02T12:00:00.000Z', failure.label)
  }
})

test('a successful sync preserves existing values when Steam omits optional time fields', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedGame(db)
  const session = seedSession(db, { ownerId: OWNER_ID })
  let requestedUrl = ''
  const { baseUrl } = await startServer(config({ apiKey: 'a'.repeat(32) }), {
    db,
    fetcher: async input => {
      requestedUrl = String(input)
      return Response.json({ response: { games: [{ appid: 620, name: 'Portal 2' }] } })
    },
  })

  const response = await postSync(baseUrl, session)
  assert.equal(response.status, 200)
  assert.equal(new URL(requestedUrl).searchParams.get('key'), 'a'.repeat(32))
  const game = db.prepare('SELECT last_played_at AS lastPlayedAt, playtime_minutes AS playtimeMinutes, playtime_recent_minutes AS recent FROM steam_games WHERE steam_app_id = 620').get()
  assert.deepEqual({ ...game }, { lastPlayedAt: '2025-12-01T12:00:00.000Z', playtimeMinutes: 1250, recent: 37 })
})

test('a successful empty Steam response does not delete previously archived games', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedGame(db)
  const session = seedSession(db, { ownerId: OWNER_ID })
  const { baseUrl } = await startServer(config({ apiKey: 'a'.repeat(32) }), {
    db,
    fetcher: async () => Response.json({ response: { games: [] } }),
  })

  const response = await postSync(baseUrl, session)
  assert.equal(response.status, 200)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM steam_games').get() as { count: number }).count, 1)
  assert.equal((await response.json() as { gameCount: number }).gameCount, 1)
})

test('a SQLite write error rolls back the whole sync and hides internal diagnostics', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedGame(db)
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('last_synced_at', '2025-12-02T12:00:00.000Z')
  db.exec(`CREATE TRIGGER reject_test_game BEFORE INSERT ON steam_games WHEN NEW.steam_app_id = 999 BEGIN SELECT RAISE(ABORT, 'private sqlite diagnostic'); END`)
  const session = seedSession(db, { ownerId: OWNER_ID })
  const { baseUrl } = await startServer(config({ apiKey: 'a'.repeat(32) }), {
    db,
    fetcher: async () => Response.json({ response: { games: [
      { appid: 730, name: 'Counter-Strike 2', playtime_forever: 10 },
      { appid: 999, name: 'Failure Fixture', playtime_forever: 20 },
    ] } }),
  })

  const response = await postSync(baseUrl, session)
  assert.equal(response.status, 500)
  const body = await response.text()
  assert.equal(body.includes('private sqlite diagnostic'), false)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM steam_games').get() as { count: number }).count, 1)
  assert.equal(db.prepare('SELECT value FROM archive_meta WHERE key = ?').get('last_synced_at')?.value, '2025-12-02T12:00:00.000Z')
})
