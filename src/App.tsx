import { useState } from 'react'
import { Home } from './pages/Home'
import { Ceremony } from './pages/Ceremony'
import { year2025 } from './data/2025'
import { year2026 } from './data/2026'

export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  const go = (next: string) => { window.history.pushState({}, '', next); setPath(next); window.scrollTo(0, 0) }
  window.onpopstate = () => setPath(window.location.pathname)
  if (path === '/2025' || path === '/2025/') return <Ceremony data={year2025} onHome={() => go('/')}/>
  if (path === '/2026' || path === '/2026/') return <Ceremony data={year2026} onHome={() => go('/')}/>
  return <Home openCeremony={year => go(`/${year}`)}/>
}
