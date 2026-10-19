import type { SteamFilmArchiveData } from '../types/steam-film'

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
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
