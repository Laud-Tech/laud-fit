// Laud Fit standalone cardio: the maths behind a session (distance, pace, splits, calories, best
// efforts, GPX). Pure, no DOM, no network — the recorder and the views only feed it points.
// A point is [t seconds from start, lat, lon, alt|null, accuracy|null], the shape the API stores.

export const ACTIVITIES = [
  'run', 'walk', 'hike', 'cycling', 'mtb', 'stationary_bike', 'treadmill_run', 'treadmill_walk',
  'inline', 'swim', 'rowing', 'elliptical', 'stairs', 'jump_rope', 'other'
]
// Which of them are indoor by nature (the start sheet pre-selects it; the person can still flip
// run/walk/cycling/other, so a street walk and a treadmill walk stay apart).
export const INDOOR_ONLY = new Set(['stationary_bike', 'treadmill_run', 'treadmill_walk', 'elliptical', 'stairs'])
// GPS only makes sense outdoors and for things that travel.
export const GPS_CAPABLE = new Set(['run', 'walk', 'hike', 'cycling', 'mtb', 'inline', 'rowing', 'other'])

const rad = d => d * Math.PI / 180
/** Metres between two [.., lat, lon] points (haversine). */
export function haversine(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[2] - a[2])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Drops fixes a phone is unsure of, jitter while standing still, and impossible jumps. */
export function filterTrack(points, { maxAcc = 30, minStep = 3, maxSpeed = 40 } = {}) {
  const out = []
  for (const p of points) {
    if (p[4] != null && p[4] > maxAcc) continue
    const last = out[out.length - 1]
    if (last) {
      const d = haversine(last, p), dt = p[0] - last[0]
      if (d < minStep) continue
      if (dt > 0 && d / dt > maxSpeed) continue
    }
    out.push(p)
  }
  return out
}

/** Gain of the altitude series, ignoring wobble smaller than `threshold` metres. */
export function elevationGain(points, threshold = 3) {
  let gain = 0, ref = null
  for (const p of points) {
    if (p[3] == null) continue
    if (ref == null) { ref = p[3]; continue }
    if (p[3] - ref >= threshold) { gain += p[3] - ref; ref = p[3] }
    else if (ref - p[3] >= threshold) ref = p[3]
  }
  return Math.round(gain)
}

/**
 * Totals of a (filtered) track. A leg slower than `pauseSpeed` m/s is a stop and does not count
 * as moving time, so a red light does not wreck the average pace.
 */
export function trackStats(points, { pauseSpeed = 0.5 } = {}) {
  let distance = 0, moving = 0
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]), dt = points[i][0] - points[i - 1][0]
    distance += d
    if (dt > 0 && d / dt >= pauseSpeed) moving += dt
  }
  const duration = points.length > 1 ? points[points.length - 1][0] - points[0][0] : 0
  return { distance_m: Math.round(distance), moving_s: Math.round(moving), duration_s: Math.round(duration), elev_gain_m: elevationGain(points) }
}

// Cumulative metres at each point.
const cumulative = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + haversine(pts[i - 1], pts[i])); return c }

/** Time (s) at which the cumulative distance `c` reaches `d`, interpolated between points. */
function timeAt(pts, c, d) {
  let i = 1
  while (i < c.length - 1 && c[i] < d) i++
  const span = c[i] - c[i - 1]
  return pts[i - 1][0] + (span > 0 ? (d - c[i - 1]) / span : 0) * (pts[i][0] - pts[i - 1][0])
}

/** Seconds per full `size` metres (1 km by default); the leftover is a last, shorter split. */
export function splits(points, size = 1000) {
  if (points.length < 2) return []
  const c = cumulative(points), total = c[c.length - 1], out = []
  let from = points[0][0]
  for (let d = size; d <= total; d += size) {
    const t = timeAt(points, c, d)
    out.push({ n: out.length + 1, distance_m: size, s: Math.round(t - from) }); from = t
  }
  const rest = total - out.length * size
  if (rest >= size * 0.05) out.push({ n: out.length + 1, distance_m: Math.round(rest), s: Math.round(points[points.length - 1][0] - from), partial: true })
  return out
}

/** Fastest time (s) over any stretch of `target` metres inside the track, or null if it is shorter. */
export function bestEffort(points, target) {
  if (points.length < 2) return null
  const c = cumulative(points)
  if (c[c.length - 1] < target) return null
  let best = Infinity
  for (let i = 0; i < points.length; i++) {
    if (c[i] + target > c[c.length - 1]) break
    best = Math.min(best, timeAt(points, c, c[i] + target) - points[i][0])
  }
  return Math.round(best)
}
export const EFFORTS = [1000, 5000, 10000]

/** At most `max` points, always keeping the first and the last (offline outbox, GPX size). */
export function decimate(points, max = 3000) {
  if (points.length <= max) return points
  const step = (points.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)])
}

// ---- calories -------------------------------------------------------------------------------
// MET values after the Compendium of Physical Activities, simplified. They make an estimate of
// energy use, not a measurement, and the UI says so.
const bySpeed = (table, kmh) => { for (const [limit, met] of table) if (kmh < limit) return met; return table[table.length - 1][1] }
const RUN = [[8, 8.3], [9.7, 9.8], [11.3, 11], [12.9, 11.8], [14.5, 12.8], [16.1, 14.5], [Infinity, 16]]
const WALK = [[3.2, 2.8], [4.8, 3.5], [5.6, 4.3], [6.4, 5], [Infinity, 6.5]]
const CYCLE = [[16, 4], [19, 6.8], [22, 8], [26, 10], [Infinity, 12]]
const FLAT_MET = { hike: 6, mtb: 8.5, stationary_bike: 7, inline: 7.5, swim: 7, rowing: 7, elliptical: 5, stairs: 8.8, jump_rope: 11.8, other: 5 }

export function metFor(activity, kmh) {
  const v = Number.isFinite(kmh) && kmh > 0 ? kmh : null
  if (activity === 'run' || activity === 'treadmill_run') return v ? bySpeed(RUN, v) : 9.8
  if (activity === 'walk' || activity === 'treadmill_walk') return v ? bySpeed(WALK, v) : 3.5
  if (activity === 'cycling') return v ? bySpeed(CYCLE, v) : 6.8
  return FLAT_MET[activity] ?? 5
}
/** kcal = MET x kg x hours, from moving time (a stop burns little). */
export function caloriesFor(activity, weightKg, movingS, distanceM) {
  if (!(weightKg > 0) || !(movingS > 0)) return null
  const kmh = distanceM > 0 ? distanceM / 1000 / (movingS / 3600) : null
  return Math.round(metFor(activity, kmh) * weightKg * movingS / 3600)
}

// ---- display --------------------------------------------------------------------------------
export const avgSpeedKmh = s => (s.distance_m > 0 && s.moving_s > 0 ? s.distance_m / 1000 / (s.moving_s / 3600) : null)
/** Seconds per km as "m:ss", or "–" when there is no pace. */
export function fmtPace(secPerKm) {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '–'
  const s = Math.round(secPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const paceOf = s => (s.distance_m > 0 && s.moving_s > 0 ? s.moving_s / (s.distance_m / 1000) : null)
/** 3725 -> "1:02:05", 125 -> "2:05". */
export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
/** Metres as "5.20 km" (or "850 m" under a kilometre). */
export const fmtDistance = m => (!Number.isFinite(m) ? '–' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`)

// ---- miles --------------------------------------------------------------------------------
// Everything is stored in metres and seconds; `imp` (the profile reads mph) only changes display.
export const M_PER_MI = 1609.344
/** "3.11 mi" (or "850 yd" under a tenth of a mile is overkill: feet are not tracked, so under 0.1 mi shows 0.xx mi). */
export const fmtDist = (m, imp) => (!imp ? fmtDistance(m) : !Number.isFinite(m) ? '–' : `${(m / M_PER_MI).toFixed(2)} mi`)
/** Pace "m:ss /km" or "m:ss /mi". */
export const fmtPaceU = (secPerKm, imp) => `${fmtPace(imp ? secPerKm * M_PER_MI / 1000 : secPerKm)} ${imp ? '/mi' : '/km'}`
export const fmtSpeedU = (kmh, imp) => `${(imp ? kmh * 1000 / M_PER_MI : kmh).toFixed(1)} ${imp ? 'mph' : 'km/h'}`
export const splitSize = imp => (imp ? M_PER_MI : 1000)
/** What a person types in the distance / speed fields, back to km and km/h. */
export const toKm = (v, imp) => (imp ? v * M_PER_MI / 1000 : v)

// ---- export ---------------------------------------------------------------------------------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
/** GPX 1.1 for one outdoor session; null when there is no route to write. */
export function toGpx(session, points) {
  if (!points || points.length < 2) return null
  const pt = p => `<trkpt lat="${p[1]}" lon="${p[2]}">${p[3] != null ? `<ele>${p[3]}</ele>` : ''}<time>${new Date(session.started + p[0] * 1000).toISOString()}</time></trkpt>`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Laud Fit" xmlns="http://www.topografix.com/GPX/1/1">` +
    `<metadata><time>${new Date(session.started).toISOString()}</time></metadata>` +
    `<trk><name>${esc(session.note || session.activity)}</name><type>${esc(session.activity)}</type><trkseg>${points.map(pt).join('')}</trkseg></trk></gpx>\n`
}
