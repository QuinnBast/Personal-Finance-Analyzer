/**
 * One-time Chart.js registration + the shared mark specs.
 *
 * Import this for its side effects anywhere a chart is rendered, and use the
 * option builders so every chart in the app carries the same recessive chrome:
 * hairline solid grid, thin marks, 2px surface gaps, muted axis ink.
 */
import {
  Chart as ChartJS,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Title,
  Tooltip,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import 'chartjs-adapter-moment'
import { INK, SURFACE } from '@/utils/palette.js'
import { money, moneyCompact, moneyExact } from '@/utils/format.js'

let registered = false

if (!registered) {
  ChartJS.register(
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    DoughnutController,
    Filler,
    Legend,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    TimeScale,
    Title,
    Tooltip,
    zoomPlugin,
  )

  // Chrome defaults: text wears text tokens, never a series colour.
  ChartJS.defaults.color = INK.secondary
  ChartJS.defaults.borderColor = INK.grid
  ChartJS.defaults.font.family =
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  ChartJS.defaults.font.size = 12

  // Thin marks.
  ChartJS.defaults.elements.line.borderWidth = 2
  ChartJS.defaults.elements.line.tension = 0
  ChartJS.defaults.elements.point.radius = 4
  ChartJS.defaults.elements.point.hoverRadius = 6
  ChartJS.defaults.elements.point.borderWidth = 2
  ChartJS.defaults.elements.point.borderColor = SURFACE // 2px surface ring
  ChartJS.defaults.elements.point.hitRadius = 12 // hit target > mark
  ChartJS.defaults.elements.bar.borderRadius = 4
  ChartJS.defaults.elements.bar.borderSkipped = 'start' // square at the baseline

  ChartJS.defaults.plugins.title.display = false // the card supplies the title
  ChartJS.defaults.plugins.legend.position = 'bottom'
  ChartJS.defaults.plugins.legend.labels.boxWidth = 10
  ChartJS.defaults.plugins.legend.labels.boxHeight = 10
  ChartJS.defaults.plugins.legend.labels.usePointStyle = true
  ChartJS.defaults.plugins.legend.labels.padding = 14

  registered = true
}

/** Tooltip chrome shared by every chart. */
export const tooltipStyle = {
  backgroundColor: '#15181b',
  borderColor: 'rgba(255,255,255,0.10)',
  borderWidth: 1,
  titleColor: INK.primary,
  bodyColor: INK.secondary,
  padding: 10,
  cornerRadius: 6,
  displayColors: true,
  boxWidth: 10,
  boxHeight: 10,
  usePointStyle: true,
}

/** A recessive y-axis in dollars. `compact` for long ranges where full figures collide. */
export const moneyAxis = ({ compact = false, stacked = false, zeroLine = true, title } = {}) => ({
  stacked,
  border: { display: false },
  title: title ? { display: true, text: title, color: INK.muted } : undefined,
  grid: {
    color: (ctx) => (zeroLine && ctx.tick?.value === 0 ? INK.axis : INK.grid),
    lineWidth: 1, // hairline, solid - never dashed
    drawTicks: false,
  },
  ticks: {
    color: INK.muted,
    padding: 8,
    callback: (v) => (compact ? moneyCompact(v) : money(v)),
  },
})

/** A recessive category x-axis. `autoSkip: false` keeps every label when there
 *  are only a handful and dropping one would leave a bar unlabelled. */
export const categoryAxis = ({ stacked = false, maxRotation = 0, autoSkip = true } = {}) => ({
  stacked,
  border: { display: false },
  grid: { display: false },
  ticks: {
    color: INK.muted,
    padding: 6,
    maxRotation,
    minRotation: autoSkip ? 0 : maxRotation,
    autoSkip,
    autoSkipPadding: 12,
  },
})

/** Percent y-axis (savings rate, share of spend). */
export const percentAxis = ({ zeroLine = true, min, max } = {}) => ({
  min,
  max,
  border: { display: false },
  grid: {
    color: (ctx) => (zeroLine && ctx.tick?.value === 0 ? INK.axis : INK.grid),
    lineWidth: 1,
    drawTicks: false,
  },
  ticks: { color: INK.muted, padding: 8, callback: (v) => `${Math.round(v)}%` },
})

/** Bar dataset spec: capped thickness, air in the band, 2px surface gap when stacked. */
export const barSpec = ({ stacked = false, thickness = 24 } = {}) => ({
  maxBarThickness: thickness,
  categoryPercentage: 0.7,
  barPercentage: 0.9,
  ...(stacked
    ? { borderColor: SURFACE, borderWidth: { top: 2 }, borderSkipped: false, borderRadius: 0 }
    : {}),
})

/** Standard money tooltip: "<series>: $1,234.56". */
export const moneyTooltip = (extra = {}) => ({
  ...tooltipStyle,
  callbacks: {
    label: (ctx) => {
      const v = ctx.parsed?.y ?? ctx.parsed?.x ?? ctx.parsed
      return ` ${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${moneyExact(v)}`
    },
    ...extra,
  },
})

/** Crosshair-style hover for time/category lines: one tooltip listing every series. */
export const crosshair = { mode: 'index', intersect: false, axis: 'x' }

/**
 * Direct-labels the last point of selected datasets - selectively, which is the
 * only way direct labels work. Opt in per chart via
 * `plugins: [endLabelPlugin]` + `options.plugins.endLabel`.
 *
 *   endLabel: { datasets: [0], formatter: (v) => money(v) }
 */
export const endLabelPlugin = {
  id: 'endLabel',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || opts.display === false) return
    const format = opts.formatter ?? ((v) => String(v))
    const { ctx, chartArea } = chart

    chart.data.datasets.forEach((dataset, i) => {
      if (opts.datasets && !opts.datasets.includes(i)) return
      const meta = chart.getDatasetMeta(i)
      if (meta.hidden) return

      for (let k = meta.data.length - 1; k >= 0; k--) {
        const raw = dataset.data[k]
        const value = raw && typeof raw === 'object' ? raw.y : raw
        if (value == null) continue

        const point = meta.data[k]
        const text = format(value, dataset)
        ctx.save()
        ctx.font = `600 12px ${ChartJS.defaults.font.family}`
        ctx.fillStyle = opts.color ?? INK.primary
        ctx.textBaseline = 'bottom'
        // Keep the label inside the plot area rather than clipping it.
        const width = ctx.measureText(text).width
        const fitsRight = point.x + 8 + width < chartArea.right
        ctx.textAlign = fitsRight ? 'left' : 'right'
        ctx.fillText(text, fitsRight ? point.x + 8 : point.x - 8, Math.max(point.y - 8, chartArea.top + 14))
        ctx.restore()
        break
      }
    })
  },
}

export { ChartJS }
