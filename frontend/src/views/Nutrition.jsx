import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { lastBW } from '../lib/history.js'
import { todayISO, isoOf, uid, fmtDate, DAYN, DAYS } from '../lib/format.js'
import { t, getLang, useLang } from '../lib/i18n.js'
import {
  MEALS, ACTIVITY, macrosOf, dayTotals, portionGrams, roundMacros, searchFoods, nameOf, expandDish,
  dailyGoal, weeksToGoal, bmi,
  weekSummary, planWith, planEntries, toggleSupp, weekdayOf
} from '../lib/nutrition.js'
import { bind, getNutrition, subscribe, editDay, dayOf, saveFood, removeFood, saveGoal, savePlan, saveSupp, flush } from '../lib/nutrition-sync.js'
import { bind as bindCardio, getCardio, subscribe as subCardio } from '../lib/cardio-sync.js'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Section, Segmented, SelectRow, TextField } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'
import { appBase } from '../lib/app-base.js'
import { shrinkPhoto } from '../lib/food-photo.js'

const toast = m => useUI.getState().toast(m)
// Library foods have a photo under /food/<id>.webp; your own carry theirs as a small data URL.
const photoOf = f => (f?.photo ? f.photo : f && !f.custom && !String(f.id).startsWith('my-') && !String(f.id).startsWith('dish:') ? appBase().replace(/\/$/, '') + '/food/' + f.id + '.webp' : null)
const Pic = ({ food, size = 40 }) => { const src = photoOf(food); return src ? <img src={src} alt="" width={size} height={size} loading="lazy" style={{ borderRadius: 8, objectFit: 'cover', flex: 'none', background: 'var(--surface-2)' }} onError={e => { e.currentTarget.style.display = 'none' }} /> : <span style={{ width: size, flex: 'none' }} /> }
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' }
const useNutrition = () => useSyncExternalStore(subscribe, getNutrition)
const useCardioSessions = () => useSyncExternalStore(subCardio, getCardio).sessions
const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const weightKg = S => { const w = lastBW(S)?.w; return w ? Math.round((S.unit === 'lb' ? w / 2.2046226218 : w) * 10) / 10 : 70 }
const dayOfMs = ms => isoOf(new Date(ms))

// The bundled food table (about 230 KB) is its own chunk, fetched the first time it is needed.
let dataPromise
const loadData = () => (dataPromise ??= import('../data/foods.json').then(m => m.default))
const useData = () => { const [d, setD] = useState(null); useEffect(() => { loadData().then(setD) }, []); return d }

const Bar = ({ label, v, goal, color }) => <div style={{ flex: 1 }}>
  <div className="muted small">{label}</div>
  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', margin: '4px 0' }}>
    <div style={{ height: 6, borderRadius: 3, width: Math.min(100, goal ? v / goal * 100 : 0) + '%', background: color }} />
  </div>
  <div className="small">{Math.round(v)}{goal ? ` / ${goal}` : ''} g</div>
</div>

/* ---------------------------------- goal ---------------------------------- */

function Goal({ S, close }) {
  const g = getNutrition().goal || {}
  const pr = g.profile || {}
  const [sex, setSex] = useState(pr.sex || 'male')
  const [age, setAge] = useState(pr.age || 30)
  const [cm, setCm] = useState(pr.cm || 170)
  const [kg, setKg] = useState(weightKg(S))
  const [activity, setActivity] = useState(pr.activity || 'light')
  const [weekly, setWeekly] = useState(pr.weekly ?? -0.5)
  const [target, setTarget] = useState(pr.target ?? null)
  const calc = useMemo(() => dailyGoal({ sex, kg, cm, age }, activity, weekly), [sex, kg, cm, age, activity, weekly])
  const weeks = target ? weeksToGoal(kg, target, weekly) : null
  const save = () => {
    saveGoal({ kcal: calc.kcal, p: calc.p, c: calc.c, f: calc.f, profile: { sex, age, cm, kg, activity, weekly, target } })
    close(); toast(t('Goal saved'))
  }
  const field = (label, unit, v, set, nullable) => <label className="measure-field"><span>{label}</span>
    <span className="measure-input"><NumberField nullable={nullable} value={v} onChange={set} /><i>{unit}</i></span></label>
  return <>
    <h3>{t('Daily goal')}</h3>
    <Segmented value={sex} onChange={setSex} options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
    <div className="measure-form" style={{ marginTop: 12 }}>
      {field(t('Age'), t('years'), age, setAge)}
      {field(t('Height'), 'cm', cm, setCm)}
      {field(t('Weight'), 'kg', kg, setKg)}
      {field(t('Goal weight'), 'kg', target, setTarget, true)}
    </div>
    <SelectRow title={t('Activity')} sheetTitle={t('Activity')} value={activity} onChange={setActivity}
      options={Object.keys(ACTIVITY).map(k => ({ value: k, label: t({ sedentary: 'Sedentary', light: 'Light', moderate: 'Moderate', active: 'Active', athlete: 'Athlete' }[k]) }))} />
    <SelectRow title={t('Weekly change')} sheetTitle={t('Weekly change')} value={weekly} onChange={setWeekly}
      options={[-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5].map(v => ({ value: v, label: v === 0 ? t('Maintain weight') : `${v > 0 ? '+' : ''}${v} kg / ${t('week')}` }))} />
    <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
      <div className="big">{calc.kcal} kcal</div>
      <div className="muted small">{t('P {0} g · C {1} g · F {2} g', calc.p, calc.c, calc.f)}</div>
      <div className="muted small" style={{ marginTop: 6 }}>{t('Maintenance about {0} kcal · BMI {1}', calc.maintenance, bmi(kg, cm))}{weeks ? ' · ' + t('about {0} weeks to your goal', weeks) : ''}</div>
      {calc.floored && <div className="small" style={{ color: 'var(--orange)', marginTop: 6 }}>{t('That deficit is below the safe minimum, so the goal was raised to {0} kcal. Talk to a professional before eating less.', calc.kcal)}</div>}
    </div>
    <div className="muted small" style={{ margin: '8px 0' }}>{t('Estimates only, not medical advice.')}</div>
    <Button variant="primary" onClick={save}>{t('Save goal')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/* ------------------------------ portion / amount ------------------------------ */

function Amount({ item, meal, date, entry, close }) {
  // item: { id, name, per100 (macros per 100 g), kind, g } — a food, or a dish already summed (per100 of its total).
  const [grams, setGrams] = useState(entry ? entry.grams : portionGrams(item))
  const m = roundMacros(macrosOf(item.per100, grams))
  const save = () => {
    if (!(grams > 0)) { toast(t('Enter the amount')); return }
    const e = { id: entry?.id || uid(), meal: entry?.meal || meal, food: item.id, name: item.name, grams: Math.round(grams), m, t: entry?.t || Date.now() }
    editDay(date, d => ({ ...d, entries: entry ? d.entries.map(x => (x.id === e.id ? e : x)) : [...d.entries, e] }))
    close(); toast(t('Added'))
  }
  const del = () => { editDay(date, d => ({ ...d, entries: d.entries.filter(x => x.id !== entry.id) })); close() }
  return <>
    <div className="row" style={{ gap: 12, alignItems: 'center' }}><Pic food={item.food} size={56} /><h3 style={{ margin: 0 }}>{item.name}</h3></div>
    <div className="measure-form"><label className="measure-field"><span>{t('Amount')}</span><span className="measure-input"><NumberField value={grams} onChange={setGrams} /><i>g</i></span></label></div>
    {item.kind && <div className="row" style={{ gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
      {[0.5, 1, 2].map(n => <Button key={n} size="sm" variant="tinted" onClick={() => setGrams(Math.round(portionGrams(item) * n))}>{n} × {Math.round(portionGrams(item))} g</Button>)}
    </div>}
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="big">{m.k} kcal</div>
      <div className="muted small">{t('P {0} g · C {1} g · F {2} g', m.p, m.c, m.f)}</div>
    </div>
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{entry ? t('Save') : t('Add')}</Button>
    {entry && <><div style={{ height: 8 }} /><Button variant="ghost" icon="trash" onClick={del}>{t('Delete')}</Button></>}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
const amountSheet = props => useUI.getState().openSheet(close => <Amount {...props} close={close} />)
const libItem = f => ({ id: f.id, name: nameOf(f, getLang()), per100: f, kind: f.kind, g: f.g, food: f })

/* ------------------------------ add / create food ------------------------------ */

const KINDS = ['unit', 'slice', 'scoop', 'tbsp', 'tsp', 'cup', 'glass']
const KIND_LABEL = { unit: 'Unit', slice: 'Slice', scoop: 'Scoop', tbsp: 'Tablespoon', tsp: 'Teaspoon', cup: 'Cup', glass: 'Glass' }

function FoodForm({ food, onSaved, close }) {
  const [v, setV] = useState(() => ({ name: '', k: null, p: null, c: null, f: null, fi: null, su: null, na: null, kind: 'unit', g: null, photo: '', ...(food || {}) }))
  const set = key => x => setV(o => ({ ...o, [key]: x }))
  const pick = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    try { const url = await shrinkPhoto(file); if (url) setV(o => ({ ...o, photo: url })); else toast(t('That picture is too large.')) } catch { toast(t('That picture is too large.')) }
  }
  const save = () => {
    if (!v.name.trim()) { toast(t('Enter a name')); return }
    const out = { id: food?.id || 'my-' + uid(), custom: true, name: v.name.trim().slice(0, 80), k: v.k || 0, p: v.p || 0, c: v.c || 0, f: v.f || 0 }
    for (const key of ['fi', 'su', 'na']) if (v[key] > 0) out[key] = v[key]
    if (v.g > 0) { out.kind = v.kind; out.g = v.g }
    if (v.photo) out.photo = v.photo
    saveFood(out); close(); onSaved?.(out)
  }
  const del = () => confirmSheet({ title: t('Delete'), message: food.name, confirmText: t('Delete'), danger: true, onConfirm: () => { removeFood(food.id); close() } })
  const num = (label, key, unit) => <label className="measure-field"><span>{label}</span><span className="measure-input"><NumberField nullable value={v[key]} onChange={set(key)} /><i>{unit}</i></span></label>
  return <>
    <h3>{food ? t('Edit food') : t('New food')}</h3>
    <div className="row" style={{ gap: 12, alignItems: 'center' }}>
      <label style={{ cursor: 'pointer' }}>{v.photo ? <img src={v.photo} alt="" width="64" height="64" style={{ borderRadius: 12, objectFit: 'cover' }} /> : <span className="tile" style={{ display: 'inline-block', width: 64, height: 64, textAlign: 'center', lineHeight: '64px' }}><Icon name="plus" /></span>}
        <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} /></label>
      <div style={{ flex: 1 }}><TextField placeholder={t('Name')} value={v.name} onChange={e => setV(o => ({ ...o, name: e.target.value }))} /></div>
    </div>
    {v.photo && <div style={{ marginTop: 6 }}><Button size="sm" variant="ghost" onClick={() => setV(o => ({ ...o, photo: '' }))}>{t('Remove photo')}</Button></div>}
    <div className="muted small" style={{ margin: '8px 0' }}>{t('Values per 100 g')}</div>
    <div className="measure-form">{num('kcal', 'k', 'kcal')}{num(t('Protein'), 'p', 'g')}{num(t('Carbs'), 'c', 'g')}{num(t('Fat'), 'f', 'g')}
      {num(t('Fiber'), 'fi', 'g')}{num(t('Sugar'), 'su', 'g')}{num(t('Sodium'), 'na', 'mg')}</div>
    <div className="muted small" style={{ margin: '8px 0' }}>{t('Usual portion (optional)')}</div>
    <SelectRow title={t('Portion')} sheetTitle={t('Portion')} value={v.kind} onChange={set('kind')} options={KINDS.map(k => ({ value: k, label: t(KIND_LABEL[k]) }))} />
    <div className="measure-form">{num(t('Weight of one portion'), 'g', 'g')}</div>
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {food && <><div style={{ height: 8 }} /><Button variant="ghost" icon="trash" onClick={del}>{t('Delete')}</Button></>}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
const foodSheet = (food, onSaved) => useUI.getState().openSheet(c => <FoodForm food={food} onSaved={onSaved} close={c} />)

function AddFood({ meal, date, close }) {
  useLang()
  const data = useData()
  const { foods: mine } = useNutrition()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('foods')
  const [kcal, setKcal] = useState(null)
  const lang = getLang()
  const custom = Object.values(mine)
  const results = useMemo(() => (data ? searchFoods([...custom, ...data.foods], q, lang) : []), [data, q, lang, custom.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => (data ? Object.fromEntries(data.foods.map(f => [f.id, f])) : {}), [data])
  const dishes = useMemo(() => (data ? data.dishes.filter(d => !q.trim() || searchFoods([{ id: d.id, n: d.n }], q, lang).length) : []), [data, q, lang])
  const pick = item => { close(); amountSheet({ item, meal, date }) }
  const dish = d => { const x = expandDish(d, byId), total = x.rows.reduce((a, r) => a + r.grams, 0); pick({ id: 'dish:' + d.id, name: nameOf(d, lang), per100: Object.fromEntries(Object.entries(x.total).map(([k, v]) => [k, v / total * 100])), g: total, kind: 'unit' }) }
  const quick = () => {
    if (!(kcal > 0)) { toast(t('Enter the amount')); return }
    editDay(date, d => ({ ...d, entries: [...d.entries, { id: uid(), meal, food: null, name: t('Quick add'), grams: 0, m: { k: Math.round(kcal), p: 0, c: 0, f: 0, fi: 0, su: 0, na: 0 }, t: Date.now() }] }))
    close(); toast(t('Added'))
  }
  return <>
    <h3>{t(MEAL_LABEL[meal])}</h3>
    <Segmented value={tab} onChange={setTab} options={[{ value: 'foods', label: t('Foods') }, { value: 'dishes', label: t('Dishes') }, { value: 'quick', label: t('Quick add') }]} />
    {tab !== 'quick' && <div style={{ marginTop: 10 }}><TextField placeholder={t('Search foods')} value={q} onChange={e => setQ(e.target.value)} autoFocus /></div>}
    {tab === 'foods' && <div style={{ marginTop: 6 }}>
      {!data && <div className="muted small">…</div>}
      {(q.trim() ? results : custom).map(f => <div key={f.id} className="row" style={{ gap: 4 }}>
        <button className="lrow" style={{ flex: 1 }} onClick={() => pick(libItem(f))}><Pic food={f} />
          <span className="lrow-m"><span className="lrow-t">{nameOf(f, lang)}</span><span className="lrow-s">{Math.round(f.k)} kcal / 100 g{f.custom ? ' · ' + t('Mine') : ''}</span></span><Icon name="plus" /></button>
        {f.custom && <button className="iconbtn" aria-label={t('Edit food')} onClick={() => foodSheet(f)}><Icon name="pencil" /></button>}</div>)}
      {q.trim() && !results.length && data && <div className="empty small">{t('Nothing found.')}</div>}
      <div style={{ height: 8 }} />
      <Button variant="tinted" icon="plus" onClick={() => foodSheet(null, f => amountSheet({ item: libItem(f), meal, date }))}>{t('New food')}</Button>
    </div>}
    {tab === 'dishes' && <div style={{ marginTop: 6 }}>{dishes.map(d => <button key={d.id} className="lrow" onClick={() => dish(d)}>
      <span className="lrow-m"><span className="lrow-t">{nameOf(d, lang)}</span><span className="lrow-s">{Math.round(expandDish(d, byId).total.k)} kcal</span></span><Icon name="plus" /></button>)}</div>}
    {tab === 'quick' && <div style={{ marginTop: 12 }}>
      <div className="measure-form"><label className="measure-field"><span>kcal</span><span className="measure-input"><NumberField nullable value={kcal} onChange={setKcal} /><i>kcal</i></span></label></div>
      <div style={{ height: 12 }} /><Button variant="primary" onClick={quick}>{t('Add')}</Button></div>}
    <div style={{ height: 12 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Close')}</Button>
  </>
}
const addSheet = (meal, date) => useUI.getState().openSheet(close => <AddFood meal={meal} date={date} close={close} />)

/* ------------------------------ week, supplements ------------------------------ */

function Week({ date, goal, days, close }) {
  const w = weekSummary(days, date)
  const top = Math.max(goal?.kcal || 0, ...w.rows.map(r => r.k), 1)
  return <>
    <h3>{t('Last 7 days')}</h3>
    <div className="row" style={{ gap: 6, alignItems: 'flex-end', height: 110 }}>
      {w.rows.map(r => <div key={r.date} style={{ flex: 1, textAlign: 'center' }}>
        <div title={r.k + ' kcal'} style={{ height: Math.max(2, 90 * r.k / top), background: r.logged ? 'var(--accent)' : 'var(--fill, #8883)', borderRadius: 4 }} />
        <div className="muted small">{t(DAYS[weekdayOf(r.date)])}</div>
      </div>)}
    </div>
    {w.logged ? <div className="cols" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 12 }}>
      <div className="tile"><div className="l">{t('Average per day')}</div><div className="v">{w.avg.k} kcal</div></div>
      <div className="tile"><div className="l">{t('Water')}</div><div className="v">{(w.avg.water / 1000).toFixed(1)} L</div></div>
      <div className="tile"><div className="l">{t('Protein')}</div><div className="v">{w.avg.p} g</div></div>
      <div className="tile"><div className="l">{t('Days logged')}</div><div className="v">{w.logged} / 7</div></div>
    </div> : <div className="muted" style={{ marginTop: 12 }}>{t('No activities yet.')}</div>}
    <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={close}>{t('Close')}</Button>
  </>
}

function NewSupp({ list, close }) {
  const [name, setName] = useState('')
  const add = () => { const n = name.trim().slice(0, 40); if (n) saveSupp([...list, { id: uid(), name: n }]); close() }
  return <>
    <h3>{t('Add supplement')}</h3>
    <TextField value={name} onChange={e => setName(e.target.value)} placeholder={t('Name')} autoFocus />
    <div style={{ height: 8 }} /><Button variant="primary" onClick={add}>{t('Add')}</Button>
  </>
}

/* ------------------------------------ screen ------------------------------------ */

export default function Nutrition() {
  const nav = useNavigate()
  useLang()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const { goal, days, foods: mine, plan, supp } = useNutrition()
  const suppList = supp || []
  const wd = weekdayOf(date)
  const sessions = useCardioSessions()
  const [date, setDate] = useState(todayISO())
  useEffect(() => { bind(user?.id || 'guest'); bindCardio(user?.id || 'guest'); flush() }, [user?.id])
  const day = days[date] || dayOf(date)
  const { total, byMeal } = useMemo(() => dayTotals(day.entries), [day])
  const burned = Math.round(sessions.filter(s => dayOfMs(s.started) === date).reduce((a, s) => a + (s.calories || 0), 0))
  const left = goal ? Math.round(goal.kcal - total.k) : null
  const water = day.water || 0
  const addWater = ml => editDay(date, d => ({ ...d, water: Math.max(0, (d.water || 0) + ml) }))

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Nutrition')}</h1><div className="sub">{t('Calories and macros against your daily goal')}</div></div>
      <button className="iconbtn" onClick={() => useUI.getState().openSheet(close => <Goal S={S} close={close} />)} aria-label={t('Daily goal')}><Icon name="target" /></button>
    </div>
    <div className="row between" style={{ marginBottom: 8 }}>
      <button className="iconbtn" onClick={() => setDate(shift(date, -1))} aria-label="-1"><Icon name="chevronLeft" /></button>
      <div>{date === todayISO() ? t('Today') : fmtDate(date, true)}</div>
      <button className="iconbtn" disabled={date >= todayISO()} onClick={() => setDate(shift(date, 1))} aria-label="+1"><Icon name="chevronRight" /></button>
    </div>
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="big">{total.k} <span className="muted" style={{ fontSize: '1rem' }}>{goal ? `/ ${goal.kcal} kcal` : 'kcal'}</span></div>
      {left != null && <div className="muted small">{left >= 0 ? t('{0} kcal left', left) : t('{0} kcal over', -left)}</div>}
      {!goal && <div style={{ marginTop: 8 }}><Button size="sm" variant="tinted" icon="target" onClick={() => useUI.getState().openSheet(close => <Goal S={S} close={close} />)}>{t('Set your goal')}</Button></div>}
      <div className="row" style={{ gap: 12, marginTop: 12 }}>
        <Bar label={t('Protein')} v={total.p} goal={goal?.p} color="var(--blue)" />
        <Bar label={t('Carbs')} v={total.c} goal={goal?.c} color="var(--orange)" />
        <Bar label={t('Fat')} v={total.f} goal={goal?.f} color="var(--red)" />
      </div>
      {burned > 0 && <div className="muted small" style={{ marginTop: 10 }}>{t('Burned in cardio')}: ≈ {burned} kcal</div>}
    </div>
    <div className="card row between" style={{ alignItems: 'center' }}>
      <div><div className="muted small">{t('Water')}</div><div className="big" style={{ fontSize: '1.3rem' }}>{(water / 1000).toFixed(2)} L</div></div>
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" variant="tinted" onClick={() => addWater(-250)} disabled={!water}>−250</Button>
        <Button size="sm" variant="tinted" icon="plus" onClick={() => addWater(250)}>250 ml</Button>
      </div>
    </div>
    {MEALS.map(meal => <Section key={meal} title={`${t(MEAL_LABEL[meal])} · ${byMeal[meal].k} kcal`}>
      {day.entries.filter(e => e.meal === meal).map(e => <button key={e.id} className="lrow" onClick={() => e.food ? amountSheet({ item: { id: e.food, food: mine[e.food] || { id: e.food }, name: e.name, per100: Object.fromEntries(Object.entries(e.m).map(([k, v]) => [k, e.grams ? v / e.grams * 100 : 0])), g: e.grams }, meal, date, entry: e })
        : confirmSheet({ title: t('Delete'), message: e.name + ' · ' + e.m.k + ' kcal', confirmText: t('Delete'), danger: true, onConfirm: () => editDay(date, d => ({ ...d, entries: d.entries.filter(x => x.id !== e.id) })) })}>
        <Pic food={e.food ? (mine[e.food] || { id: e.food }) : null} size={36} /><span className="lrow-m"><span className="lrow-t">{e.name}</span><span className="lrow-s">{e.grams ? e.grams + ' g' : ''}</span></span><span>{e.m.k} kcal</span></button>)}
      <div className="lrow" style={{ justifyContent: 'center' }}><Button size="sm" variant="tinted" icon="plus" onClick={() => addSheet(meal, date)}>{t('Add food')}</Button></div>
    </Section>)}
    <Section title={t('Supplements')}>
      {suppList.map(x => <div key={x.id} className="lrow">
        <button className="lrow-m" style={{ textAlign: 'start', background: 'none', border: 0, color: 'inherit' }} onClick={() => editDay(date, d => ({ ...d, supp: toggleSupp(d.supp, x.id) }))}>
          <span className="lrow-t">{(day.supp || []).includes(x.id) ? <Icon name="checkCircle" /> : <span style={{ display: 'inline-block', width: '1.2em' }} />} {x.name}</span></button>
        <button className="iconbtn" aria-label={t('Delete')} onClick={() => saveSupp(suppList.filter(y => y.id !== x.id))}><Icon name="trash" /></button>
      </div>)}
      <div className="lrow" style={{ justifyContent: 'center' }}><Button size="sm" variant="tinted" icon="plus" onClick={() => useUI.getState().openSheet(close => <NewSupp list={suppList} close={close} />)}>{t('Add supplement')}</Button></div>
    </Section>
    <Section title={t('Meal plan')} footer={t('Saves what you ate on this weekday and fills it in on the next ones.')}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant="tinted" disabled={!day.entries.length} onClick={() => { savePlan(planWith(plan, wd, day.entries)); toast(t('Plan saved for {0}', t(DAYN[wd]))) }}>{t('Save as plan for {0}', t(DAYN[wd]))}</Button>
        <Button size="sm" variant="tinted" disabled={!plan?.[wd]} onClick={() => { editDay(date, d => ({ ...d, entries: [...d.entries, ...planEntries(plan, wd, uid)] })); toast(t('Added')) }}>{t('Add the plan')}</Button>
      </div>
    </Section>
    <div style={{ height: 8 }} />
    <Button variant="tinted" icon="chart" onClick={() => useUI.getState().openSheet(close => <Week date={date} goal={goal} days={days} close={close} />)}>{t('Last 7 days')}</Button>
  </div>
}
