export interface SteamFilmGame {
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
  personalNote?: string | null
  dataSource?: string
}

export interface SteamFilmArchiveData {
  format: 'baka-steam-film-archive'
  schemaVersion: 1
  generatedAt: string | null
  lastSuccessfulSyncAt: string | null
  gameCount: number
  dataStatus: 'ready' | 'empty'
  games: SteamFilmGame[]
}

export type FirstPlayDatePrecision = 'day' | 'month' | 'year' | 'unknown'

export type FirstPlaySource = 'heybox-import' | 'manual' | 'steam-client-get-last-played-times'

export interface FirstPlayTimelineEntry {
  id: string
  steamAppId: number | null
  customGameId: string | null
  gameName: string
  headerImage: string | null
  firstPlayedOn: string | null
  datePrecision: FirstPlayDatePrecision
  source: FirstPlaySource
  personalNote: string | null
  playtimeMinutes: number | null
}

export interface FirstPlayTimelineData {
  format: 'baka-first-play-timeline'
  schemaVersion: 1
  generatedAt: string
  lastSuccessfulSyncAt: string | null
  timezone: 'Asia/Shanghai'
  entryCount: number
  dataStatus: 'ready' | 'empty'
  entries: FirstPlayTimelineEntry[]
}
