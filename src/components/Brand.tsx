import { ArrowUpRight } from 'lucide-react'

export function Brand({ onHome }: { onHome?: () => void }) {
  return <a className="brand" href="/" onClick={onHome ? (e) => { e.preventDefault(); onHome() } : undefined} aria-label="BAKA AWARD 首页">
    <span className="brand-mark">B<span>.</span></span><span className="brand-name">BAKA AWARD</span><ArrowUpRight size={14} />
  </a>
}
