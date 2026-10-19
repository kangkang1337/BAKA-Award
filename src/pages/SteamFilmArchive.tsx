import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { ArrowLeft, ArrowRight, Clock3, Film, Gamepad2, Info, LockKeyhole, LogIn, RotateCw, X } from 'lucide-react'
import type { SteamFilmGame, SteamFilmStatus } from '../types/steam-film'
import { steamFilmPreviewGames } from '../data/steam-film-preview'
import '../styles/steam-film-archive.css'

const API = '/api/steam-film'

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

async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(value.error || `请求失败（${response.status}）`)
  return value
}

function FilmCover({ game, className = '' }: { game: SteamFilmGame; className?: string }) {
  const [failed, setFailed] = useState(false)
  return <div className={`steam-film-cover ${failed || !game.headerImage ? 'steam-film-cover--missing' : ''} ${className}`}>
    {game.headerImage && !failed
      ? <img src={game.headerImage} alt={`${game.name} Steam 封面`} loading="lazy" decoding="async" onError={() => setFailed(true)}/>
      : <span><Gamepad2 size={23}/><small>FRAME / {String(game.steamAppId).padStart(6, '0')}</small></span>}
  </div>
}

function FilmDetails({ game, onClose, preview }: { game: SteamFilmGame; onClose: () => void; preview: boolean }) {
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
      <div className="steam-film-detail__topline"><span>{preview ? 'SAMPLE FRAME / 预览样片' : `STEAM APP / ${game.steamAppId}`}</span><button onClick={onClose} aria-label="收起游戏档案"><X size={16}/><span>收起</span></button></div>
      <h2>{game.name}</h2>
      <p className="steam-film-detail__archive-note">{game.personalNote || (preview ? '这是用于查看胶片交互的样例画格。连接自己的 Steam 档案后，这里会显示实际记录。' : '还没有为这款游戏留下个人备注。')}</p>
      <dl className="steam-film-facts">
        <div><dt><Clock3 size={13}/>{date.label}</dt><dd>{date.date ?? '日期待确认'}</dd></div>
        <div><dt><Clock3 size={13}/>最近游玩</dt><dd>{parseDate(game.lastPlayedAt) ?? 'Steam 未提供'}</dd></div>
        <div><dt>累计游玩时间</dt><dd>{preview ? '未载入样例时长' : duration(game.playtimeMinutes)}</dd></div>
        <div><dt>近期游玩时间</dt><dd>{preview ? '未载入样例时长' : duration(game.playtimeRecentMinutes)}</dd></div>
        <div><dt>已解锁成就</dt><dd>{preview ? '未载入样例数据' : achievementText}</dd></div>
      </dl>
      <div className="steam-film-detail__source"><Info size={14}/><span>{game.dataSource}</span></div>
    </div>
  </section>
}

export function SteamFilmArchive({ onHome }: { onHome: () => void }) {
  const [status, setStatus] = useState<SteamFilmStatus | null>(null)
  const [games, setGames] = useState<SteamFilmGame[]>(steamFilmPreviewGames)
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<{ x: number; scrollLeft: number; pointerId: number } | null>(null)
  const dragged = useRef(false)
  const suppressClick = useRef(false)
  const orderedGames = useMemo(() => sortTimeline(games), [games])
  const selectedGame = orderedGames.find(game => game.steamAppId === selectedAppId) ?? null
  const preview = !status?.authenticated

  const loadArchive = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const nextStatus = await readJson<SteamFilmStatus>(await fetch(`${API}/status`, { credentials: 'same-origin' }))
      setStatus(nextStatus)
      if (nextStatus.authenticated) {
        const response = await readJson<{ games: SteamFilmGame[] }>(await fetch(`${API}/games`, { credentials: 'same-origin' }))
        setGames(response.games)
        setSelectedAppId(current => response.games.some(game => game.steamAppId === current) ? current : null)
      } else {
        setGames(steamFilmPreviewGames)
      }
    } catch {
      setStatus(null)
      setGames(steamFilmPreviewGames)
      setError('档案服务目前无法连接。以下仍是交互样例，不是你的 Steam 游戏库。')
    } finally {
      setIsLoading(false)
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
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current
    if (!start || start.pointerId !== event.pointerId || !viewportRef.current) return
    const delta = event.clientX - start.x
    if (Math.abs(delta) > 6) dragged.current = true
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

  const sync = async () => {
    if (!status?.csrfToken || isSyncing) return
    setIsSyncing(true)
    setError('')
    try {
      await readJson(await fetch(`${API}/sync`, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': status.csrfToken } }))
      await loadArchive()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '同步失败，请稍后再试。')
    } finally {
      setIsSyncing(false)
    }
  }

  const logout = async () => {
    if (!status?.csrfToken) return
    try {
      await readJson(await fetch(`${API}/logout`, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': status.csrfToken } }))
      setSelectedAppId(null)
      await loadArchive()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '退出失败，请重试。')
    }
  }

  return <main className="steam-film-page">
    <header className="steam-film-header">
      <a className="steam-film-brand" href="/" onClick={event => { event.preventDefault(); onHome() }} aria-label="返回 BAKA AWARD 首页"><span>B.</span><b>BAKA AWARD</b><i>/</i><small>FILM ARCHIVE</small></a>
      <div className="steam-film-header__right">
        {status?.authenticated
          ? <><span className="steam-film-private"><LockKeyhole size={12}/>仅本人可见</span><button className="steam-film-text-button" onClick={() => void logout()}>退出 Steam</button></>
          : <span className="steam-film-header__folio">PERSONAL ARCHIVE / FRAME INDEX</span>}
      </div>
    </header>

    <section className="steam-film-intro">
      <div className="steam-film-intro__copy">
        <div className="steam-film-kicker"><Film size={14}/> BAKA AWARD — STEAM FILM ARCHIVE</div>
        <h1>Every game<br/><em>leaves a frame.</em></h1>
        <p>每一款游戏，都留下过一帧。</p>
      </div>
      <div className="steam-film-intro__aside"><span>PERSONAL GAME ARCHIVE</span><b>— — : — — : — —</b><small>PLAY / REMEMBER / RETURN</small></div>
      <div className="steam-film-rule" aria-hidden="true"><span>ROLL NO. —</span><i/><span>STEAM COLLECTION</span></div>
    </section>

    <section className="steam-film-reel" aria-label="Steam 游戏胶片时间轴">
      <div className="steam-film-reel__heading">
        <div><span>01 / THE REEL</span><h2>{preview ? '一卷尚未冲洗的样片' : '沿着游玩记录，慢慢经过'}</h2></div>
        <div className="steam-film-reel__controls">
          <span>{isLoading ? '读取档案…' : preview ? `INTERACTION PREVIEW · ${orderedGames.length} SAMPLE FRAMES` : `PRIVATE COLLECTION · ${orderedGames.length} FRAMES`}</span>
          <button onClick={() => moveTimeline(-1)} aria-label="胶片向左浏览"><ArrowLeft size={17}/></button>
          <button onClick={() => moveTimeline(1)} aria-label="胶片向右浏览"><ArrowRight size={17}/></button>
        </div>
      </div>

      {preview && <div className="steam-film-preview-notice"><Info size={15}/><span>{status === null
        ? '目前展示的是交互样例，不是你的 Steam 游戏库。'
        : status.loginAvailable
          ? '目前展示的是交互样例，不是你的 Steam 游戏库；未填入虚构的游玩日期、时长或成就。'
          : '目前展示的是交互样例；服务器尚未配置 Steam 登录。'}</span>
        {status?.loginAvailable && <a href={`${API}/login`}><LogIn size={14}/>使用 Steam 登录</a>}
      </div>}
      {status?.authenticated && <div className="steam-film-sync-row"><span><LockKeyhole size={13}/>仅此 Steam 账号可以查看这卷档案</span><button onClick={() => void sync()} disabled={isSyncing || !status.syncAvailable}><RotateCw size={13} className={isSyncing ? 'is-spinning' : ''}/>{isSyncing ? '正在同步…' : status.syncAvailable ? '手动同步游戏库' : '等待服务器配置 API Key'}</button>
        {status.lastSyncedAt && <small>最近同步：{parseDateTime(status.lastSyncedAt)}</small>}
      </div>}
      {error && <p className="steam-film-error" role="alert">{error}</p>}

      {orderedGames.length ? <div className="steam-film-viewport-wrap">
        <div className="steam-film-tape-cap steam-film-tape-cap--left" aria-hidden="true"/>
        <div className="steam-film-viewport" ref={viewportRef} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <ol className="steam-film-track" aria-label={preview ? '交互样例画格' : '你的 Steam 游戏记录'}>
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
      </div> : <div className="steam-film-empty"><Film size={25}/><p>{status?.authenticated
        ? status.lastSyncedAt ? '这次同步没有返回游戏记录。' : '档案已连接；手动同步后，游戏会出现在这卷胶片上。'
        : '连接档案后，游戏会沿着这卷胶片出现。'}</p><small>Steam 游戏详情若设为私密，官方接口不会提供游戏库。</small></div>}

      <div className="steam-film-reel__foot"><span>← 拖动胶片 / 横向滚轮浏览 →</span><span>触屏可横向滑动 · 点击画格展开</span></div>

      {selectedGame
        ? <FilmDetails game={selectedGame} preview={preview} onClose={() => setSelectedAppId(null)}/>
        : <div className="steam-film-selection-hint"><i/><span>从任意一格开始。相邻的帧，会带你回到另一个世界。</span></div>}
    </section>

    {!preview && <section className="steam-film-date-note"><span>DATE / SOURCE NOTES</span><p>首次游玩、网站首次记录、最早成就和最近游玩会分开标注。Steam 常规接口不能证明首次启动日期；无法可靠确认时，时间留空。</p></section>}

    <footer className="steam-film-footer"><button onClick={onHome}><ArrowLeft size={14}/>回到 BAKA AWARD 年度档案</button><span>END OF THIS REEL · TO BE CONTINUED</span></footer>
  </main>
}
