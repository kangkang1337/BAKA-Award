import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'
import {
  ArrowLeft, ArrowRight, Battery, BookOpen, Bookmark, ChevronLeft, ChevronRight,
  Headphones, Heart, Home, Image as ImageIcon, Music2,
  Smartphone, Star, Wifi,
} from 'lucide-react'
import { mobileExAwards, mobileExGuest, type MobileExAward } from '../data/2026-mobile-ex'
import '../styles/mobile-ex-2026.css'

function ArtSlot({ label, image, images, className = '' }: { label: string; image?: string; images?: string[]; className?: string }) {
  const sources = images?.length ? images : image ? [image] : []
  if (sources.length) return <div className={`mobile-ex-art-slot mobile-ex-art-slot--photo ${className}`}>
    {sources.map((src, index) => <img key={src} src={src} alt={`${label} ${index + 1}`} loading="lazy" decoding="async"/>) }
  </div>
  return <div className={`mobile-ex-art-slot ${className}`} aria-label={`图片位置：${label}`}>
    <span><ImageIcon size={17}/>{label}</span>
    <small>把图片放进 public/images/2026/ex-mobile/，再填写本奖项数据里的 image 或 images 路径</small>
  </div>
}

function ImageThumbnails({ images, label, className = '' }: { images: string[]; label: string; className?: string }) {
  if (!images.length) return null
  return <div className={`mobile-ex-image-thumbnails ${className}`} aria-label={label}>
    {images.map((src, index) => <img key={src} src={src} alt={`${label} ${index + 1}`} loading="lazy" decoding="async"/>)}
  </div>
}

function OpeningDesk() {
  return <div className="mobile-ex-desk" aria-label="周末房间里的手机桌面插画">
    <span className="mobile-ex-desk__sun" aria-hidden="true"/>
    <div className="mobile-ex-desk__memo"><span>WEEKEND</span><strong>14:36</strong><small>just a little break</small></div>
    <div className="mobile-ex-desk__phone">
      <div className="mobile-ex-desk__speaker"/>
      <div className="mobile-ex-desk__screen">
        <div className="mobile-ex-desk__status"><span>14:36</span><span><Wifi size={10}/><Battery size={12}/></span></div>
        <div className="mobile-ex-desk__welcome">TODAY, JUST<br/><b>OPEN IT FOR A WHILE.</b></div>
        <div className="mobile-ex-desk__apps" aria-hidden="true">
          <i><Heart size={17}/></i><i><Star size={17}/></i><i><Music2 size={17}/></i><i><Gamepad2Icon/></i>
        </div>
        <div className="mobile-ex-desk__notification"><span className="mobile-ex-desk__app-dot">BA</span><span><b>GAMES, STILL HERE</b><small>7 little places to visit</small></span><ChevronRight size={13}/></div>
        <div className="mobile-ex-desk__dock"><i/><i/><i/><i/></div>
      </div>
    </div>
    <div className="mobile-ex-desk__earbuds"><Headphones size={39} strokeWidth={1.2}/></div>
    <div className="mobile-ex-desk__drink"><span>ICE<br/>TEA</span><i/></div>
    <div className="mobile-ex-desk__snack"><span>SNACK<br/>BREAK</span><i>✳</i></div>
    <span className="mobile-ex-desk__sticker mobile-ex-desk__sticker--one">played<br/>a little</span>
    <span className="mobile-ex-desk__sticker mobile-ex-desk__sticker--two"><Heart size={17}/></span>
    <svg className="mobile-ex-desk__cable" viewBox="0 0 190 150" fill="none" aria-hidden="true"><path d="M8 10c70 8 43 81 107 70 55-9 60 22 39 45-18 20-65 3-54-17 8-15 42-12 56 1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 1"/></svg>
    <span className="mobile-ex-desk__caption">A DESK, A PHONE, A FEW FAVOURITES.</span>
  </div>
}

function Gamepad2Icon() {
  return <span className="mobile-ex-gamepad-mark" aria-hidden="true">✣</span>
}

function shuffleAfterFirst(items: string[]) {
  const [entranceImage, ...remaining] = items
  for (let index = remaining.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[remaining[index], remaining[swapIndex]] = [remaining[swapIndex]!, remaining[index]!]
  }
  return entranceImage ? [entranceImage, ...remaining] : remaining
}

function YuiRoom({ images }: { images: string[] }) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const showPhoto = (step: number) => setPhotoIndex(index => (index + step + images.length) % images.length)
  return <div className="mobile-ex-yui-room" aria-label="平泽唯坐在房间里一起看手机的插画位置">
    <div className="mobile-ex-yui-room__window"><i/><i/><i/><i/></div>
    <div className="mobile-ex-yui-room__sunlight"/>
    <div className="mobile-ex-yui-room__sofa"><i/><i/><span/></div>
    <div className="mobile-ex-yui-room__table"><span/><i/><b/></div>
    <div className="mobile-ex-yui-room__phone"><Smartphone size={23}/></div>
    <div className="mobile-ex-yui-room__person">
      {images.length ? <>
        <img key={images[photoIndex]} src={images[photoIndex]} alt={`平泽唯照片 ${photoIndex + 1}`} loading="lazy" decoding="async"/>
        <div className="mobile-ex-yui-room__photo-controls">
          <button onClick={() => showPhoto(-1)} aria-label="上一张平泽唯图片"><ChevronLeft size={13}/></button>
          <span>YUI / {String(photoIndex + 1).padStart(2, '0')} — {String(images.length).padStart(2, '0')}</span>
          <button onClick={() => showPhoto(1)} aria-label="下一张平泽唯图片"><ChevronRight size={13}/></button>
        </div>
      </> : <div className="mobile-ex-yui-room__portrait-placeholder"><span>YUI</span><small>PORTRAIT SLOT</small></div>}
    </div>
    <span className="mobile-ex-yui-room__label">SUNDAY / ROOM 01</span>
  </div>
}

function AwardVisual({ award }: { award: MobileExAward }) {
  const slot = (extra = '') => <ArtSlot label={award.visualLabel} image={award.image} images={award.images} className={extra}/>
  if (award.id === 'companion') return <div className="mobile-ex-award-art mobile-ex-award-art--companion">
    <div className="mobile-ex-chat-paper"><span className="mobile-ex-paper-kicker">A NOTE THAT STAYS</span><div className="mobile-ex-chat-paper__screen"><div className="mobile-ex-chat-paper__bar"><i/> ONLINE / STILL HERE</div>{slot('mobile-ex-chat-paper__wallpaper')}<span className="mobile-ex-chat-bubble">今天也来看看。</span><span className="mobile-ex-chat-bubble mobile-ex-chat-bubble--reply">嗯，还在这里。</span></div><span className="mobile-ex-handnote">打开一下<br/>就很好</span></div>
  </div>
  if (award.id === 'portrait') return <div className="mobile-ex-award-art mobile-ex-award-art--portrait">
    <div className="mobile-ex-polaroid"><div className="mobile-ex-polaroid__tape"/>{slot('mobile-ex-polaroid__photo')}<div className="mobile-ex-polaroid__caption"><b>ONE MORE LOOK</b><span>STAR / SAVIOR</span></div></div><span className="mobile-ex-sticker mobile-ex-sticker--star"><Star size={24}/></span><span className="mobile-ex-sticker mobile-ex-sticker--spark">✳</span><span className="mobile-ex-handnote">我本来只是<br/>看一下的</span>
  </div>
  if (award.id === 'idle') return <div className="mobile-ex-award-art mobile-ex-award-art--idle">
    <div className="mobile-ex-landscape-phone"><div className="mobile-ex-landscape-phone__screen"><div className="mobile-ex-landscape-phone__top">ANCIENT GODS <span>PAUSE / 03:00</span></div>{slot('mobile-ex-landscape-phone__game')}<div className="mobile-ex-cards"><i>Ⅰ</i><i>Ⅱ</i><i>Ⅲ</i><i>+</i></div></div></div>
  </div>
  if (award.id === 'gifts') return <div className="mobile-ex-award-art mobile-ex-award-art--gifts">
    <div className="mobile-ex-gift-sheet"><span className="mobile-ex-free-stamp">FREE<br/><small>FREE</small></span><div className="mobile-ex-gift-sheet__pack">{slot('mobile-ex-gift-sheet__image')}</div><div className="mobile-ex-gift-sheet__tickets"><i>GACHA TICKET</i><i>ONE MORE</i><i>LUCKY DAY</i></div></div><span className="mobile-ex-sticker mobile-ex-sticker--gift">✦</span><span className="mobile-ex-gift-confetti">✳　✦　✳</span>
  </div>
  if (award.id === 'story-art') return <div className="mobile-ex-award-art mobile-ex-award-art--story">
    <div className="mobile-ex-book"><div className="mobile-ex-book__page mobile-ex-book__page--left"><span>TIME / ARCHIVE</span><ArtSlot label={award.visualLabel} image={award.images?.[0] ?? award.image} className="mobile-ex-book__photo mobile-ex-book__photo--one"/><small>AN UNEXPECTED CHAPTER</small></div><div className="mobile-ex-book__page mobile-ex-book__page--right"><span>REVERSE / 1999</span><div className="mobile-ex-book__quote">A year<br/>in pages.</div><small>PAGE 19 — 99</small></div><div className="mobile-ex-book__spine"/></div><Bookmark className="mobile-ex-bookmark" size={34}/>
  </div>
  if (award.id === 'rooted') return <div className="mobile-ex-award-art mobile-ex-award-art--rooted">
    <div className="mobile-ex-home-screen"><div className="mobile-ex-home-screen__status">09:41 <span>HOME / PAGE 01</span></div><div className="mobile-ex-home-screen__app"><ArtSlot label={award.visualLabel} image={award.images?.[0] ?? award.image} className="mobile-ex-home-screen__icon"/><span>TOUHOU<br/>LOSTWORD</span></div><ImageThumbnails images={award.images?.slice(1) ?? []} label="Touhou LostWord screenshots" className="mobile-ex-home-screen__archive"/><div className="mobile-ex-home-screen__apps"><i><Heart size={14}/></i><i><Music2 size={14}/></i><i><BookOpen size={14}/></i></div><div className="mobile-ex-home-screen__dock"><i/><i/><i/><i/></div></div><span className="mobile-ex-installed">INSTALLED<br/><b>STILL HERE ✓</b></span>
  </div>
  return <div className="mobile-ex-award-art mobile-ex-award-art--goty">
    <div className="mobile-ex-goty-composition">
      {award.images?.[1] && <figure className="mobile-ex-goty-support mobile-ex-goty-support--left"><img src={award.images[1]} alt="终末地截图 02" loading="lazy" decoding="async"/><figcaption>FIELD NOTE / 02</figcaption></figure>}
      <div className="mobile-ex-launch-phone"><div className="mobile-ex-launch-phone__earpiece"/><div className="mobile-ex-launch-phone__screen"><ArtSlot label={award.visualLabel} image={award.images?.[0] ?? award.image} className="mobile-ex-launch-phone__image"/><span className="mobile-ex-launch-phone__brand">HYPERGRYPH<br/><b>EX / 2026</b></span><span className="mobile-ex-launch-phone__start">TAP TO OPEN <ChevronRight size={14}/></span></div></div>
      {award.images?.[2] && <figure className="mobile-ex-goty-support mobile-ex-goty-support--right"><img src={award.images[2]} alt="终末地截图 03" loading="lazy" decoding="async"/><figcaption>FIELD NOTE / 03</figcaption></figure>}
    </div><div className="mobile-ex-ex-seal"><span>EX PICK</span><b>07</b></div>
  </div>
}

export function MobileEx2026({ onHome }: { onHome: () => void }) {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [yuiPhotoSequence] = useState(() => shuffleAfterFirst(mobileExGuest.images))
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const sceneCount = mobileExAwards.length + 3
  const awardIndex = sceneIndex - 2
  const currentAward = awardIndex >= 0 && awardIndex < mobileExAwards.length ? mobileExAwards[awardIndex] : undefined

  const next = useCallback(() => setSceneIndex(index => index < sceneCount - 1 ? index + 1 : index), [sceneCount])
  const previous = useCallback(() => setSceneIndex(index => index > 0 ? index - 1 : index), [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); next() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
      if (event.key === 'Escape') onHome()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [next, previous, onHome])

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0]
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current
    touchStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) > 58 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      if (deltaX < 0) next()
      else previous()
    }
  }
  const goTo = (index: number) => setSceneIndex(index)
  const sceneName = sceneIndex === 0 ? 'OPENING' : sceneIndex === 1 ? 'MEET YUI' : currentAward ? `AWARD ${currentAward.number}` : 'LOCK SCREEN'

  return <main className="mobile-ex-page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    <header className="mobile-ex-header">
      <a className="mobile-ex-brand" href="/" onClick={event => { event.preventDefault(); onHome() }} aria-label="返回 BAKA AWARD 年度档案馆">
        <span className="mobile-ex-brand__mark">B.</span><span>BAKA AWARD <i>EX</i></span>
      </a>
      <div className="mobile-ex-header__edition"><span>MOBILE / 2026</span><span>手机里的小日子</span></div>
      <button className="mobile-ex-archive" onClick={onHome}><Home size={15}/><span>年度档案馆</span></button>
    </header>

    <div className="mobile-ex-progress" aria-label={`第 ${sceneIndex + 1} / ${sceneCount} 场景`}>
      <span>{String(sceneIndex + 1).padStart(2, '0')} <i>/ {String(sceneCount).padStart(2, '0')}</i></span>
      <div className="mobile-ex-progress__track"><i style={{ width: `${(sceneIndex / (sceneCount - 1)) * 100}%` }}/></div>
      <span>{sceneName}</span>
    </div>

    <section className="mobile-ex-stage" key={sceneIndex} aria-live="polite">
      {sceneIndex === 0 && <article className="mobile-ex-opening mobile-ex-enter">
        <div className="mobile-ex-opening__copy">
          <span className="mobile-ex-kicker"><i/> AN EX SIDE STORY / VOL. 01</span>
          <div className="mobile-ex-opening__title"><span>BAKA AWARD</span><strong>EX</strong><i>2026 / MOBILE</i></div>
          <p className="mobile-ex-opening__chinese">手机里的<br/><em>小日子</em></p>
          <p className="mobile-ex-opening__tagline">Today, just open it for a while.<br/><span>今天也打开一下。</span></p>
          <div className="mobile-ex-opening__foot"><span>MY PHONE, THIS YEAR</span><span>07 GAMES STAYED<br/>AND A LOT OF THEM DIDN’T</span></div>
        </div>
        <OpeningDesk/>
        <span className="mobile-ex-margin-note">A SMALL PRIVATE ARCHIVE<br/>SATURDAY / 14:36</span>
      </article>}

      {sceneIndex === 1 && <article className="mobile-ex-guest-scene mobile-ex-enter">
        <div className="mobile-ex-guest-scene__copy"><span className="mobile-ex-kicker">SCENE 02 / MEET THE EX GUEST</span><p>一起看一下手机的人</p><h1>平泽唯<small>Hirasawa Yui</small></h1><blockquote>“{mobileExGuest.quote}”</blockquote><div className="mobile-ex-guest-note"><span>NOT A HOST</span><i>只是坐在旁边看一眼。</i></div></div>
        <YuiRoom images={yuiPhotoSequence}/>
      </article>}

      {currentAward && <article className={`mobile-ex-award-scene mobile-ex-award-scene--${currentAward.id} mobile-ex-enter`}>
        <header className="mobile-ex-award-heading"><span className="mobile-ex-award-heading__number">{currentAward.number}<i> / 07</i></span><div><span className="mobile-ex-kicker">{currentAward.english}</span><h1>{currentAward.title}</h1><p>{currentAward.game}</p></div><span className="mobile-ex-award-heading__kind">A LITTLE THING<br/>THAT STAYED</span></header>
        <div className="mobile-ex-award-body">
          <div className="mobile-ex-award-body__art"><AwardVisual award={currentAward}/></div>
          <div className="mobile-ex-note"><div className="mobile-ex-note__byline"><img className="mobile-ex-note__yui" src={yuiPhotoSequence[awardIndex % yuiPhotoSequence.length]} alt="平泽唯" loading="lazy" decoding="async"/><span>YUI’S LITTLE NOTE<small>平泽唯 / 评委</small></span><Heart size={14}/></div><p>{currentAward.note}</p><span className="mobile-ex-note__end">嗯，就记在这里吧。<i>— YUI</i></span></div>
        </div>
        <div className="mobile-ex-life-map" aria-label="今年手机生活地图">
          <span>MY PHONE, THIS YEAR</span>{mobileExAwards.map((award, index) => <button key={award.id} className={index === awardIndex ? 'is-active' : ''} onClick={() => goTo(index + 2)} aria-label={`跳转至${award.title}`} title={award.title}>{award.number}</button>)}
        </div>
      </article>}

      {sceneIndex === sceneCount - 1 && <article className="mobile-ex-finale mobile-ex-enter">
        <div className="mobile-ex-finale__paper"><div className="mobile-ex-finale__lock"><span>14:36</span><i/><span>SUNDAY / OCT 2026</span></div><div className="mobile-ex-finale__icons">{mobileExAwards.map((award, index) => <i key={award.id} className={`mobile-ex-finale__app mobile-ex-finale__app--${index + 1}`}>{['♥', '✦', 'Ⅲ', '＋', '↗', '東', '終'][index]}</i>)}</div><p className="mobile-ex-finale__small">GAMES THAT STAYED CLOSE</p><h1>SEE YOU<br/><em>TOMORROW.</em></h1><p>今天也打开一下。</p><div className="mobile-ex-finale__lockbar"><span/><small>BAKA AWARD EX / MOBILE</small></div></div>
        <div className="mobile-ex-finale__copy"><span className="mobile-ex-kicker">END OF THIS LITTLE SESSION</span><p>聊完了，把手机放到桌上。</p><button onClick={onHome}>回到年度档案馆 <ArrowRight size={16}/></button></div>
      </article>}
    </section>

    <nav className="mobile-ex-controls" aria-label="番外场景导航">
      <button className="mobile-ex-controls__arrow" onClick={previous} aria-label="上一页" disabled={sceneIndex === 0}><ArrowLeft size={19}/></button>
      <div className="mobile-ex-controls__center"><span>{sceneName}</span><div>{Array.from({ length: sceneCount }, (_, index) => <button key={index} className={index === sceneIndex ? 'is-active' : index < sceneIndex ? 'is-past' : ''} aria-label={`前往第 ${index + 1} 页`} onClick={() => goTo(index)}/>)}</div></div>
      <button className="mobile-ex-controls__arrow" onClick={() => sceneIndex === sceneCount - 1 ? onHome() : next()} aria-label={sceneIndex === sceneCount - 1 ? '返回年度档案馆' : '下一页'}><ArrowRight size={19}/></button>
      <span className="mobile-ex-controls__keys"><ChevronLeft size={12}/><ChevronRight size={12}/> KEY / SWIPE</span>
    </nav>
  </main>
}
