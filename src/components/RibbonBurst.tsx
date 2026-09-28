import type { CSSProperties } from 'react'

const ribbons = [
  { angle: -160, width: 18, bend: 58, phase: 0.3, color: 'violet', delay: 0 },
  { angle: -137, width: 13, bend: -43, phase: 1.1, color: 'ivory', delay: 70 },
  { angle: -116, width: 22, bend: 46, phase: 2.2, color: 'pink', delay: 130 },
  { angle: -96, width: 14, bend: -32, phase: 0.8, color: 'violet', delay: 40 },
  { angle: -77, width: 20, bend: 51, phase: 2.9, color: 'ivory', delay: 170 },
  { angle: -57, width: 12, bend: -49, phase: 1.9, color: 'violet', delay: 100 },
  { angle: -36, width: 21, bend: 36, phase: 0.1, color: 'pink', delay: 210 },
  { angle: -17, width: 15, bend: -54, phase: 2.5, color: 'violet', delay: 80 },
  { angle: 5, width: 22, bend: 45, phase: 1.5, color: 'ivory', delay: 180 },
  { angle: 26, width: 13, bend: -38, phase: 0.6, color: 'pink', delay: 50 },
  { angle: 46, width: 19, bend: 60, phase: 2.7, color: 'violet', delay: 150 },
  { angle: 66, width: 12, bend: -42, phase: 1.3, color: 'ivory', delay: 20 },
  { angle: 87, width: 21, bend: 37, phase: 2.1, color: 'violet', delay: 220 },
  { angle: 108, width: 14, bend: -56, phase: 0.4, color: 'pink', delay: 110 },
  { angle: 129, width: 20, bend: 43, phase: 1.7, color: 'ivory', delay: 190 },
  { angle: 151, width: 13, bend: -36, phase: 2.4, color: 'violet', delay: 60 },
  { angle: 174, width: 18, bend: 52, phase: 0.9, color: 'pink', delay: 140 },
  { angle: 195, width: 12, bend: -45, phase: 1.2, color: 'violet', delay: 90 },
]

type Ribbon = typeof ribbons[number]

function makeRibbonPath({ angle, width, bend, phase }: Ribbon) {
  const radians = angle * Math.PI / 180
  const direction = { x: Math.cos(radians), y: Math.sin(radians) }
  const normal = { x: -direction.y, y: direction.x }
  const length = 790
  const segments = 30
  const centerline = Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments
    const flutter = Math.sin(t * 9 + phase) * bend * t
    return {
      x: 500 + direction.x * length * t + normal.x * flutter,
      y: 500 + direction.y * length * t + normal.y * flutter,
      width: (Math.sin(t * Math.PI) * 0.72 + 0.28) * width * 1.6 * (0.22 + t * 0.78),
    }
  })

  const edge = (side: number) => centerline.map((point, index) => {
    const previous = centerline[Math.max(0, index - 1)]!
    const next = centerline[Math.min(segments, index + 1)]!
    const dx = next.x - previous.x
    const dy = next.y - previous.y
    const size = Math.hypot(dx, dy) || 1
    const offset = point.width * side / 2
    return `${index === 0 ? 'M' : 'L'} ${(point.x - dy / size * offset).toFixed(1)} ${(point.y + dx / size * offset).toFixed(1)}`
  }).join(' ')

  return `${edge(1)} ${centerline.slice().reverse().map((point, reverseIndex) => {
    const index = segments - reverseIndex
    const previous = centerline[Math.max(0, index - 1)]!
    const next = centerline[Math.min(segments, index + 1)]!
    const dx = next.x - previous.x
    const dy = next.y - previous.y
    const size = Math.hypot(dx, dy) || 1
    const offset = point.width / 2
    return `L ${(point.x + dy / size * offset).toFixed(1)} ${(point.y - dx / size * offset).toFixed(1)}`
  }).join(' ')} Z`
}

export function RibbonBurst() {
  return <div className="grand-reveal-burst" aria-hidden="true">
    <svg className="grand-reveal-burst__svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ribbon-violet" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#8171b3"/><stop offset=".34" stopColor="#b2a5db"/><stop offset=".52" stopColor="#fffaff"/><stop offset=".76" stopColor="#9c8cc9"/><stop offset="1" stopColor="#75639f"/></linearGradient>
        <linearGradient id="ribbon-pink" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#a85d7e"/><stop offset=".38" stopColor="#d793ae"/><stop offset=".54" stopColor="#fff0f5"/><stop offset=".8" stopColor="#cb7f9c"/><stop offset="1" stopColor="#97516f"/></linearGradient>
        <linearGradient id="ribbon-ivory" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#aaa2b4"/><stop offset=".4" stopColor="#fffdf8"/><stop offset=".55" stopColor="#fff"/><stop offset=".82" stopColor="#e7e0e9"/><stop offset="1" stopColor="#9b92a4"/></linearGradient>
        <radialGradient id="ribbon-flare"><stop stopColor="#f8eefa" stopOpacity=".9"/><stop offset=".25" stopColor="#aa9bd2" stopOpacity=".28"/><stop offset="1" stopColor="#aa9bd2" stopOpacity="0"/></radialGradient>
      </defs>
      <circle className="grand-reveal-burst__flare" cx="500" cy="500" r="175" fill="url(#ribbon-flare)"/>
      {ribbons.map((ribbon, index) => <g
        className="grand-reveal-burst__ribbon"
        key={ribbon.angle}
        style={{ '--ribbon-delay': `${ribbon.delay}ms`, '--ribbon-turn': `${index % 2 === 0 ? 1 : -1}deg` } as CSSProperties}
      >
        <path className="grand-reveal-burst__cloth" d={makeRibbonPath(ribbon)} fill={`url(#ribbon-${ribbon.color})`}/>
        <path className="grand-reveal-burst__shine" d={makeRibbonPath({ ...ribbon, width: Math.max(1.5, ribbon.width * 0.09), bend: ribbon.bend * 0.9 })}/>
      </g>)}
    </svg>
  </div>
}
