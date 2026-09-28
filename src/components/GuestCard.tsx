import { ArrowDownRight } from 'lucide-react'
import type { Guest } from '../types'

export function GuestCard({ guest, compact = false, image, year = 2025 }: { guest: Guest; compact?: boolean; image?: string; year?: number }) {
  const portrait = image ?? guest.image
  return <aside className={`guest-card ${compact ? 'guest-card--compact' : ''}`}>
    <div className={`guest-art ${portrait ? 'guest-art--image' : ''}`} aria-hidden="true">{portrait && <img className="image-fade" src={portrait} alt="" loading="lazy" decoding="async" onLoad={event => event.currentTarget.classList.add('is-loaded')}/>}<span className="guest-orbit guest-orbit--one"/><span className="guest-orbit guest-orbit--two"/>{!portrait && <span className="guest-sigil">{guest.name.slice(0, 1)}</span>}<span className="guest-art-label">GUEST / {year}</span></div>
    <div className="guest-copy"><div className="eyebrow"><span className="live-dot"/> THIS YEAR'S GUEST</div><h3>{guest.displayName}</h3><p>{guest.introduction}</p><div className="guest-foot"><span>{guest.theme}</span><ArrowDownRight size={17}/></div></div>
  </aside>
}
