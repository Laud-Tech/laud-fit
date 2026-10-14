// Small calculators. Pure, metric in / metric out; the view converts units.
const r1 = n => Math.round(n * 10) / 10

/** WHO adult BMI band. */
export const bmiBand = b => (b < 18.5 ? 'under' : b < 25 ? 'normal' : b < 30 ? 'over' : 'obese')

/** Daily water in ml: 35 ml per kg, plus 500 ml per hour of training. */
export const waterMl = (kg, trainingH = 0) => Math.round((kg * 35 + trainingH * 500) / 50) * 50

/** US Navy body-fat %, from circumferences in cm. Returns null when the numbers make no sense. */
export function bodyFatNavy({ sex, cm, neck, waist, hip }) {
  const w = sex === 'female' ? waist + hip - neck : waist - neck
  if (!(cm > 0) || !(neck > 0) || !(waist > 0) || w <= 0 || (sex === 'female' && !(hip > 0))) return null
  const L = Math.log10
  const bf = 495 / (sex === 'female'
    ? 1.29579 - 0.35004 * L(w) + 0.221 * L(cm)
    : 1.0324 - 0.19077 * L(w) + 0.15456 * L(cm)) - 450
  return bf > 2 && bf < 70 ? r1(bf) : null
}

/** Healthy weight range in kg for a height (BMI 18.5–24.9). */
export const healthyRange = cm => [r1(18.5 * (cm / 100) ** 2), r1(24.9 * (cm / 100) ** 2)]

/** Weight for a given % of a 1RM, rounded to `step`. */
export const percentOf = (oneRm, pct, step = 2.5) => Math.round(oneRm * pct / 100 / step) * step
