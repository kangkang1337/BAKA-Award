import { Suspense, lazy, useState } from 'react'
import { Home } from './pages/Home'
import { Ceremony } from './pages/Ceremony'
import { year2025 } from './data/2025'
import { year2026 } from './data/2026'

const MobileEx2026 = lazy(() => import('./pages/MobileEx2026').then(module => ({ default: module.MobileEx2026 })))

export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  const go = (next: string) => { window.history.pushState({}, '', next); setPath(next); window.scrollTo(0, 0) }
  window.onpopstate = () => setPath(window.location.pathname)
  if (path === '/2026/ex/mobile' || path === '/2026/ex/mobile/') return <Suspense fallback={<main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', color: '#626c6d', background: '#f5f2e9' }}>打开手机里的小日子…</main>}><MobileEx2026 onHome={() => go('/')}/></Suspense>
  if (path === '/2025' || path === '/2025/') return <Ceremony data={year2025} onHome={() => go('/')}/>
  if (path === '/2026' || path === '/2026/') return <Ceremony data={year2026} onHome={() => go('/')}/>
  return <Home openCeremony={year => go(`/${year}`)} openMobileEx={() => go('/2026/ex/mobile')}/>
}
