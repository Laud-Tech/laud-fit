import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { lastBW } from '../lib/history.js'
import { todayISO, uid } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { useWakeLock } from '../lib/wakelock.js'
import {
  ACTIVITIES, INDOOR_ONLY, GPS_CAPABLE, EFFORTS, filterTrack, trackStats, splits, bestEffort, caloriesFor,
  avgSpeedKmh, paceOf, fmtPace, fmtDuration, fmtDistance, toGpx
} from '../lib/cardio.js'
import { bind, getCardio, subscribe, saveSession, removeSession, flush, getTrack, loadDraft, saveDraft, clearDraft } from '../lib/cardio-sync.js'
import Icon from '../components/Icon.jsx'
import RouteMap from '../components/RouteMap.jsx'
import { Button, NumberField, Section, Segmented, SelectRow, TextField } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'

const LABEL = {
  run: 'Running', walk: 'Walking', hike: 'Hiking', cycling: 'Cycling', mtb: 'Mountain biking',
  stationary_bike: 'Stationary bike', treadmill_run: 'Treadmill running', treadmill_walk: 'Treadmill walking',
  inline: 'Inline skating', swim: 'Swimming', rowing: 'Rowing', elliptical: 'Elliptical', stairs: 'Stair climbing',
  jump_rope: 'Jump rope', other: 'Other cardio'
}
const ICON = { run: 'figureRun', walk: 'figureRun', hike: 'figureRun', treadmill_run: 'figureRun', treadmill_walk: 'figureRun', cycling: 'bike', mtb: 'bike', stationary_bike: 'bike', swim: 'swim' }
const toast = m => useUI.getState().toast(m)
const actOptions = () => ACTIVITIES.map(a => ({ value: a, label: t(LABEL[a]) }))
const envOptions = () => [{ value: 'outdoor', label: t('Outdoor') }, { value: 'indoor', label: t('Indoor') }]
const dayOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtWhen = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
// Body weight is stored in the profile's unit; calories want kg. 70 kg when nothing was ever logged.
const weightKg = S => { const w = lastBW(S)?.w; return w ? (S.unit === 'lb' ? w / 2.2046226218 : w) : 70 }

const useCardio = () => useSyncExternalStore(subscribe, getCardio)

function stats(s) {
  const v = avgSpeedKmh(s)
  return [
    [t('Distance'), s.distance_m != null ? fmtDistance(s.distance_m) : '–'],
    [t('Time'), fmtDuration(s.duration_s)],
    [t('Pace'), paceOf(s) ? fmtPace(paceOf(s)) + ' /km' : '–'],
    [t('Speed'), v ? v.toFixed(1) + ' km/h' : '–'],
    [t('Calories'), s.calories != null ? '≈ ' + Math.round(s.calories) + ' kcal' : '–'],
    [t('Elevation'), s.elev_gain_m ? '+' + Math.round(s.elev_gain_m) + ' m' : '–']
  ]
}
const Grid = ({ items }) => <div className="cols" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
  {items.map(([l, v]) => <div className="tile" key={l}><div className="l">{l}</div><div className="v" style={{ fontSize: '1.05rem' }}>{v}</div></div>)}
</div>

/* ---------------------------------- detail ---------------------------------- */

function Detail({ s, close }) {
  const [pts, setPts] = useState(undefined)   // undefined = loading, null = could not load
  useEffect(() => { if (s.has_track) getTrack(s.id).then(setPts); else setPts([]) }, [s.id, s.has_track])
  const sp = useMemo(() => (pts && pts.length > 1 ? splits(pts) : []), [pts])
  const efforts = useMemo(() => (pts && pts.length > 1 ? EFFORTS.map(d => [d, bestEffort(pts, d)]).filter(e => e[1]) : []), [pts])
  const gpx = () => {
    const x = toGpx(s, pts)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([x], { type: 'application/gpx+xml' }))
    a.download = `laudfit-${dayOf(s.started)}-${s.activity}.gpx`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const del = () => confirmSheet({
    title: t('Delete this activity?'), message: t('The activity and its route are removed.'), confirmText: t('Delete'), danger: true,
    onConfirm: () => { removeSession(s.id); close(); toast(t('Activity deleted')) }
  })
  return <>
    <h3>{t(LABEL[s.activity])} · {s.env === 'indoor' ? t('Indoor') : t('Outdoor')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{fmtWhen(s.started)}{s.note ? ' · ' + s.note : ''}</div>
    <Grid items={stats(s)} />
    {s.source !== 'gps' && <div className="muted small" style={{ marginTop: 8 }}>{s.source === 'estimated' ? t('Distance estimated from speed and time.') : t('Entered by hand.')}</div>}
    {pts === undefined && <div className="muted small" style={{ marginTop: 12 }}>{t('Loading route…')}</div>}
    {pts === null && <div className="muted small" style={{ marginTop: 12 }}>{t('Route unavailable offline.')}</div>}
    {pts && pts.length > 1 && <div style={{ marginTop: 12 }}><RouteMap points={pts} /></div>}
    {efforts.length > 0 && <Section title={t('Best efforts')}>
      {efforts.map(([d, sec]) => <div className="lrow" key={d}><span className="lrow-m"><span className="lrow-t">{d / 1000} km</span></span><span>{fmtDuration(sec)}</span></div>)}
    </Section>}
    {sp.length > 0 && <Section title={t('Splits')}>
      {sp.map(x => <div className="lrow" key={x.n}><span className="lrow-m"><span className="lrow-t">{x.partial ? fmtDistance(x.distance_m) : x.n + ' km'}</span></span>
        <span>{fmtPace(x.s / (x.distance_m / 1000))} /km</span></div>)}
    </Section>}
    <div style={{ height: 14 }} />
    {pts && pts.length > 1 && <><Button icon="download" onClick={gpx}>{t('Export GPX')}</Button><div style={{ height: 8 }} /></>}
    <Button variant="ghost" icon="trash" onClick={del}>{t('Delete')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Close')}</Button>
  </>
}
const detailSheet = s => useUI.getState().openSheet(close => <Detail s={s} close={close} />)

/* ----------------------------- manual / treadmill entry ----------------------------- */

function Manual({ preset, close }) {
  const S = useStore(s => s.S)
  const [activity, setActivity] = useState(preset.activity)
  const [env, setEnv] = useState(preset.env)
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('07:00')
  const [min, setMin] = useState(30)
  const [km, setKm] = useState(null)
  const [speed, setSpeed] = useState(null)
  const [note, setNote] = useState('')
  const pick = a => { setActivity(a); if (INDOOR_ONLY.has(a)) setEnv('indoor') }
  const save = () => {
    const duration = Math.round((+min || 0) * 60)
    if (duration < 60) { toast(t('Enter the duration')); return }
    const started = new Date(`${date}T${time}`).getTime()
    if (!(started > 0) || started > Date.now()) { toast(t('Choose a valid date')); return }
    // Distance typed wins; otherwise speed x time (a treadmill shows speed, not distance).
    const dist = km > 0 ? Math.round(km * 1000) : speed > 0 ? Math.round(speed * 1000 * duration / 3600) : null
    saveSession({
      id: uid().padEnd(8, '0') + Math.random().toString(36).slice(2, 8), activity, env, source: km > 0 ? 'manual' : dist ? 'estimated' : 'manual', started,
      duration_s: duration, moving_s: duration, distance_m: dist, elev_gain_m: null,
      calories: caloriesFor(activity, weightKg(S), duration, dist), note: note.trim().slice(0, 500)
    })
    close(); toast(t('Activity saved'))
  }
  return <>
    <h3>{t('Add activity')}</h3>
    <SelectRow title={t('Activity')} sheetTitle={t('Activity')} value={activity} onChange={pick} options={actOptions()} />
    <div style={{ height: 8 }} />
    <Segmented value={env} onChange={setEnv} options={envOptions()} />
    <div className="measure-form" style={{ marginTop: 12 }}>
      <label className="measure-field"><span>{t('Date')}</span><input className="field" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} /></label>
      <label className="measure-field"><span>{t('Start')}</span><input className="field" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
      <label className="measure-field"><span>{t('Duration')}</span><span className="measure-input"><NumberField value={min} onChange={setMin} /><i>min</i></span></label>
      <label className="measure-field"><span>{t('Distance')}</span><span className="measure-input"><NumberField nullable value={km} onChange={setKm} /><i>km</i></span></label>
      <label className="measure-field"><span>{t('Average speed')}</span><span className="measure-input"><NumberField nullable value={speed} onChange={setSpeed} /><i>km/h</i></span></label>
    </div>
    <div className="muted small" style={{ margin: '6px 0 10px' }}>{t('Without a distance, the speed and the time give an estimate. Leave both empty if you do not know.')}</div>
    <TextField placeholder={t('Note')} value={note} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
const manualSheet = preset => useUI.getState().openSheet(close => <Manual preset={preset} close={close} />)

/* ----------------------------------- recorder ----------------------------------- */

// One recording: wall-clock based (a timer that stops in a background tab still reads right), GPS
// fixes appended as they come. ponytail: a pause only stops the clock and the fixes; the leg that
// joins the last fix before to the first after counts as distance. Add a track-break marker if
// people walk during a pause.
function Recorder({ cfg, onDone }) {
  const S = useStore(s => s.S)
  const [rec, setRec] = useState(() => cfg.resume || { id: uid().padEnd(8, '0') + Math.random().toString(36).slice(2, 8), started: Date.now(), paused: 0, pausedAt: null, pts: [] })
  const [, tick] = useState(0)
  const [gpsErr, setGpsErr] = useState('')
  const ref = useRef(rec); ref.current = rec
  const useGps = cfg.gps
  useWakeLock(true)
  useEffect(() => { const i = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(i) }, [])
  useEffect(() => { // draft every 10 s so a reload does not lose the run
    const i = setInterval(() => saveDraft({ cfg: { activity: cfg.activity, env: cfg.env, gps: cfg.gps }, rec: ref.current }), 10000)
    return () => clearInterval(i)
  }, [cfg])
  useEffect(() => {
    if (!useGps || !navigator.geolocation) return
    const w = navigator.geolocation.watchPosition(pos => {
      const r = ref.current
      if (r.pausedAt) return
      const p = [Math.round((Date.now() - r.started - r.paused) / 1000), pos.coords.latitude, pos.coords.longitude,
        pos.coords.altitude, pos.coords.accuracy != null ? pos.coords.accuracy : null]
      setRec({ ...r, pts: [...r.pts, p] })
    }, e => setGpsErr(e.code === 1 ? t('Location permission denied.') : t('No GPS signal yet.')), { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 })
    return () => navigator.geolocation.clearWatch(w)
  }, [useGps])

  const elapsed = Math.max(0, Math.round(((rec.pausedAt || Date.now()) - rec.started - rec.paused) / 1000))
  const good = useMemo(() => filterTrack(rec.pts), [rec.pts])
  const live = useMemo(() => trackStats(good), [good])
  const toggle = () => setRec(r => r.pausedAt ? { ...r, paused: r.paused + Date.now() - r.pausedAt, pausedAt: null } : { ...r, pausedAt: Date.now() })
  const finish = () => {
    const r = ref.current, dur = Math.max(1, Math.round(((r.pausedAt || Date.now()) - r.started - r.paused) / 1000))
    const st = trackStats(good), moving = useGps && good.length > 1 ? Math.min(st.moving_s || dur, dur) : dur
    const dist = useGps && good.length > 1 ? st.distance_m : null
    saveSession({
      id: r.id, activity: cfg.activity, env: cfg.env, source: dist != null ? 'gps' : 'manual', started: r.started,
      duration_s: dur, moving_s: moving, distance_m: dist, elev_gain_m: dist != null ? st.elev_gain_m : null,
      calories: caloriesFor(cfg.activity, weightKg(S), moving, dist), note: ''
    }, dist != null ? good : undefined)
    clearDraft(); onDone(); toast(t('Activity saved'))
  }
  const discard = () => confirmSheet({
    title: t('Discard this recording?'), message: t('Nothing is saved.'), confirmText: t('Discard'), danger: true,
    onConfirm: () => { clearDraft(); onDone() }
  })
  const cur = { distance_m: live.distance_m, moving_s: live.moving_s || elapsed }
  return <div className="narrow">
    <div className="hdr"><div><h1>{t(LABEL[cfg.activity])}</h1><div className="sub">{cfg.env === 'indoor' ? t('Indoor') : t('Outdoor')}{useGps ? ' · GPS' : ''}</div></div></div>
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="big" style={{ fontSize: '3rem' }}>{fmtDuration(elapsed)}</div>
      {useGps && <>
        <div className="big" style={{ marginTop: 6 }}>{fmtDistance(live.distance_m)}</div>
        <div className="muted small">{paceOf(cur) ? fmtPace(paceOf(cur)) + ' /km' : '– /km'}{live.elev_gain_m ? ` · +${live.elev_gain_m} m` : ''}</div>
        {gpsErr && !good.length && <div className="small" style={{ color: 'var(--orange)', marginTop: 8 }}>{gpsErr}</div>}
        {!navigator.geolocation && <div className="small" style={{ color: 'var(--orange)', marginTop: 8 }}>{t('This device has no GPS.')}</div>}
      </>}
      {rec.pausedAt && <div className="muted" style={{ marginTop: 8 }}>{t('Paused')}</div>}
    </div>
    <div className="row" style={{ gap: 8, marginTop: 12 }}>
      <Button style={{ flex: 1 }} icon={rec.pausedAt ? 'play' : 'pause'} onClick={toggle}>{rec.pausedAt ? t('Resume') : t('Pause')}</Button>
      <Button style={{ flex: 1 }} variant="primary" icon="check" onClick={finish}>{t('Finish')}</Button>
    </div>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={discard}>{t('Discard')}</Button>
  </div>
}

/* ------------------------------------ screen ------------------------------------ */

export default function Cardio() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const { sessions } = useCardio()
  const [activity, setActivity] = useState('run')
  const [env, setEnv] = useState('outdoor')
  const [cfg, setCfg] = useState(() => { const d = loadDraft(); return d ? { ...d.cfg, resume: d.rec } : null })
  useEffect(() => { bind(user?.id || 'guest'); flush() }, [user?.id])

  const pick = a => { setActivity(a); setEnv(INDOOR_ONLY.has(a) ? 'indoor' : a === 'mtb' || a === 'hike' || a === 'inline' ? 'outdoor' : env) }
  const gps = env === 'outdoor' && GPS_CAPABLE.has(activity)
  const week = useMemo(() => {
    const from = Date.now() - 7 * 86400000, w = sessions.filter(s => s.started >= from)
    return { n: w.length, m: w.reduce((a, s) => a + s.duration_s, 0), d: w.reduce((a, s) => a + (s.distance_m || 0), 0), k: w.reduce((a, s) => a + (s.calories || 0), 0) }
  }, [sessions])

  if (cfg) return <Recorder cfg={cfg} onDone={() => setCfg(null)} />
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Cardio')}</h1><div className="sub">{t('Runs, rides, swims and other one-off activities')}</div></div>
    </div>
    <div className="card">
      <SelectRow title={t('Activity')} sheetTitle={t('Activity')} value={activity} onChange={pick} options={actOptions()} />
      <div style={{ height: 8 }} />
      <Segmented value={env} onChange={setEnv} options={envOptions()} />
      <div className="muted small" style={{ margin: '8px 0 12px' }}>{gps ? t('GPS records the distance and the route. Keep the screen on.') : t('No GPS: add the time now and the distance when you finish, or enter it by hand.')}</div>
      <div className="row" style={{ gap: 8 }}>
        <Button style={{ flex: 1 }} variant="primary" icon="play" onClick={() => setCfg({ activity, env, gps })}>{t('Start')}</Button>
        <Button style={{ flex: 1 }} icon="plus" onClick={() => manualSheet({ activity, env })}>{t('Add manually')}</Button>
      </div>
    </div>
    <Section title={t('Last 7 days')}>
      <Grid items={[[t('Activities'), String(week.n)], [t('Distance'), fmtDistance(week.d)], [t('Time'), fmtDuration(week.m)]]} />
    </Section>
    <Section title={t('History')}>
      {sessions.length === 0 && <div className="empty small">{t('No activities yet.')}</div>}
      {sessions.map(s => <button key={s.id} className="lrow" onClick={() => detailSheet(s)}>
        <Icon name={ICON[s.activity] || 'timer'} />
        <span className="lrow-m"><span className="lrow-t">{t(LABEL[s.activity])} · {s.env === 'indoor' ? t('Indoor') : t('Outdoor')}</span>
          <span className="lrow-s">{fmtWhen(s.started)}</span></span>
        <span style={{ textAlign: 'right' }}>{s.distance_m != null ? fmtDistance(s.distance_m) : fmtDuration(s.duration_s)}
          {s.distance_m != null && <div className="muted small">{fmtDuration(s.duration_s)}</div>}</span>
      </button>)}
    </Section>
  </div>
}
