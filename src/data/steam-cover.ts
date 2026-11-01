/**
 * 封面回退候选生成。
 *
 * Steam 的封面有两套路径：
 *   旧：  /steam/apps/{appid}/header.jpg                    （仅在 cdn.* 主机上）
 *   新：  /store_item_assets/steam/apps/{appid}/{hash}/header.jpg（仅在 shared.* 主机上）
 * 而且 cdn.akamai.steamstatic.com 在部分网络会被 DNS 劫持到 127.0.0.1。
 * 所以前端在图片加载失败时按下面的顺序换地址，都不行才显示占位图。
 */

/** 新路径（store_item_assets）可用的主机。 */
export const COVER_ITEM_HOSTS = [
  'shared.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'shared.akamai.steamstatic.com',
] as const

/** 旧路径（/steam/apps/...）可用的主机。 */
export const COVER_LEGACY_HOSTS = [
  'cdn.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
] as const

/** 带内容哈希的新路径，形如 /store_item_assets/steam/apps/{appid}/{40位hash}/header*.jpg */
const HASHED_ITEM_PATH = /^\/store_item_assets\/steam\/apps\/\d+\/[0-9a-f]{40}\//

/**
 * 生成某条记录的封面候选地址：首选地址 → 换主机 → 新旧路径互转 → 兜底构造。
 * 结果去重且顺序稳定，调用方按顺序逐个尝试即可，不会产生循环。
 */
export function coverCandidates(steamAppId: number | null, primary: string | null | undefined): string[] {
  const list: string[] = []
  const push = (value: string | null | undefined) => {
    if (value && !list.includes(value)) list.push(value)
  }

  push(primary)

  let handledSteamHost = false
  if (primary) {
    try {
      const parsed = new URL(primary)
      const isItemPath = parsed.pathname.startsWith('/store_item_assets/')
      const isLegacyPath = parsed.pathname.startsWith('/steam/apps/')
      if (isItemPath) {
        // 新路径：换主机即可，路径（含内容哈希）完全保留；哈希路径是权威地址，不再猜别的路径
        for (const host of COVER_ITEM_HOSTS) push(`https://${host}${parsed.pathname}`)
        // 没有哈希段的普通新路径，最后还可以退回旧路径（cdn.* 主机上的同一张图）
        if (!HASHED_ITEM_PATH.test(parsed.pathname) && steamAppId !== null) {
          for (const host of COVER_LEGACY_HOSTS) push(`https://${host}/steam/apps/${steamAppId}/header.jpg`)
        }
        handledSteamHost = true
      } else if (isLegacyPath) {
        // 旧路径：cdn.* 主机保持路径不变，shared.* 主机需要 /store_item_assets 前缀
        for (const host of COVER_LEGACY_HOSTS) push(`https://${host}${parsed.pathname}`)
        for (const host of COVER_ITEM_HOSTS) push(`https://${host}/store_item_assets${parsed.pathname}`)
        handledSteamHost = true
      }
    } catch {
      // 非法 URL：保留原值，后面按 AppID 兜底
    }
  }

  // 没有可用首选地址（或首选地址不是 Steam CDN）时，按 AppID 构造标准地址
  if (steamAppId !== null && !handledSteamHost) {
    for (const host of COVER_ITEM_HOSTS) push(`https://${host}/store_item_assets/steam/apps/${steamAppId}/header.jpg`)
    for (const host of COVER_LEGACY_HOSTS) push(`https://${host}/steam/apps/${steamAppId}/header.jpg`)
  }

  return list
}
