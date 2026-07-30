/**
 * Chart colour tokens.
 *
 * Every value here comes from a validated palette - nothing is eyeballed.
 * The app renders on a Bootstrap dark card (#2b3035), so the *dark* steps are
 * used and were validated against that exact surface:
 *
 *   categorical (8 slots, adjacent pairlist)
 *     -> PASS  worst adjacent CVD dE 8.4, worst adjacent normal-vision dE 19.3
 *              (green #008300 is 2.69:1 on this surface -> sub-3:1 "relief"
 *              warning, which is why every chart ships a legend + data table)
 *   ordinal ramp (5 steps, ORDINAL)
 *     -> PASS  monotone lightness, all adjacent dL >= 0.06, light end 2.01:1
 *
 * IMPORTANT: only the first six categorical slots are used for spending
 * categories. Slot 7 (violet) is excluded because violet vs. slot-1 blue
 * collapses under protanopia (dE 1.9), and slot 8 (red) is reserved for the
 * "money out" pole of the diverging cash-flow scale so red means one thing
 * everywhere in the dashboard.
 */

const mix = (a, b, t) => {
  const rgb = (h) => {
    const n = parseInt(h.replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const c = (x, y) => Math.round(x + (y - x) * t)
  return `#${[c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// --- surfaces -----------------------------------------------------------
export const SURFACE = '#2b3035' // bootstrap dark card - the chart surface
export const PAGE = '#212529'

// --- ink / chrome -------------------------------------------------------
export const INK = {
  primary: '#ffffff',
  secondary: '#c3c2b7',
  muted: '#898781',
  grid: '#383e44', // hairline, one step off the surface
  axis: '#454c53',
}

// --- categorical: identity (which category) -----------------------------
// Fixed order. Assigned in sequence, never cycled, never by rank.
// Seven slots, validated as a set against this surface: worst adjacent CVD
// dE 8.4, worst adjacent normal-vision dE 19.3. Slot 8 (red #e66767) is left
// out on purpose so red only ever means "money out".
export const SERIES = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
  '#008300', // 6 green
  '#9085e9', // 7 violet
]

// Everything past the six named families folds in here - a de-emphasis gray,
// never a generated hue.
export const OTHER = '#7a8189'

// --- diverging: polarity (money in vs. money out) -----------------------
// blue <-> red poles with a neutral midpoint, per the diverging spec.
export const FLOW = {
  income: '#3987e5',
  expense: '#e66767',
  net: '#c3c2b7', // the neutral midpoint of the diverging scale
  transfer: '#7a8189', // transfers are context, not spending
}

// --- ordinal: position in an ordered sequence (ticket-size buckets) ------
// Validated with --ordinal against this surface. Index 0 = largest magnitude.
export const ORDINAL = ['#cde2fb', '#9ec5f4', '#5598e7', '#2a78d6', '#1c5cab']

// --- sequential: magnitude (heatmap cells) ------------------------------
// One hue, light -> dark, all steps straight from the documented blue ramp.
// Anchor is flipped for the dark surface: the step nearest the surface means
// "near zero", brightest means "most spent". Seven classes is the ceiling at
// which adjacent classes stay tellable apart - past it, read the table.
export const SEQUENTIAL = ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb']

// --- status: reserved meaning, never a series colour --------------------
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

/**
 * Diverging scale for "better or worse than usual".
 *
 * This is a *status* judgement (under budget is good, over is bad), not series
 * identity, so it wears the status tokens rather than categorical hues. Under
 * red/green colour blindness the two poles collapse, so every cell using this
 * scale MUST also carry its value and an up/down marker - colour is the third
 * channel here, never the only one.
 *
 * Three steps per arm, each a blend from the neutral midpoint out to the
 * documented status token.
 */
export const DIVERGING = {
  neutral: '#3a4046',
  // index 0 = mildest, 2 = strongest
  good: [0.35, 0.7, 1].map((t) => mix('#3a4046', STATUS.good, t)),
  bad: [0.35, 0.7, 1].map((t) => mix('#3a4046', STATUS.critical, t)),
}

/** Series colour for slot `i` (0-based); folds to the de-emphasis gray past slot 6. */
export const seriesColor = (i) => (i >= 0 && i < SERIES.length ? SERIES[i] : OTHER)

/** Area/stack fill: the hue as a wash, never a saturated block. */
export const wash = (hex, alpha = 0.1) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * Lighter step of a hue, for distinguishing siblings inside one colour slot
 * (composite encoding: hue = family, lightness = which sub-category).
 */
export const lighten = (hex, t) => mix(hex, '#ffffff', t)

/** Pick white or near-black ink for a label sitting inside a coloured fill. */
export const inkOn = (hex) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0b0b0b' : '#ffffff'
}

/** Sequential bin for a 0..1 magnitude, dark-anchored (0 recedes to the surface). */
export const sequentialBin = (t) => {
  if (!(t > 0)) return null
  const i = Math.min(SEQUENTIAL.length - 1, Math.floor(t * SEQUENTIAL.length))
  return SEQUENTIAL[i]
}
