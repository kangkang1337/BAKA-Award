import { ArrowDown, ArrowUpRight, Disc3, MoveRight } from 'lucide-react'
import { Brand } from '../components/Brand'

export function Home({ openCeremony }: { openCeremony: (year: number) => void }) {
  return <main className="home-page">
    <nav className="topbar"><Brand/><span className="topbar-note"><span className="live-dot"/> INDEPENDENT · PERSONAL · ANNUAL</span><a className="topbar-link" href="#archive">ABOUT THE ARCHIVE <ArrowUpRight size={14}/></a></nav>
    <section className="home-hero">
      <div className="hero-grid" aria-hidden="true"/><div className="hero-vertical">PERSONAL GAME AWARDS / EST. 2025</div>
      <div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> AN ANNUAL ARCHIVE OF PLAY</div><h1>BAKA<br/><span>AWARD</span><sup>®</sup></h1><div className="hero-bottom"><p>一个人玩了一整年游戏之后，<br/>认真给自己办的一场颁奖典礼。</p><span className="hero-index">01 — ∞</span></div></div>
      <div className="hero-object" aria-hidden="true"><div className="award-disc"><Disc3 size={132} strokeWidth={0.55}/><span>PLAY<br/>·<br/>REMEMBER</span></div><div className="object-cross">✳</div><div className="object-coordinate">31°13' N<br/>121°28' E</div></div>
      <a className="scroll-cue" href="#archive"><span>SCROLL TO EXPLORE</span><ArrowDown size={15}/></a>
      <div className="hero-side-note">NO JURY<br/>NO SCORE<br/>JUST MY YEAR.</div>
    </section>
    <section className="archive-section" id="archive">
      <div className="section-kicker"><span>01 / THE ARCHIVE</span><span>AN OPEN FILE ON PLAY</span></div>
      <div className="archive-intro"><div><div className="eyebrow">CEREMONY ARCHIVE</div><h2>每一年，<br/>都值得一场典礼。</h2></div><p>不代表任何媒体、组织或行业机构。<br/>只是认真记录这一年玩过、记得、喜欢的游戏。</p></div>
      <button className="year-card year-card--ready" onClick={() => openCeremony(2025)}>
        <span className="year-card__number">2025</span><span className="year-card__meta"><span className="year-pill"><span className="live-dot"/> FIRST CEREMONY</span><strong>第一届 · 年度颁奖典礼</strong><small>10 AWARDS + BONUS · 2025</small></span><span className="year-card__open"><MoveRight/></span><span className="year-card__ghost">25</span>
      </button>
      <button className="year-card year-card--ready year-card--2026" onClick={() => openCeremony(2026)}>
        <span className="year-card__number">2026</span><span className="year-card__meta"><span className="year-pill"><span className="year-moon"/> SECOND CEREMONY · OPENING</span><strong>第二届 · 在星空下继续同行</strong><small>15 AWARDS + GUEST PICK · 2026</small></span><span className="year-card__open"><MoveRight/></span><span className="year-card__ghost">26</span>
      </button>
    </section>
    <footer className="site-footer"><Brand/><p>A PERSONAL PROJECT. MADE OF GAMES, TIME & OPINION.</p><span>© BAKA AWARD 2025—2026</span></footer>
  </main>
}
