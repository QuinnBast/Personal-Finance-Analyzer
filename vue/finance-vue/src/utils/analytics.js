/**
 * Pure aggregation layer for the dashboard.
 *
 * Everything here takes the raw transaction rows the API returns and produces
 * plain data. No Vue, no Chart.js, no side effects - so each aggregation runs
 * once per data change (inside a `computed`) instead of once per re-render.
 *
 * Three normalisations happen up front, because the stored data is messy:
 *
 *  1. `purchase_type` exists in both cases ("POS Purchase" / "pos purchase"),
 *     so every comparison is lower-cased.
 *  2. `category_override` mixes family-only names ("Food") with sub-category
 *     names ("Food - Take out"), plus '', 'Unknown', 'Gift' vs 'Gifts'. Charts
 *     roll up to a fixed set of families; the detail table keeps raw names.
 *  3. Credit-card payments and investment purchases are *transfers*, not
 *     spending. Counting them as expenses double-counts every credit-card
 *     purchase and made "Misc" look like a top-3 spending category.
 */

// ---------------------------------------------------------------------------
// Families - the fixed order is also the colour-slot order (see palette.js).
// Editing this list is the one place spending roll-ups are defined.
// ---------------------------------------------------------------------------
export const FAMILIES = [
  'Food',
  'Vehicle',
  'Rent',
  'Home & Utilities',
  'Entertainment',
  'Personal & Health',
  'Travel',
]
export const OTHER_FAMILY = 'Other'
export const INCOME_FAMILY = 'Income'
export const TRANSFER_FAMILY = 'Transfers'

const FAMILY_OF_TOKEN = {
  food: 'Food',
  groceries: 'Food',
  vehicle: 'Vehicle',
  car: 'Vehicle',
  gas: 'Vehicle',
  // Rent is a third of all spending on its own, so it is its own family rather
  // than being buried with the phone bill.
  rent: 'Rent',
  mortgage: 'Rent',
  bills: 'Home & Utilities',
  home: 'Home & Utilities',
  power: 'Home & Utilities',
  hydro: 'Home & Utilities',
  water: 'Home & Utilities',
  internet: 'Home & Utilities',
  phone: 'Home & Utilities',
  insurance: 'Home & Utilities',
  utilities: 'Home & Utilities',
  'web hosting': 'Home & Utilities',
  entertainment: 'Entertainment',
  'video games': 'Entertainment',
  sports: 'Entertainment',
  hobby: 'Entertainment',
  lottery: 'Entertainment',
  gambling: 'Entertainment',
  personal: 'Personal & Health',
  health: 'Personal & Health',
  education: 'Personal & Health',
  fitness: 'Personal & Health',
  clothing: 'Personal & Health',
  gift: 'Personal & Health',
  gifts: 'Personal & Health',
  pet: 'Personal & Health',
  electronics: 'Personal & Health',
  vacation: 'Travel',
  travel: 'Travel',
  job: INCOME_FAMILY,
  work: INCOME_FAMILY,
  'job / work': INCOME_FAMILY,
  government: INCOME_FAMILY,
  income: INCOME_FAMILY,
  payroll: INCOME_FAMILY,
  investment: TRANSFER_FAMILY,
  transfer: TRANSFER_FAMILY,
}

/** Money that moves between your own accounts is not income and not spending. */
const TRANSFER_VENDOR =
  /credit card|loc\s*pay|payment from|payment to|investment purchase|^mb-dep|^pc to\b|e-?transfer/i
const TRANSFER_TYPE = /crd\.? card bill payment/i

const UNCATEGORIZED = new Set(['', 'unknown', 'misc', 'other', 'n/a', 'none'])

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Accepts epoch millis, a Date, or an ISO-ish string. Returns null if unusable. */
export function toDate(value) {
  if (value instanceof Date) return isNaN(value) ? null : value
  if (typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d) ? null : d
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && value.trim().length >= 10 && !value.includes('-')) {
      const d = new Date(numeric)
      if (!isNaN(d)) return d
    }
    const d = new Date(value)
    if (!isNaN(d)) return d
  }
  return null
}

export const monthKeyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

/** Every month between two keys inclusive, so a quiet month shows as zero. */
export function monthRange(firstKey, lastKey) {
  if (!firstKey || !lastKey) return []
  const out = []
  let [y, m] = firstKey.split('-').map(Number)
  const [ly, lm] = lastKey.split('-').map(Number)
  let guard = 0
  while ((y < ly || (y === ly && m <= lm)) && guard++ < 1200) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export const median = (values) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return 0
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

export const mean = (values) => {
  const v = values.filter(Number.isFinite)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
}

/** Trailing mean over `window` points; null until the window is full. */
export function rollingMean(values, window) {
  const out = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0
    if (i >= window) sum -= values[i - window] ?? 0
    out.push(i >= window - 1 ? sum / window : null)
  }
  return out
}

/** The family a raw category name rolls up to. 'Food - Take out' -> 'Food'. */
export function familyOf(rawCategory) {
  const raw = String(rawCategory ?? '').trim()
  if (raw === '') return OTHER_FAMILY
  const token = raw.split(/\s*[-–/]\s*/)[0].trim().toLowerCase()
  return FAMILY_OF_TOKEN[token] ?? FAMILY_OF_TOKEN[raw.toLowerCase()] ?? OTHER_FAMILY
}

/** Display name for a raw category, with the empty/unknown cases collapsed. */
export const categoryLabel = (raw) => {
  const s = String(raw ?? '').trim()
  return s === '' ? 'Uncategorized' : s
}

/**
 * Vendors arrive with inconsistent case, padding, terminal ids and - because the
 * importer slices a fixed-width statement field - a leading "OPOS" marker that
 * sometimes has the amount baked into it. Left alone, "OPOS Amazon Web Services"
 * and "OPOS 10.23 Amazon web ser" count as two different vendors.
 *
 * Grouping only: the original string is still what gets displayed.
 */
export const vendorKeyOf = (vendor) =>
  String(vendor ?? '')
    .toUpperCase()
    .replace(/[#*]+\d+.*$/, '') // trailing store numbers: "SUPER CENTER #5878"
    .replace(/^(?:OPOS|POS|MB-POS)\s+/, '') // point-of-sale marker
    .replace(/(?:^|\s)\d+(?:[.,]\d+)?(?=\s|$)/g, ' ') // stray amounts inside the name
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Display form of a vendor: drops the point-of-sale marker and any amount the
 * importer baked into the name, so charts read "Warner Music G" rather than
 * "OPOS 36.61 WARNER MUSIC G".
 */
export const vendorLabelOf = (vendor) =>
  String(vendor ?? '')
    .replace(/^\s*(?:OPOS|POS|MB-POS)\s+/i, '')
    .replace(/^\d+(?:[.,]\d+)?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown'

/**
 * Loose vendor key used only for matching a charge to its reversal.
 *
 * Gas stations place a pre-authorisation hold, release it, then charge the real
 * amount - and the two halves do not always carry the same vendor string,
 * because the importer slices a fixed-width statement field: the hold arrives as
 * "Petro Canada749" and the release as "Petro Canada74977". Dropping every digit
 * makes both "PETRO CANADA". Safe here because a pair also has to agree on the
 * exact amount, the opposite sign, a refund-type marker and a 10-day window.
 */
export const reversalKeyOf = (vendor) =>
  String(vendor ?? '')
    .toUpperCase()
    .replace(/\d+/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Positive-amount rows that mean "that charge is cancelled", not "income". */
const REFUND_TYPE = /^(correction|pos return|return|other adjustment)$/

/** Locations are truncated to 5 chars by the importer and stored in mixed case. */
export const locationLabel = (loc) => {
  const s = String(loc ?? '').trim()
  if (s === '' || /^unknown$/i.test(s)) return 'Unknown'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ---------------------------------------------------------------------------
// prepare() - one pass, everything downstream reads these rows
// ---------------------------------------------------------------------------

/**
 * @returns {Array<{
 *   id, date: Date, ts, month, dayOfMonth, weekday, vendor, vendorKey, account,
 *   location, type, category, family, amount, flow, spend, income
 * }>} sorted oldest -> newest
 */
export function prepare(transactions) {
  const rows = []
  for (const t of transactions ?? []) {
    const date = toDate(t.date)
    const amount = Number(t.amount)
    if (!date || !Number.isFinite(amount)) continue

    const type = String(t.purchaseType ?? t.type ?? '').trim().toLowerCase()
    const vendorRaw = String(t.vendor ?? '').trim() || 'Unknown'
    const vendor = vendorLabelOf(vendorRaw)
    const category = String(t.categoryOverride ?? t.category ?? '').trim()
    const family = familyOf(category)

    const isCorrection = type === 'correction'
    const isTransfer =
      family === TRANSFER_FAMILY || TRANSFER_VENDOR.test(vendor) || TRANSFER_TYPE.test(type)

    let flow
    if (isTransfer) flow = 'transfer'
    else if (isCorrection) flow = 'expense' // a refund: reduces spending, is not income
    else flow = amount > 0 ? 'income' : 'expense'

    rows.push({
      id: t.id,
      date,
      ts: date.getTime(),
      month: monthKeyOf(date),
      dayOfMonth: date.getDate(),
      weekday: date.getDay(),
      vendor,
      vendorRaw,
      vendorKey: vendorKeyOf(vendorRaw),
      account: String(t.account ?? '').trim() || 'Unknown',
      location: locationLabel(t.location),
      type,
      category,
      family,
      amount,
      flow,
      // Positive = money out. A correction with a positive amount lands here as
      // a negative spend, which is what makes refunds net against the category.
      spend: flow === 'expense' ? -amount : 0,
      income: flow === 'income' ? amount : 0,
    })
  }
  rows.sort((a, b) => a.ts - b.ts || a.amount - b.amount)
  linkReversals(rows)
  return rows
}

const REVERSAL_WINDOW_DAYS = 10

/**
 * Pairs each refund/correction with the charge it cancels and takes BOTH out of
 * the spending figures (`flow: 'reversal'`).
 *
 * Netting them arithmetically was not enough. A -$150 fuel hold and its +$150
 * release cancel in a category total, but every per-transaction view filtered on
 * `spend > 0`, so it kept the $150 hold and dropped the -$150 release: Shell read
 * $18,292 instead of the $8,742 actually spent, a phantom $150 kept appearing in
 * "biggest purchases", and 59 fake $150 charges skewed the purchase-size mix.
 *
 * Mutates rows in place; called from prepare().
 */
function linkReversals(rows) {
  // Charges available to be cancelled, keyed by loose vendor + exact amount.
  const holds = new Map()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.amount >= 0) continue
    const key = `${reversalKeyOf(r.vendor)}|${Math.abs(r.amount).toFixed(2)}`
    if (!holds.has(key)) holds.set(key, [])
    holds.get(key).push(i)
  }

  const windowMs = REVERSAL_WINDOW_DAYS * 86_400_000
  const taken = new Set()

  for (const refund of rows) {
    if (refund.amount <= 0 || !REFUND_TYPE.test(refund.type)) continue

    const candidates = holds.get(`${reversalKeyOf(refund.vendor)}|${refund.amount.toFixed(2)}`)
    if (!candidates) continue

    let best = -1
    let bestScore = Infinity
    for (const i of candidates) {
      if (taken.has(i)) continue
      const dt = refund.ts - rows[i].ts
      if (Math.abs(dt) > windowMs) continue
      // Prefer the charge that came first, then the closest in time.
      const score = (dt >= 0 ? 0 : windowMs) + Math.abs(dt)
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best < 0) continue

    taken.add(best)
    const hold = rows[best]
    for (const row of [hold, refund]) {
      row.flow = 'reversal'
      row.spend = 0
      row.income = 0
    }
    hold.reversedBy = refund.ts
    refund.reverses = hold.ts
  }
}

/** What the reversal pass removed, so it is visible rather than silent. */
export function reversalSummary(rows) {
  const byVendor = new Map()
  let pairs = 0
  let amount = 0
  for (const r of rows) {
    if (r.flow !== 'reversal' || r.amount <= 0) continue // count each pair once
    pairs++
    amount += r.amount
    // Group on the normalised key so "Co-Op" and "CO-OP" are one vendor.
    const key = r.vendorKey
    const e = byVendor.get(key) ?? { vendor: r.vendor, pairs: 0, amount: 0 }
    e.pairs++
    e.amount = round2(e.amount + r.amount)
    byVendor.set(key, e)
  }
  return {
    pairs,
    amount: round2(amount),
    byVendor: [...byVendor.values()].sort((a, b) => b.amount - a.amount),
  }
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Time buckets. Every time-series aggregation takes an interval, so the same
// data reads as months, quarters or years without re-fetching.
// ---------------------------------------------------------------------------
export const INTERVALS = [
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'year', label: 'Yearly' },
]

/** 'YYYY-MM' -> the bucket key it belongs to for the given interval. */
export function bucketOf(monthKey, interval = 'month') {
  if (interval === 'year') return monthKey.slice(0, 4)
  if (interval === 'quarter') {
    return `${monthKey.slice(0, 4)}-Q${Math.ceil(Number(monthKey.slice(5, 7)) / 3)}`
  }
  return monthKey
}

/** Every bucket between two months inclusive - gap-filling comes along free. */
export function bucketRange(firstMonth, lastMonth, interval = 'month') {
  const out = []
  for (const m of monthRange(firstMonth, lastMonth)) {
    const b = bucketOf(m, interval)
    if (out[out.length - 1] !== b) out.push(b)
  }
  return out
}

/** Income / spend / transfers / net / savings rate per bucket, gap-filled. */
export function periodTotals(rows, interval = 'month') {
  if (!rows.length) return []
  const byPeriod = new Map()
  for (const r of rows) {
    const key = bucketOf(r.month, interval)
    let p = byPeriod.get(key)
    if (!p) {
      byPeriod.set(key, (p = { period: key, income: 0, spend: 0, transfer: 0, count: 0, months: new Set() }))
    }
    p.income += r.income
    p.spend += r.spend
    if (r.flow === 'transfer') p.transfer += Math.abs(r.amount)
    if (r.flow !== 'reversal') p.count++ // a hold and its release are not activity
    p.months.add(r.month)
  }
  return bucketRange(rows[0].month, rows[rows.length - 1].month, interval).map((period) => {
    const p = byPeriod.get(period)
    const income = p?.income ?? 0
    const spend = p?.spend ?? 0
    const net = income - spend
    return {
      period,
      income: round2(income),
      spend: round2(spend),
      transfer: round2(p?.transfer ?? 0),
      count: p?.count ?? 0,
      months: p?.months.size ?? 0,
      net: round2(net),
      savingsRate: income > 0 ? net / income : null,
    }
  })
}

/** Per-month totals - the basis for "typical month" regardless of the chart interval. */
export const monthlyTotals = (rows) => periodTotals(rows, 'month')

const INTERVAL_MONTHS = { month: 1, quarter: 3, year: 12 }

/**
 * Buckets holding fewer months than the interval expects - the range boundary
 * clips the first one, and the newest quarter or year is not over yet. Comparing
 * a 5-month "2025" against a 3-month "2026" is apples to oranges, so the charts
 * say so rather than letting the columns imply otherwise.
 */
export function partialPeriods(rows, interval = 'month') {
  const expected = INTERVAL_MONTHS[interval] ?? 1
  if (expected === 1) return []
  return periodTotals(rows, interval)
    .filter((p) => p.months > 0 && p.months < expected)
    .map((p) => ({ period: p.period, months: p.months, expected }))
}

/**
 * Family x period spend matrix. Series come out in the fixed family order, so
 * a category keeps its colour when the range or interval changes, and on-screen
 * stack adjacency matches the validated colour-slot adjacency.
 */
export function familyByPeriod(rows, interval = 'month') {
  const periods = periodTotals(rows, interval).map((p) => p.period)
  const index = new Map(periods.map((p, i) => [p, i]))
  const order = [...FAMILIES, OTHER_FAMILY]
  const values = new Map(order.map((f) => [f, new Array(periods.length).fill(0)]))

  for (const r of rows) {
    if (r.flow !== 'expense') continue
    const key = order.includes(r.family) ? r.family : OTHER_FAMILY
    const i = index.get(bucketOf(r.month, interval))
    if (i === undefined) continue
    values.get(key)[i] += r.spend
  }

  const series = order
    .map((family) => ({ family, values: values.get(family).map((v) => round2(v)) }))
    .filter((s) => s.values.some((v) => Math.abs(v) > 0.005))
  return { periods, series }
}

export const OTHER_CATEGORY = 'Everything else'

/**
 * Raw-category x period spend matrix - the drill-down behind familyByPeriod.
 *
 * There are ~40 raw category names in real data, far past the point where hue
 * alone can tell series apart, so this uses composite encoding: the colour slot
 * still comes from the category's family, and `shade` distinguishes siblings
 * within that family. Series are ordered by family (colour-slot order) and then
 * by size, so same-hue segments sit together in the stack.
 *
 * `series` is capped for the chart; `all` carries every category for the table,
 * so nothing is hidden by the cap.
 */
export function categoryByPeriod(rows, interval = 'month', { limit = 12 } = {}) {
  const periods = periodTotals(rows, interval).map((p) => p.period)
  const index = new Map(periods.map((p, i) => [p, i]))

  const build = () => ({ values: new Array(periods.length).fill(0), total: 0, count: 0 })
  const byCategory = new Map()

  for (const r of rows) {
    if (r.flow !== 'expense') continue
    const i = index.get(bucketOf(r.month, interval))
    if (i === undefined) continue
    const key = categoryLabel(r.category)
    let e = byCategory.get(key)
    if (!e) {
      byCategory.set(key, (e = { category: key, family: FAMILIES.includes(r.family) ? r.family : OTHER_FAMILY, ...build() }))
    }
    e.values[i] += r.spend
    e.total += r.spend
    e.count++
  }

  const all = [...byCategory.values()]
    .map((e) => ({
      ...e,
      values: e.values.map(round2),
      total: round2(e.total),
      avg: e.count ? round2(e.total / e.count) : 0,
    }))
    .filter((e) => Math.abs(e.total) > 0.005)
    .sort((a, b) => b.total - a.total)

  const grand = all.reduce((a, e) => a + e.total, 0)
  const withShare = all.map((e) => ({ ...e, share: grand > 0 ? e.total / grand : 0 }))

  // Keep the biggest `limit` categories; everything else becomes one series.
  const kept = withShare.slice(0, limit)
  const rest = withShare.slice(limit)

  const order = [...FAMILIES, OTHER_FAMILY]
  const series = kept
    .slice()
    .sort(
      (a, b) =>
        order.indexOf(a.family) - order.indexOf(b.family) || b.total - a.total || a.category.localeCompare(b.category),
    )
  // Shade index counts siblings within a family, in the order drawn.
  const seen = new Map()
  for (const s of series) {
    const n = seen.get(s.family) ?? 0
    s.shade = n
    seen.set(s.family, n + 1)
  }

  if (rest.length) {
    series.push({
      category: `${OTHER_CATEGORY} (${rest.length})`,
      family: OTHER_FAMILY,
      shade: (seen.get(OTHER_FAMILY) ?? 0) + 1,
      values: periods.map((_, i) => round2(rest.reduce((a, e) => a + e.values[i], 0))),
      total: round2(rest.reduce((a, e) => a + e.total, 0)),
      share: grand > 0 ? rest.reduce((a, e) => a + e.total, 0) / grand : 0,
    })
  }

  return { periods, series, all: withShare }
}

/** Total spend per family across the whole view, largest first. */
export function familyTotals(rows) {
  const totals = new Map()
  for (const r of rows) {
    if (r.flow !== 'expense') continue
    const key = FAMILIES.includes(r.family) ? r.family : OTHER_FAMILY
    totals.set(key, (totals.get(key) ?? 0) + r.spend)
  }
  const all = [...totals.entries()].map(([family, total]) => ({ family, total: round2(total) }))
  const grand = all.reduce((a, b) => a + b.total, 0)
  all.sort((a, b) => b.total - a.total)
  let cum = 0
  return all.map((f) => {
    cum += f.total
    return { ...f, share: grand > 0 ? f.total / grand : 0, cumulativeShare: grand > 0 ? cum / grand : 0 }
  })
}

/** Raw-category totals (the detail behind the family roll-up). */
export function categoryTotals(rows) {
  const totals = new Map()
  for (const r of rows) {
    if (r.flow !== 'expense') continue
    const key = categoryLabel(r.category)
    let e = totals.get(key)
    // Report the family the charts actually roll this into, so the detail table
    // and the charts never disagree about where a category ended up.
    const family = FAMILIES.includes(r.family) ? r.family : OTHER_FAMILY
    if (!e) totals.set(key, (e = { category: key, family, total: 0, count: 0 }))
    e.total += r.spend
    e.count++
  }
  return [...totals.values()]
    .map((e) => ({ ...e, total: round2(e.total), avg: round2(e.total / e.count) }))
    .sort((a, b) => b.total - a.total)
}

/** Per-vendor spend, count and average ticket. Expenses only. */
export function vendorStats(rows) {
  const byVendor = new Map()
  for (const r of rows) {
    if (r.flow !== 'expense' || r.spend <= 0) continue
    let v = byVendor.get(r.vendorKey)
    if (!v) {
      byVendor.set(r.vendorKey, (v = {
        vendor: r.vendor,
        vendorKey: r.vendorKey,
        family: r.family,
        total: 0,
        count: 0,
        firstTs: r.ts,
        lastTs: r.ts,
      }))
    }
    v.total += r.spend
    v.count++
    v.firstTs = Math.min(v.firstTs, r.ts)
    v.lastTs = Math.max(v.lastTs, r.ts)
  }
  return [...byVendor.values()]
    .map((v) => ({ ...v, total: round2(v.total), avg: round2(v.total / v.count) }))
    .sort((a, b) => b.total - a.total)
}

/** Spend by day of week, plus an average per occurrence of that weekday. */
export function weekdayProfile(rows) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const buckets = names.map((name, i) => ({ weekday: i, name, total: 0, count: 0, days: new Set() }))
  for (const r of rows) {
    if (r.flow !== 'expense' || r.spend <= 0) continue
    const b = buckets[r.weekday]
    b.total += r.spend
    b.count++
    b.days.add(r.date.toDateString())
  }
  // Rotate to Monday-first: a spending week reads Mon->Sun, not Sun->Sat.
  return [...buckets.slice(1), buckets[0]].map((b) => ({
    weekday: b.weekday,
    name: b.name,
    short: b.name.slice(0, 3),
    total: round2(b.total),
    count: b.count,
    activeDays: b.days.size,
    avgPerActiveDay: b.days.size ? round2(b.total / b.days.size) : 0,
    avgTicket: b.count ? round2(b.total / b.count) : 0,
  }))
}

const TICKET_BUCKETS = [
  { label: 'Under $15', min: 0, max: 15 },
  { label: '$15 - $40', min: 15, max: 40 },
  { label: '$40 - $100', min: 40, max: 100 },
  { label: '$100 - $300', min: 100, max: 300 },
  { label: '$300+', min: 300, max: Infinity },
]

/** Where the money actually goes: small frequent buys vs. big-ticket items. */
export function ticketBuckets(rows) {
  const out = TICKET_BUCKETS.map((b) => ({ ...b, total: 0, count: 0 }))
  for (const r of rows) {
    if (r.flow !== 'expense' || r.spend <= 0) continue
    const b = out.find((x) => r.spend >= x.min && r.spend < x.max)
    if (!b) continue
    b.total += r.spend
    b.count++
  }
  const grand = out.reduce((a, b) => a + b.total, 0)
  return out.map((b) => ({
    ...b,
    total: round2(b.total),
    share: grand > 0 ? b.total / grand : 0,
    avg: b.count ? round2(b.total / b.count) : 0,
  }))
}

/** Months present in the range, newest first - drives the month picker. */
export const availableMonths = (rows) => monthlyTotals(rows).map((p) => p.period).reverse()

/**
 * One month in isolation, with the comparisons that make a single month mean
 * something: the month before it, and the median month in range.
 *
 * Data is imported a whole month at a time, so every month here is complete and
 * no partial-month or projection logic applies.
 */
export function monthDetail(rows, month) {
  if (!month || !rows.length) return null

  const all = monthlyTotals(rows)
  const i = all.findIndex((p) => p.period === month)
  if (i < 0) return null

  const current = all[i]
  const previous = i > 0 ? all[i - 1] : null
  const typicalSpend = median(all.map((p) => p.spend))

  const inMonth = rows.filter((r) => r.month === month)
  const inPrevious = previous ? rows.filter((r) => r.month === previous.period) : []

  const familyMap = (subset) => {
    const map = new Map()
    for (const r of subset) {
      if (r.flow !== 'expense') continue
      const key = FAMILIES.includes(r.family) ? r.family : OTHER_FAMILY
      map.set(key, (map.get(key) ?? 0) + r.spend)
    }
    return map
  }

  const now = familyMap(inMonth)
  const before = familyMap(inPrevious)
  const families = [...new Set([...now.keys(), ...before.keys()])]
    .map((family) => {
      const total = round2(now.get(family) ?? 0)
      const prev = round2(before.get(family) ?? 0)
      return { family, total, previous: prev, delta: round2(total - prev) }
    })
    .filter((f) => f.total > 0 || Math.abs(f.delta) > 0.005)
    .sort((a, b) => b.total - a.total)

  return {
    month,
    current,
    previous,
    typicalSpend: round2(typicalSpend),
    vsPrevious: previous ? round2(current.spend - previous.spend) : null,
    vsTypical: round2(current.spend - typicalSpend),
    families,
    // Biggest movers first - "what changed" is the question a single month raises.
    changes: families
      .filter((f) => Math.abs(f.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    composition: Object.fromEntries(families.filter((f) => f.total > 0).map((f) => [f.family, f.total])),
    vendors: vendorStats(inMonth).slice(0, 8),
    biggest: inMonth
      .filter((r) => r.flow === 'expense' && r.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5),
    transactionCount: inMonth.length,
  }
}

/**
 * Recurring-charge detector: vendors billing on a stable cadence for a stable
 * amount. Heuristic, deliberately conservative - it is a shortlist to review,
 * not a ledger.
 */
export function recurringCharges(rows, { minOccurrences = 3 } = {}) {
  const byVendor = new Map()
  for (const r of rows) {
    if (r.flow !== 'expense' || r.spend <= 0) continue
    let v = byVendor.get(r.vendorKey)
    if (!v) byVendor.set(r.vendorKey, (v = { vendor: r.vendor, family: r.family, items: [] }))
    v.items.push(r)
  }

  const newestTs = rows.length ? rows[rows.length - 1].ts : 0
  const DAY = 86_400_000
  const out = []

  for (const v of byVendor.values()) {
    if (v.items.length < minOccurrences) continue
    const items = v.items.slice().sort((a, b) => a.ts - b.ts)

    const gaps = []
    for (let i = 1; i < items.length; i++) gaps.push((items[i].ts - items[i - 1].ts) / DAY)
    const gap = median(gaps)
    if (!(gap >= 6 && gap <= 400)) continue

    // Cadence must be regular and the amount stable, or it is just a shop you
    // happen to visit often.
    const gapSpread = mean(gaps.map((g) => Math.abs(g - gap))) / gap
    const amounts = items.map((i) => i.spend)
    const amountMean = mean(amounts)
    const amountSpread = amountMean > 0 ? mean(amounts.map((a) => Math.abs(a - amountMean))) / amountMean : 1
    if (gapSpread > 0.3 || amountSpread > 0.2) continue

    // Name the cadence honestly: a 146-day gap is not "yearly".
    const early = mean(amounts.slice(0, 2))
    const recent = mean(amounts.slice(-2))

    const cadence =
      gap < 10
        ? 'Weekly'
        : gap < 20
          ? 'Bi-weekly'
          : gap < 45
            ? 'Monthly'
            : gap < 320
              ? `Every ${Math.round(gap / 30.44)} months`
              : 'Yearly'
    const lastTs = items[items.length - 1].ts

    out.push({
      vendor: v.vendor,
      family: v.family,
      cadence,
      cadenceDays: Math.round(gap),
      occurrences: items.length,
      avgAmount: round2(amountMean),
      earlyAmount: round2(early),
      recentAmount: round2(recent),
      perYear: 365.25 / gap,
      monthlyEquivalent: round2(amountMean * (30.44 / gap)),
      yearlyEquivalent: round2(amountMean * (365.25 / gap)),
      lastDate: new Date(lastTs),
      nextExpected: new Date(lastTs + gap * DAY),
      active: newestTs - lastTs <= gap * DAY * 1.8,
      total: round2(amounts.reduce((a, b) => a + b, 0)),
    })
  }

  return out.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
}

/** Cumulative net flow per account. Not a balance unless all history is imported. */
export function cumulativeFlow(rows) {
  const byAccount = new Map()
  for (const r of rows) {
    // Internal moves would double-count; reversals net to zero and would draw
    // a spike down and straight back up.
    if (r.flow === 'transfer' || r.flow === 'reversal') continue
    let a = byAccount.get(r.account)
    if (!a) byAccount.set(r.account, (a = { account: r.account, points: [], running: 0 }))
    a.running += r.amount
    a.points.push({ x: r.ts, y: round2(a.running), row: r })
  }
  return [...byAccount.values()].sort((a, b) => b.points.length - a.points.length)
}

/**
 * Headline numbers for the KPI row.
 *
 * Every month is treated as complete: data is imported one whole month at a
 * time, so the newest month is not a partial period and is no longer excluded
 * from the average and median.
 */
export function summary(rows) {
  const monthly = monthlyTotals(rows)
  const complete = monthly
  const income = rows.reduce((a, r) => a + r.income, 0)
  const spend = rows.reduce((a, r) => a + r.spend, 0)
  const transfers = rows.reduce((a, r) => a + (r.flow === 'transfer' ? Math.abs(r.amount) : 0), 0)
  const families = familyTotals(rows)
  const biggest = rows
    .filter((r) => r.flow === 'expense' && r.spend > 0)
    .sort((a, b) => b.spend - a.spend)[0]

  return {
    months: monthly.length,
    income: round2(income),
    spend: round2(spend),
    transfers: round2(transfers),
    net: round2(income - spend),
    savingsRate: income > 0 ? (income - spend) / income : null,
    avgMonthlySpend: round2(mean(complete.map((m) => m.spend))),
    medianMonthlySpend: round2(median(complete.map((m) => m.spend))),
    avgMonthlyIncome: round2(mean(complete.map((m) => m.income))),
    medianMonthlyIncome: round2(median(complete.map((m) => m.income))),
    topFamily: families[0] ?? null,
    biggestExpense: biggest ?? null,
    monthly,
    transactionCount: rows.filter((r) => r.flow !== 'reversal').length,
    reversals: reversalSummary(rows),
  }
}

// ---------------------------------------------------------------------------
// Savings ideas
// ---------------------------------------------------------------------------

/** Families where a recurring charge is plausibly optional. Rent is not. */
const DISCRETIONARY = new Set(['Entertainment', 'Personal & Health', 'Other'])

/** Charges that are pure cost - no goods, no service. */
const FEE_PATTERN =
  /service charge|overdraft|\bnsf\b|non-?sufficient|interest charge|annual fee|monthly fee|a[bt]m fee|dishonou?r|late fee/i

const GAMBLING_PATTERN = /lotter|gambl|casino|\bvlt\b/i

/**
 * Concrete, self-referential savings suggestions: every figure comes from this
 * data set, and each idea says what it would take to realise it.
 *
 * `kind` separates the two very different asks:
 *   'fixed' - cancel, renegotiate or avoid; no behaviour change needed.
 *   'habit' - requires spending differently, so the estimate is softer.
 *
 * Annual figures are NOT additive: the small-purchase idea overlaps the
 * habit-vendor ideas by design, so the UI never sums them.
 */
export function savingsIdeas(rows) {
  const ideas = []
  if (!rows.length) return ideas

  const months = monthlyTotals(rows)
  const monthCount = Math.max(months.length, 1)
  const perYear = (total) => round2((total / monthCount) * 12)

  const recurring = recurringCharges(rows)
  const active = recurring.filter((r) => r.active)

  // 1. A recurring charge that quietly went up.
  for (const r of active
    .filter(
      (r) =>
        r.occurrences >= 4 &&
        r.earlyAmount > 0 &&
        r.recentAmount / r.earlyAmount >= 1.1 &&
        (r.recentAmount - r.earlyAmount) * r.perYear >= 24,
    )
    .sort((a, b) => (b.recentAmount - b.earlyAmount) * b.perYear - (a.recentAmount - a.earlyAmount) * a.perYear)
    .slice(0, 3)) {
    const increase = round2(r.recentAmount - r.earlyAmount)
    ideas.push({
      id: `creep:${r.vendor}`,
      kind: 'fixed',
      title: `${r.vendor} costs ${Math.round((increase / r.earlyAmount) * 100)}% more than it used to`,
      detail: `Its ${r.cadence.toLowerCase()} charge went from ${money2(r.earlyAmount)} to ${money2(
        r.recentAmount,
      )}. Getting the old price back saves the amount on the left.`,
      annual: round2(increase * r.perYear),
    })
  }

  // 2. Small optional subscriptions still billing.
  const subs = active
    .filter((r) => DISCRETIONARY.has(r.family) && r.monthlyEquivalent <= 60)
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
  if (subs.length) {
    ideas.push({
      id: 'subscriptions',
      kind: 'fixed',
      title: `Cancel ${subs.length} optional recurring ${subs.length === 1 ? 'charge' : 'charges'}`,
      detail: `Still billing: ${subs
        .slice(0, 5)
        .map((s) => `${s.vendor} ${money2(s.monthlyEquivalent)}/mo`)
        .join(', ')}. Cancelling ${subs.length === 1 ? 'it' : 'them all'} saves the amount on the left.`,
      annual: round2(subs.reduce((a, s) => a + s.yearlyEquivalent, 0)),
    })
  }

  // 3. Bank fees and interest - cost with nothing attached.
  const fees = rows.filter(
    (r) => r.flow === 'expense' && r.spend > 0 && (FEE_PATTERN.test(r.type) || FEE_PATTERN.test(r.vendor)),
  )
  if (fees.length) {
    const total = fees.reduce((a, r) => a + r.spend, 0)
    ideas.push({
      id: 'fees',
      kind: 'fixed',
      title: 'Stop paying bank fees and interest',
      detail: `${fees.length} charges totalling ${money2(total)} over ${monthCount} months. Changing account type or clearing a balance usually removes these entirely.`,
      annual: perYear(total),
    })
  }

  // 4. Gambling and lottery - fully discretionary, so worth naming separately.
  const gambling = rows.filter(
    (r) => r.flow === 'expense' && r.spend > 0 && GAMBLING_PATTERN.test(`${r.category} ${r.vendor}`),
  )
  if (gambling.length >= 3) {
    const total = gambling.reduce((a, r) => a + r.spend, 0)
    ideas.push({
      id: 'gambling',
      kind: 'habit',
      title: 'Lottery and gambling',
      detail: `${gambling.length} transactions totalling ${money2(total)}. The amount on the left is what stopping would return each year.`,
      annual: perYear(total),
    })
  }

  // 5. A category running above its own long-run level.
  const matrix = familyByPeriod(rows, 'month')
  if (matrix.periods.length >= 6) {
    for (const s of matrix.series) {
      // Rent and utility drift is a fixed cost moving, not a habit to cut - the
      // recurring-charge ideas cover those instead.
      if (s.family === 'Rent' || s.family === 'Home & Utilities') continue
      const active = s.values.filter((v) => v > 0)
      if (active.length < 4) continue
      const recent = mean(s.values.slice(-3))
      const baseline = median(active)
      const excess = recent - baseline
      if (excess < 40) continue
      ideas.push({
        id: `drift:${s.family}`,
        kind: 'habit',
        title: `${s.family} is running above its own normal level`,
        detail: `The last 3 months averaged ${money2(recent)}/mo, against ${money2(
          baseline,
        )}/mo normally. Getting back to normal saves the amount on the left.`,
        annual: round2(excess * 12),
      })
    }
  }

  // 6. Frequent low-value visits - the classic leak, named per vendor.
  const habitVendors = vendorStats(rows)
    .filter((v) => v.count >= 15 && v.avg <= 25 && (v.family === 'Food' || v.family === 'Entertainment'))
    .slice(0, 2)
  for (const v of habitVendors) {
    const annualSpend = perYear(v.total)
    ideas.push({
      id: `habit:${v.vendorKey}`,
      kind: 'habit',
      title: `Go to ${v.vendor} a bit less often`,
      detail: `${v.count} visits at ${money2(v.avg)} each, about ${money2(
        annualSpend,
      )} a year. The amount on the left is what you would keep by going 3 times for every 4 you go now.`,
      annual: round2(annualSpend * 0.25),
    })
  }

  // 7. Sub-$15 purchases in aggregate.
  const small = ticketBuckets(rows)[0]
  if (small && small.count >= 20) {
    ideas.push({
      id: 'small-purchases',
      kind: 'habit',
      title: 'Cut back on small purchases',
      detail: `${small.count} purchases under $15, ${money2(
        small.total / monthCount,
      )}/mo and ${percentOf(small.share)} of all spending. The amount on the left is what skipping 1 in every 5 would keep.`,
      annual: round2(perYear(small.total) * 0.2),
    })
  }

  return ideas.filter((i) => i.annual >= 12).sort((a, b) => b.annual - a.annual)
}

/**
 * A target drawn from the user's own best run rather than a generic rule of
 * thumb: the best three consecutive months of savings rate against the median.
 * Returned separately from `savingsIdeas` because it is a goal, not an action -
 * summing it with the concrete ideas would double-count.
 */
export function savingsBenchmark(rows) {
  // Only recent history counts. On a 7-year range the best window was a 2020
  // lockdown quarter at an 84% rate, which is not a target anyone can act on.
  const BENCHMARK_MONTHS = 24
  const all = monthlyTotals(rows).filter((m) => m.income > 0)
  const months = all.slice(-BENCHMARK_MONTHS)
  if (months.length < 6) return null

  const rates = months.map((m) => m.savingsRate)
  let best = -Infinity
  let bestAt = 0
  for (let i = 0; i + 3 <= rates.length; i++) {
    const window = mean(rates.slice(i, i + 3))
    if (window > best) {
      best = window
      bestAt = i
    }
  }

  const typical = median(rates)
  if (!(best > typical + 0.05)) return null

  const annualIncome = mean(months.map((m) => m.income)) * 12
  return {
    bestRate: best,
    typicalRate: typical,
    bestMonths: months.slice(bestAt, bestAt + 3).map((m) => m.period),
    annualGap: round2(annualIncome * (best - typical)),
    // True when older months were excluded, so the UI can say which window this is.
    windowed: all.length > months.length,
    windowMonths: months.length,
  }
}

function money2(v) {
  return `$${Math.abs(Number(v) || 0).toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function percentOf(share) {
  return `${Math.round((Number(share) || 0) * 100)}%`
}


/** The row-level tests behind the data-quality issues, shared with the
 *  Transactions page so "fix these" lands on exactly the flagged rows. */
export const ISSUE_TESTS = {
  uncategorized: (r) => r.flow === 'expense' && UNCATEGORIZED.has(String(r.category ?? '').toLowerCase()),
  'blank-type': (r) => r.type === '',
  reversals: (r) => r.flow === 'reversal',
}

/** Rows whose date+vendor+amount+account appears more than once. */
export function duplicateRows(rows) {
  const groups = new Map()
  for (const r of rows) {
    if (r.flow === 'reversal') continue
    const k = `${r.date.toDateString()}|${r.vendorKey}|${r.amount}|${r.account}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const out = new Set()
  for (const g of groups.values()) if (g.length > 1) g.forEach((r) => out.add(r))
  return out
}

/**
 * Things that make the numbers above less trustworthy. Surfacing these is more
 * useful than silently charting them.
 */
export function dataQuality(rows) {
  const issues = []
  if (!rows.length) return issues

  const uncategorized = rows.filter(
    (r) => r.flow === 'expense' && UNCATEGORIZED.has(r.category.toLowerCase()),
  )
  const uncatSpend = uncategorized.reduce((a, r) => a + r.spend, 0)
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0)
  if (uncategorized.length) {
    issues.push({
      id: 'uncategorized',
      count: uncategorized.length,
      severity: uncatSpend > totalSpend * 0.1 ? 'warning' : 'good',
      label: 'Uncategorized spending',
      detail: `${uncategorized.length} transactions (${
        totalSpend > 0 ? Math.round((uncatSpend / totalSpend) * 100) : 0
      }% of spend) sit in Unknown/Misc/blank categories.`,
      value: round2(uncatSpend),
    })
  }

  const caseGroups = new Map()
  for (const r of rows) {
    const k = categoryLabel(r.category).toLowerCase()
    if (!caseGroups.has(k)) caseGroups.set(k, new Set())
    caseGroups.get(k).add(categoryLabel(r.category))
  }
  const dupes = [...caseGroups.values()].filter((s) => s.size > 1)
  if (dupes.length) {
    issues.push({
      id: 'category-case',
      count: dupes.length,
      // The variants themselves, so the UI can offer to merge a specific pair.
      variants: dupes.map((s) => [...s]),
      severity: 'warning',
      label: 'Category names differing only by case',
      detail: dupes.map((s) => [...s].join(' / ')).slice(0, 5).join('  ·  '),
    })
  }

  const typeGroups = new Set(rows.map((r) => r.type).filter(Boolean))
  const blankType = rows.filter((r) => r.type === '').length
  if (blankType) {
    issues.push({
      id: 'blank-type',
      count: blankType,
      severity: 'good',
      label: 'Transactions with no purchase type',
      detail: `${blankType} of ${rows.length} rows have a blank type (${typeGroups.size} distinct types in view).`,
    })
  }

  const reversals = reversalSummary(rows)
  if (reversals.pairs) {
    issues.push({
      id: 'reversals',
      count: reversals.pairs,
      severity: 'good',
      label: 'Pre-authorisation holds netted out',
      detail: `${reversals.pairs} charge/refund pairs excluded from spending (${reversals.byVendor
        .slice(0, 3)
        .map((v) => v.vendor)
        .join(', ')}${reversals.byVendor.length > 3 ? ', …' : ''}).`,
      value: reversals.amount,
    })
  }

  // Same day, same vendor, same amount - the importer does not de-duplicate.
  const seen = new Map()
  let duplicates = 0
  for (const r of rows) {
    if (r.flow === 'reversal') continue
    const k = `${r.date.toDateString()}|${r.vendorKey}|${r.amount}|${r.account}`
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    if (n > 1) duplicates++
  }
  if (duplicates) {
    issues.push({
      id: 'duplicates',
      count: duplicates,
      severity: 'warning',
      label: 'Possible duplicate imports',
      detail: `${duplicates} rows repeat an identical date + vendor + amount + account.`,
    })
  }

  return issues
}

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100
}
