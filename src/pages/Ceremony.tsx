import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Home as HomeIcon, SkipBack, SkipForward } from 'lucide-react'
import type { YearData } from '../types'
import { Brand } from '../components/Brand'
import { GuestCard } from '../components/GuestCard'
import { RibbonBurst } from '../components/RibbonBurst'
import { AwardStage } from '../layouts/AwardStage'

type Scene = 'opening' | 'guest' | 'award' | 'finale'

export function Ceremony({ data, onHome }: { data: YearData; onHome: () => void }) {
  const [scene, setScene] = useState<Scene>('opening')
  const [awardIndex, setAwardIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const touchStart = useRef<number | null>(null)
  const totalAwards = data.awards.length + (data.specialAward ? 1 : 0)
  const gameOfTheYearAward = data.awards.find(award => award.id === 'goty')
  const allAwards = [
    ...data.awards,
    ...(data.specialAward ? [data.specialAward] : []),
  ]
  const gameOfTheYear = gameOfTheYearAward?.winner
  const revealGameOfTheYear = scene === 'award' && allAwards[awardIndex]?.id === 'goty'
  const step = scene === 'opening' ? 0 : scene === 'guest' ? 1 : scene === 'award' ? awardIndex + 2 : totalAwards + 2
  const beginAwards = useCallback(() => { setAwardIndex(0); setScene('award') }, [])
  const next = useCallback(() => {
    setDirection(1)
    if (scene === 'opening') setScene('guest')
    else if (scene === 'guest') beginAwards()
    else if (scene === 'award' && awardIndex < allAwards.length - 1) setAwardIndex(i => i + 1)
    else if (scene === 'award') setScene('finale')
    else onHome()
  }, [scene, awardIndex, allAwards.length, beginAwards, onHome])
  const previous = useCallback(() => {
    setDirection(-1)
    if (scene === 'guest') setScene('opening')
    else if (scene === 'award' && awardIndex > 0) setAwardIndex(i => i - 1)
    else if (scene === 'award') setScene('guest')
    else if (scene === 'finale') { setScene('award'); setAwardIndex(allAwards.length - 1) }
    else onHome()
  }, [scene, awardIndex, allAwards.length, onHome])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); previous() }
      if (e.key === 'Escape') onHome()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [next, previous, onHome])
  const handleTouchStart = (e: TouchEvent) => { touchStart.current = e.touches[0]?.clientX ?? null }
  const handleTouchEnd = (e: TouchEvent) => {
    if (touchStart.current === null) return
    const delta = e.changedTouches[0]!.clientX - touchStart.current
    if (Math.abs(delta) > 55) delta < 0 ? next() : previous()
    touchStart.current = null
  }
  const progress = scene === 'finale' ? 100 : Math.round((step / (totalAwards + 2)) * 100)
  return <main className={`ceremony-page ceremony-page--${data.year}`} style={{ '--bg': data.theme.background, '--fg': data.theme.foreground, '--accent': data.theme.accent, '--accent-soft': data.theme.accentSecondary ?? data.theme.accent, '--muted': data.theme.secondary, '--grid': data.theme.grid, '--type': data.theme.typography } as CSSProperties} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
    <div className="ceremony-grain" aria-hidden="true"/>
    {revealGameOfTheYear && <RibbonBurst key="goty-ribbon-burst"/>}
    <header className="ceremony-topbar"><Brand onHome={onHome}/><div className="ceremony-edition"><span>BAKA AWARD</span><i>/</i>{data.year} <span className="edition-state">{scene === 'opening' ? 'OPENING' : scene === 'guest' ? 'GUEST' : scene === 'finale' ? 'FINALE' : `AWARD ${String(awardIndex + 1).padStart(2, '0')}`}</span></div><button className="home-button" onClick={onHome}><HomeIcon size={15}/><span>ARCHIVE</span></button></header>
    <div className="ceremony-progress"><span>THE FIRST CEREMONY</span><div className="progress-track"><i style={{ width: `${progress}%` }}/></div><span>{String(step).padStart(2, '0')}<i> / {String(totalAwards + 2).padStart(2, '0')}</i></span></div>
    <section className="ceremony-stage" key={`${scene}-${awardIndex}-${direction}`}>
      {scene === 'opening' && <article className="opening-scene scene-enter"><div className="opening-watermark">FIRST<br/>EDITION</div><div className="opening-main"><div className="eyebrow"><span className="live-dot"/> A PERSONAL CEREMONY · {data.year}</div><p className="opening-pretitle">THE YEAR IN GAMES</p><h1>BAKA<br/><span>AWARD</span></h1><div className="opening-year">{String(data.year).slice(0, 2)}<span>{String(data.year).slice(-2)}</span><b>{data.edition}</b></div><p className="opening-caption">个人年度游戏颁奖典礼。<br/>泉此方：「今年也玩了不少嘛。」</p></div><div className="opening-seal"><span>BAKA<br/>AWARD</span><i>✳</i><small>VOL. 01</small></div><div className="opening-coordinates">ARCHIVE NO. 001<br/>PERSONAL PICKS / {data.year}</div></article>}
      {scene === 'guest' && <article className="guest-scene scene-enter"><div className="guest-scene__text"><div className="eyebrow">STAGE 02 / THE FACE OF THIS YEAR</div><p className="guest-overline">MEET THE GUEST</p><h1>本届<br/><em>Guest</em></h1><p>{data.guest.introduction}</p><div className="guest-status">{data.year} GUEST <b>·</b> {data.guest.displayName}</div></div><GuestCard guest={data.guest} year={data.year}/><span className="guest-scene__index">02 <i>/ {totalAwards + 2}</i></span></article>}
      {scene === 'award' && <AwardStage award={allAwards[awardIndex]!} guest={data.guest} year={data.year} awardCount={totalAwards} active/>}
      {scene === 'finale' && <article className="finale-scene scene-enter"><div className="finale-lines" aria-hidden="true"/><div className="eyebrow"><span className="live-dot"/> END OF CEREMONY · {data.year}</div><p>AND THE YEAR'S BIGGEST AWARD GOES TO...</p><h1>BAKA<br/><span>GAME OF<br/>THE YEAR</span></h1><div className="finale-winner">{gameOfTheYear?.name ?? '获奖名单待揭晓'}</div><p className="finale-note">这一年的游戏旅程暂告一段落。<br/>档案留存，下一届再见。</p><button className="finale-home" onClick={onHome}>返回年度档案馆 <ArrowUpRight size={16}/></button></article>}
    </section>
    <nav className="award-nav" aria-label="颁奖典礼导航"><button className="nav-arrow" onClick={previous} aria-label="上一个阶段"><ArrowLeft/></button><div className="nav-middle"><span>{scene === 'award' ? allAwards[awardIndex]?.title : scene === 'opening' ? 'OPENING' : scene === 'guest' ? 'INTRODUCING THE GUEST' : 'THE FINALE'}</span><div className="nav-dots">{Array.from({ length: totalAwards + 3 }, (_, i) => <button key={i} aria-label={`跳转至第 ${i + 1} 阶段`} className={i === step ? 'is-current' : i < step ? 'is-past' : ''} onClick={() => { if (i === 0) setScene('opening'); else if (i === 1) setScene('guest'); else if (i < totalAwards + 2) { setAwardIndex(i - 2); setScene('award') } else setScene('finale') }}/>)}</div></div><button className="nav-arrow nav-arrow--next" onClick={next} aria-label="下一个阶段"><ArrowRight/></button><span className="nav-key-hint"><SkipBack size={12}/> <SkipForward size={12}/> USE ← →</span></nav>
  </main>
}
