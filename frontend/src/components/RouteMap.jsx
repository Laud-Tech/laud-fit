// A route drawn as an SVG line. No map tiles, so nothing leaves the device and it works offline.
import { useMemo } from 'react'

export default function RouteMap({ points, height = 220 }) {
  const d = useMemo(() => {
    if (!points || points.length < 2) return null
    const lats = points.map(p => p[1]), lons = points.map(p => p[2])
    const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)]
    const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180)   // a degree of longitude is shorter away from the equator
    const w = Math.max((maxLon - minLon) * k, 1e-6), h = Math.max(maxLat - minLat, 1e-6), pad = Math.max(w, h) * 0.08
    const xy = p => [((p[2] - minLon) * k + pad).toFixed(7), (maxLat - p[1] + pad).toFixed(7)]
    return {
      vb: `0 0 ${w + pad * 2} ${h + pad * 2}`, r: Math.max(w, h) * 0.02,
      path: points.map((p, i) => (i ? 'L' : 'M') + xy(p).join(' ')).join(''), a: xy(points[0]), b: xy(points[points.length - 1])
    }
  }, [points])
  if (!d) return null
  return (
    <svg viewBox={d.vb} style={{ width: '100%', height, background: 'var(--surface-2)', borderRadius: 'var(--r-card)' }} role="img" aria-label="route">
      <path d={d.path} fill="none" stroke="var(--acc)" strokeWidth={d.r} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={d.a[0]} cy={d.a[1]} r={d.r * 1.6} fill="var(--green)" />
      <circle cx={d.b[0]} cy={d.b[1]} r={d.r * 1.6} fill="var(--red)" />
    </svg>
  )
}
