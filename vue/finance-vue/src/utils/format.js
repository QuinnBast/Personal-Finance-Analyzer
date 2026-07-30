// Shared number/date formatting. Charts and tables must agree on these or the
// same value reads two different ways in two places.

const currency = (fraction) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  })

const whole = currency(0)
const cents = currency(2)

/** $1,234 - for axis ticks, stat tiles, anything scanned rather than reconciled. */
export const money = (v) => (Number.isFinite(Number(v)) ? whole.format(Number(v)) : '-')

/** $1,234.56 - for tables and tooltips, where the exact figure matters. */
export const moneyExact = (v) => (Number.isFinite(Number(v)) ? cents.format(Number(v)) : '-')

/** Signed, for deltas: +$120 / -$120. */
export const moneySigned = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return (n > 0 ? '+' : n < 0 ? '-' : '') + whole.format(Math.abs(n))
}

/** $12.9K / $4.2M - axis ticks on long ranges, where full figures collide. */
export const moneyCompact = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(a >= 10_000 ? 0 : 1)}K`
  return `${sign}$${a.toFixed(0)}`
}

export const percent = (v, digits = 0) =>
  Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(digits)}%` : '-'

export const percentSigned = (v, digits = 0) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return (n > 0 ? '+' : '') + percent(n, digits)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-03' -> 'Mar 2026' */
export const monthLabel = (key) => {
  if (typeof key !== 'string' || key.length < 7) return String(key ?? '')
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`
}

/** '2026-03' -> 'Mar' (compact axis; the year rides the axis title) */
export const monthShort = (key) => {
  if (typeof key !== 'string' || key.length < 7) return String(key ?? '')
  const [, m] = key.split('-')
  return MONTHS[Number(m) - 1] ?? m
}

/**
 * Period keys are self-describing, so labels don't need the interval passed in:
 * '2026' -> '2026', '2026-Q1' -> 'Q1 2026', '2026-03' -> 'Mar 2026'.
 */
export const periodLabel = (key) => {
  const s = String(key ?? '')
  if (/^\d{4}$/.test(s)) return s
  if (/^\d{4}-Q[1-4]$/.test(s)) return `${s.slice(5)} ${s.slice(0, 4)}`
  return monthLabel(s)
}

/** Compact form for axis ticks and heatmap columns. */
export const periodShort = (key) => {
  const s = String(key ?? '')
  if (/^\d{4}$/.test(s)) return s
  if (/^\d{4}-Q[1-4]$/.test(s)) return s.slice(5)
  return monthShort(s)
}

export const dateLabel = (d) => (d instanceof Date && !isNaN(d) ? d.toISOString().slice(0, 10) : '-')
