import type { SteamFilmGame } from '../types/steam-film'

// Familiar Steam titles are used only to demonstrate the film interaction.
// Dates, playtime, achievements, and notes are intentionally left unknown.
const previewIds = [620, 367520, 413150, 753640, 1145360, 1245620, 1086940]
const previewNames = [
  'Portal 2',
  'Hollow Knight',
  'Stardew Valley',
  'Outer Wilds',
  'Hades',
  'ELDEN RING',
  "Baldur's Gate 3",
]

export const steamFilmPreviewGames: SteamFilmGame[] = previewIds.map((steamAppId, index) => ({
  steamAppId,
  name: previewNames[index]!,
  headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`,
  firstPlayedAt: null,
  firstSeenAt: null,
  firstAchievementAt: null,
  lastPlayedAt: null,
  playtimeMinutes: null,
  playtimeRecentMinutes: null,
  achievementCount: null,
  achievementTotal: null,
  personalNote: null,
  dataSource: '仅用于演示交互的 Steam 游戏样例',
}))
