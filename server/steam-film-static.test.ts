import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, test } from 'node:test'
import { createStore, syncOwnedGames, type SteamFilmConfig } from './index.ts'
import { readLocalSteamFilmConfig } from './steam-film-cli.ts'
import { buildSteamFilmStaticData, exportSteamFilmStaticData } from './steam-film-static.ts'
import { isSteamFilmArchive, resolveSteamFilmArchiveUrl } from '../src/data/steam-film-static.ts'
import { appHref, appPathFromLocation } from '../src/data/app-path.ts'
import { ProxyAgent } from 'undici'
import { checkSteamNetwork, createSteamHttpClient, resolveSteamProxySettings, STEAM_SERVER_INFO_ENDPOINT, SteamOperationError } from './steam-film-http.ts'
import { runSteamFilmCommand } from './steam-film-cli.ts'

const OWNER_ID = '76561198000000000'
const API_KEY = 'a'.repeat(32)
const temporaryDirectories: string[] = []

function config(overrides: Partial<SteamFilmConfig> = {}): SteamFilmConfig {
  return {
    apiKey: API_KEY,
    ownerId: OWNER_ID,
    publicOrigin: null,
    sessionSecret: null,
    databasePath: './var/test.sqlite',
    host: '127.0.0.1',
    port: 8788,
    production: false,
    ...overrides,
  }
}

function addBatch(db: DatabaseSync, batchId: string, capturedAt: string, games: Array<{ appId: number; minutes: number; regressed?: boolean }> = []) {
  db.prepare(`
    INSERT INTO sync_batches(
      batch_id, owner_steam_id, started_at, completed_at, status,
      sampled_game_count, snapshot_count, regression_count
    ) VALUES (?, ?, ?, ?, 'succeeded', ?, ?, ?)
  `).run(batchId, OWNER_ID, capturedAt, capturedAt, games.length, games.length, games.filter(game => game.regressed).length)
  const insertSnapshot = db.prepare(`
    INSERT INTO game_playtime_snapshots(
      batch_id, owner_steam_id, steam_app_id, captured_at, playtime_minutes,
      regressed, previous_playtime_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, NULL)
  `)
  for (const game of games) insertSnapshot.run(batchId, OWNER_ID, game.appId, capturedAt, game.minutes, game.regressed ? 1 : 0)
}

function seedPublicGame(db: DatabaseSync, options: { note?: string; appId?: number; minutes?: number } = {}) {
  db.prepare(`
    INSERT INTO steam_games(steam_app_id, name, personal_note, playtime_minutes, data_source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(options.appId ?? 620, 'Portal 2', options.note ?? null, options.minutes ?? 130, 'private source marker', new Date().toISOString())
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('owner_steam_id', OWNER_ID)
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('last_synced_at', '2026-06-11T01:00:00.000Z')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

test('local sync configuration requires a SteamID64 and server-only Web API Key', () => {
  const local = readLocalSteamFilmConfig({ STEAM_OWNER_ID: OWNER_ID, STEAM_WEB_API_KEY: API_KEY })
  assert.equal(local.ownerId, OWNER_ID)
  assert.equal(local.apiKey, API_KEY)
  assert.equal(local.steamHttpsProxy, null)
  assert.equal(readLocalSteamFilmConfig({
    STEAM_OWNER_ID: OWNER_ID,
    STEAM_WEB_API_KEY: API_KEY,
    STEAM_FILM_HTTPS_PROXY: 'http://127.0.0.1:43110',
  }).steamHttpsProxy, 'http://127.0.0.1:43110/')
  assert.throws(() => readLocalSteamFilmConfig({ STEAM_OWNER_ID: OWNER_ID, STEAM_API_KEY: API_KEY }), /STEAM_WEB_API_KEY/)
  assert.throws(() => readLocalSteamFilmConfig({ STEAM_OWNER_ID: '123', STEAM_WEB_API_KEY: API_KEY }), /STEAM_OWNER_ID/)
  assert.throws(() => readLocalSteamFilmConfig({ STEAM_OWNER_ID: OWNER_ID, STEAM_WEB_API_KEY: API_KEY, STEAM_FILM_DATABASE_PATH: './public/archive.sqlite' }), /public/)
})

test('Steam proxy selection prefers the local setting, falls back to HTTPS_PROXY, and supports direct mode', () => {
  assert.deepEqual(resolveSteamProxySettings({
    STEAM_FILM_HTTPS_PROXY: 'http://127.0.0.1:43111',
    HTTPS_PROXY: 'http://127.0.0.1:43112',
    https_proxy: 'http://127.0.0.1:43113',
  }), { url: 'http://127.0.0.1:43111/', source: 'STEAM_FILM_HTTPS_PROXY' })
  assert.deepEqual(resolveSteamProxySettings({ HTTPS_PROXY: 'http://127.0.0.1:43112' }), {
    url: 'http://127.0.0.1:43112/', source: 'HTTPS_PROXY',
  })
  assert.deepEqual(resolveSteamProxySettings({ https_proxy: 'https://127.0.0.1:43113' }), {
    url: 'https://127.0.0.1:43113/', source: 'https_proxy',
  })
  assert.deepEqual(resolveSteamProxySettings({}), { url: null, source: 'direct' })
  assert.deepEqual(resolveSteamProxySettings({ HTTP_PROXY: 'http://127.0.0.1:43114' }), { url: null, source: 'direct' })
  assert.throws(() => resolveSteamProxySettings({ STEAM_FILM_HTTPS_PROXY: 'socks5://127.0.0.1:43111' }), error => {
    assert.equal((error as SteamOperationError).category, 'steam-proxy-configuration-error')
    assert.equal((error as Error).message.includes('43111'), false)
    return true
  })
})

test('Steam fetch uses a per-request ProxyAgent and leaves the global fetch unchanged', async () => {
  const originalFetch = globalThis.fetch
  let dispatcher: unknown
  const client = createSteamHttpClient(
    resolveSteamProxySettings({ STEAM_FILM_HTTPS_PROXY: 'http://127.0.0.1:43114' }),
    async (_input, init) => {
      dispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
      return Response.json({ ok: true })
    },
  )
  try {
    await client.fetch('https://example.test/', {})
    assert.equal(client.mode, 'proxy')
    assert.ok(dispatcher instanceof ProxyAgent)
    assert.equal(globalThis.fetch, originalFetch)
  } finally {
    await client.close()
  }

  let directDispatcher: unknown = 'not-called'
  const direct = createSteamHttpClient(resolveSteamProxySettings({}), async (_input, init) => {
    directDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
    return Response.json({ ok: true })
  })
  await direct.fetch('https://example.test/', {})
  assert.equal(direct.mode, 'direct')
  assert.equal(directDispatcher, undefined)
  await direct.close()
})

test('configured proxy failures are classified without falling back to direct requests', async () => {
  let calls = 0
  const secretMarker = 'private-proxy-auth-marker'
  const client = createSteamHttpClient(
    resolveSteamProxySettings({ STEAM_FILM_HTTPS_PROXY: 'http://127.0.0.1:43115' }),
    async () => {
      calls++
      const cause = Object.assign(new Error(secretMarker), { code: 'ECONNREFUSED' })
      throw new TypeError(`fetch failed ${secretMarker}`, { cause })
    },
  )
  try {
    await assert.rejects(client.fetch('https://example.test/', {}), error => {
      assert.equal((error as SteamOperationError).category, 'steam-proxy-connection-error')
      assert.equal((error as SteamOperationError).systemErrorCode, 'ECONNREFUSED')
      assert.equal((error as Error).message.includes(secretMarker), false)
      return true
    })
    assert.equal(calls, 1)
  } finally {
    await client.close()
  }
})

test('Steam network-check validates the public server-info response without requiring credentials or touching SQLite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'baka-steam-network-check-'))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, 'must-not-be-created.sqlite')
  const secretMarker = 'private-api-key-marker'
  const logs: string[] = []
  let requestedUrl = ''
  let timeoutSignal: AbortSignal | undefined
  const result = await runSteamFilmCommand('network-check', {
    STEAM_WEB_API_KEY: secretMarker,
    STEAM_FILM_DATABASE_PATH: databasePath,
  }, {
    fetcher: async (input, init) => {
      requestedUrl = String(input)
      timeoutSignal = init?.signal as AbortSignal | undefined
      return Response.json({ servertime: 1_760_000_000, servertimestring: 'test fixture' })
    },
    log: line => logs.push(line),
  })

  assert.equal(result?.success, true)
  assert.equal(requestedUrl, STEAM_SERVER_INFO_ENDPOINT)
  assert.equal(requestedUrl.includes(secretMarker), false)
  assert.ok(timeoutSignal)
  assert.match(logs.join('\n'), /Steam 网络诊断成功/)
  assert.match(logs.join('\n'), /直连/)
  assert.equal(logs.join('\n').includes(secretMarker), false)
  await assert.rejects(access(databasePath))
})

test('Steam network-check sends the public request through the selected proxy without printing its address', async () => {
  const logs: string[] = []
  let dispatcher: unknown
  const result = await runSteamFilmCommand('network-check', {
    STEAM_FILM_HTTPS_PROXY: 'http://127.0.0.1:43116',
  }, {
    fetcher: async (_input, init) => {
      dispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
      return Response.json({ servertime: 1_760_000_000 })
    },
    log: line => logs.push(line),
  })

  assert.equal(result?.success, true)
  assert.ok(dispatcher instanceof ProxyAgent)
  assert.match(logs.join('\n'), /代理（STEAM_FILM_HTTPS_PROXY）/)
  assert.equal(logs.join('\n').includes('127.0.0.1'), false)
  assert.equal(logs.join('\n').includes('43116'), false)
})

test('Steam network-check rejects bad HTTP and invalid JSON responses with safe categories', async () => {
  await assert.rejects(checkSteamNetwork(async () => new Response('private body', { status: 503 })), error => {
    assert.equal((error as SteamOperationError).category, 'steam-http-error')
    assert.equal((error as SteamOperationError).httpStatus, 503)
    assert.equal((error as Error).message.includes('private body'), false)
    return true
  })
  await assert.rejects(checkSteamNetwork(async () => new Response('{invalid-json')), error => {
    assert.equal((error as SteamOperationError).category, 'steam-response-invalid')
    assert.equal((error as Error).message.includes('invalid-json'), false)
    return true
  })
})

test('a validated Steam sync stores the archive and its snapshots as one successful batch', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  const response = Response.json({ response: { games: [
    { appid: 620, name: 'Portal 2', playtime_forever: 1250, playtime_2weeks: 30, rtime_last_played: 1760000000 },
  ] } })
  let requestedUrl = ''
  const result = await syncOwnedGames(db, config(), { steamId: OWNER_ID }, async input => {
    requestedUrl = String(input)
    return response
  }, { enforceCooldown: false })

  assert.equal(new URL(requestedUrl).searchParams.get('key'), API_KEY)
  assert.equal(result.sampledGameCount, 1)
  assert.equal(result.snapshotCount, 1)
  assert.equal(result.regressionCount, 0)
  const batch = db.prepare('SELECT status, sampled_game_count AS sampled, snapshot_count AS snapshots, completed_at AS completed FROM sync_batches WHERE batch_id = ?').get(result.batchId) as Record<string, unknown>
  assert.equal(batch.status, 'succeeded')
  assert.equal(batch.sampled, 1)
  assert.equal(batch.snapshots, 1)
  assert.equal(typeof batch.completed, 'string')
  const snapshot = db.prepare('SELECT owner_steam_id AS owner, steam_app_id AS appId, playtime_minutes AS minutes FROM game_playtime_snapshots WHERE batch_id = ?').get(result.batchId) as Record<string, unknown>
  assert.deepEqual({ ...snapshot }, { owner: OWNER_ID, appId: 620, minutes: 1250 })
})

test('Steam API failures record failed batches without snapshots or archive changes', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedPublicGame(db, { minutes: 777 })
  const failures: Array<{ label: string; fetcher: typeof fetch }> = [
    { label: 'timeout', fetcher: async () => { throw new DOMException('secret timeout detail', 'TimeoutError') } },
    { label: 'HTTP failure', fetcher: async () => new Response('private response body', { status: 503 }) },
    { label: 'malformed data', fetcher: async () => Response.json({ response: { games: [{ appid: 620, name: 'Portal 2', playtime_forever: -1 }] } }) },
  ]
  for (const failure of failures) {
    await assert.rejects(syncOwnedGames(db, config(), { steamId: OWNER_ID }, failure.fetcher, { enforceCooldown: false }), undefined, failure.label)
  }
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM game_playtime_snapshots').get() as { count: number }).count, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM sync_batches WHERE status = 'succeeded'").get() as { count: number }).count, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM sync_batches WHERE status = 'failed'").get() as { count: number }).count, 3)
  assert.equal((db.prepare('SELECT playtime_minutes AS minutes FROM steam_games WHERE steam_app_id = 620').get() as { minutes: number }).minutes, 777)
})

test('a database bound to another Steam account rejects local sync before any API request', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('owner_steam_id', '76561198000000001')
  let requestMade = false
  await assert.rejects(syncOwnedGames(db, config(), { steamId: OWNER_ID }, async () => {
    requestMade = true
    return Response.json({ response: { games: [] } })
  }, { enforceCooldown: false }), /已绑定另一 Steam 账号/)
  assert.equal(requestMade, false)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM sync_batches').get() as { count: number }).count, 0)
})

test('database write failure rolls back game updates and snapshots while keeping the batch failed', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedPublicGame(db, { minutes: 777 })
  db.exec("CREATE TRIGGER reject_static_sync BEFORE INSERT ON steam_games WHEN NEW.steam_app_id = 999 BEGIN SELECT RAISE(ABORT, 'private sqlite detail'); END")
  await assert.rejects(syncOwnedGames(db, config(), { steamId: OWNER_ID }, async () => Response.json({ response: { games: [
    { appid: 620, name: 'Portal 2', playtime_forever: 800 },
    { appid: 999, name: 'Failure', playtime_forever: 20 },
  ] } }), { enforceCooldown: false }))

  assert.equal((db.prepare('SELECT playtime_minutes AS minutes FROM steam_games WHERE steam_app_id = 620').get() as { minutes: number }).minutes, 777)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM steam_games WHERE steam_app_id = 999').get() as { count: number }).count, 0)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM game_playtime_snapshots').get() as { count: number }).count, 0)
  assert.equal((db.prepare("SELECT status FROM sync_batches").get() as { status: string }).status, 'failed')
})

test('time regressions are flagged, absent games remain archived, and missing minutes create no snapshot', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  const run = async (games: Array<Record<string, unknown>>) => syncOwnedGames(
    db,
    config(),
    { steamId: OWNER_ID },
    async () => Response.json({ response: { games } }),
    { enforceCooldown: false },
  )
  await run([
    { appid: 620, name: 'Portal 2', playtime_forever: 100 },
    { appid: 730, name: 'Counter-Strike 2', playtime_forever: 40 },
  ])
  const second = await run([
    { appid: 620, name: 'Portal 2', playtime_forever: 90 },
    { appid: 730, name: 'Counter-Strike 2' },
  ])
  assert.equal(second.regressionCount, 1)
  assert.equal(second.snapshotCount, 1)
  const regression = db.prepare('SELECT regressed, previous_playtime_minutes AS previous FROM game_playtime_snapshots WHERE steam_app_id = 620 AND regressed = 1').get() as { regressed: number; previous: number }
  assert.deepEqual({ ...regression }, { regressed: 1, previous: 100 })
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM game_playtime_snapshots WHERE steam_app_id = 730').get() as { count: number }).count, 1)
  const third = await run([{ appid: 730, name: 'Counter-Strike 2', playtime_forever: 45 }])
  assert.equal(third.sampledGameCount, 1)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM steam_games WHERE steam_app_id = 620').get() as { count: number }).count, 1)
  assert.equal((db.prepare('SELECT playtime_minutes AS minutes FROM steam_games WHERE steam_app_id = 730').get() as { minutes: number }).minutes, 45)
})

test('export is read-only, repeatable, and excludes credentials and private database fields', async () => {
  const db = createStore(new DatabaseSync(':memory:'))
  seedPublicGame(db, { note: 'private diary note', minutes: 130 })
  addBatch(db, 'june-a', '2026-06-10T01:00:00.000Z', [{ appId: 620, minutes: 100 }])
  addBatch(db, 'june-b', '2026-06-11T01:00:00.000Z', [{ appId: 620, minutes: 130 }])
  const output = await mkdtemp(join(tmpdir(), 'baka-steam-film-export-'))
  temporaryDirectories.push(output)
  const before = {
    batches: (db.prepare('SELECT COUNT(*) AS count FROM sync_batches').get() as { count: number }).count,
    snapshots: (db.prepare('SELECT COUNT(*) AS count FROM game_playtime_snapshots').get() as { count: number }).count,
  }
  const generatedAt = new Date('2026-06-12T00:00:00.000Z')
  const result = await exportSteamFilmStaticData(db, output, generatedAt)
  const archiveText = await readFile(result.archivePath, 'utf8')
  const monthlyText = await readFile(result.monthlyPath, 'utf8')
  const archive = JSON.parse(archiveText) as Record<string, unknown>
  const monthly = JSON.parse(monthlyText) as { reports: Array<{ month: string; status: string; totalPlaytimeMinutes: number | null }> }
  assert.equal(archive.lastSuccessfulSyncAt, '2026-06-11T01:00:00.000Z')
  assert.equal(archive.generatedAt, generatedAt.toISOString())
  assert.equal(archive.gameCount, 1)
  assert.equal(archiveText.includes('private diary note'), false)
  assert.equal(archiveText.includes('private source marker'), false)
  assert.equal(archiveText.includes(OWNER_ID), false)
  assert.equal(archiveText.includes(API_KEY), false)
  assert.equal(monthly.reports.find(report => report.month === '2026-06')?.status, 'partial')
  assert.equal(monthly.reports.find(report => report.month === '2026-06')?.totalPlaytimeMinutes, 30)
  const repeated = await exportSteamFilmStaticData(db, output, generatedAt)
  assert.equal(await readFile(repeated.archivePath, 'utf8'), archiveText)
  assert.equal(await readFile(repeated.monthlyPath, 'utf8'), monthlyText)
  assert.deepEqual({
    batches: (db.prepare('SELECT COUNT(*) AS count FROM sync_batches').get() as { count: number }).count,
    snapshots: (db.prepare('SELECT COUNT(*) AS count FROM game_playtime_snapshots').get() as { count: number }).count,
  }, before)
})

test('the export path works against a genuinely read-only SQLite connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'baka-steam-film-readonly-'))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, 'archive.sqlite')
  const writable = createStore(new DatabaseSync(databasePath))
  seedPublicGame(writable)
  writable.close()

  const readOnly = new DatabaseSync(databasePath, { readOnly: true })
  const output = join(directory, 'public-data')
  const result = await exportSteamFilmStaticData(readOnly, output, new Date('2026-06-12T00:00:00.000Z'))
  readOnly.close()
  const archive = JSON.parse(await readFile(result.archivePath, 'utf8')) as { gameCount: number; dataStatus: string }
  assert.equal(archive.gameCount, 1)
  assert.equal(archive.dataStatus, 'ready')
})

test('monthly data rejects missing samples and never allocates a cross-month interval as a precise month total', () => {
  const db = createStore(new DatabaseSync(':memory:'))
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('owner_steam_id', OWNER_ID)
  addBatch(db, 'may-end', '2026-05-31T15:59:00.000Z', [{ appId: 620, minutes: 100 }])
  addBatch(db, 'june-start', '2026-05-31T16:01:00.000Z', [{ appId: 620, minutes: 105 }])
  addBatch(db, 'june-gap', '2026-06-02T01:00:00.000Z')
  addBatch(db, 'june-back', '2026-06-03T01:00:00.000Z', [{ appId: 620, minutes: 120 }])
  const { monthly } = buildSteamFilmStaticData(db, new Date('2026-06-04T00:00:00.000Z'))
  const may = monthly.reports.find(report => report.month === '2026-05')!
  const june = monthly.reports.find(report => report.month === '2026-06')!
  assert.equal(may.status, 'insufficient-boundary-samples')
  assert.equal(may.totalPlaytimeMinutes, null)
  assert.equal(june.unallocatedBoundaryIntervals, 1)
  assert.equal(june.unobservedSampleIntervals, 1)
  assert.equal(june.totalPlaytimeMinutes, null)
  assert.match(monthly.note, /跨月区间不分摊/)
})

test('read-only export can read an existing archive before the additive history tables have been created', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE steam_games (
      steam_app_id INTEGER PRIMARY KEY, name TEXT NOT NULL, header_image TEXT,
      first_played_at TEXT, first_seen_at TEXT, first_achievement_at TEXT, last_played_at TEXT,
      playtime_minutes INTEGER, playtime_recent_minutes INTEGER, achievement_count INTEGER,
      achievement_total INTEGER, personal_note TEXT, data_source TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE archive_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  db.prepare('INSERT INTO steam_games(steam_app_id, name, data_source, updated_at) VALUES(?, ?, ?, ?)').run(620, 'Portal 2', 'legacy', '2026-06-01T00:00:00.000Z')
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('owner_steam_id', OWNER_ID)
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('last_synced_at', '2026-06-01T00:00:00.000Z')
  const { archive, monthly } = buildSteamFilmStaticData(db, new Date('2026-06-02T00:00:00.000Z'))
  assert.equal(archive.gameCount, 1)
  assert.equal(monthly.status, 'accumulating')
  assert.deepEqual(monthly.reports, [])
})

test('static archive validation handles empty data, rejects incompatible records, and resolves base paths', () => {
  const empty = { format: 'baka-steam-film-archive', schemaVersion: 1, generatedAt: null, lastSuccessfulSyncAt: null, gameCount: 0, dataStatus: 'empty', games: [] }
  assert.equal(isSteamFilmArchive(empty), true)
  assert.equal(isSteamFilmArchive({ ...empty, schemaVersion: 2 }), false)
  assert.equal(isSteamFilmArchive({ ...empty, gameCount: 1 }), false)
  assert.equal(resolveSteamFilmArchiveUrl('/BAKA-Award/', 'https://example.test/BAKA-Award/steam-film'), 'https://example.test/BAKA-Award/data/steam-film/archive.v1.json')
  assert.equal(appPathFromLocation('/BAKA-Award/steam-film', '/BAKA-Award/'), '/steam-film')
  assert.equal(appPathFromLocation('/BAKA-Award', '/BAKA-Award/'), '/')
  assert.equal(appHref('/2026', '/BAKA-Award/'), '/BAKA-Award/2026')
})
