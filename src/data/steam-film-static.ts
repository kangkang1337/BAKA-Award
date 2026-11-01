import type { FirstPlayTimelineData, SteamFilmArchiveData } from '../types/steam-film'

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}

function isCalendarDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)
}

export function isSteamFilmArchive(value: unknown): value is SteamFilmArchiveData {
  if (!value || typeof value !== 'object') return false
  const archive = value as Record<string, unknown>
  if (archive.format !== 'baka-steam-film-archive' || archive.schemaVersion !== 1 || !Array.isArray(archive.games)) return false
  if (archive.dataStatus !== 'ready' && archive.dataStatus !== 'empty') return false
  if (!Number.isSafeInteger(archive.gameCount) || archive.gameCount !== archive.games.length) return false
  if (!isNullableString(archive.generatedAt) || !isNullableString(archive.lastSuccessfulSyncAt)) return false
  if ((archive.dataStatus === 'empty') !== (archive.games.length === 0)) return false
  return archive.games.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false
    const game = item as Record<string, unknown>
    return Number.isSafeInteger(game.steamAppId) && Number(game.steamAppId) > 0
      && typeof game.name === 'string' && game.name.trim().length > 0
      && isNullableString(game.headerImage)
      && isNullableString(game.firstPlayedAt)
      && isNullableString(game.firstSeenAt)
      && isNullableString(game.firstAchievementAt)
      && isNullableString(game.lastPlayedAt)
      && isNullableNonNegativeInteger(game.playtimeMinutes)
      && isNullableNonNegativeInteger(game.playtimeRecentMinutes)
      && isNullableNonNegativeInteger(game.achievementCount)
      && isNullableNonNegativeInteger(game.achievementTotal)
  })
}

export function resolveSteamFilmArchiveUrl(baseUrl: string, currentUrl: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(`${base}data/steam-film/archive.v1.json`, currentUrl).href
}

export function isFirstPlayTimeline(value: unknown): value is FirstPlayTimelineData {
  if (!value || typeof value !== 'object') return false
  const timeline = value as Record<string, unknown>
  if (timeline.format !== 'baka-first-play-timeline' || timeline.schemaVersion !== 1 || timeline.timezone !== 'Asia/Shanghai') return false
  if (!Array.isArray(timeline.entries) || timeline.entryCount !== timeline.entries.length) return false
  if (timeline.dataStatus !== (timeline.entries.length ? 'ready' : 'empty')) return false
  if (typeof timeline.generatedAt !== 'string' || !Number.isFinite(Date.parse(timeline.generatedAt))) return false
  if (!isNullableString(timeline.lastSuccessfulSyncAt)) return false
  return timeline.entries.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false
    const entry = item as Record<string, unknown>
    const precision = entry.datePrecision
    const date = entry.firstPlayedOn
    const validDate = precision === 'unknown' ? date === null
      : precision === 'day' && typeof date === 'string' && isCalendarDay(date)
        || precision === 'month' && typeof date === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(date)
        || precision === 'year' && typeof date === 'string' && /^\d{4}$/.test(date)
    return typeof entry.id === 'string' && entry.id.length > 0
      && (entry.steamAppId === null || (Number.isSafeInteger(entry.steamAppId) && Number(entry.steamAppId) > 0))
      && (entry.customGameId === null || typeof entry.customGameId === 'string')
      && ((entry.steamAppId !== null && entry.customGameId === null) || (entry.steamAppId === null && typeof entry.customGameId === 'string'))
      && typeof entry.gameName === 'string' && entry.gameName.trim().length > 0
      && isNullableString(entry.headerImage)
      && ['day', 'month', 'year', 'unknown'].includes(String(precision)) && validDate
      && (entry.source === 'heybox-import' || entry.source === 'manual' || entry.source === 'steam-client-get-last-played-times')
      && isNullableString(entry.personalNote)
      && isNullableNonNegativeInteger(entry.playtimeMinutes)
  })
}

export function resolveFirstPlayTimelineUrl(baseUrl: string, currentUrl: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(`${base}data/steam-film/first-play-timeline.v1.json`, currentUrl).href
}
