import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createStore } from './index.ts'
import { buildSteamFilmStaticData } from './steam-film-static.ts'
import { createFirstPlayEntry } from './first-play-timeline.ts'
import { STEAM_COVER_OVERRIDES, SHARED_PRIMARY_APP_IDS, isHashedCoverUrl, resolveSteamCoverUrl } from './steam-cover-overrides.ts'
import { COVER_ITEM_HOSTS, COVER_LEGACY_HOSTS, coverCandidates } from '../src/data/steam-cover.ts'

const databases: DatabaseSync[] = []
after(() => { for (const db of databases) db.close() })

function makeDb() {
  const db = createStore(new DatabaseSync(':memory:'))
  databases.push(db)
  return db
}

function seedGame(db: DatabaseSync, appId: number, name: string, headerImage: string | null) {
  db.prepare(`INSERT INTO steam_games(
    steam_app_id, name, header_image, first_played_at, first_seen_at, first_achievement_at,
    last_played_at, playtime_minutes, playtime_recent_minutes, achievement_count,
    achievement_total, personal_note, data_source, updated_at
  ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 90, NULL, NULL, NULL, NULL, 'steam-api', ?)`)
    .run(appId, name, headerImage, new Date().toISOString())
}

test('every timeline cover resolves to a verified shared.steamstatic.com address', () => {
  const ids = Object.keys(STEAM_COVER_OVERRIDES).map(Number)
  assert.equal(ids.length, 8)
  assert.equal(SHARED_PRIMARY_APP_IDS.size, 140)
  // 两组不重叠：8 款哈希封面 + 140 款普通封面 = 148
  for (const appId of ids) assert.equal(SHARED_PRIMARY_APP_IDS.has(appId), false)
  assert.equal(ids.length + SHARED_PRIMARY_APP_IDS.size, 148)

  for (const url of Object.values(STEAM_COVER_OVERRIDES)) {
    const parsed = new URL(url)
    assert.equal(parsed.hostname, 'shared.steamstatic.com')
    // 新路径必须带内容哈希目录，否则就是旧的 404 路径
    assert.match(parsed.pathname, /^\/store_item_assets\/steam\/apps\/\d+\/[0-9a-f]{40}\/header(_alt_assets_4)?\.jpg$/)
    assert.ok(isHashedCoverUrl(url))
  }

  const legacy = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
  for (const appId of SHARED_PRIMARY_APP_IDS) {
    const resolved = resolveSteamCoverUrl(appId, legacy(appId))
    assert.equal(resolved, `https://shared.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`)
    // 提升后不再含 akamai 主机，也不带哈希段
    assert.equal(isHashedCoverUrl(resolved), false)
  }
})

test('static export promotes verified covers and keeps hashed overrides intact', () => {
  const db = makeDb()
  const legacy = 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
  seedGame(db, 730, 'Counter-Strike 2', legacy)
  seedGame(db, 3527290, 'PEAK', 'https://cdn.akamai.steamstatic.com/steam/apps/3527290/header.jpg')
  seedGame(db, 555, 'Unverified Game', 'https://cdn.akamai.steamstatic.com/steam/apps/555/header.jpg')
  createFirstPlayEntry(db, { steamAppId: 730, gameName: 'Counter-Strike 2', firstPlayedOn: '2023-06-22' })
  createFirstPlayEntry(db, { steamAppId: 3527290, gameName: 'PEAK', firstPlayedOn: '2025-07-30' })
  createFirstPlayEntry(db, { steamAppId: 555, gameName: 'Unverified Game', firstPlayedOn: '2020-01-02' })

  const built = buildSteamFilmStaticData(db, new Date('2026-11-01T00:00:00.000Z'))
  const cs2 = built.timeline.entries.find(entry => entry.steamAppId === 730)!
  const peak = built.timeline.entries.find(entry => entry.steamAppId === 3527290)!
  const unknown = built.timeline.entries.find(entry => entry.steamAppId === 555)!

  // 140 类：旧路径 → shared 首选地址
  assert.equal(cs2.headerImage, 'https://shared.steamstatic.com/store_item_assets/steam/apps/730/header.jpg')
  assert.equal(cs2.firstPlayedOn, '2023-06-22')
  // 8 类：完整哈希路径原样保留
  assert.equal(peak.headerImage, STEAM_COVER_OVERRIDES[3527290])
  assert.equal(peak.firstPlayedOn, '2025-07-30')
  assert.equal(peak.source, 'manual')
  // 没有验证过的 AppID 不动
  assert.equal(unknown.headerImage, 'https://cdn.akamai.steamstatic.com/steam/apps/555/header.jpg')

  const archivePeak = built.archive.games.find(game => game.steamAppId === 3527290)!
  assert.equal(archivePeak.headerImage, STEAM_COVER_OVERRIDES[3527290])
  const archiveCs2 = built.archive.games.find(game => game.steamAppId === 730)!
  assert.equal(archiveCs2.headerImage, cs2.headerImage)

  // 再导出一次结果稳定，不会退回 akamai
  const again = buildSteamFilmStaticData(db, new Date('2026-11-02T00:00:00.000Z'))
  assert.equal(again.timeline.entries.find(entry => entry.steamAppId === 730)!.headerImage, cs2.headerImage)
  assert.equal(again.timeline.entries.find(entry => entry.steamAppId === 3527290)!.headerImage, peak.headerImage)
})

test('cover fallback candidates are deduplicated and terminate', () => {
  const legacy = 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
  const legacyList = coverCandidates(730, legacy)
  assert.equal(legacyList[0], legacy)
  assert.equal(new Set(legacyList).size, legacyList.length)
  assert.ok(legacyList.includes('https://shared.steamstatic.com/store_item_assets/steam/apps/730/header.jpg'))
  assert.ok(legacyList.includes('https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg'))
  assert.ok(legacyList.length <= COVER_ITEM_HOSTS.length + COVER_LEGACY_HOSTS.length + 1)

  // 提升后的首选地址：先换主机，最后才退回旧路径
  const promoted = 'https://shared.steamstatic.com/store_item_assets/steam/apps/730/header.jpg'
  const promotedList = coverCandidates(730, promoted)
  assert.equal(promotedList[0], promoted)
  assert.equal(new Set(promotedList).size, promotedList.length)
  assert.equal(promotedList.length, COVER_ITEM_HOSTS.length + COVER_LEGACY_HOSTS.length)
  assert.equal(promotedList.at(-1), 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg')

  const item = STEAM_COVER_OVERRIDES[3527290]
  const itemList = coverCandidates(3527290, item)
  assert.equal(itemList[0], item)
  assert.equal(new Set(itemList).size, itemList.length)
  // 新路径换主机时保留哈希目录
  assert.ok(itemList.includes(item.replace('shared.steamstatic.com', 'shared.cloudflare.steamstatic.com')))
  // 哈希路径是权威地址，不再追加同一 AppID 的无哈希猜测
  assert.ok(itemList.every(url => !url.endsWith('/store_item_assets/steam/apps/3527290/header.jpg')))
  assert.equal(itemList.length, COVER_ITEM_HOSTS.length)

  // 没有图片也没有 AppID：没有候选，直接走占位图
  assert.deepEqual(coverCandidates(null, null), [])
  // 只有一个 AppID：只用构造出来的地址
  assert.equal(coverCandidates(730, null).length, COVER_ITEM_HOSTS.length + COVER_LEGACY_HOSTS.length)
})

test('resolveSteamCoverUrl leaves unknown apps untouched', () => {
  assert.equal(resolveSteamCoverUrl(999, 'https://example.com/a.jpg'), 'https://example.com/a.jpg')
  assert.equal(resolveSteamCoverUrl(null, null), null)
  assert.equal(resolveSteamCoverUrl(3527290, 'https://cdn.akamai.steamstatic.com/x.jpg'), STEAM_COVER_OVERRIDES[3527290])
  // 已经在首选地址上的不做二次改写
  assert.equal(resolveSteamCoverUrl(730, 'https://shared.steamstatic.com/store_item_assets/steam/apps/730/header.jpg'), 'https://shared.steamstatic.com/store_item_assets/steam/apps/730/header.jpg')
  // AppID 与 URL 里的编号不一致时不动
  assert.equal(resolveSteamCoverUrl(730, 'https://cdn.akamai.steamstatic.com/steam/apps/999/header.jpg'), 'https://cdn.akamai.steamstatic.com/steam/apps/999/header.jpg')
  // 非 header.jpg 的旧路径不动
  assert.equal(resolveSteamCoverUrl(730, 'https://cdn.akamai.steamstatic.com/steam/apps/730/capsule_616x353.jpg'), 'https://cdn.akamai.steamstatic.com/steam/apps/730/capsule_616x353.jpg')
})
