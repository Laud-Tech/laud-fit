// A standalone cardio session as a .fit activity (Garmin Connect, Strava, Intervals...): sport, one
// lap, and — when there is a route — a record per GPS point with position, altitude, distance, speed.
import { encodeFit, fitTime, MSG, SPORT, SUB_SPORT } from './fit-export.js'
import { haversine } from './cardio.js'

const SWIMMING = 5
const SPORTS = {
  run: [SPORT.running, SUB_SPORT.generic], treadmill_run: [SPORT.running, SUB_SPORT.treadmill],
  walk: [SPORT.walking, SUB_SPORT.generic], hike: [SPORT.walking, SUB_SPORT.generic], treadmill_walk: [SPORT.walking, SUB_SPORT.treadmill],
  cycling: [SPORT.cycling, SUB_SPORT.generic], mtb: [SPORT.cycling, SUB_SPORT.generic], stationary_bike: [SPORT.cycling, SUB_SPORT.indoorCycling],
  swim: [SWIMMING, SUB_SPORT.generic], rowing: [SPORT.rowing, SUB_SPORT.generic],
  elliptical: [SPORT.fitnessEquipment, SUB_SPORT.elliptical], stairs: [SPORT.fitnessEquipment, SUB_SPORT.stairClimbing],
}
export const sportOf = activity => SPORTS[activity] || [SPORT.generic, SUB_SPORT.generic]
const semi = deg => deg * (2 ** 31) / 180   // degrees -> semicircles

/** Points are [t_s, lat, lon, alt|null, acc|null], as stored. */
export function cardioFitMessages(s, points = [], { version = '' } = {}) {
  const T0 = fitTime(s.started), T1 = T0 + Math.round(s.duration_s)
  const ver = /^(\d+)\.(\d+)/.exec(String(version))
  const sw = ver ? Number(ver[1]) * 100 + Number(ver[2]) : undefined
  const [sport, sub] = sportOf(s.activity)
  const meters = s.distance_m > 0 ? s.distance_m : undefined
  const msgs = [
    { global: MSG.fileId, fields: [[0, 'enum', 4], [1, 'uint16', 255], [2, 'uint16', 0], [3, 'uint32z', (T0 >>> 0) || 1], [4, 'uint32', T0]] },
    { global: MSG.fileCreator, fields: [[0, 'uint16', sw]] },
    { global: MSG.event, fields: [[253, 'uint32', T0], [0, 'enum', 0], [1, 'enum', 0]] },
  ]
  let dist = 0
  points.forEach((p, i) => {
    const step = i ? haversine(points[i - 1], p) : 0, dt = i ? p[0] - points[i - 1][0] : 0
    dist += step
    msgs.push({ global: MSG.record, fields: [
      [253, 'uint32', T0 + p[0]], [0, 'sint32', semi(p[1])], [1, 'sint32', semi(p[2])],
      [2, 'uint16', p[3] == null ? undefined : (p[3] + 500) * 5],   // altitude, scale 5 offset 500
      [5, 'uint32', dist * 100],                                    // cm
      [6, 'uint16', dt > 0 ? step / dt * 1000 : undefined],         // mm/s
    ] })
  })
  msgs.push({ global: MSG.event, fields: [[253, 'uint32', T1], [0, 'enum', 0], [1, 'enum', 4]] })
  msgs.push({ global: MSG.lap, fields: [
    [254, 'uint16', 0], [253, 'uint32', T1], [0, 'enum', 9], [1, 'enum', 1], [2, 'uint32', T0],
    [7, 'uint32', s.duration_s * 1000], [8, 'uint32', (s.moving_s ?? s.duration_s) * 1000],
    [9, 'uint32', meters != null ? meters * 100 : undefined], [11, 'uint16', s.calories != null ? s.calories : undefined],
    [25, 'enum', sport], [39, 'enum', sub],
  ] })
  msgs.push({ global: MSG.session, fields: [
    [254, 'uint16', 0], [253, 'uint32', T1], [0, 'enum', 8], [1, 'enum', 1], [2, 'uint32', T0], [5, 'enum', sport], [6, 'enum', sub],
    [7, 'uint32', s.duration_s * 1000], [8, 'uint32', (s.moving_s ?? s.duration_s) * 1000],
    [9, 'uint32', meters != null ? meters * 100 : undefined],
    [11, 'uint16', s.calories != null ? s.calories : undefined],
    [14, 'uint16', meters && s.moving_s > 0 ? meters / s.moving_s * 1000 : undefined],
    [22, 'uint16', s.elev_gain_m > 0 ? s.elev_gain_m : undefined],
    [25, 'uint16', 0], [26, 'uint16', 1],
  ] })
  const offset = -new Date(s.started + s.duration_s * 1000).getTimezoneOffset() * 60
  msgs.push({ global: MSG.activity, fields: [[253, 'uint32', T1], [0, 'uint32', s.duration_s * 1000], [1, 'uint16', 1], [2, 'enum', 0], [3, 'enum', 26], [4, 'enum', 1], [5, 'uint32', T1 + offset]] })
  return msgs
}

export const cardioFit = (s, points, options) => encodeFit(cardioFitMessages(s, points, options))
