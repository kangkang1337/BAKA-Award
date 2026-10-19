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
  personalNote: string | null
  dataSource: string
}

export interface SteamFilmStatus {
  loginAvailable: boolean
  syncAvailable: boolean
  authenticated: boolean
  csrfToken?: string
  lastSyncedAt: string | null
  gameCount?: number
}
