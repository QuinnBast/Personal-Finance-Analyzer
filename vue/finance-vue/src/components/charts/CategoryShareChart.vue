<script setup>
/**
 * Pareto view of spending: share per family, largest first, with the running
 * cumulative share. Answers "how few categories account for most of my money?"
 * Both series are percentages, so they share one axis.
 */
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import ChartCard from '@/components/ChartCard.vue'
import { barSpec, categoryAxis, crosshair, percentAxis, tooltipStyle } from '@/utils/chartSetup.js'
import { INK } from '@/utils/palette.js'
import { familyTotals } from '@/utils/analytics.js'
import { familyColor } from '@/utils/categoryColors.js'
import { money, percent } from '@/utils/format.js'

const props = defineProps({ rows: { type: Array, required: true } })

const families = computed(() => familyTotals(props.rows).filter((f) => f.total > 0))

const chartData = computed(() => ({
  labels: families.value.map((f) => f.family),
  datasets: [
    {
      type: 'bar',
      label: 'Share of spending',
      data: families.value.map((f) => Math.round(f.share * 1000) / 10),
      backgroundColor: families.value.map((f) => familyColor(f.family)),
      ...barSpec({ thickness: 40 }),
    },
    {
      type: 'line',
      label: 'Running total',
      data: families.value.map((f) => Math.round(f.cumulativeShare * 1000) / 10),
      borderColor: INK.secondary,
      backgroundColor: INK.secondary,
      pointRadius: 4,
      pointBackgroundColor: INK.secondary,
      fill: false,
    },
  ],
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: crosshair,
  scales: {
    // Seven bars at most: never drop a label, or a bar loses its identity.
    x: categoryAxis({ maxRotation: 40, autoSkip: false }),
    y: percentAxis({ max: 100 }),
  },
  plugins: {
    legend: { display: true },
    tooltip: {
      ...tooltipStyle,
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
        afterBody: (items) => {
          const f = families.value[items[0].dataIndex]
          return f ? `${money(f.total)} spent on ${f.family}` : ''
        },
      },
    },
  },
}))

const tableFields = [
  { key: 'family', label: 'Category' },
  { key: 'total', label: 'Spent' },
  { key: 'share', label: 'Share' },
  { key: 'cumulative', label: 'Running total' },
]

const tableRows = computed(() =>
  families.value.map((f) => ({
    family: f.family,
    total: money(f.total),
    share: percent(f.share, 1),
    cumulative: percent(f.cumulativeShare, 1),
  })),
)

const headline = computed(() => {
  const list = families.value
  if (!list.length) return ''
  let i = 0
  while (i < list.length && list[i].cumulativeShare < 0.8) i++
  const n = Math.min(i + 1, list.length)
  return `The top ${n} ${n === 1 ? 'category accounts' : 'categories account'} for ${percent(
    list[n - 1].cumulativeShare,
  )} of all spending in this range.`
})
</script>

<template>
  <ChartCard
    title="Where spending concentrates"
    subtitle="Categories by size, with a running total."
    :note="headline"
    :height="340"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="families.length === 0"
  >
    <Bar :data="chartData" :options="options" />
  </ChartCard>
</template>
