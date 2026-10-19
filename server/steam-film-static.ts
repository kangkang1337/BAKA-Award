import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { getGames, getMeta } from './index.ts'

export interface PublicSteamFilmGame {
  steamAppId: number
  name: string
  headerImage: string | null
  firstPlayedAt: string | null
  firstSeenAt: string | null
  firstAchievementAt: string | null
  lastPlayedAt: string | null
  playtimeMinutes: number | null
  playtimeRecentMinutes: number | null
  achievementCount: number | null
  achievementTotal: number | null
}

export interface SteamFilmStaticArchive {
  format: 'baka-steam-film-archive'
  schemaVersion: 1
  generatedAt: string | null
  lastSuccessfulSyncAt: string | null
  gameCount: number
  dataStatus: 'ready' | 'empty'
  games: PublicSteamFilmGame[]
}

interface MonthlyGameMinutes {
  steamAppId: number
  name: string
  minutes: number
}

export interface SteamFilmMonthlyReel {
  format: 'baka-steam-film-monthly-reel'
  schemaVersion: 1
  timezone: 'Asia/Shanghai'
  generatedAt: string | null
  algorithmVersion: 'snapshot-delta-v1'
  status: 'accumulating' | 'partial'
  note: string
  reports: Array<{
    month: string
    status: 'accumulating' | 'partial' | 'insufficient-samples' | 'insufficient-boundary-samples'
    totalPlaytimeMinutes: number | null
    games: MonthlyGameMinutes[]
    sampledSyncCount: number
    coverageStart: string | null
    coverageEnd: string | null
    unallocatedBoundaryIntervals: number
    unobservedSampleIntervals: number
    excludedRegressionIntervals: number
  }>
}

function monthKey(isoDate: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(isoDate))
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  if (!year || !month) throw new Error('Invalid snapshot timestamp')
  return `${year}-${month}`
}

function monthKeysBetween(first: string, last: string) {
  const [firstYear, firstMonth] = first.split('-').map(Number)
  const [lastYear, lastMonth] = last.split('-').map(Number)
  let cursor = firstYear! * 12 + firstMonth! - 1
  const end = lastYear! * 12 + lastMonth! - 1
  const keys: string[] = []
  while (cursor <= end && keys.length < 240) {
    const year = Math.floor(cursor / 12)
    const month = cursor % 12 + 1
    keys.push(`${year}-${String(month).padStart(2, '0')}`)
    cursor++
  }
  return keys
}

function publicGame(row: Record<string, unknown>): PublicSteamFilmGame {
  return {
    steamAppId: row.steamAppId as number,
    name: row.name as string,
    headerImage: row.headerImage as string | null,
    firstPlayedAt: row.firstPlayedAt as string | null,
    firstSeenAt: row.firstSeenAt as string | null,
    firstAchievementAt: row.firstAchievementAt as string | null,
    lastPlayedAt: row.lastPlayedAt as string | null,
    playtimeMinutes: row.playtimeMinutes as number | null,
    playtimeRecentMinutes: row.playtimeRecentMinutes as number | null,
    achievementCount: row.achievementCount as number | null,
    achievementTotal: row.achievementTotal as number | null,
  }
}

export function buildSteamFilmStaticData(db: DatabaseSync, generatedAt = new Date()): {
  archive: SteamFilmStaticArchive
  monthly: SteamFilmMonthlyReel
} {
  const generatedAtIso = generatedAt.toISOString()
  const games = getGames(db).map(publicGame)
  const archive: SteamFilmStaticArchive = {
    format: 'baka-steam-film-archive',
    schemaVersion: 1,
    generatedAt: generatedAtIso,
    lastSuccessfulSyncAt: getMeta(db, 'last_synced_at'),
    gameCount: games.length,
    dataStatus: games.length ? 'ready' : 'empty',
    games,
  }

  const ownerId = getMeta(db, 'owner_steam_id')
  const historyTableCount = (db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('sync_batches', 'game_playtime_snapshots')").get() as { count: number }).count
  const hasHistoryTables = historyTableCount === 2
  let syncRows: Array<{ batchId: string; completedAt: string }> = []
  let snapshotRows: Array<{
    batchId: string
    steamAppId: number
    capturedAt: string
    playtimeMinutes: number
    regressed: number
  }> = []
  if (hasHistoryTables && ownerId) {
    syncRows = db.prepare(`
    SELECT batch_id AS batchId, completed_at AS completedAt
    FROM sync_batches
    WHERE owner_steam_id = ? AND status = 'succeeded' AND completed_at IS NOT NULL
    ORDER BY completed_at ASC, batch_id ASC
    `).all(ownerId) as typeof syncRows
  }
  const batchOrder = new Map(syncRows.map((row, index) => [row.batchId, index]))
  if (hasHistoryTables && ownerId) snapshotRows = db.prepare(`
    SELECT b.batch_id AS batchId, s.steam_app_id AS steamAppId,
      s.captured_at AS capturedAt, s.playtime_minutes AS playtimeMinutes,
      s.regressed AS regressed
    FROM game_playtime_snapshots s
    JOIN sync_batches b ON b.batch_id = s.batch_id
    WHERE b.status = 'succeeded' AND s.owner_steam_id = (
      SELECT value FROM archive_meta WHERE key = 'owner_steam_id'
    )
    ORDER BY s.captured_at ASC, s.steam_app_id ASC
  `).all() as typeof snapshotRows

  const names = new Map(games.map(game => [game.steamAppId, game.name]))
  const snapshotsByGame = new Map<number, typeof snapshotRows>()
  const syncsByMonth = new Map<string, Set<string>>()
  const reportData = new Map<string, {
    minutesByGame: Map<number, number>
    unallocatedBoundaryIntervals: number
    unobservedSampleIntervals: number
    excludedRegressionIntervals: number
    coverageStart: string | null
    coverageEnd: string | null
  }>()
  const ensureMonth = (month: string) => {
    let value = reportData.get(month)
    if (!value) {
      value = { minutesByGame: new Map(), unallocatedBoundaryIntervals: 0, unobservedSampleIntervals: 0, excludedRegressionIntervals: 0, coverageStart: null, coverageEnd: null }
      reportData.set(month, value)
    }
    return value
  }

  for (const sync of syncRows) {
    const month = monthKey(sync.completedAt)
    const syncIds = syncsByMonth.get(month) ?? new Set<string>()
    syncIds.add(sync.batchId)
    syncsByMonth.set(month, syncIds)
    ensureMonth(month)
  }

  for (const sample of snapshotRows) {
    const month = monthKey(sample.capturedAt)
    ensureMonth(month)
    const gameSamples = snapshotsByGame.get(sample.steamAppId) ?? []
    gameSamples.push(sample)
    snapshotsByGame.set(sample.steamAppId, gameSamples)
  }

  for (const [steamAppId, samples] of snapshotsByGame) {
    for (let index = 1; index < samples.length; index++) {
      const previous = samples[index - 1]!
      const current = samples[index]!
      const previousMonth = monthKey(previous.capturedAt)
      const currentMonth = monthKey(current.capturedAt)
      const delta = current.playtimeMinutes - previous.playtimeMinutes
      const isAdjacentSync = batchOrder.get(current.batchId) === (batchOrder.get(previous.batchId) ?? -2) + 1
      if (previousMonth === currentMonth && !isAdjacentSync) {
        ensureMonth(currentMonth).unobservedSampleIntervals++
      } else if (previousMonth === currentMonth && (previous.regressed || current.regressed)) {
        ensureMonth(currentMonth).excludedRegressionIntervals++
      } else if (previousMonth === currentMonth && delta >= 0) {
        const report = ensureMonth(currentMonth)
        report.minutesByGame.set(steamAppId, (report.minutesByGame.get(steamAppId) ?? 0) + delta)
        report.coverageStart = !report.coverageStart || previous.capturedAt < report.coverageStart ? previous.capturedAt : report.coverageStart
        report.coverageEnd = !report.coverageEnd || current.capturedAt > report.coverageEnd ? current.capturedAt : report.coverageEnd
      } else if (previousMonth !== currentMonth) {
        for (const month of monthKeysBetween(previousMonth, currentMonth)) {
          const report = ensureMonth(month)
          report.unallocatedBoundaryIntervals++
          if (!isAdjacentSync) report.unobservedSampleIntervals++
          if (previous.regressed || current.regressed) report.excludedRegressionIntervals++
        }
      }
    }
  }

  const reports: SteamFilmMonthlyReel['reports'] = [...reportData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, report]) => {
      const gamesForMonth = [...report.minutesByGame.entries()]
        .sort(([a], [b]) => a - b)
        .map(([steamAppId, minutes]) => ({ steamAppId, name: names.get(steamAppId) ?? `Steam App ${steamAppId}`, minutes }))
      const hasMeasuredDeltas = gamesForMonth.length > 0
      const status: SteamFilmMonthlyReel['reports'][number]['status'] = hasMeasuredDeltas
        ? 'partial'
        : report.unallocatedBoundaryIntervals > 0 ? 'insufficient-boundary-samples'
          : report.unobservedSampleIntervals > 0 || report.excludedRegressionIntervals > 0 ? 'insufficient-samples' : 'accumulating'
      return {
        month,
        status,
        totalPlaytimeMinutes: hasMeasuredDeltas ? gamesForMonth.reduce((total, game) => total + game.minutes, 0) : null,
        games: gamesForMonth,
        sampledSyncCount: syncsByMonth.get(month)?.size ?? 0,
        coverageStart: report.coverageStart,
        coverageEnd: report.coverageEnd,
        unallocatedBoundaryIntervals: report.unallocatedBoundaryIntervals,
        unobservedSampleIntervals: report.unobservedSampleIntervals,
        excludedRegressionIntervals: report.excludedRegressionIntervals,
      }
    })

  const monthly: SteamFilmMonthlyReel = {
    format: 'baka-steam-film-monthly-reel',
    schemaVersion: 1,
    timezone: 'Asia/Shanghai',
    generatedAt: generatedAtIso,
    algorithmVersion: 'snapshot-delta-v1',
    status: reports.some(report => report.status === 'partial') ? 'partial' : 'accumulating',
    note: '月报只计算同一上海自然月内相邻成功批次都含该游戏、且累计时长未倒退的快照差值。跨月区间不分摊；中间批次缺失游戏、异常倒退和缺少基线均不补零。所有结果都是部分统计，不代表完整自然月总时长。',
    reports,
  }
  return { archive, monthly }
}

async function atomicWrite(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(tempPath, content, { encoding: 'utf8', flag: 'wx' })
    await rename(tempPath, path)
  } catch (error) {
    const { rm } = await import('node:fs/promises')
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function exportSteamFilmStaticData(db: DatabaseSync, outputDirectory: string, generatedAt = new Date()) {
  const { archive, monthly } = buildSteamFilmStaticData(db, generatedAt)
  const archivePath = join(outputDirectory, 'archive.v1.json')
  const monthlyPath = join(outputDirectory, 'monthly-reel.v1.json')
  await atomicWrite(archivePath, `${JSON.stringify(archive, null, 2)}\n`)
  await atomicWrite(monthlyPath, `${JSON.stringify(monthly, null, 2)}\n`)
  return { archivePath, monthlyPath, gameCount: archive.gameCount, monthlyCount: monthly.reports.length }
}
