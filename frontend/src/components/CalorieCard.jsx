import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO, isoOf } from '../lib/format.js'
import { dayTotals } from '../lib/nutrition.js'
import { bind, getNutrition, subscribe, dayOf, flush } from '../lib/nutrition-sync.js'
import { bind as bindCardio, getCardio, subscribe as subCardio } from '../lib/cardio-sync.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// Home's answer to "how am I doing today": calories eaten against the goal, and what cardio burned.
export default function CalorieCard() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const nut = useSyncExternalStore(subscribe, getNutrition)
  const cardio = useSyncExternalStore(subCardio, getCardio)
  useEffect(() => { bind(user?.id || 'guest'); bindCardio(user?.id || 'guest'); flush() }, [user?.id])
  const today = todayISO()
  const { total } = dayTotals((nut.days[today] || dayOf(today)).entries)
  const burned = Math.round(cardio.sessions.filter(s => isoOf(new Date(s.started)) === today).reduce((a, s) => a + (s.calories || 0), 0))
  const goal = nut.goal?.kcal
  const pct = goal ? Math.min(100, Math.round(100 * total.k / goal)) : 0
  return <div className="card">
    <div className="row between" style={{ alignItems: 'center' }}>
      <div>
        <div className="muted small">{t('Nutrition')}</div>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{total.k} <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>{goal ? `/ ${goal} kcal` : 'kcal'}</span></div>
        {burned > 0 && <div className="muted small">{t('Burned in cardio')}: ≈ {burned} kcal</div>}
      </div>
      <Button size="sm" variant="tinted" icon="plus" onClick={() => nav('/nutrition')}>{t('Add food')}</Button>
    </div>
    {goal ? <div style={{ height: 6, borderRadius: 3, background: 'var(--fill, #8883)', overflow: 'hidden', marginTop: 10 }}>
      <div style={{ width: pct + '%', height: '100%', background: total.k > goal ? 'var(--red)' : 'var(--acc)' }} /></div>
      : <div className="small" style={{ marginTop: 8 }}><button className="linklike" style={{ color: 'var(--acc)' }} onClick={() => nav('/nutrition')}><Icon name="target" /> {t('Set your goal')}</button></div>}
  </div>
}
