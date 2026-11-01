/**
 * 封面地址的首选映射。
 *
 * 背景（2026-11-01 实测，见 var/reports/steam-cover-check/）：
 *
 * 1. `cdn.akamai.steamstatic.com` 在本地网络被 DNS 解析到 127.0.0.1，
 *    旧的 `https://cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg` 会先请求失败。
 * 2. 其中 140 款的同一张图在 `https://shared.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg`
 *    可以直接取到（GET 实测 200 + image/jpeg + JPEG 魔数 + 460x215），现已提升为首选。
 * 3. 另外 8 款是较新的应用，旧路径根本没有这个文件（404）。它们的真实封面在带内容哈希的新路径上，
 *    只能从 Steam 商店 AppDetails 的 `header_image` 拿到，必须整条保留哈希路径。
 *
 * 这里的映射只在静态导出层生效：不会改动首次游玩日期、来源、原始时间戳、审计记录或数据库里的游戏资料。
 * 每次重新导出都会重新走一遍 `resolveSteamCoverUrl`，因此不会再退回 Akamai 首选地址。
 */

/** 第 3 类：必须保留完整哈希路径的 8 款。 */
export const STEAM_COVER_OVERRIDES: Readonly<Record<number, string>> = {
  // Counter-Strike:Global Offensive
  4465480: 'https://shared.steamstatic.com/store_item_assets/steam/apps/4465480/a7ec167096e887d775d775fbb8b7b5efc4186291/header.jpg',
  // DragonSword : Awakening
  4570720: 'https://shared.steamstatic.com/store_item_assets/steam/apps/4570720/96a897e98f4472e656fbe6681191b3066cab6056/header.jpg',
  // Touhou Koumakyou: New Classic - the Embodiment of Scarlet Devil
  4659620: 'https://shared.steamstatic.com/store_item_assets/steam/apps/4659620/e1fc78d7ff003b772b8637de6440c541c25fa0b9/header.jpg',
  // How to Fish
  4001890: 'https://shared.steamstatic.com/store_item_assets/steam/apps/4001890/45c4ddff4901e32c4b8b643e1b97d0d01898d299/header.jpg',
  // Far Far West（官方 header 是 alt assets 变体）
  3124540: 'https://shared.steamstatic.com/store_item_assets/steam/apps/3124540/5473eb1bbfdcbd1d1585d47bdc07752caf3105c9/header_alt_assets_4.jpg',
  // F1® 25
  3059520: 'https://shared.steamstatic.com/store_item_assets/steam/apps/3059520/76dc8ac45f1bd6dec26e04434ca1c8814e7bb330/header.jpg',
  // Formula Legends
  3194360: 'https://shared.steamstatic.com/store_item_assets/steam/apps/3194360/28d6f3aa14926a8d40df0fe4c432cbe8343f77e2/header.jpg',
  // PEAK
  3527290: 'https://shared.steamstatic.com/store_item_assets/steam/apps/3527290/31bac6b2eccf09b368f5e95ce510bae2baf3cfcd/header.jpg',
}

/** 首选主机：Fastly，本机网络可正常解析。 */
export const SHARED_COVER_ORIGIN = 'https://shared.steamstatic.com'

/**
 * 第 2 类：已验证 shared.steamstatic.com 上有对应 `store_item_assets/steam/apps/{appid}/header.jpg` 的 140 款。
 * 只有出现在这个白名单里的 AppID 才会被改写成首选地址，避免「只换 hostname 就假定地址有效」。
 */
export const SHARED_PRIMARY_APP_IDS: ReadonlySet<number> = new Set([
  730, 33230, 48700, 210970, 220200, 233860, 234270, 242050, 242860, 244210,
  259810, 289650, 346010, 361420, 365960, 367520, 368340, 386940, 392160, 392280,
  396750, 406350, 413150, 428660, 433340, 447530, 457140, 463710, 477160, 501300,
  502500, 524220, 526870, 530320, 553640, 553850, 558990, 572890, 581320, 582160,
  609320, 632360, 633460, 638230, 646570, 684410, 701160, 731040, 746850, 753640,
  805550, 814380, 837470, 851100, 921570, 941300, 957960, 969990, 990080, 1029780,
  1030300, 1049280, 1161170, 1166290, 1179060, 1205520, 1210320, 1227690, 1241100, 1245620,
  1255560, 1270670, 1277510, 1282150, 1289310, 1293180, 1318690, 1323830, 1329410, 1366540,
  1422450, 1455840, 1467920, 1483870, 1551360, 1556790, 1578650, 1584090, 1627720, 1644940,
  1654660, 1701520, 1712350, 1715460, 1716740, 1746030, 1755830, 1757300, 1771300, 1785650,
  1808500, 1811040, 1820000, 1823930, 1903340, 1915380, 1931770, 1939970, 1942280, 1948280,
  1955830, 1970020, 1971650, 2094270, 2102450, 2116120, 2124120, 2186680, 2215430, 2289650,
  2290180, 2358720, 2379780, 2384580, 2399420, 2407270, 2442460, 2644590, 2853730, 2868840,
  3003460, 3042680, 3065800, 3167020, 3209750, 3229980, 3265060, 3372420, 3404470, 3469190,
])

/** 旧版封面路径，形如 https://<任意 steam CDN 主机>/steam/apps/{appid}/header.jpg */
const LEGACY_COVER_PATTERN = /^https:\/\/[^/]+\/steam\/apps\/(\d+)\/header\.jpg$/i

/** 新的内容哈希路径，形如 .../store_item_assets/steam/apps/{appid}/{40位hash}/header*.jpg */
const HASHED_COVER_PATTERN = /\/store_item_assets\/steam\/apps\/(\d+)\/[0-9a-f]{40}\//

export function isHashedCoverUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && HASHED_COVER_PATTERN.test(url)
}

/**
 * 决定导出时写入的封面地址：
 *   1. 哈希覆盖表 → 原样使用（保证 8 款新应用的哈希路径不被破坏）
 *   2. 已验证的 140 款 + 当前是旧路径 → 换到 shared.steamstatic.com 的首选地址
 *   3. 其他情况保持不变
 */
export function resolveSteamCoverUrl(steamAppId: number | null, current: string | null) {
  if (steamAppId === null) return current

  const override = STEAM_COVER_OVERRIDES[steamAppId]
  if (override) return override

  if (current && SHARED_PRIMARY_APP_IDS.has(steamAppId)) {
    if (HASHED_COVER_PATTERN.test(current)) return current
    const legacy = LEGACY_COVER_PATTERN.exec(current)
    if (legacy && Number(legacy[1]) === steamAppId) {
      return `${SHARED_COVER_ORIGIN}/store_item_assets/steam/apps/${steamAppId}/header.jpg`
    }
  }

  return current
}
