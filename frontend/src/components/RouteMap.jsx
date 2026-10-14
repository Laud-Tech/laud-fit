// A route as an SVG line, optionally over OpenStreetMap tiles. Off by default: the tiles come
// from tile.openstreetmap.org, which sees the area on screen, so the person turns them on.
import { useMemo } from 'react'
import { mapLayout } from '../lib/cardio-map.js'

export default function RouteMap({ points, tiles = false, height = 260 }) {
  const m = useMemo(() => mapLayout(points), [points])
  if (!m) return null
  const [a, b] = [m.line[0], m.line[m.line.length - 1]]
  return (
    <svg viewBox={`0 0 ${m.width} ${m.height}`} style={{ width: '100%', height, display: 'block', background: 'var(--surface-2)', borderRadius: 'var(--r-card)' }}
      role="img" aria-label="route" preserveAspectRatio="xMidYMid slice">
      {tiles && m.tiles.map(x => <image key={x.url + x.x} href={x.url} x={x.x} y={x.y} width="256" height="256" referrerPolicy="no-referrer" />)}
      <path d={m.line.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')} fill="none"
        stroke="#fff" strokeOpacity={tiles ? 0.9 : 0} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d={m.line.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')} fill="none"
        stroke="var(--acc)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={a[0]} cy={a[1]} r="8" fill="var(--green)" stroke="#fff" strokeWidth="2" />
      <circle cx={b[0]} cy={b[1]} r="8" fill="var(--red)" stroke="#fff" strokeWidth="2" />
      {tiles && <text x={m.width - 6} y={m.height - 6} textAnchor="end" fontSize="11" fill="#333" stroke="#fff" strokeWidth="3" paintOrder="stroke">© OpenStreetMap contributors</text>}
    </svg>
  )
}
