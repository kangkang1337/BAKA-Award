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
