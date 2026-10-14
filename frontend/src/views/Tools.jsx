import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { lastBW } from '../lib/history.js'
import { bmi, tdee, ACTIVITY } from '../lib/nutrition.js'
import { estimate1RM } from '../lib/onerm.js'
import { bmiBand, waterMl, bodyFatNavy, healthyRange, percentOf } from '../lib/tools.js'
import Icon from '../components/Icon.jsx'
import { NumberField, Segmented, SelectRow } from '../components/ui.jsx'

const KG = 2.2046226218
const field = (label, unit, v, set) => <label className="measure-field"><span>{label}</span>
  <span className="measure-input"><NumberField value={v} onChange={set} /><i>{unit}</i></span></label>
const Out = ({ label, value, sub }) => <div className="tile"><div className="l">{label}</div><div className="v" style={{ fontSize: '1.1rem' }}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>
const Card = ({ title, children }) => <div className="card"><h2 style={{ marginTop: 0 }}>{title}</h2>{children}</div>
const BAND = () => ({ under: t('Underweight'), normal: t('Healthy weight'), over: t('Overweight'), obese: t('Obese') })

export default function Tools() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const w0 = lastBW(S)?.w
  const [sex, setSex] = useState('male')
  const [age, setAge] = useState(30)
  const [cm, setCm] = useState(170)
  const [kg, setKg] = useState(w0 ? Math.round((S.unit === 'lb' ? w0 / KG : w0) * 10) / 10 : 70)
  const [activity, setActivity] = useState('light')
  const [neck, setNeck] = useState(38)
  const [waist, setWaist] = useState(85)
  const [hip, setHip] = useState(95)
  const [lift, setLift] = useState(100)
  const [reps, setReps] = useState(5)
  const b = bmi(kg, cm)
  const [lo, hi] = healthyRange(cm)
  const bf = useMemo(() => bodyFatNavy({ sex, cm, neck, waist, hip }), [sex, cm, neck, waist, hip])
  const orm = estimate1RM(lift, reps)
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Calculators')}</h1><div className="sub">{t('BMI, calories, body fat, water and 1RM')}</div></div>
    </div>
    <div className="card">
      <Segmented value={sex} onChange={setSex} options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
      <div className="measure-form" style={{ marginTop: 12 }}>
        {field(t('Age'), t('years'), age, setAge)}
        {field(t('Height'), 'cm', cm, setCm)}
        {field(t('Weight'), 'kg', kg, setKg)}
      </div>
    </div>
    <Card title={t('BMI')}>
      <div className="cols" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <Out label="BMI" value={b} sub={BAND()[bmiBand(b)]} />
        <Out label={t('Healthy range')} value={`${lo}–${hi} kg`} />
      </div>
    </Card>
    <Card title={t('Daily calories')}>
      <SelectRow title={t('Activity')} sheetTitle={t('Activity')} value={activity} onChange={setActivity}
        options={Object.keys(ACTIVITY).map(k => ({ value: k, label: t({ sedentary: 'Sedentary', light: 'Light', moderate: 'Moderate', active: 'Active', athlete: 'Athlete' }[k]) }))} />
      <div className="cols" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8 }}>
        <Out label={t('Maintenance')} value={`${tdee({ sex, kg, cm, age }, activity)} kcal`} />
        <Out label={t('Water')} value={`${(waterMl(kg) / 1000).toFixed(2)} L`} />
      </div>
    </Card>
    <Card title={t('Body fat')}>
      <div className="measure-form">
        {field(t('Neck'), 'cm', neck, setNeck)}
        {field(t('Waist'), 'cm', waist, setWaist)}
        {sex === 'female' && field(t('Hips'), 'cm', hip, setHip)}
      </div>
      <Out label={t('Body fat')} value={bf == null ? '–' : `${bf} %`} sub={bf != null ? t('{0} kg lean mass', Math.round(kg * (100 - bf)) / 100) : null} />
    </Card>
    <Card title={t('One-rep max')}>
      <div className="measure-form">
        {field(t('Weight'), S.unit || 'kg', lift, setLift)}
        {field(t('Reps'), '', reps, setReps)}
      </div>
      <div className="cols" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Out label="1RM" value={orm ? Math.round(orm * 10) / 10 : '–'} />
        {[90, 80, 70].map(p => <Out key={p} label={p + '%'} value={orm ? percentOf(orm, p, S.unit === 'lb' ? 5 : 2.5) : '–'} />)}
      </div>
    </Card>
  </div>
}
