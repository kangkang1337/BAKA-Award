import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import { openStore } from './index.ts'
import { exportSteamFilmStaticData } from './steam-film-static.ts'
import { bindLoopback, LOCAL_LOOPBACK_HOST } from './loopback.ts'
import {
  applyFirstPlayImportDecisions,
  buildFirstPlayImportPreview,
  createFirstPlayEntry,
  deleteFirstPlayEntry,
  FirstPlayInputError,
  listFirstPlayCandidates,
  listFirstPlayEntries,
  parseFirstPlayImport,
  updateFirstPlayEntry,
  type FirstPlayImportDecision,
  type FirstPlayEntryInput,
  type ImportedFirstPlayRecord,
} from './first-play-timeline.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = resolve(projectRoot, process.env.STEAM_FILM_DATABASE_PATH?.trim() || './var/steam-film-static.sqlite')
const expectedDbPath = resolve(projectRoot, 'var/steam-film-static.sqlite')
const legacyDbPath = resolve(projectRoot, 'var/steam-film.sqlite')
const host = LOCAL_LOOPBACK_HOST
const port = Number(process.env.TIMELINE_MANAGER_PORT || 8789)
const staticOutput = resolve(projectRoot, 'public/data/steam-film')
const importDirectory = resolve(projectRoot, 'var/imports/heybox-first-play')
const csrfToken = randomBytes(32).toString('base64url')
const previews = new Map<string, { rows: ImportedFirstPlayRecord[]; expiresAt: number }>()
const MAX_BODY_BYTES = 8_500_000

if (dbPath !== expectedDbPath || dbPath === legacyDbPath) {
  throw new Error('First Play Manager 仅允许使用 var/steam-film-static.sqlite；检查 STEAM_FILM_DATABASE_PATH。')
}
if (!existsSync(dbPath)) {
  throw new Error('找不到 var/steam-film-static.sqlite。请先确认已有的新 Steam Film 数据库已放在本地 var/ 目录中。')
}
if (realpathSync(dbPath) === (existsSync(legacyDbPath) ? realpathSync(legacyDbPath) : legacyDbPath)) {
  throw new Error('拒绝打开旧版 var/steam-film.sqlite。')
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('TIMELINE_MANAGER_PORT 必须在 1024 到 65535 之间。')

const db = openStore(dbPath)

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.end(JSON.stringify(body))
}

function sendText(response: ServerResponse, status: number, text: string, contentType = 'text/plain; charset=utf-8') {
  response.statusCode = status
  response.setHeader('Content-Type', contentType)
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.end(text)
}

function allowedHost(request: IncomingMessage) {
  const value = request.headers.host?.toLowerCase() || ''
  return value === `${host}:${port}` || value === `localhost:${port}` || value === host || value === 'localhost'
}

function originAllowed(request: IncomingMessage) {
  return request.headers.origin === `http://${host}:${port}`
}

function mutationAllowed(request: IncomingMessage, response: ServerResponse) {
  if (!originAllowed(request)) {
    sendJson(response, 403, { error: '请求来源校验失败。请只从本机管理页面操作。' })
    return false
  }
  if (request.headers['x-csrf-token'] !== csrfToken) {
    sendJson(response, 403, { error: '页面校验已过期，请刷新后重试。' })
    return false
  }
  return true
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.length
    if (length > MAX_BODY_BYTES) throw new FirstPlayInputError('请求内容超过 2 MB。')
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new FirstPlayInputError('请求 JSON 必须是对象。')
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof FirstPlayInputError) throw error
    throw new FirstPlayInputError('请求 JSON 无法解析。')
  }
}

function serializeRow(row: ImportedFirstPlayRecord) {
  const { originalData: _originalData, ...safeRow } = row
  return safeRow
}

function prunePreviews() {
  const now = Date.now()
  for (const [id, preview] of previews) if (preview.expiresAt <= now) previews.delete(id)
  while (previews.size > 5) previews.delete(previews.keys().next().value!)
}

async function refreshPublicFiles() {
  try {
    await exportSteamFilmStaticData(db, staticOutput)
    return null
  } catch {
    return '记录已保存到本地数据库，但静态 JSON 导出失败；可稍后点击“重新生成时间轴 JSON”。'
  }
}

async function serve(request: IncomingMessage, response: ServerResponse) {
  if (!allowedHost(request)) return sendJson(response, 403, { error: '只允许通过本机回环地址访问。' })
  const requestUrl = new URL(request.url || '/', `http://${host}:${port}`)
  const pathname = decodeURIComponent(requestUrl.pathname)

  if (request.method === 'GET' && pathname === '/') {
    const html = await readFile(new URL('./first-play-manager.html', import.meta.url), 'utf8')
    const page = html.replace('%%CSRF_TOKEN%%', csrfToken)
    response.statusCode = 200
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.akamai.steamstatic.com https://shared.akamai.steamstatic.com https://steamcdn-a.akamaihd.net data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    response.end(page)
    return
  }
  if (request.method === 'GET' && pathname === '/manager.js') {
    return sendText(response, 200, await readFile(new URL('./first-play-manager.js', import.meta.url), 'utf8'), 'text/javascript; charset=utf-8')
  }
  if (request.method === 'GET' && pathname === '/manager.css') {
    return sendText(response, 200, await readFile(new URL('./first-play-manager.css', import.meta.url), 'utf8'), 'text/css; charset=utf-8')
  }
  if (request.method === 'GET' && pathname === '/docs/first-play-timeline-template.csv') {
    return sendText(response, 200, await readFile(resolve(projectRoot, 'docs/first-play-timeline-template.csv'), 'utf8'), 'text/csv; charset=utf-8')
  }
  if (request.method === 'GET' && pathname === '/docs/first-play-timeline-template.json') {
    return sendText(response, 200, await readFile(resolve(projectRoot, 'docs/first-play-timeline-template.json'), 'utf8'), 'application/json; charset=utf-8')
  }
  if (request.method === 'GET' && pathname === '/api/timeline/entries') {
    return sendJson(response, 200, { entries: listFirstPlayEntries(db, requestUrl.searchParams.get('q') || '') })
  }
  if (request.method === 'GET' && pathname === '/api/timeline/candidates') {
    return sendJson(response, 200, { candidates: listFirstPlayCandidates(db, requestUrl.searchParams.get('q') || '') })
  }
  if (request.method === 'GET' && pathname === '/api/timeline/backup') {
    const entries = listFirstPlayEntries(db)
    const payload = JSON.stringify({ format: 'baka-first-play-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), entries }, null, 2)
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Content-Disposition', 'attachment; filename="first-play-timeline-backup.json"')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(payload)
    return
  }
  if (request.method === 'POST' && pathname.startsWith('/api/')) {
    if (!mutationAllowed(request, response)) return
    const body = await readJsonBody(request)
    if (pathname === '/api/timeline/entries') {
      const entry = createFirstPlayEntry(db, {
        steamAppId: body.steamAppId as number | null | undefined,
        customGameId: body.customGameId as string | null | undefined,
        gameName: body.gameName as string,
        firstPlayedOn: body.firstPlayedOn as string | null | undefined,
        datePrecision: body.datePrecision as FirstPlayEntryInput['datePrecision'],
        personalNote: body.personalNote as string | null | undefined,
      })
      const exportError = await refreshPublicFiles()
      return sendJson(response, exportError ? 202 : 201, { entry, exportError })
    }
    if (pathname === '/api/timeline/import/preview') {
      if (typeof body.content !== 'string' || typeof body.fileName !== 'string') throw new FirstPlayInputError('请选择 CSV 或 JSON 文件。')
      const extension = extname(body.fileName).toLowerCase()
      if (!['.csv', '.json'].includes(extension)) throw new FirstPlayInputError('只支持 CSV 或 JSON 文件。')
      if (Buffer.byteLength(body.content, 'utf8') > 2_000_000) throw new FirstPlayInputError('导入文件不能超过 2 MB。')
      await mkdir(importDirectory, { recursive: true })
      const sourcePath = resolve(importDirectory, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}${extension}`)
      const importRoot = relative(importDirectory, sourcePath)
      if (importRoot.startsWith(`..${sep}`) || isAbsolute(importRoot)) throw new FirstPlayInputError('导入文件路径无效。')
      await writeFile(sourcePath, body.content, { encoding: 'utf8', flag: 'wx' })
      const records = parseFirstPlayImport(body.content, extension === '.csv' ? 'csv' : 'json')
      const preview = buildFirstPlayImportPreview(db, records)
      prunePreviews()
      const previewId = randomUUID()
      previews.set(previewId, { rows: preview.rows, expiresAt: Date.now() + 30 * 60 * 1000 })
      return sendJson(response, 200, { previewId, summary: preview.summary, rows: preview.rows.map(serializeRow), expiresInMinutes: 30 })
    }
    if (pathname === '/api/timeline/import/confirm') {
      prunePreviews()
      const previewId = typeof body.previewId === 'string' ? body.previewId : ''
      const preview = previews.get(previewId)
      if (!preview) throw new FirstPlayInputError('导入预览已过期，请重新上传。')
      if (!Array.isArray(body.decisions)) throw new FirstPlayInputError('缺少导入确认结果。')
      const decisions = body.decisions as FirstPlayImportDecision[]
      const result = applyFirstPlayImportDecisions(db, preview.rows, decisions)
      previews.delete(previewId)
      const exportError = await refreshPublicFiles()
      return sendJson(response, exportError ? 202 : 200, { ...result, exportError })
    }
    if (pathname === '/api/timeline/export') {
      const exported = await exportSteamFilmStaticData(db, staticOutput)
      return sendJson(response, 200, { entryCount: exported.timelineCount, generated: true })
    }
    return sendJson(response, 404, { error: '本地管理接口不存在。' })
  }
  if (request.method === 'PATCH' && pathname.startsWith('/api/timeline/entries/')) {
    if (!mutationAllowed(request, response)) return
    const body = await readJsonBody(request)
    const id = pathname.slice('/api/timeline/entries/'.length)
    const entry = updateFirstPlayEntry(db, id, {
      gameName: body.gameName as string | undefined,
      firstPlayedOn: body.firstPlayedOn as string | null | undefined,
      datePrecision: body.datePrecision as FirstPlayEntryInput['datePrecision'],
      personalNote: body.personalNote as string | null | undefined,
    })
    const exportError = await refreshPublicFiles()
    return sendJson(response, exportError ? 202 : 200, { entry, exportError })
  }
  if (request.method === 'DELETE' && pathname.startsWith('/api/timeline/entries/')) {
    if (!mutationAllowed(request, response)) return
    const body = await readJsonBody(request)
    if (body.confirm !== true) throw new FirstPlayInputError('删除前需要再次确认。')
    const id = pathname.slice('/api/timeline/entries/'.length)
    deleteFirstPlayEntry(db, id)
    const exportError = await refreshPublicFiles()
    return sendJson(response, exportError ? 202 : 200, { deleted: true, exportError })
  }
  return sendJson(response, 404, { error: '页面或接口不存在。' })
}

const server = createServer((request, response) => {
  void serve(request, response).catch(error => {
    if (error instanceof FirstPlayInputError) return sendJson(response, 400, { error: error.message })
    if (error instanceof SyntaxError) return sendJson(response, 400, { error: '请求格式无效。' })
    sendJson(response, 500, { error: '本地操作失败；数据库和静态文件详情不会显示在页面中。' })
  })
})

server.on('close', () => db.close())
bindLoopback(server, port).on('listening', () => {
  console.log(`First Play Manager 已在本机启动：http://${host}:${port}`)
  console.log('只监听 127.0.0.1；不会请求 Steam，也不会启动公网服务。')
  void refreshPublicFiles().then(error => {
    if (error) console.error('时间轴已启动，但本地静态 JSON 尚未生成；可在管理页面点击“重新生成时间轴 JSON”。')
    else console.log('本地时间轴 JSON 已从当前 SQLite 档案刷新。')
  })
})

function isDirectRun() {
  const entry = process.argv[1]
  return Boolean(entry && import.meta.url === pathToFileURL(resolve(entry)).href)
}

if (!isDirectRun()) server.close()
