import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openStore, SafeHttpError, syncOwnedGames, type SteamFilmConfig } from './index.ts'
import { exportSteamFilmStaticData } from './steam-film-static.ts'
import { checkSteamNetwork, createSteamHttpClient, resolveSteamProxySettings, SteamOperationError } from './steam-film-http.ts'

const OUTPUT_DIRECTORY = resolve('public/data/steam-film')

function databasePathFromEnvironment(env: Record<string, string | undefined>) {
  const path = resolve(env.STEAM_FILM_DATABASE_PATH?.trim() || './var/steam-film.sqlite')
  const publicRoots = [resolve('public'), resolve('dist')]
  if (publicRoots.some(root => {
    const rel = relative(root, path)
    return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  })) throw new Error('Steam Film 数据库必须位于 public/ 和 dist/ 以外。')
  return path
}

export function readLocalSteamFilmConfig(env: Record<string, string | undefined> = process.env): SteamFilmConfig {
  const ownerId = env.STEAM_OWNER_ID?.trim() || ''
  const apiKey = env.STEAM_WEB_API_KEY?.trim() || ''
  if (!/^\d{17}$/.test(ownerId)) throw new Error('请在 .env.steam-film.local 配置有效的 STEAM_OWNER_ID。')
  if (!/^[a-f\d]{32}$/i.test(apiKey)) throw new Error('请在 .env.steam-film.local 配置有效的 STEAM_WEB_API_KEY。')
  const proxySettings = resolveSteamProxySettings(env)
  return {
    ownerId,
    apiKey,
    publicOrigin: null,
    sessionSecret: null,
    databasePath: databasePathFromEnvironment(env),
    steamHttpsProxy: proxySettings.url,
    host: '127.0.0.1',
    port: 8788,
    production: false,
  }
}

async function sync(config: SteamFilmConfig, fetcher: typeof fetch) {
  const db = openStore(config.databasePath)
  try {
    const result = await syncOwnedGames(db, config, { steamId: config.ownerId! }, fetcher, { enforceCooldown: false })
    return result
  } finally {
    db.close()
  }
}

async function exportData(databasePath: string) {
  if (!existsSync(databasePath)) throw new Error('本地 Steam Film 数据库还不存在；先运行 npm run steam:sync。')
  const db = new DatabaseSync(databasePath, { readOnly: true })
  try {
    return await exportSteamFilmStaticData(db, OUTPUT_DIRECTORY)
  } finally {
    db.close()
  }
}

export interface SteamFilmCliDependencies {
  fetcher?: typeof fetch
  log?: (line: string) => void
}

export async function runSteamFilmCommand(
  command: string,
  env: Record<string, string | undefined> = process.env,
  dependencies: SteamFilmCliDependencies = {},
) {
  if (!['sync', 'export', 'update', 'network-check'].includes(command)) {
    throw new Error('用法：npm run steam:sync | steam:export | steam:update | steam:network-check')
  }

  if (command === 'network-check') {
    const log = dependencies.log ?? console.log
    let client
    try {
      const proxySettings = resolveSteamProxySettings(env)
      client = createSteamHttpClient(proxySettings, dependencies.fetcher ?? fetch)
      await checkSteamNetwork(client.fetch)
      const route = client.mode === 'direct' ? '直连' : `代理（${client.proxySource}）`
      log(`Steam 网络诊断成功；连接方式：${route}。未访问游戏库或本地数据库。`)
      return { success: true, mode: client.mode, proxySource: client.proxySource }
    } catch (error) {
      if (error instanceof SteamOperationError) {
        const detail = error.systemErrorCode ? `；系统错误码：${error.systemErrorCode}` : error.httpStatus ? `；HTTP 状态：${error.httpStatus}` : ''
        const route = client?.mode === 'proxy' ? '代理' : client?.mode === 'direct' ? '直连' : '代理配置'
        log(`Steam 网络诊断失败；连接方式：${route}；类别：${error.category}${detail}。`)
        return { success: false, mode: client?.mode ?? 'proxy', category: error.category }
      }
      log('Steam 网络诊断失败；类别：steam-network-error。')
      return { success: false, mode: client?.mode ?? 'direct', category: 'steam-network-error' }
    } finally {
      try { await client?.close() } catch { /* Do not log proxy internals. */ }
    }
  }

  if (command === 'export') {
    const databasePath = databasePathFromEnvironment(env)
    const result = await exportData(databasePath)
    console.log(`已导出 ${result.gameCount} 款游戏；月报条目 ${result.monthlyCount}。`)
    console.log(`公开文件：${result.archivePath} 和 ${result.monthlyPath}`)
    console.log('导出只读取数据库，不会请求 Steam 或创建历史快照。')
    return
  }

  const config = readLocalSteamFilmConfig(env)
  const client = createSteamHttpClient(resolveSteamProxySettings(env), dependencies.fetcher ?? fetch)
  let result: Awaited<ReturnType<typeof sync>>
  try {
    result = await sync(config, client.fetch)
  } finally {
    try { await client.close() } catch { /* Do not log proxy internals. */ }
  }
  console.log(`同步成功：游戏列表 ${result.sampledGameCount} 款，档案保留 ${result.gameCount} 款。`)
  console.log(`历史快照 ${result.snapshotCount} 条；检测到时长倒退 ${result.regressionCount} 条。`)
  console.log(`最近成功同步：${result.lastSyncedAt}（UTC）；批次 ${result.batchId}。`)

  if (command === 'update') {
    const exported = await exportData(config.databasePath)
    console.log(`静态 JSON 已更新：${exported.archivePath} 和 ${exported.monthlyPath}`)
  }
}

function isDirectRun() {
  const entry = process.argv[1]
  return Boolean(entry && import.meta.url === pathToFileURL(resolve(entry)).href)
}

if (isDirectRun()) {
  const command = process.argv[2] || ''
  void runSteamFilmCommand(command).then(result => {
    if (command === 'network-check' && result?.success === false) process.exitCode = 1
  }).catch(error => {
    if (error instanceof SteamOperationError) {
      const detail = error.systemErrorCode ? `；系统错误码：${error.systemErrorCode}` : ''
      console.error(`Steam Film 操作失败；类别：${error.category}${detail}。`)
    } else if (error instanceof SafeHttpError) {
      console.error(`${error.message} 类别：${error.failureCode}。`)
    } else if (error instanceof Error && /STEAM_OWNER_ID|STEAM_WEB_API_KEY|数据库必须位于|用法：/.test(error.message)) {
      console.error(error.message)
    } else {
      console.error('Steam Film 本地操作失败；底层详情已隐藏。')
    }
    process.exitCode = 1
  })
}
