<script setup>
/**
 * Savings rate per period - the share of income that survived.
 * A single measure, so the reference line is the only companion series.
 */
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import ChartCard from '@/components/ChartCard.vue'
import {
  categoryAxis,
  crosshair,
  endLabelPlugin,
  percentAxis,
  tooltipStyle,
} from '@/utils/chartSetup.js'
import { FLOW, INK, SERIES, wash } from '@/utils/palette.js'
import { median, partialPeriods, periodTotals } from '@/utils/analytics.js'
import { money, percent, periodLabel } from '@/utils/format.js'

const props = defineProps({
  rows: { type: Array, required: true },
  interval: { type: String, default: 'month' },
})

const periods = computed(() => periodTotals(props.rows, props.interval).filter((p) => p.income > 0))
const medianRate = computed(() => median(periods.value.map((p) => p.savingsRate * 100)))

/**
 * One catastrophic period (a car bought against a single paycheque) reaches
 * -350% and flattens everything else into a hairline. The axis is clamped and
 * the off-scale periods are named, rather than silently cropped.
 */
const AXIS_LIMIT = 100
const outliers = computed(() => periods.value.filter((p) => Math.abs(p.savingsRate * 100) > AXIS_LIMIT))

const note = computed(() => {
  const parts = []
  if (outliers.value.length) {
    const list = outliers.value.map((p) => `${periodLabel(p.period)} (${percent(p.savingsRate)})`).join(', ')
    parts.push(`Clamped to ±100%. Off-scale: ${list}.`)
  }
  const partial = partialPeriods(props.rows, props.interval)
  if (partial.length) {
    parts.push(
      `Partial ${partial.length === 1 ? 'period' : 'periods'}: ${partial
        .map((p) => `${periodLabel(p.period)} covers ${p.months} of ${p.expected} months`)
        .join('; ')}.`,
    )
  }
  return parts.join(' ')
})

const chartData = computed(() => ({
  labels: periods.value.map((p) => periodLabel(p.period)),
  datasets: [
    {
      label: 'Savings rate',
      data: periods.value.map((p) => Math.round(p.savingsRate * 1000) / 10),
      borderColor: SERIES[0],
      backgroundColor: wash(SERIES[0], 0.12),
      fill: { target: { value: 0 }, above: wash(SERIES[0], 0.12), below: wash(FLOW.expense, 0.12) },
      pointRadius: periods.value.length > 24 ? 0 : 4,
      pointBackgroundColor: SERIES[0],
    },
    {
      label: `Typical (${Math.round(medianRate.value)}%)`,
      data: periods.value.map(() => Math.round(medianRate.value * 10) / 10),
      borderColor: INK.muted,
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
    },
  ],
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: crosshair,
  scales: {
    x: categoryAxis({ maxRotation: 45 }),
    y: percentAxis({ min: -AXIS_LIMIT, max: AXIS_LIMIT }),
  },
  plugins: {
    legend: { display: true },
    endLabel: { datasets: [0], formatter: (v) => `${v.toFixed(0)}%` },
    tooltip: {
      ...tooltipStyle,
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
        afterBody: (items) => {
          const p = periods.value[items[0].dataIndex]
          return p ? `In ${money(p.income)} · out ${money(p.spend)} · net ${money(p.net)}` : ''
        },
      },
    },
  },
}))

const tableFields = [
  { key: 'period', label: 'Period' },
  { key: 'rate', label: 'Savings rate' },
  { key: 'income', label: 'Money in' },
  { key: 'spend', label: 'Money out' },
  { key: 'net', label: 'Net' },
]

const tableRows = computed(() =>
  periods.value
    .slice()
    .reverse()
    .map((p) => ({
      period: periodLabel(p.period),
      rate: percent(p.savingsRate, 1),
      income: money(p.income),
      spend: money(p.spend),
      net: money(p.net),
    })),
)
</script>

<template>
  <ChartCard
    title="Savings rate"
    subtitle="Net as a share of income. Periods with no recorded income are skipped."
    :note="note"
    :height="320"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="periods.length === 0"
    empty-text="No periods with recorded income in this range."
  >
    <Line :data="chartData" :options="options" :plugins="[endLabelPlugin]" />
  </ChartCard>
</template>
