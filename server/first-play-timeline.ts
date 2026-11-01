import { createHash, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type { DatabaseSync } from 'node:sqlite'

export type FirstPlayDatePrecision = 'day' | 'month' | 'year' | 'unknown'
export type FirstPlaySource = 'heybox-import' | 'manual' | 'steam-client-get-last-played-times'

/** 允许写入数据库的来源。heybox-import 保留给以后真正从小黑盒导入的数据。 */
export const FIRST_PLAY_SOURCES: readonly FirstPlaySource[] = ['heybox-import', 'manual', 'steam-client-get-last-played-times']
/** 没写 source 的导入文件沿用旧行为，仍算小黑盒导入。 */
export const DEFAULT_IMPORT_SOURCE: FirstPlaySource = 'heybox-import'

export function isFirstPlaySource(value: unknown): value is FirstPlaySource {
  return typeof value === 'string' && (FIRST_PLAY_SOURCES as readonly string[]).includes(value)
}

export interface FirstPlayEntryInput {
  steamAppId?: number | null
  customGameId?: string | null
  gameName: string
  firstPlayedOn?: string | null
  datePrecision?: FirstPlayDatePrecision
  source?: FirstPlaySource
  originalFirstPlaytime?: number | null
  personalNote?: string | null
}

export interface FirstPlayEntry extends FirstPlayEntryInput {
  id: string
  steamAppId: number | null
  customGameId: string | null
  firstPlayedOn: string | null
  datePrecision: FirstPlayDatePrecision
  source: FirstPlaySource
  /** 导入时保留的原始 Unix 秒级时间戳；手工记录一般为 null。 */
  originalFirstPlaytime: number | null
  personalNote: string | null
  createdAt: string
  updatedAt: string
  headerImage: string | null
  playtimeMinutes: number | null
}

export class FirstPlayInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirstPlayInputError'
  }
}

function firstPlayEntriesDdl(table: string, ifNotExists: boolean) {
  return `
    CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${table} (
      id TEXT PRIMARY KEY,
      steam_app_id INTEGER UNIQUE CHECK (steam_app_id IS NULL OR steam_app_id > 0),
      custom_game_id TEXT UNIQUE,
      game_name TEXT NOT NULL CHECK (length(trim(game_name)) BETWEEN 1 AND 200),
      first_played_on TEXT,
      date_precision TEXT NOT NULL CHECK (date_precision IN ('day', 'month', 'year', 'unknown')),
      source TEXT NOT NULL CHECK (source IN ('heybox-import', 'manual', 'steam-client-get-last-played-times')),
      last_modified_source TEXT NOT NULL CHECK (last_modified_source IN ('heybox-import', 'manual', 'steam-client-get-last-played-times')),
      personal_note TEXT,
      original_first_playtime INTEGER CHECK (original_first_playtime IS NULL OR original_first_playtime > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK ((steam_app_id IS NOT NULL AND custom_game_id IS NULL) OR (steam_app_id IS NULL AND custom_game_id IS NOT NULL)),
      CHECK ((date_precision = 'unknown' AND first_played_on IS NULL) OR (date_precision = 'day' AND first_played_on GLOB '????-??-??') OR (date_precision = 'month' AND first_played_on GLOB '????-??') OR (date_precision = 'year' AND first_played_on GLOB '????'))
    );
  `
}

function firstPlayChangesDdl(table: string, ifNotExists: boolean) {
  return `
    CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${table} (
      change_id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
      changed_by TEXT NOT NULL CHECK (changed_by IN ('heybox-import', 'manual', 'steam-client-get-last-played-times')),
      game_name TEXT NOT NULL,
      steam_app_id INTEGER,
      previous_first_played_on TEXT,
      new_first_played_on TEXT,
      previous_date_precision TEXT,
      new_date_precision TEXT
    );
  `
}

function tableSql(db: DatabaseSync, name: string) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as { sql?: string } | undefined
  return typeof row?.sql === 'string' ? row.sql : null
}

function tableColumns(db: DatabaseSync, name: string) {
  return (db.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>).map(column => String(column.name))
}

/**
 * 旧库里的 source / changed_by 只允许 ('heybox-import', 'manual')。
 * SQLite 不能直接改 CHECK，所以这里按官方推荐的「新建表 → 搬数据 → 换名」方式原地升级，
 * 不重建数据库、不动 steam_games，也不丢任何一行历史记录。
 */
function migrateFirstPlayTimelineSchema(db: DatabaseSync) {
  const entriesSql = tableSql(db, 'first_play_entries')
  const changesSql = tableSql(db, 'first_play_entry_changes')
  const entriesOutdated = entriesSql !== null && !entriesSql.includes('steam-client-get-last-played-times')
  const changesOutdated = changesSql !== null && !changesSql.includes('steam-client-get-last-played-times')
  if (!entriesOutdated && !changesOutdated) return

  db.exec('BEGIN IMMEDIATE')
  try {
    if (entriesOutdated) {
      const hasTimestamp = tableColumns(db, 'first_play_entries').includes('original_first_playtime')
      db.exec('DROP TABLE IF EXISTS first_play_entries_migrated')
      db.exec(firstPlayEntriesDdl('first_play_entries_migrated', false))
      db.exec(`INSERT INTO first_play_entries_migrated(
        id, steam_app_id, custom_game_id, game_name, first_played_on, date_precision,
        source, last_modified_source, personal_note, original_first_playtime, created_at, updated_at
      ) SELECT id, steam_app_id, custom_game_id, game_name, first_played_on, date_precision,
        source, last_modified_source, personal_note, ${hasTimestamp ? 'original_first_playtime' : 'NULL'}, created_at, updated_at
        FROM first_play_entries`)
      const before = (db.prepare('SELECT COUNT(*) AS count FROM first_play_entries').get() as { count: number }).count
      const copied = (db.prepare('SELECT COUNT(*) AS count FROM first_play_entries_migrated').get() as { count: number }).count
      if (before !== copied) throw new Error('首次游玩记录迁移行数不一致，已回滚。')
      db.exec('DROP TABLE first_play_entries')
      db.exec('ALTER TABLE first_play_entries_migrated RENAME TO first_play_entries')
    }
    if (changesOutdated) {
      db.exec('DROP TABLE IF EXISTS first_play_entry_changes_migrated')
      db.exec(firstPlayChangesDdl('first_play_entry_changes_migrated', false))
      db.exec(`INSERT INTO first_play_entry_changes_migrated(
        change_id, entry_id, changed_at, action, changed_by, game_name, steam_app_id,
        previous_first_played_on, new_first_played_on, previous_date_precision, new_date_precision
      ) SELECT change_id, entry_id, changed_at, action, changed_by, game_name, steam_app_id,
        previous_first_played_on, new_first_played_on, previous_date_precision, new_date_precision
        FROM first_play_entry_changes`)
      const before = (db.prepare('SELECT COUNT(*) AS count FROM first_play_entry_changes').get() as { count: number }).count
      const copied = (db.prepare('SELECT COUNT(*) AS count FROM first_play_entry_changes_migrated').get() as { count: number }).count
      if (before !== copied) throw new Error('变更日志迁移行数不一致，已回滚。')
      db.exec('DROP TABLE first_play_entry_changes')
      db.exec('ALTER TABLE first_play_entry_changes_migrated RENAME TO first_play_entry_changes')
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function createFirstPlayTimelineSchema(db: DatabaseSync) {
  db.exec(firstPlayEntriesDdl('first_play_entries', true))
  db.exec(firstPlayChangesDdl('first_play_entry_changes', true))
  migrateFirstPlayTimelineSchema(db)
  db.exec(`
    CREATE INDEX IF NOT EXISTS first_play_entries_date_idx ON first_play_entries(first_played_on DESC, game_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS first_play_changes_entry_time_idx ON first_play_entry_changes(entry_id, changed_at);
  `)
}

function validCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)
}

export function normalizeFirstPlayDate(value: unknown, requestedPrecision?: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  let precision: FirstPlayDatePrecision
  if (requestedPrecision === undefined || requestedPrecision === null || requestedPrecision === '') {
    precision = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? 'day'
      : /^\d{4}-\d{2}$/.test(raw) ? 'month'
        : /^\d{4}$/.test(raw) ? 'year' : 'unknown'
  } else if (['day', 'month', 'year', 'unknown'].includes(String(requestedPrecision))) {
    precision = requestedPrecision as FirstPlayDatePrecision
  } else {
    throw new FirstPlayInputError('日期精度只能是 day、month、year 或 unknown。')
  }

  if (precision === 'unknown') {
    if (raw) throw new FirstPlayInputError('日期精度为 unknown 时，首次游玩日期必须留空。')
    return { firstPlayedOn: null, datePrecision: precision }
  }
  if (precision === 'day' && validCalendarDate(raw)) return { firstPlayedOn: raw, datePrecision: precision }
  if (precision === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return { firstPlayedOn: raw, datePrecision: precision }
  if (precision === 'year' && /^\d{4}$/.test(raw)) return { firstPlayedOn: raw, datePrecision: precision }
  throw new FirstPlayInputError('日期与所选精度不匹配，请使用 YYYY-MM-DD、YYYY-MM 或 YYYY 格式。')
}

function normalizeAppId(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const appId = typeof value === 'number' ? value : /^\d+$/.test(String(value).trim()) ? Number(String(value).trim()) : NaN
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new FirstPlayInputError('Steam AppID 必须是正整数。')
  return appId
}

function normalizeGameName(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new FirstPlayInputError('请填写游戏名称。')
  const name = value.trim()
  if (name.length > 200) throw new FirstPlayInputError('游戏名称不能超过 200 个字符。')
  return name
}

function normalizeNote(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 4000) throw new FirstPlayInputError('个人备注不能超过 4000 个字符。')
  return value.trim() || null
}

function normalizeSource(value: unknown, fallback: FirstPlaySource) {
  if (value === undefined || value === null || value === '') return fallback
  if (!isFirstPlaySource(value)) throw new FirstPlayInputError('来源只能是 heybox-import、manual 或 steam-client-get-last-played-times。')
  return value
}

/** 原始 Unix 秒级时间戳：只做类型与范围校验，不参与日期计算。 */
function normalizeOriginalFirstPlaytime(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const numeric = typeof value === 'number' ? value : /^\d+$/.test(String(value).trim()) ? Number(String(value).trim()) : NaN
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new FirstPlayInputError('原始首玩时间戳必须是正整数（Unix 秒）。')
  return numeric
}

export function stableCustomGameId(name: string) {
  const normalized = name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
  return `custom-${createHash('sha256').update(normalized).digest('hex').slice(0, 24)}`
}

function normalizeEntryInput(input: FirstPlayEntryInput, defaultSource: FirstPlaySource = 'manual') {
  const gameName = normalizeGameName(input.gameName)
  const steamAppId = normalizeAppId(input.steamAppId)
  const customGameId = steamAppId ? null : (input.customGameId?.trim() || stableCustomGameId(gameName))
  if (!steamAppId && customGameId.length > 128) throw new FirstPlayInputError('自定义游戏标识过长。')
  const date = normalizeFirstPlayDate(input.firstPlayedOn, input.datePrecision)
  const source = normalizeSource(input.source, defaultSource)
  return {
    steamAppId,
    customGameId,
    gameName,
    ...date,
    source,
    originalFirstPlaytime: normalizeOriginalFirstPlaytime(input.originalFirstPlaytime),
    personalNote: normalizeNote(input.personalNote),
  }
}

function recordChange(
  db: DatabaseSync,
  entry: { id: string; gameName: string; steamAppId: number | null; firstPlayedOn: string | null; datePrecision: string },
  action: 'created' | 'updated' | 'deleted',
  changedBy: FirstPlaySource,
  next?: { firstPlayedOn: string | null; datePrecision: string },
) {
  db.prepare(`INSERT INTO first_play_entry_changes(
    change_id, entry_id, changed_at, action, changed_by, game_name, steam_app_id,
    previous_first_played_on, new_first_played_on, previous_date_precision, new_date_precision
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), entry.id, new Date().toISOString(), action, changedBy, entry.gameName,
      entry.steamAppId, action === 'created' ? null : entry.firstPlayedOn,
      action === 'deleted' ? null : next?.firstPlayedOn ?? entry.firstPlayedOn,
      action === 'created' ? null : entry.datePrecision,
      action === 'deleted' ? null : next?.datePrecision ?? entry.datePrecision)
}

function rowToEntry(row: Record<string, unknown>): FirstPlayEntry {
  return {
    id: String(row.id),
    steamAppId: row.steamAppId === null ? null : Number(row.steamAppId),
    customGameId: row.customGameId === null ? null : String(row.customGameId),
    gameName: String(row.gameName),
    firstPlayedOn: row.firstPlayedOn === null ? null : String(row.firstPlayedOn),
    datePrecision: row.datePrecision as FirstPlayDatePrecision,
    source: row.source as FirstPlaySource,
    originalFirstPlaytime: row.originalFirstPlaytime === null || row.originalFirstPlaytime === undefined
      ? null : Number(row.originalFirstPlaytime),
    personalNote: row.personalNote === null ? null : String(row.personalNote),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    headerImage: row.headerImage === null ? null : String(row.headerImage),
    playtimeMinutes: row.playtimeMinutes === null ? null : Number(row.playtimeMinutes),
  }
}

const ENTRY_SELECT = `
  SELECT e.id, e.steam_app_id AS steamAppId, e.custom_game_id AS customGameId,
    e.game_name AS gameName, e.first_played_on AS firstPlayedOn,
    e.date_precision AS datePrecision, e.source,
    e.original_first_playtime AS originalFirstPlaytime, e.personal_note AS personalNote,
    e.created_at AS createdAt, e.updated_at AS updatedAt,
    g.header_image AS headerImage, g.playtime_minutes AS playtimeMinutes
  FROM first_play_entries e
  LEFT JOIN steam_games g ON g.steam_app_id = e.steam_app_id
`

export function listFirstPlayEntries(db: DatabaseSync, search = '') {
  const term = search.trim()
  const rows = term
    ? db.prepare(`${ENTRY_SELECT} WHERE e.game_name LIKE ? ESCAPE '\\' ORDER BY e.first_played_on IS NULL, e.first_played_on DESC, e.game_name COLLATE NOCASE`).all(`%${term.replace(/[\\%_]/g, value => `\\${value}`)}%`)
    : db.prepare(`${ENTRY_SELECT} ORDER BY e.first_played_on IS NULL, e.first_played_on DESC, e.game_name COLLATE NOCASE`).all()
  return (rows as Record<string, unknown>[]).map(rowToEntry)
}

export function listFirstPlayCandidates(db: DatabaseSync, search = '', limit = 500) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000))
  const term = search.trim()
  const rows = db.prepare(`
    SELECT g.steam_app_id AS steamAppId, g.name AS gameName, g.header_image AS headerImage,
      g.playtime_minutes AS playtimeMinutes
    FROM steam_games g
    LEFT JOIN first_play_entries e ON e.steam_app_id = g.steam_app_id
    WHERE e.id IS NULL AND (? = '' OR g.name LIKE ? ESCAPE '\\' OR CAST(g.steam_app_id AS TEXT) = ?)
    ORDER BY g.name COLLATE NOCASE
    LIMIT ?
  `).all(term, `%${term.replace(/[\\%_]/g, value => `\\${value}`)}%`, term, safeLimit) as Record<string, unknown>[]
  return rows.map(row => ({
    steamAppId: Number(row.steamAppId),
    gameName: String(row.gameName),
    headerImage: row.headerImage === null ? null : String(row.headerImage),
    playtimeMinutes: row.playtimeMinutes === null ? null : Number(row.playtimeMinutes),
  }))
}

function findEntryById(db: DatabaseSync, id: string) {
  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id) as Record<string, unknown> | undefined
}

function insertEntry(db: DatabaseSync, input: ReturnType<typeof normalizeEntryInput>, changedBy: FirstPlaySource) {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO first_play_entries(
    id, steam_app_id, custom_game_id, game_name, first_played_on, date_precision,
    source, last_modified_source, personal_note, original_first_playtime, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.steamAppId, input.customGameId, input.gameName, input.firstPlayedOn,
      input.datePrecision, input.source, changedBy, input.personalNote, input.originalFirstPlaytime, now, now)
  recordChange(db, { id, gameName: input.gameName, steamAppId: input.steamAppId, firstPlayedOn: null, datePrecision: 'unknown' }, 'created', changedBy, input)
  return id
}

export function createFirstPlayEntry(db: DatabaseSync, raw: FirstPlayEntryInput) {
  const input = normalizeEntryInput({ ...raw, source: 'manual' }, 'manual')
  const duplicate = input.steamAppId
    ? db.prepare('SELECT id FROM first_play_entries WHERE steam_app_id = ?').get(input.steamAppId)
    : db.prepare('SELECT id FROM first_play_entries WHERE custom_game_id = ?').get(input.customGameId)
  if (duplicate) throw new FirstPlayInputError('这款游戏已经在时间轴中。')
  db.exec('BEGIN IMMEDIATE')
  let id = ''
  try {
    id = insertEntry(db, input, 'manual')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return rowToEntry(findEntryById(db, id)!)
}

export function updateFirstPlayEntry(db: DatabaseSync, id: string, raw: Partial<FirstPlayEntryInput>) {
  const currentRow = findEntryById(db, id)
  if (!currentRow) throw new FirstPlayInputError('这条时间轴记录已不存在。')
  const current = rowToEntry(currentRow)
  const input = normalizeEntryInput({
    steamAppId: current.steamAppId,
    customGameId: current.customGameId,
    gameName: raw.gameName ?? current.gameName,
    firstPlayedOn: raw.firstPlayedOn === undefined ? current.firstPlayedOn : raw.firstPlayedOn,
    datePrecision: raw.datePrecision ?? current.datePrecision,
    source: current.source,
    originalFirstPlaytime: raw.originalFirstPlaytime === undefined ? current.originalFirstPlaytime : raw.originalFirstPlaytime,
    personalNote: raw.personalNote === undefined ? current.personalNote : raw.personalNote,
  }, 'manual')
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`UPDATE first_play_entries SET game_name = ?, first_played_on = ?, date_precision = ?,
      personal_note = ?, original_first_playtime = ?, last_modified_source = 'manual', updated_at = ? WHERE id = ?`)
      .run(input.gameName, input.firstPlayedOn, input.datePrecision, input.personalNote, input.originalFirstPlaytime, now, id)
    recordChange(db, current, 'updated', 'manual', input)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return rowToEntry(findEntryById(db, id)!)
}

export function deleteFirstPlayEntry(db: DatabaseSync, id: string) {
  const row = findEntryById(db, id)
  if (!row) throw new FirstPlayInputError('这条时间轴记录已不存在。')
  const current = rowToEntry(row)
  db.exec('BEGIN IMMEDIATE')
  try {
    recordChange(db, current, 'deleted', 'manual')
    db.prepare('DELETE FROM first_play_entries WHERE id = ?').run(id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export interface ImportedFirstPlayRecord {
  rowNumber: number
  appId: number | null
  gameName: string
  firstPlayedOn: string | null
  datePrecision: FirstPlayDatePrecision
  source: FirstPlaySource
  originalFirstPlaytime: number | null
  originalData: Record<string, unknown>
  status: 'ready' | 'name-candidate' | 'unmatched' | 'missing-date' | 'duplicate' | 'conflict' | 'invalid'
  message: string
  candidateAppId: number | null
  candidateName: string | null
  error?: string
}

function findValue(object: Record<string, unknown>, names: string[]) {
  const keys = new Map(Object.keys(object).map(key => [key.replace(/[\s_-]/g, '').toLocaleLowerCase(), key]))
  for (const name of names) {
    const actual = keys.get(name.replace(/[\s_-]/g, '').toLocaleLowerCase())
    if (actual !== undefined) return object[actual]
  }
  return undefined
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index++ }
      else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"' && cell.length === 0) quoted = true
    else if (character === ',') { row.push(cell); cell = '' }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++
      row.push(cell); cell = ''
      if (row.some(value => value.trim())) rows.push(row)
      row = []
    } else cell += character
  }
  if (quoted) throw new FirstPlayInputError('CSV 引号没有闭合。')
  row.push(cell)
  if (row.some(value => value.trim())) rows.push(row)
  if (rows.length < 2) throw new FirstPlayInputError('CSV 至少需要一行表头和一条记录。')
  const headers = rows[0]!.map(value => value.trim())
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

export function parseFirstPlayImport(content: string, format: 'csv' | 'json') {
  if (Buffer.byteLength(content, 'utf8') > 2_000_000) throw new FirstPlayInputError('导入文件不能超过 2 MB。')
  let records: unknown
  if (format === 'csv') records = parseCsv(content)
  else {
    try { records = JSON.parse(content) } catch { throw new FirstPlayInputError('JSON 无法解析。') }
    if (!Array.isArray(records)) records = (records as Record<string, unknown>)?.records
  }
  if (!Array.isArray(records)) throw new FirstPlayInputError('JSON 顶层应为记录数组，或包含 records 数组。')
  if (records.length > 5000) throw new FirstPlayInputError('一次最多导入 5000 条记录。')
  return records.map((record, index) => {
    const source = record && typeof record === 'object' && !Array.isArray(record) ? record as Record<string, unknown> : {}
    const minimalOriginal = Object.fromEntries(Object.entries(source).filter(([key, value]) => {
      const normalized = key.toLocaleLowerCase().replace(/[^a-z]/g, '')
      return ['appid', 'steamappid', 'gamename', 'name', 'firstplayedon', 'firstplayed', 'date', 'dateprecision', 'precision', 'source', 'originalfirstplaytime', 'firstplaytime', 'firstplayedat'].includes(normalized)
        && (typeof value === 'string' || typeof value === 'number' || value === null)
    }))
    try {
      const appId = normalizeAppId(findValue(source, ['appId', 'steamAppId']))
      const gameName = normalizeGameName(findValue(source, ['gameName', 'name']))
      const dateValue = findValue(source, ['firstPlayedOn', 'firstPlayed', 'date'])
      const date = normalizeFirstPlayDate(dateValue, findValue(source, ['datePrecision', 'precision']))
      const declaredSource = typeof findValue(source, ['source', 'importSource']) === 'string'
        ? String(findValue(source, ['source', 'importSource'])).trim() : ''
      const recordSource: FirstPlaySource = isFirstPlaySource(declaredSource) ? declaredSource : DEFAULT_IMPORT_SOURCE
      let sourceNote = ''
      if (declaredSource && !isFirstPlaySource(declaredSource)) {
        sourceNote = `未知来源“${declaredSource}”，已按 ${DEFAULT_IMPORT_SOURCE} 处理。`
      }
      // 原始 Unix 时间戳只影响可追溯性，坏值不该让整条记录作废，因此降级为 null 并提示。
      let originalFirstPlaytime: number | null = null
      try {
        originalFirstPlaytime = normalizeOriginalFirstPlaytime(findValue(source, ['originalFirstPlaytime', 'firstPlaytime', 'firstPlayedAt']))
      } catch (timestampError) {
        sourceNote += `原始时间戳无法识别（${timestampError instanceof Error ? timestampError.message : '格式无效'}），已忽略。`
      }
      const baseMessage = date.datePrecision === 'unknown' ? '缺少日期；可按 unknown 保存到待确认区域。' : '可导入。'
      return {
        rowNumber: index + 1, appId, gameName, ...date, source: recordSource, originalFirstPlaytime,
        originalData: minimalOriginal,
        status: date.datePrecision === 'unknown' ? 'missing-date' as const : 'ready' as const,
        message: sourceNote ? `${baseMessage}${sourceNote}` : baseMessage,
        candidateAppId: null, candidateName: null,
      }
    } catch (error) {
      return {
        rowNumber: index + 1, appId: null,
        gameName: String(findValue(source, ['gameName', 'name']) ?? '').trim(),
        firstPlayedOn: null, datePrecision: 'unknown' as const,
        source: DEFAULT_IMPORT_SOURCE, originalFirstPlaytime: null,
        originalData: minimalOriginal,
        status: 'invalid' as const,
        message: error instanceof Error ? error.message : '记录格式无效。',
        candidateAppId: null, candidateName: null,
        error: error instanceof Error ? error.message : '记录格式无效。',
      }
    }
  })
}

export function buildFirstPlayImportPreview(db: DatabaseSync, records: ImportedFirstPlayRecord[]) {
  const rows = records.map(record => ({ ...record }))
  const existingByAppId = new Map<number, Record<string, unknown>>()
  const existingByCustomId = new Map<string, Record<string, unknown>>()
  for (const row of db.prepare('SELECT id, steam_app_id AS steamAppId, custom_game_id AS customGameId, game_name AS gameName, first_played_on AS firstPlayedOn, date_precision AS datePrecision FROM first_play_entries').all() as Record<string, unknown>[]) {
    if (row.steamAppId !== null) existingByAppId.set(Number(row.steamAppId), row)
    if (row.customGameId) existingByCustomId.set(String(row.customGameId), row)
  }
  const seen = new Map<string, { date: string | null; index: number }>()
  for (const row of rows) {
    if (row.status === 'invalid') continue
    let candidate: { steamAppId: number; gameName: string } | undefined
    if (row.appId) {
      candidate = db.prepare('SELECT steam_app_id AS steamAppId, name AS gameName FROM steam_games WHERE steam_app_id = ?').get(row.appId) as typeof candidate
      if (!candidate) {
        row.status = 'unmatched'
        row.message = '未找到对应 Steam 档案；确认后会保留为无封面的时间轴记录。'
      }
    } else {
      const matches = db.prepare('SELECT steam_app_id AS steamAppId, name AS gameName FROM steam_games WHERE name = ? COLLATE NOCASE LIMIT 2').all(row.gameName) as Array<{ steamAppId: number; gameName: string }>
      if (matches.length === 1) {
        candidate = matches[0]
        row.candidateAppId = candidate!.steamAppId
        row.candidateName = candidate!.gameName
        row.status = 'name-candidate'
        row.message = '名称唯一匹配到 Steam 档案；请在预览中确认关联。'
      } else if (matches.length > 1) {
        row.status = 'unmatched'
        row.message = '名称匹配到多个候选；请手动选择 AppID 或保留为自定义记录。'
      } else {
        row.status = row.datePrecision === 'unknown' ? 'missing-date' : 'unmatched'
        row.message = row.datePrecision === 'unknown' ? '没有 Steam 匹配且日期缺失；可保存到待确认区域。' : '没有 Steam 匹配；确认后会保留为自定义游戏。'
      }
    }
    const appId = row.appId ?? (row.status === 'name-candidate' ? row.candidateAppId : null)
    const customId = appId ? null : stableCustomGameId(row.gameName)
    const key = appId ? `app:${appId}` : `custom:${customId}`
    const prior = seen.get(key)
    if (prior && prior.date !== row.firstPlayedOn) {
      row.status = 'conflict'
      row.message = `同一游戏在本次导入中出现不同日期（第 ${prior.index} 条）；请只选择一条，或修改日期。`
    } else if (prior) {
      row.status = 'duplicate'
      row.message = `与本次导入第 ${prior.index} 条重复；默认跳过。`
    } else {
      seen.set(key, { date: row.firstPlayedOn, index: row.rowNumber })
    }
    const existing = appId ? existingByAppId.get(appId) : existingByCustomId.get(customId!)
    if (existing && row.status !== 'duplicate') {
      if (existing.firstPlayedOn === row.firstPlayedOn && existing.datePrecision === row.datePrecision) {
        row.status = 'duplicate'
        row.message = '与已存在的时间轴记录相同；默认跳过。'
      } else {
        row.status = 'conflict'
        row.message = '时间轴中已有不同日期；只能在预览中明确选择更新。'
      }
    }
  }
  const count = (status: ImportedFirstPlayRecord['status']) => rows.filter(row => row.status === status).length
  return {
    summary: {
      originalRecordCount: rows.length,
      recognizedCount: rows.filter(row => row.status !== 'invalid').length,
      appIdMatchCount: rows.filter(row => row.appId !== null && row.status !== 'invalid' && row.message.indexOf('未找到对应') < 0).length,
      nameMatchCandidateCount: count('name-candidate'),
      missingDateCount: rows.filter(row => row.datePrecision === 'unknown').length,
      duplicateCount: count('duplicate'),
      dateConflictCount: count('conflict'),
      unrecognizedCount: count('invalid') + rows.filter(row => row.status === 'unmatched').length,
    },
    rows,
  }
}

export interface FirstPlayImportDecision {
  rowNumber: number
  action: 'insert' | 'update' | 'skip'
  steamAppId?: number | null
  gameName?: string
  firstPlayedOn?: string | null
  datePrecision?: FirstPlayDatePrecision
  source?: FirstPlaySource
  personalNote?: string | null
}

export function applyFirstPlayImportDecisions(db: DatabaseSync, rows: ImportedFirstPlayRecord[], decisions: FirstPlayImportDecision[]) {
  const byNumber = new Map(rows.map(row => [row.rowNumber, row]))
  const chosen = decisions.filter(decision => decision.action !== 'skip')
  if (chosen.some(decision => !byNumber.has(decision.rowNumber))) throw new FirstPlayInputError('导入预览已失效，请重新上传文件。')
  const seenKeys = new Set<string>()
  for (const decision of chosen) {
    const row = byNumber.get(decision.rowNumber)!
    const appId = normalizeAppId(decision.steamAppId === undefined ? row.appId ?? row.candidateAppId : decision.steamAppId)
    const input = normalizeEntryInput({
      steamAppId: appId,
      gameName: decision.gameName ?? row.gameName,
      firstPlayedOn: decision.firstPlayedOn === undefined ? row.firstPlayedOn : decision.firstPlayedOn,
      datePrecision: decision.datePrecision ?? row.datePrecision,
      source: decision.source ?? row.source,
      originalFirstPlaytime: row.originalFirstPlaytime,
      personalNote: decision.personalNote,
    }, DEFAULT_IMPORT_SOURCE)
    const key = input.steamAppId ? `app:${input.steamAppId}` : `custom:${input.customGameId}`
    if (seenKeys.has(key)) throw new FirstPlayInputError('同一游戏不能在一次确认中选择多条记录；请先解决日期冲突。')
    seenKeys.add(key)
    const existing = input.steamAppId
      ? db.prepare('SELECT id FROM first_play_entries WHERE steam_app_id = ?').get(input.steamAppId) as { id: string } | undefined
      : db.prepare('SELECT id FROM first_play_entries WHERE custom_game_id = ?').get(input.customGameId) as { id: string } | undefined
    if (decision.action === 'insert' && existing) throw new FirstPlayInputError('确认期间这款游戏已被加入时间轴，请刷新预览。')
    if (decision.action === 'update' && !existing) throw new FirstPlayInputError('要更新的时间轴记录已不存在，请刷新预览。')
    if (row.status === 'conflict' && decision.action === 'insert' && existing) throw new FirstPlayInputError('日期冲突不能通过新增覆盖，请明确选择更新或跳过。')
  }

  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const decision of chosen) {
      const row = byNumber.get(decision.rowNumber)!
      const appId = normalizeAppId(decision.steamAppId === undefined ? row.appId ?? row.candidateAppId : decision.steamAppId)
      const input = normalizeEntryInput({
        steamAppId: appId,
        gameName: decision.gameName ?? row.gameName,
        firstPlayedOn: decision.firstPlayedOn === undefined ? row.firstPlayedOn : decision.firstPlayedOn,
        datePrecision: decision.datePrecision ?? row.datePrecision,
        source: decision.source ?? row.source,
        originalFirstPlaytime: row.originalFirstPlaytime,
        personalNote: decision.personalNote,
      }, DEFAULT_IMPORT_SOURCE)
      if (decision.action === 'insert') insertEntry(db, input, input.source)
      else {
        const existing = input.steamAppId
          ? db.prepare('SELECT id FROM first_play_entries WHERE steam_app_id = ?').get(input.steamAppId) as { id: string } | undefined
          : db.prepare('SELECT id FROM first_play_entries WHERE custom_game_id = ?').get(input.customGameId) as { id: string } | undefined
        if (!existing) throw new FirstPlayInputError('要更新的时间轴记录已不存在，请刷新预览。')
        const prior = rowToEntry(findEntryById(db, existing.id)!)
        db.prepare(`UPDATE first_play_entries SET game_name = ?, first_played_on = ?, date_precision = ?,
          source = ?, original_first_playtime = ?, last_modified_source = ?, updated_at = ? WHERE id = ?`)
          .run(input.gameName, input.firstPlayedOn, input.datePrecision, input.source, input.originalFirstPlaytime, input.source, now, existing.id)
        recordChange(db, prior, 'updated', input.source, input)
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { inserted: chosen.filter(item => item.action === 'insert').length, updated: chosen.filter(item => item.action === 'update').length, skipped: decisions.filter(item => item.action === 'skip').length }
}
