import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createStore } from './index.ts'
import { exportSteamFilmStaticData, buildSteamFilmStaticData } from './steam-film-static.ts'
import {
  applyFirstPlayImportDecisions,
  buildFirstPlayImportPreview,
  createFirstPlayEntry,
  createFirstPlayTimelineSchema,
  deleteFirstPlayEntry,
  FirstPlayInputError,
  listFirstPlayCandidates,
  listFirstPlayEntries,
  normalizeFirstPlayDate,
  parseFirstPlayImport,
  stableCustomGameId,
  updateFirstPlayEntry,
} from './first-play-timeline.ts'

const databases: DatabaseSync[] = []
const directories: string[] = []
after(async () => {
  for (const db of databases) db.close()
  for (const directory of directories) await rm(directory, { recursive: true, force: true })
})

function makeDb() {
  const db = createStore(new DatabaseSync(':memory:'))
  databases.push(db)
  return db
}

function seedGame(db: DatabaseSync, appId: number, name: string) {
  db.prepare(`INSERT INTO steam_games(
    steam_app_id, name, header_image, first_played_at, first_seen_at, first_achievement_at,
    last_played_at, playtime_minutes, playtime_recent_minutes, achievement_count,
    achievement_total, personal_note, data_source, updated_at
  ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, 'steam-api', ?)`)
    .run(appId, name, `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`, 90, new Date().toISOString())
}

test('date-only precision accepts calendar-valid dates and rejects fabricated or mismatched dates', () => {
  assert.deepEqual(normalizeFirstPlayDate('2024-02-29'), { firstPlayedOn: '2024-02-29', datePrecision: 'day' })
  assert.deepEqual(normalizeFirstPlayDate('2024-02', 'month'), { firstPlayedOn: '2024-02', datePrecision: 'month' })
  assert.deepEqual(normalizeFirstPlayDate('2024', 'year'), { firstPlayedOn: '2024', datePrecision: 'year' })
  assert.deepEqual(normalizeFirstPlayDate('', 'unknown'), { firstPlayedOn: null, datePrecision: 'unknown' })
  assert.throws(() => normalizeFirstPlayDate('2023-02-29'), FirstPlayInputError)
  assert.throws(() => normalizeFirstPlayDate('2024-02', 'day'), FirstPlayInputError)
  assert.throws(() => normalizeFirstPlayDate('2024-01-01', 'unknown'), FirstPlayInputError)
})

test('manual entries support custom games, edits, delete confirmation audit, and stable identifiers', () => {
  const db = makeDb()
  const name = '同人作品 / Custom Game'
  const entry = createFirstPlayEntry(db, { gameName: name, firstPlayedOn: '2021-08', datePrecision: 'month', personalNote: '旅程从这里开始。' })
  assert.equal(entry.steamAppId, null)
  assert.equal(entry.customGameId, stableCustomGameId(name))
  assert.equal(entry.source, 'manual')
  assert.equal(entry.firstPlayedOn, '2021-08')
  assert.throws(() => createFirstPlayEntry(db, { gameName: name, firstPlayedOn: '2021-08', datePrecision: 'month' }), /已经在时间轴中/)

  const updated = updateFirstPlayEntry(db, entry.id, { firstPlayedOn: null, datePrecision: 'unknown', personalNote: '日期以后再补。' })
  assert.equal(updated.firstPlayedOn, null)
  assert.equal(updated.datePrecision, 'unknown')
  assert.equal(updated.personalNote, '日期以后再补。')
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM first_play_entry_changes WHERE entry_id = ? AND action = \'updated\'').get(entry.id) as { count: number }).count, 1)

  deleteFirstPlayEntry(db, entry.id)
  assert.equal(listFirstPlayEntries(db).length, 0)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM first_play_entry_changes WHERE entry_id = ?').get(entry.id) as { count: number }).count, 3)
})

test('manual create and import writes roll back when database constraints fail', () => {
  const db = makeDb()
  db.exec("CREATE TRIGGER reject_timeline_entry BEFORE INSERT ON first_play_entries WHEN NEW.game_name = 'Reject' BEGIN SELECT RAISE(ABORT, 'local test'); END")
  assert.throws(() => createFirstPlayEntry(db, { gameName: 'Reject', firstPlayedOn: '2026-01-01' }))
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM first_play_entries').get() as { count: number }).count, 0)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM first_play_entry_changes').get() as { count: number }).count, 0)
})

test('CSV and JSON imports normalize dates without inventing missing values', () => {
  const csv = parseFirstPlayImport('appId,gameName,firstPlayedOn,datePrecision\n620,"Portal, Two",2020-03,month\n,Custom,,unknown\n', 'csv')
  assert.equal(csv.length, 2)
  assert.equal(csv[0]!.appId, 620)
  assert.equal(csv[0]!.gameName, 'Portal, Two')
  assert.equal(csv[0]!.firstPlayedOn, '2020-03')
  assert.equal(csv[1]!.firstPlayedOn, null)
  assert.equal(csv[1]!.datePrecision, 'unknown')
  const json = parseFirstPlayImport(JSON.stringify({ records: [{ steamAppId: 730, name: 'Dota 2', date: '2015', precision: 'year' }] }), 'json')
  assert.equal(json[0]!.datePrecision, 'year')
  assert.equal(json[0]!.firstPlayedOn, '2015')
  assert.throws(() => parseFirstPlayImport('[', 'json'), FirstPlayInputError)
})

test('preview distinguishes exact AppID, unique name candidates, missing dates, duplicates, and conflicts', () => {
  const db = makeDb()
  seedGame(db, 620, 'Portal 2')
  seedGame(db, 730, 'Dota 2')
  const records = parseFirstPlayImport(JSON.stringify([
    { appId: 620, gameName: 'Portal 2', firstPlayedOn: '2019-01-03', datePrecision: 'day' },
    { gameName: 'Dota 2', firstPlayedOn: '2018', datePrecision: 'year' },
    { gameName: 'Unlisted Game', firstPlayedOn: null },
    { appId: 620, gameName: 'Portal 2', firstPlayedOn: '2019-01-03', datePrecision: 'day' },
    { appId: 620, gameName: 'Portal 2', firstPlayedOn: '2020-05-06', datePrecision: 'day' },
  ]), 'json')
  const preview = buildFirstPlayImportPreview(db, records)
  assert.equal(preview.summary.originalRecordCount, 5)
  assert.equal(preview.summary.appIdMatchCount, 3)
  assert.equal(preview.rows[1]!.status, 'name-candidate')
  assert.equal(preview.rows[2]!.datePrecision, 'unknown')
  assert.equal(preview.rows[3]!.status, 'duplicate')
  assert.equal(preview.rows[4]!.status, 'conflict')
  assert.equal(preview.rows[2]!.firstPlayedOn, null)
})

test('confirmed import is idempotent, preserves unknown dates, and requires explicit conflict resolution', () => {
  const db = makeDb()
  seedGame(db, 620, 'Portal 2')
  const records = parseFirstPlayImport(JSON.stringify([
    { appId: 620, gameName: 'Portal 2', firstPlayedOn: '2019-01-03', datePrecision: 'day' },
    { appId: 620, gameName: 'Portal 2', firstPlayedOn: '2020-05-06', datePrecision: 'day' },
    { gameName: 'Unknown Date Game', firstPlayedOn: null },
  ]), 'json')
  const preview = buildFirstPlayImportPreview(db, records)
  assert.throws(() => applyFirstPlayImportDecisions(db, preview.rows, [
    { rowNumber: 1, action: 'insert' }, { rowNumber: 2, action: 'insert' },
  ]), /不能在一次确认中选择多条/)

  const result = applyFirstPlayImportDecisions(db, preview.rows, [
    { rowNumber: 1, action: 'skip' },
    { rowNumber: 2, action: 'insert' },
    { rowNumber: 3, action: 'insert' },
  ])
  assert.equal(result.inserted, 2)
  assert.equal(result.skipped, 1)
  const portal = listFirstPlayEntries(db).find(entry => entry.steamAppId === 620)!
  assert.equal(portal.firstPlayedOn, '2020-05-06')
  assert.equal(portal.source, 'heybox-import')
  const unknown = listFirstPlayEntries(db).find(entry => entry.gameName === 'Unknown Date Game')!
  assert.equal(unknown.firstPlayedOn, null)
  assert.equal(unknown.datePrecision, 'unknown')

  const repeatedRecords = parseFirstPlayImport(JSON.stringify([
    { appId: 620, gameName: 'Portal 2', firstPlayedOn: '2020-05-06', datePrecision: 'day' },
  ]), 'json')
  const repeated = buildFirstPlayImportPreview(db, repeatedRecords)
  assert.equal(repeated.rows[0]!.status, 'duplicate')
  assert.throws(() => applyFirstPlayImportDecisions(db, repeated.rows, [{ rowNumber: 1, action: 'insert' }]), /确认期间这款游戏已被加入/)
})

test('candidate list excludes timeline games and timeline survives Steam profile removal', () => {  const db = makeDb()
  seedGame(db, 620, 'Portal 2')
  seedGame(db, 730, 'Dota 2')
  const entry = createFirstPlayEntry(db, { steamAppId: 620, gameName: 'Portal 2', firstPlayedOn: '2011-02-19' })
  assert.deepEqual(listFirstPlayCandidates(db).map(candidate => candidate.steamAppId), [730])
  db.prepare('DELETE FROM steam_games WHERE steam_app_id = ?').run(620)
  const retained = listFirstPlayEntries(db).find(item => item.id === entry.id)!
  assert.equal(retained.gameName, 'Portal 2')
  assert.equal(retained.headerImage, null)
})

test('public export contains only explicitly selected games and export failure keeps saved data', async () => {
  const db = makeDb()
  seedGame(db, 620, 'Portal 2')
  seedGame(db, 730, 'Dota 2')
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('owner_steam_id', '76561198000000001')
  db.prepare('INSERT INTO archive_meta(key, value) VALUES(?, ?)').run('last_synced_at', '2026-10-19T07:50:00.000Z')
  createFirstPlayEntry(db, { steamAppId: 620, gameName: 'Portal 2', firstPlayedOn: '2011-02-19', personalNote: 'A public note.' })
  const built = buildSteamFilmStaticData(db, new Date('2026-10-20T00:00:00.000Z'))
  assert.equal(built.timeline.entryCount, 1)
  assert.equal(built.archive.gameCount, 1)
  assert.equal(JSON.stringify(built.timeline).includes('Dota 2'), false)
  assert.equal(JSON.stringify(built.timeline).includes('76561198000000001'), false)
  assert.equal(JSON.stringify(built.timeline).includes('A public note.'), true)

  const output = await mkdtemp(join(tmpdir(), 'baka-first-play-export-'))
  directories.push(output)
  const exported = await exportSteamFilmStaticData(db, output, new Date('2026-10-20T00:00:00.000Z'))
  const timeline = JSON.parse(await readFile(exported.timelinePath, 'utf8')) as { entryCount: number; entries: Array<{ steamAppId: number }> }
  const archive = JSON.parse(await readFile(exported.archivePath, 'utf8')) as { gameCount: number; games: Array<{ steamAppId: number }> }
  assert.equal(timeline.entryCount, 1)
  assert.equal(timeline.entries[0]!.steamAppId, 620)
  assert.equal(archive.gameCount, 1)
  assert.equal(archive.games[0]!.steamAppId, 620)

  const blockedPath = join(output, 'not-a-directory')
  await writeFile(blockedPath, 'file')
  await assert.rejects(exportSteamFilmStaticData(db, blockedPath))
  assert.equal(listFirstPlayEntries(db).length, 1)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM game_playtime_snapshots').get() as { count: number }).count, 0)
})

test('confirmed imports store the real source and keep the raw Unix timestamp', () => {
  const db = makeDb()
  seedGame(db, 730, 'Counter-Strike 2')
  seedGame(db, 620, 'Portal 2')

  const records = parseFirstPlayImport(JSON.stringify([
    { appId: 730, gameName: 'Counter-Strike 2', firstPlayedOn: '2023-06-22', datePrecision: 'day', source: 'steam-client-get-last-played-times', originalFirstPlaytime: 1687446293 },
    { appId: 620, gameName: 'Portal 2', firstPlayedOn: '2019-01-03', datePrecision: 'day', source: 'heybox-import', originalFirstPlaytime: 1546473600 },
    { gameName: 'Imported Custom Game', firstPlayedOn: '2021-08-09', datePrecision: 'day' },
  ]), 'json')
  assert.equal(records[0]!.source, 'steam-client-get-last-played-times')
  assert.equal(records[0]!.originalFirstPlaytime, 1687446293)
  assert.equal(records[1]!.source, 'heybox-import')
  // 缺少 source 列的老文件仍然按 heybox-import 处理
  assert.equal(records[2]!.source, 'heybox-import')
  assert.equal(records[2]!.originalFirstPlaytime, null)

  const preview = buildFirstPlayImportPreview(db, records)
  // 第三条没有 AppID 也不在游戏库里，按自定义游戏保留（unmatched 仍可确认导入）
  assert.deepEqual(preview.rows.map(row => row.status), ['ready', 'ready', 'unmatched'])
  const result = applyFirstPlayImportDecisions(db, preview.rows, preview.rows.map(row => ({ rowNumber: row.rowNumber, action: 'insert' as const })))
  assert.equal(result.inserted, 3)

  const entries = listFirstPlayEntries(db)
  const steam = entries.find(entry => entry.steamAppId === 730)!
  assert.equal(steam.source, 'steam-client-get-last-played-times')
  assert.equal(steam.originalFirstPlaytime, 1687446293)
  assert.equal(steam.firstPlayedOn, '2023-06-22')
  const heybox = entries.find(entry => entry.steamAppId === 620)!
  assert.equal(heybox.source, 'heybox-import')
  assert.equal(heybox.originalFirstPlaytime, 1546473600)

  // 审计日志记录的是实际发生变更的来源
  const changes = db.prepare('SELECT action, changed_by FROM first_play_entry_changes WHERE entry_id = ?').all(steam.id) as Array<{ action: string; changed_by: string }>
  assert.deepEqual(changes.map(change => `${change.action}:${change.changed_by}`), ['created:steam-client-get-last-played-times'])

  // 手动记录的来源永远是 manual，也不会被导入来源污染
  const manual = createFirstPlayEntry(db, { gameName: '手工补录的游戏', firstPlayedOn: '2020-05-05' })
  assert.equal(manual.source, 'manual')
  assert.equal(manual.originalFirstPlaytime, null)
  const edited = updateFirstPlayEntry(db, manual.id, { firstPlayedOn: '2020-05-06' })
  assert.equal(edited.source, 'manual')
  const manualChange = db.prepare('SELECT changed_by FROM first_play_entry_changes WHERE entry_id = ? AND action = \'updated\'').get(manual.id) as { changed_by: string }
  assert.equal(manualChange.changed_by, 'manual')
})

test('different sources never overwrite each other without an explicit decision', () => {
  const db = makeDb()
  seedGame(db, 730, 'Counter-Strike 2')
  seedGame(db, 620, 'Portal 2')

  const steamRows = parseFirstPlayImport(JSON.stringify([
    { appId: 730, gameName: 'Counter-Strike 2', firstPlayedOn: '2023-06-22', datePrecision: 'day', source: 'steam-client-get-last-played-times', originalFirstPlaytime: 1687446293 },
  ]), 'json')
  applyFirstPlayImportDecisions(db, buildFirstPlayImportPreview(db, steamRows).rows, [{ rowNumber: 1, action: 'insert' }])

  // 同一 AppID、不同来源、不同日期：只标记冲突，绝不静默覆盖
  const heyboxRows = parseFirstPlayImport(JSON.stringify([
    { appId: 730, gameName: 'Counter-Strike 2', firstPlayedOn: '2023-07-01', datePrecision: 'day', source: 'heybox-import' },
  ]), 'json')
  const conflicted = buildFirstPlayImportPreview(db, heyboxRows)
  assert.equal(conflicted.rows[0]!.status, 'conflict')
  assert.throws(
    () => applyFirstPlayImportDecisions(db, conflicted.rows, [{ rowNumber: 1, action: 'insert' }]),
    /确认期间这款游戏已被加入时间轴|日期冲突不能通过新增覆盖/,
  )
  const untouched = listFirstPlayEntries(db).find(entry => entry.steamAppId === 730)!
  assert.equal(untouched.firstPlayedOn, '2023-06-22')
  assert.equal(untouched.source, 'steam-client-get-last-played-times')

  // 同日期的新来源只会被判为重复，默认跳过；跳过不改变已有记录
  const sameDate = parseFirstPlayImport(JSON.stringify([
    { appId: 730, gameName: 'Counter-Strike 2', firstPlayedOn: '2023-06-22', datePrecision: 'day', source: 'heybox-import' },
  ]), 'json')
  const duplicate = buildFirstPlayImportPreview(db, sameDate)
  assert.equal(duplicate.rows[0]!.status, 'duplicate')
  applyFirstPlayImportDecisions(db, duplicate.rows, [{ rowNumber: 1, action: 'skip' }])
  assert.equal(listFirstPlayEntries(db).length, 1)

  // 另一个 AppID 各自保留自己的来源，互不影响
  const otherSource = parseFirstPlayImport(JSON.stringify([
    { appId: 620, gameName: 'Portal 2', firstPlayedOn: '2019-01-03', datePrecision: 'day', source: 'heybox-import' },
  ]), 'json')
  applyFirstPlayImportDecisions(db, buildFirstPlayImportPreview(db, otherSource).rows, [{ rowNumber: 1, action: 'insert' }])
  const byApp = new Map(listFirstPlayEntries(db).map(entry => [entry.steamAppId, entry]))
  assert.equal(byApp.get(730)!.source, 'steam-client-get-last-played-times')
  assert.equal(byApp.get(620)!.source, 'heybox-import')

  // 只有在预览里明确选择 update，才允许覆盖，并把来源改成提供新日期的那个
  const explicit = buildFirstPlayImportPreview(db, heyboxRows)
  const updated = applyFirstPlayImportDecisions(db, explicit.rows, [{ rowNumber: 1, action: 'update' }])
  assert.equal(updated.updated, 1)
  const replaced = listFirstPlayEntries(db).find(entry => entry.steamAppId === 730)!
  assert.equal(replaced.firstPlayedOn, '2023-07-01')
  assert.equal(replaced.source, 'heybox-import')
  const trail = db.prepare('SELECT changed_by FROM first_play_entry_changes WHERE entry_id = ? ORDER BY changed_at').all(replaced.id) as Array<{ changed_by: string }>
  assert.deepEqual(trail.map(item => item.changed_by), ['steam-client-get-last-played-times', 'heybox-import'])
})

test('legacy databases migrate in place and keep every row', () => {
  const db = makeDb()
  db.exec('DROP TABLE first_play_entry_changes')
  db.exec('DROP TABLE first_play_entries')
  db.exec(`CREATE TABLE first_play_entries (
      id TEXT PRIMARY KEY,
      steam_app_id INTEGER UNIQUE CHECK (steam_app_id IS NULL OR steam_app_id > 0),
      custom_game_id TEXT UNIQUE,
      game_name TEXT NOT NULL CHECK (length(trim(game_name)) BETWEEN 1 AND 200),
      first_played_on TEXT,
      date_precision TEXT NOT NULL CHECK (date_precision IN ('day', 'month', 'year', 'unknown')),
      source TEXT NOT NULL CHECK (source IN ('heybox-import', 'manual')),
      last_modified_source TEXT NOT NULL CHECK (last_modified_source IN ('heybox-import', 'manual')),
      personal_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK ((steam_app_id IS NOT NULL AND custom_game_id IS NULL) OR (steam_app_id IS NULL AND custom_game_id IS NOT NULL)),
      CHECK ((date_precision = 'unknown' AND first_played_on IS NULL) OR (date_precision = 'day' AND first_played_on GLOB '????-??-??') OR (date_precision = 'month' AND first_played_on GLOB '????-??') OR (date_precision = 'year' AND first_played_on GLOB '????'))
    )`)
  db.exec(`CREATE TABLE first_play_entry_changes (
      change_id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
      changed_by TEXT NOT NULL CHECK (changed_by IN ('heybox-import', 'manual')),
      game_name TEXT NOT NULL,
      steam_app_id INTEGER,
      previous_first_played_on TEXT,
      new_first_played_on TEXT,
      previous_date_precision TEXT,
      new_date_precision TEXT
    )`)
  db.prepare(`INSERT INTO first_play_entries(id, steam_app_id, custom_game_id, game_name, first_played_on, date_precision,
    source, last_modified_source, personal_note, created_at, updated_at)
    VALUES ('legacy-1', 730, NULL, 'Counter-Strike 2', '2019-05-05', 'day', 'heybox-import', 'heybox-import', '旧记录', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`).run()
  db.prepare(`INSERT INTO first_play_entry_changes(change_id, entry_id, changed_at, action, changed_by, game_name, steam_app_id)
    VALUES ('change-1', 'legacy-1', '2026-01-01T00:00:00.000Z', 'created', 'heybox-import', 'Counter-Strike 2', 730)`).run()
  assert.throws(() => db.prepare(`INSERT INTO first_play_entries(id, steam_app_id, custom_game_id, game_name, first_played_on, date_precision,
    source, last_modified_source, created_at, updated_at)
    VALUES ('x', 620, NULL, 'Portal 2', '2019-01-03', 'day', 'steam-client-get-last-played-times', 'steam-client-get-last-played-times', 'now', 'now')`).run(), /CHECK/)

  createFirstPlayTimelineSchema(db)

  const migrated = listFirstPlayEntries(db)[0]!
  assert.equal(migrated.id, 'legacy-1')
  assert.equal(migrated.firstPlayedOn, '2019-05-05')
  assert.equal(migrated.source, 'heybox-import')
  assert.equal(migrated.originalFirstPlaytime, null)
  assert.equal(migrated.personalNote, '旧记录')
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM first_play_entry_changes').get() as { count: number }).count, 1)
  const indexes = (db.prepare('PRAGMA index_list(first_play_entries)').all() as Array<{ name: string }>).map(index => index.name)
  assert.ok(indexes.includes('first_play_entries_date_idx'))

  // 迁移之后新来源可以正常写入
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO first_play_entries(id, steam_app_id, custom_game_id, game_name, first_played_on, date_precision,
    source, last_modified_source, original_first_playtime, created_at, updated_at)
    VALUES ('steam-1', 620, NULL, 'Portal 2', '2019-01-03', 'day', 'steam-client-get-last-played-times', 'steam-client-get-last-played-times', 1546473600, ?, ?)`).run(now, now)
  const steamEntry = listFirstPlayEntries(db).find(entry => entry.id === 'steam-1')!
  assert.equal(steamEntry.source, 'steam-client-get-last-played-times')
  assert.equal(steamEntry.originalFirstPlaytime, 1546473600)

  // 重复调用是幂等的，不会再次重建
  createFirstPlayTimelineSchema(db)
  assert.equal(listFirstPlayEntries(db).length, 2)
})
