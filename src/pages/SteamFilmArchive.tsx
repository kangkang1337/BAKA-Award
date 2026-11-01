import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Film, Gamepad2, RotateCw } from 'lucide-react'
import type { FirstPlayTimelineData, FirstPlayTimelineEntry } from '../types/steam-film'
import { isFirstPlayTimeline, resolveFirstPlayTimelineUrl } from '../data/steam-film-static'
import { coverCandidates } from '../data/steam-cover'
import '../styles/first-play-timeline.css'

const TIMELINE_URL = resolveFirstPlayTimelineUrl(import.meta.env.BASE_URL, window.location.href)

function localDateLabel(entry: FirstPlayTimelineEntry) {
  const value = entry.firstPlayedOn
  if (!value) return '日期待确认'
  if (entry.datePrecision === 'year') return `${value} 年`
  if (entry.datePrecision === 'month') {
    const [year, month] = value.split('-')
    return `${year} 年 ${Number(month)} 月`
  }
  const [year, month, day] = value.split('-')
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`
}

function yearFor(entry: FirstPlayTimelineEntry) {
  return entry.firstPlayedOn?.slice(0, 4) ?? null
}

function monthFor(entry: FirstPlayTimelineEntry) {
  if (!entry.firstPlayedOn) return '待确认日期'
  if (entry.datePrecision === 'year') return '仅记录到年份'
  return `${entry.firstPlayedOn.slice(0, 4)}-${entry.firstPlayedOn.slice(5, 7)}`
}

function monthLabel(value: string) {
  if (value === '仅记录到年份') return value
  const [year, month] = value.split('-')
  return `${year} 年 ${Number(month)} 月`
}

function durationLabel(minutes: number | null) {
  if (minutes === null) return null
  const hours = Math.floor(minutes / 60)
  return hours ? `Steam 当前记录 ${hours.toLocaleString('zh-CN')} 小时` : `Steam 当前记录 ${minutes} 分钟`
}

function TimelineCover({ entry }: { entry: FirstPlayTimelineEntry }) {
  const sources = useMemo(() => coverCandidates(entry.steamAppId, entry.headerImage), [entry.steamAppId, entry.headerImage])
  const [attempt, setAttempt] = useState(0)
  const source = sources[attempt]

  if (!source) {
    return <div className="timeline-card__cover timeline-card__cover--missing">
      {sources.length ? <span aria-hidden="true">B.</span> : <Gamepad2 size={28} aria-hidden="true"/>}
    </div>
  }

  return <div className="timeline-card__cover">
    <img
      key={source}
      src={source}
      alt={`${entry.gameName} 游戏封面`}
      loading="lazy"
      decoding="async"
      onError={() => setAttempt(current => (current < sources.length ? current + 1 : current))}
    />
  </div>
}

function TimelineCard({ entry }: { entry: FirstPlayTimelineEntry }) {
  const duration = durationLabel(entry.playtimeMinutes)
  return <article className="timeline-card">
    <TimelineCover entry={entry}/>
    <div className="timeline-card__body">
      <span className="timeline-card__date">{localDateLabel(entry)} · {entry.datePrecision === 'unknown' ? '待补日期' : `精度：${entry.datePrecision}`}</span>
      <h3>{entry.gameName}</h3>
      {duration && <small className="timeline-card__playtime">{duration}</small>}
      {entry.personalNote && <p className="timeline-card__note">{entry.personalNote}</p>}
    </div>
  </article>
}

function dateTimeLabel(value: string | null) {
  if (!value) return '尚无同步记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '同步时间不可用'
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function SteamFilmArchive({ onHome }: { onHome: () => void }) {
  const [timeline, setTimeline] = useState<FirstPlayTimelineData | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')

  const loadTimeline = useCallback(async () => {
    setLoadState('loading')
    setError('')
    try {
      const response = await fetch(TIMELINE_URL, { credentials: 'omit', cache: 'no-cache' })
      if (!response.ok) throw new Error(`时间轴暂时无法读取（HTTP ${response.status}）。`)
      let value: unknown
      try { value = await response.json() } catch { throw new Error('时间轴 JSON 无法解析；请在本地管理器重新生成。') }
      if (!isFirstPlayTimeline(value)) throw new Error('时间轴数据格式或版本不兼容；请重新生成静态文件。')
      setTimeline(value)
      setLoadState('ready')
    } catch (reason) {
      setTimeline(null)
      setLoadState('error')
      const message = reason instanceof Error ? reason.message : ''
      setError(message.startsWith('时间轴') ? message : '无法读取时间轴文件；请确认 JSON 随网站一起生成。')
    }
  }, [])

  useEffect(() => { void loadTimeline() }, [loadTimeline])

  const years = useMemo(() => [...new Set((timeline?.entries ?? []).filter(entry => entry.firstPlayedOn).map(yearFor).filter((year): year is string => Boolean(year)))].sort((a, b) => b.localeCompare(a)), [timeline?.entries])
  const filteredEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('zh-CN')
    return (timeline?.entries ?? []).filter(entry => {
      const searchable = `${entry.gameName} ${entry.personalNote ?? ''}`.toLocaleLowerCase('zh-CN')
      if (term && !searchable.includes(term)) return false
      if (yearFilter === 'unknown') return !entry.firstPlayedOn
      if (yearFilter !== 'all' && yearFor(entry) !== yearFilter) return false
      return true
    })
  }, [timeline?.entries, search, yearFilter])

  const pendingEntries = filteredEntries.filter(entry => !entry.firstPlayedOn || entry.datePrecision === 'unknown')
  const datedEntries = filteredEntries.filter(entry => entry.firstPlayedOn && entry.datePrecision !== 'unknown')
  const groupedYears = useMemo(() => {
    const byYear = new Map<string, FirstPlayTimelineEntry[]>()
    for (const entry of datedEntries) {
      const year = yearFor(entry)!
      const entries = byYear.get(year) ?? []
      entries.push(entry)
      byYear.set(year, entries)
    }
    return [...byYear.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([year, entries]) => {
      const byMonth = new Map<string, FirstPlayTimelineEntry[]>()
      for (const entry of entries) {
        const month = monthFor(entry)
        const monthEntries = byMonth.get(month) ?? []
        monthEntries.push(entry)
        byMonth.set(month, monthEntries)
      }
      return { year, months: [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, monthEntries]) => ({ month, entries: monthEntries })) }
    })
  }, [datedEntries])

  const unknownOnly = yearFilter === 'unknown'
  return <main className="first-play-page">
    <header className="first-play-header">
      <a className="first-play-brand" href="/" onClick={event => { event.preventDefault(); onHome() }} aria-label="返回 BAKA AWARD 首页"><span>B.</span><b>BAKA AWARD</b><i>/</i><small>FIRST PLAY TIMELINE</small></a>
      <span className="first-play-header__folio">PERSONAL GAME HISTORY / 01</span>
    </header>

    <section className="first-play-intro">
      <div>
        <div className="first-play-kicker"><CalendarDays size={14}/> BAKA AWARD — FIRST PLAY TIMELINE</div>
        <h1>每段旅程，<br/><em>都有一个开始。</em></h1>
        <p>记录真正开始体验一款游戏的那一天。未知的日期，就先留在待确认里。</p>
      </div>
      <div className="first-play-sync"><span>最近一次 Steam 同步</span><b>{dateTimeLabel(timeline?.lastSuccessfulSyncAt ?? null)}</b><small>游戏资料只作辅助，不用于推断首次游玩日</small></div>
      <div className="first-play-rule"><span>FIRST PLAY / PERSONAL ARCHIVE</span><span>BAKA AWARD · {timeline?.entryCount ?? 0} RECORDS</span></div>
    </section>

    <section className="first-play-controls" aria-label="时间轴筛选">
      <input type="search" value={search} onChange={event => setSearch(event.currentTarget.value)} placeholder="搜索游戏名称或评语" aria-label="搜索游戏名称或评语" />
      <select value={yearFilter} onChange={event => setYearFilter(event.currentTarget.value)} aria-label="按年份筛选">
        <option value="all">全部年份</option>
        <option value="unknown">待确认日期</option>
        {years.map(year => <option value={year} key={year}>{year} 年</option>)}
      </select>
    </section>

    <div className="first-play-status"><span>{loadState === 'loading' ? '正在读取时间轴…' : loadState === 'error' ? 'TIMELINE UNAVAILABLE' : `${filteredEntries.length} 条个人记录`}</span><span>{timeline ? `数据生成于 ${dateTimeLabel(timeline.generatedAt)}` : 'STATIC FIRST PLAY ARCHIVE'}</span></div>

    {loadState === 'loading' ? <div className="first-play-empty" role="status"><RotateCw size={22} className="is-spinning"/><p>正在展开个人时间轴…</p></div>
      : loadState === 'error' ? <div className="first-play-error" role="alert"><Film size={24}/><p>时间轴暂时无法读取</p><small>{error}</small><button onClick={() => void loadTimeline()}><RotateCw size={13}/>重新读取</button></div>
        : !filteredEntries.length ? <div className="first-play-empty"><Gamepad2 size={26}/><p>{timeline?.entryCount ? '没有匹配的记录。' : '这段时间轴还没有记录。'}</p><small>{timeline?.entryCount ? '调整搜索文字或年份筛选。' : '在本地运行 npm run timeline:manage，手动添加游戏或导入已经整理好的历史记录。未知日期可以留空，之后再补充。'}</small></div>
          : <>
            {!unknownOnly && groupedYears.map(group => <section className="timeline-section" key={group.year}>
              <div className="timeline-section__heading"><div><span>YEAR / {group.year}</span><h2>{group.year}</h2></div><small>{group.months.reduce((count, month) => count + month.entries.length, 0)} 款游戏</small></div>
              {group.months.map(month => <section className="timeline-month" key={`${group.year}-${month.month}`}>
                <h3 className="timeline-month__heading">{monthLabel(month.month)}</h3>
                <div className="timeline-grid">{month.entries.map(entry => <TimelineCard entry={entry} key={entry.id}/>)}</div>
              </section>)}
            </section>)}
            {pendingEntries.length > 0 && <section className="timeline-section">
              <div className="timeline-section__heading"><div><span>DATE / TO BE CONFIRMED</span><h2>待确认</h2></div><small>{pendingEntries.length} 款游戏</small></div>
              <div className="timeline-grid">{pendingEntries.map(entry => <TimelineCard entry={entry} key={entry.id}/>)}</div>
            </section>}
          </>}

    <section className="first-play-date-note"><span>DATE / SOURCE NOTES</span><p>首次游玩日期来自个人确认或导入的个人记录，不从累计时长、最后游玩、成就或网站首次发现日期推断。时间轴只包含手动加入或确认导入的游戏；未进入时间轴的 Steam 游戏不会出现在此页面。</p></section>
    <footer className="first-play-footer"><a href="/" onClick={event => { event.preventDefault(); onHome() }}><ArrowLeft size={13}/>回到 BAKA AWARD 年度档案</a><span>ONE JOURNEY AT A TIME</span></footer>
  </main>
}
