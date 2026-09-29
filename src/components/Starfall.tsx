export function Starfall() {
  return <div className="starfall" aria-hidden="true">
    {Array.from({ length: 24 }, (_, index) => <i key={index} style={{
      left: `${(index * 41 + 7) % 100}%`,
      top: `${(index * 67 + 13) % 82}%`,
      animationDelay: `${-(index % 9) * 0.48}s`,
    }}/>) }
    <span className="starfall__halo"/>
  </div>
}
