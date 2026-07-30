<script setup>
/**
 * Cash flow per period: income above the baseline, spending below it, net as a
 * line. One dollar axis for all three - never a second y-scale.
 */
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import ChartCard from '@/components/ChartCard.vue'
import { barSpec, categoryAxis, crosshair, moneyAxis, tooltipStyle } from '@/utils/chartSetup.js'
import { FLOW } from '@/utils/palette.js'
import { partialPeriods, periodTotals } from '@/utils/analytics.js'
import { money, moneyExact, percent, periodLabel } from '@/utils/format.js'

const props = defineProps({
  rows: { type: Array, required: true },
  interval: { type: String, default: 'month' },
})

const periods = computed(() => periodTotals(props.rows, props.interval))
const chartData = computed(() => {
  const p = periods.value
  return {
    labels: p.map((x) => periodLabel(x.period)),
    datasets: [
      {
        type: 'bar',
        label: 'Money in',
        data: p.map((x) => x.income),
        backgroundColor: FLOW.income,
        ...barSpec(),
      },
      {
        type: 'bar',
        label: 'Money out',
        // Below the baseline so in and out read as opposite directions.
        data: p.map((x) => -x.spend),
        backgroundColor: FLOW.expense,
        ...barSpec(),
      },
      {
        type: 'line',
        label: 'Net',
        data: p.map((x) => x.net),
        borderColor: FLOW.net,
        backgroundColor: FLOW.net,
        pointRadius: p.length > 24 ? 0 : 3,
        order: 0,
      },
    ],
  }
})

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: crosshair,
  scales: {
    // `stacked` on the index axis stops Chart.js offsetting the two bar
    // datasets side by side - money in and money out now share one slot and
    // grow in opposite directions from the baseline. The y axis stays
    // unstacked so the Net lines are unaffected.
    x: categoryAxis({ stacked: true, maxRotation: 45 }),
    y: moneyAxis({ compact: true }),
  },
  plugins: {
    legend: { display: true },
    tooltip: {
      ...tooltipStyle,
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${moneyExact(Math.abs(ctx.parsed.y))}`,
        afterBody: (items) => {
          const row = periods.value[items[0].dataIndex]
          return row?.savingsRate == null ? '' : `Net ${percent(row.savingsRate)} of income`
        },
      },
    },
  },
}))


/** Buckets clipped by the range boundary or not finished yet. */
const partialNote = computed(() => {
  const list = partialPeriods(props.rows, props.interval)
  if (!list.length) return ''
  return `Partial ${list.length === 1 ? 'period' : 'periods'}: ${list
    .map((p) => `${periodLabel(p.period)} covers ${p.months} of ${p.expected} months`)
    .join('; ')}.`
})

const tableFields = [
  { key: 'period', label: 'Period' },
  { key: 'income', label: 'Money in' },
  { key: 'spend', label: 'Money out' },
  { key: 'net', label: 'Net' },
  { key: 'rate', label: 'Net %' },
  { key: 'count', label: 'Transactions' },
]

const tableRows = computed(() =>
  periods.value
    .slice()
    .reverse()
    .map((p) => ({
      period: periodLabel(p.period),
      income: money(p.income),
      spend: money(p.spend),
      net: money(p.net),
      rate: p.savingsRate == null ? '—' : percent(p.savingsRate),
      count: p.count,
    })),
)
</script>

<template>
  <ChartCard
    title="Cash flow"
    subtitle="In above the line, out below. Excludes transfers between your own accounts."
    :note="partialNote"
    :height="380"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="periods.length === 0"
  >
    <Bar :data="chartData" :options="options" />
  </ChartCard>
</template>
