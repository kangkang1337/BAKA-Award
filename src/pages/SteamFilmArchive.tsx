import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { ArrowLeft, ArrowRight, Clock3, Film, Gamepad2, Info, RotateCw, X } from 'lucide-react'
import type { SteamFilmArchiveData, SteamFilmGame } from '../types/steam-film'
import { isSteamFilmArchive, resolveSteamFilmArchiveUrl } from '../data/steam-film-static'
import '../styles/steam-film-archive.css'

const ARCHIVE_URL = resolveSteamFilmArchiveUrl(import.meta.env.BASE_URL, window.location.href)

function parseDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

function parseDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function dateDescription(game: SteamFilmGame) {
  if (game.firstPlayedAt) return { label: '已确认首次游玩', date: parseDate(game.firstPlayedAt) }
  if (game.firstSeenAt) return { label: '网站首次记录', date: parseDate(game.firstSeenAt) }
  if (game.firstAchievementAt) return { label: '最早成就解锁', date: parseDate(game.firstAchievementAt) }
  return { label: '日期待确认', date: null }
}

function dateGroup(game: SteamFilmGame) {
  if (game.firstPlayedAt) return 0
  if (game.firstSeenAt) return 1
  if (game.firstAchievementAt) return 2
  return 3
}

function sortTimeline(games: SteamFilmGame[]) {
  return [...games].sort((a, b) => {
    const groupDifference = dateGroup(a) - dateGroup(b)
    if (groupDifference) return groupDifference
    const aDate = a.firstPlayedAt ?? a.firstSeenAt ?? a.firstAchievementAt
    const bDate = b.firstPlayedAt ?? b.firstSeenAt ?? b.firstAchievementAt
    if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate)
    return a.name.localeCompare(b.name)
  })
}

function duration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return 'Steam 未提供'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? `${hours.toLocaleString('zh-CN')} 小时 ${remainder} 分钟` : `${remainder} 分钟`
}

function FilmCover({ game, className = '' }: { game: SteamFilmGame; className?: string }) {
  const [failed, setFailed] = useState(false)
  return <div className={`steam-film-cover ${failed || !game.headerImage ? 'steam-film-cover--missing' : ''} ${className}`}>
    {game.headerImage && !failed
      ? <img src={game.headerImage} alt={`${game.name} Steam 封面`} loading="lazy" decoding="async" onError={() => setFailed(true)}/>
      : <span><Gamepad2 size={23}/><small>FRAME / {String(game.steamAppId).padStart(6, '0')}</small></span>}
  </div>
}

function FilmDetails({ game, onClose }: { game: SteamFilmGame; onClose: () => void }) {
  const date = dateDescription(game)
  const achievementText = game.achievementCount !== null && game.achievementTotal !== null
    ? `${game.achievementCount} / ${game.achievementTotal}`
    : '尚无可靠数据'

  return <section className="steam-film-detail" id="steam-film-detail" aria-live="polite" key={game.steamAppId}>
    <div className="steam-film-detail__image-wrap">
      <FilmCover game={game} className="steam-film-detail__image"/>
      <span className="steam-film-detail__frame-label">FRAME / {String(game.steamAppId).padStart(6, '0')}</span>
      <span className="steam-film-detail__sprocket" aria-hidden="true">●　●　●　●</span>
    </div>
    <div className="steam-film-detail__copy">
      <div className="steam-film-detail__topline"><span>STEAM APP / {game.steamAppId}</span><button onClick={onClose} aria-label="收起游戏档案"><X size={16}/><span>收起</span></button></div>
      <h2>{game.name}</h2>
      <p className="steam-film-detail__archive-note">{game.personalNote || '还没有为这款游戏留下个人备注。'}</p>
      <dl className="steam-film-facts">
        <div><dt><Clock3 size={13}/>{date.label}</dt><dd>{date.date ?? '日期待确认'}</dd></div>
        <div><dt><Clock3 size={13}/>最近游玩</dt><dd>{parseDate(game.lastPlayedAt) ?? 'Steam 未提供'}</dd></div>
        <div><dt>累计游玩时间</dt><dd>{duration(game.playtimeMinutes)}</dd></div>
        <div><dt>近期游玩时间</dt><dd>{duration(game.playtimeRecentMinutes)}</dd></div>
        <div><dt>已解锁成就</dt><dd>{achievementText}</dd></div>
      </dl>
      <div className="steam-film-detail__source"><Info size={14}/><span>{game.dataSource || '由本地 Steam Film 同步程序采集并生成静态档案。'}</span></div>
    </div>
  </section>
}

export function SteamFilmArchive({ onHome }: { onHome: () => void }) {
  const [archive, setArchive] = useState<SteamFilmArchiveData | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<{ x: number; scrollLeft: number; pointerId: number } | null>(null)
  const dragged = useRef(false)
  const suppressClick = useRef(false)
  const orderedGames = useMemo(() => sortTimeline(archive?.games ?? []), [archive?.games])
  const selectedGame = orderedGames.find(game => game.steamAppId === selectedAppId) ?? null

  const loadArchive = useCallback(async () => {
    setLoadState('loading')
    setError('')
    try {
      const response = await fetch(ARCHIVE_URL, { credentials: 'omit', cache: 'no-cache' })
      if (!response.ok) throw new Error(`静态档案暂时无法读取（HTTP ${response.status}）。`)
      let value: unknown
      try {
        value = await response.json()
      } catch {
        throw new Error('档案 JSON 无法解析；请重新生成并发布静态数据。')
      }
      if (!isSteamFilmArchive(value)) throw new Error('档案数据格式或版本不兼容；请重新生成 JSON 并发布匹配的网站版本。')
      setArchive(value)
      setSelectedAppId(current => value.games.some(game => game.steamAppId === current) ? current : null)
      setLoadState('ready')
    } catch (reason) {
      setArchive(null)
      setLoadState('error')
      const message = reason instanceof Error ? reason.message : ''
      setError(message.startsWith('静态档案') || message.startsWith('档案')
        ? message
        : '无法连接静态档案文件；请检查 JSON 是否随网站发布，然后重试。')
    }
  }, [])

  useEffect(() => { void loadArchive() }, [loadArchive])

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      event.preventDefault()
      event.currentTarget.scrollLeft += event.shiftKey ? event.deltaY : event.deltaX
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    pointerStart.current = { x: event.clientX, scrollLeft: event.currentTarget.scrollLeft, pointerId: event.pointerId }
    dragged.current = false
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current
    if (!start || start.pointerId !== event.pointerId || !viewportRef.current) return
    const delta = event.clientX - start.x
    if (Math.abs(delta) > 6 && !dragged.current) {
      dragged.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    if (dragged.current) {
      event.preventDefault()
      viewportRef.current.scrollLeft = start.scrollLeft - delta
    }
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current || pointerStart.current.pointerId !== event.pointerId) return
    suppressClick.current = dragged.current
    pointerStart.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    window.setTimeout(() => { suppressClick.current = false }, 0)
  }

  const moveTimeline = (direction: -1 | 1) => {
    viewportRef.current?.scrollBy({ left: direction * Math.max(240, viewportRef.current.clientWidth * .72), behavior: 'smooth' })
  }

  return <main className="steam-film-page">
    <header className="steam-film-header">
      <a className="steam-film-brand" href="/" onClick={event => { event.preventDefault(); onHome() }} aria-label="返回 BAKA AWARD 首页"><span>B.</span><b>BAKA AWARD</b><i>/</i><small>FILM ARCHIVE</small></a>
      <div className="steam-film-header__right">
        <span className="steam-film-header__folio">STATIC ARCHIVE / FRAME INDEX</span>
      </div>
    </header>

    <section className="steam-film-intro">
      <div className="steam-film-intro__copy">
        <div className="steam-film-kicker"><Film size={14}/> BAKA AWARD — STEAM FILM ARCHIVE</div>
        <h1>Every game<br/><em>leaves a frame.</em></h1>
        <p>每一款游戏，都留下过一帧。</p>
      </div>
      <div className="steam-film-intro__aside"><span>PERSONAL GAME ARCHIVE</span><b>{archive?.lastSuccessfulSyncAt ? parseDateTime(archive.lastSuccessfulSyncAt) : 'NOT SYNCED'}</b><small>LAST SUCCESSFUL SYNC</small></div>
      <div className="steam-film-rule" aria-hidden="true"><span>ROLL NO. —</span><i/><span>STEAM COLLECTION</span></div>
    </section>

    <section className="steam-film-reel" aria-label="Steam 游戏胶片时间轴">
      <div className="steam-film-reel__heading">
        <div><span>01 / THE REEL</span><h2>沿着游玩记录，慢慢经过</h2></div>
        <div className="steam-film-reel__controls">
          <span aria-live="polite">{loadState === 'loading' ? '读取静态档案…' : loadState === 'error' ? 'ARCHIVE UNAVAILABLE' : `PUBLIC ARCHIVE · ${orderedGames.length} FRAMES`}</span>
          <button onClick={() => moveTimeline(-1)} aria-label="胶片向左浏览" disabled={loadState !== 'ready' || orderedGames.length === 0}><ArrowLeft size={17}/></button>
          <button onClick={() => moveTimeline(1)} aria-label="胶片向右浏览" disabled={loadState !== 'ready' || orderedGames.length === 0}><ArrowRight size={17}/></button>
        </div>
      </div>

      {loadState === 'ready' && <div className="steam-film-static-notice"><Info size={15}/><span>这是可公开下载的静态档案。Steam 同步需在本机运行 <code>npm run steam:update</code>，随后重新发布生成的 JSON；网页不会连接 Steam 或启动本地程序。最近成功同步：{archive?.lastSuccessfulSyncAt ? parseDateTime(archive.lastSuccessfulSyncAt) : '尚无记录'}。</span></div>}

      {loadState === 'loading' ? <div className="steam-film-empty" role="status"><RotateCw size={23} className="is-spinning"/><p>正在读取静态游戏档案…</p></div>
      : loadState === 'error' ? <div className="steam-film-empty steam-film-load-error" role="alert"><Film size={25}/><p>档案数据暂时不可用</p><small>{error}</small><button onClick={() => void loadArchive()}><RotateCw size={13}/>重新读取</button></div>
      : orderedGames.length ? <div className="steam-film-viewport-wrap">
        <div className="steam-film-tape-cap steam-film-tape-cap--left" aria-hidden="true"/>
        <div className="steam-film-viewport" ref={viewportRef} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <ol className="steam-film-track" aria-label="Steam 游戏静态档案">
            {orderedGames.map((game, index) => {
              const isSelected = selectedAppId === game.steamAppId
              const date = dateDescription(game)
              return <li className={`steam-film-frame ${isSelected ? 'is-selected' : ''}`} key={game.steamAppId}>
                <button className="steam-film-frame__button" aria-expanded={isSelected} aria-controls={isSelected ? 'steam-film-detail' : undefined} onClick={() => {
                  if (suppressClick.current) return
                  setSelectedAppId(current => current === game.steamAppId ? null : game.steamAppId)
                }}>
                  <span className="steam-film-frame__top"><span>FRAME {String(index + 1).padStart(2, '0')}</span><i>BA / {String(game.steamAppId).slice(-4)}</i></span>
                  <FilmCover game={game}/>
                  <span className="steam-film-frame__caption"><b>{game.name}</b><small>{date.date ? `${date.label} · ${date.date}` : date.label}</small></span>
                  <span className="steam-film-frame__bottom"><i>{date.date?.slice(0, 4) ?? 'DATE / ?'}</i><span>{isSelected ? 'OPEN FRAME' : 'SELECT FRAME'}</span></span>
                </button>
              </li>
            })}
            <li className="steam-film-end" aria-label="胶片结尾"><span>END<br/>OF<br/>REEL</span></li>
          </ol>
        </div>
        <div className="steam-film-tape-cap steam-film-tape-cap--right" aria-hidden="true"/>
      </div> : <div className="steam-film-empty"><Film size={25}/><p>{archive?.lastSuccessfulSyncAt ? '最近一次同步没有记录可展示的游戏。' : '还没有生成 Steam 游戏档案。'}</p><small>在本地配置 Steam API Key 后运行 npm run steam:update，再将公开 JSON 与网站一起发布。游戏详情隐私设置可能影响 Steam 返回的数据。</small></div>}

      <div className="steam-film-reel__foot"><span>← 拖动胶片 / 横向滚轮浏览 →</span><span>触屏可横向滑动 · 点击画格展开</span></div>

      {selectedGame
        ? <FilmDetails game={selectedGame} onClose={() => setSelectedAppId(null)}/>
        : <div className="steam-film-selection-hint"><i/><span>从任意一格开始。相邻的帧，会带你回到另一个世界。</span></div>}
    </section>

    <section className="steam-film-date-note"><span>DATE / SOURCE NOTES</span><p>首次游玩、网站首次记录、最早成就和最近游玩会分开标注。Steam 常规接口不能证明首次启动日期；无法可靠确认时，时间留空。静态 JSON 面向所有访客公开，月度统计只在本地历史快照提供足够证据后生成。</p></section>

    <footer className="steam-film-footer"><button onClick={onHome}><ArrowLeft size={14}/>回到 BAKA AWARD 年度档案</button><span>END OF THIS REEL · TO BE CONTINUED</span></footer>
  </main>
}
