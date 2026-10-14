import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { awards } from '../lib/awards.js'
import { bind, getCardio, subscribe } from '../lib/cardio-sync.js'
import Icon from '../components/Icon.jsx'

const NAME = a => ({
  firstStep: t('First step'), firstWorkout: t('First workout'), firstRoutine: t('First routine'), firstRecord: t('First record'),
  streak: t('{0}-day streak', a.goal), workouts: t('{0} workouts', a.goal), tonne: t('{0} t lifted', a.goal),
  sets: t('{0} sets', a.goal), hours: t('{0} hours', a.goal)
}[a.id.replace(/\d+$/, '')])
const num = n => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)

export default function Awards() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const cardio = useSyncExternalStore(subscribe, getCardio)
  useEffect(() => { bind(user?.id || 'guest') }, [user?.id])
  const A = awards(S, { cardio: cardio.sessions.length })
  const done = A.list.filter(a => a.done).length
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Medals')}</h1><div className="sub">{t('{0} of {1} earned', done, A.list.length)}</div></div>
    </div>
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="muted small">{t('Level')}</div>
      <div className="big">{A.level}</div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--fill, #8883)', overflow: 'hidden', margin: '8px 0 4px' }}>
        <div style={{ width: `${(100 * A.into) / A.span}%`, height: '100%', background: 'var(--accent)' }} />
      </div>
      <div className="muted small">{A.into} / {A.span} XP</div>
    </div>
    <div className="cols" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
      {A.list.map(a => <div key={a.id} className="tile" style={{ opacity: a.done ? 1 : 0.55, textAlign: 'center' }}>
        <div style={{ color: a.done ? 'var(--accent)' : 'inherit' }}><Icon name={a.done ? a.icon : 'lock'} size={28} /></div>
        <div style={{ fontWeight: 600, margin: '4px 0' }}>{NAME(a)}</div>
        <div className="muted small">{a.done ? t('Earned') : `${num(a.value)} / ${a.goal}`}</div>
      </div>)}
    </div>
  </div>
}
