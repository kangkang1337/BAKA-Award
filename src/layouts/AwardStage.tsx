import { useState } from 'react'
import { ArrowDown, Sparkles } from 'lucide-react'
import type { Award, Guest } from '../types'
import { GuestCard } from '../components/GuestCard'

const placeholderMarks: Record<string, string> = {
  gameplay: '↗',
  narrative: '∞',
  art: '33',
  music: '♫',
  indie: '—',
  guide: '?',
  'one-more-turn': '05',
  surprise: '◇',
  'just-like-it': '♡',
  goty: '大',
  'konata-certified': '♥',
}

function WinnerArt({ award, className = '' }: { award: Award; className?: string }) {
  const [failedImages, setFailedImages] = useState<string[]>([])
  const game = award.winner
  const images = [game?.cover, ...(game?.screenshots ?? [])].filter((src): src is string => Boolean(src))
  const visibleImages = images.filter(image => !failedImages.includes(image)).slice(0, 4)
  const failed = (image: string) => setFailedImages(current => current.includes(image) ? current : [...current, image])
  const src = visibleImages[0]
  return <div className={`winner-art ${className} ${src ? 'winner-art--image' : ''}`}>
    {src ? visibleImages.length > 1 ? <div className={`winner-gallery winner-gallery--${award.layout} winner-gallery--${award.id} winner-gallery--count-${Math.min(visibleImages.length, 4)}`}>{visibleImages.map((image, index) => <img className={`gallery-image gallery-image--${index + 1} image-fade`} key={image} src={image} alt={`${game?.name ?? '获奖游戏'} 游戏画面 ${index + 1}`} loading="eager" fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" onLoad={event => event.currentTarget.classList.add('is-loaded')} onError={() => failed(image)}/>)}</div> : <img className="image-fade" src={src} alt={`${game?.name ?? '获奖游戏'} 游戏画面`} loading="eager" fetchPriority="high" decoding="async" onLoad={event => event.currentTarget.classList.add('is-loaded')} onError={() => failed(src)}/> : <div className={`winner-placeholder winner-placeholder--${award.id}`}><span className="placeholder-index">{award.number} / ARCHIVE</span><span className="placeholder-mark" aria-hidden="true">{placeholderMarks[award.id] ?? '✳'}</span><span className="placeholder-label">{game ? 'VISUAL ARCHIVE · IMAGE SLOT' : 'WINNER TO BE REVEALED'}</span></div>}
    {award.id === 'one-more-turn' && <div className="winner-time-mark" aria-hidden="true"><span>5 MINUTES</span><strong>03:00 AM</strong></div>}
    {src && game?.name && <span className="winner-name">{game.name}</span>}
  </div>
}

export function AwardStage({ award, guest, year, awardCount, active }: { award: Award; guest: Guest; year: number; awardCount: number; active: boolean }) {
  const cls = `award-stage layout-${award.layout} award-${award.id} ${active ? 'is-active' : ''}`
  const guestImage = award.guestImage ?? guest.image
  return <article key={award.id} className={cls} aria-hidden={!active}>
    <div className="award-stage__main">
      <header className="award-heading"><span className="award-number">{award.number}<i> / {awardCount}</i></span><div><div className="eyebrow">{award.english}</div><h2>{award.title}</h2></div><span className="award-stamp">BAKA<br/>AWARD<br/>{year}</span></header>
      <div className="award-content">
        <div className="award-story"><p className="award-description">{award.description}</p><div className="winner-reveal"><span className="eyebrow">{award.winner ? 'THE WINNER' : 'THE ENVELOPE IS STILL SEALED'}</span><h3>{award.winner?.name ?? '获奖名单待揭晓'}</h3>{!award.winner && <p className="muted">数据确认后，这里将揭晓本届获奖作品。</p>}</div></div>
        <WinnerArt award={award} className="award-visual"/>
        <div className={`judge-note judge-note--${award.layout}`}><span className="judge-note__label">{guestImage && <img className="judge-note__portrait image-fade" src={guestImage} alt="" aria-hidden="true" loading="eager" decoding="async" onLoad={event => event.currentTarget.classList.add('is-loaded')} onError={event => { event.currentTarget.hidden = true }}/>}<Sparkles size={13}/> GUEST NOTE</span><p>{award.guestComment || guest.comments[award.id] || '嘉宾短评待补入典礼档案。'}</p></div>
      </div>
      <footer className="award-stage__foot"><span>PERSONAL PICKS · {year}</span><span>{award.number} — {awardCount} <ArrowDown size={14}/></span></footer>
    </div>
    <div className="guest-rail"><GuestCard guest={guest} image={award.guestImage} year={year} compact/><span className="rail-caption">A CEREMONY OF ONE<br/>FOR THE GAMES THAT STAYED</span></div>
  </article>
}
