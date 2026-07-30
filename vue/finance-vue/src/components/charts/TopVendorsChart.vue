<script setup>
/**
 * Top vendors, horizontal - vendor names are long, so bars go sideways and the
 * labels stay readable instead of being rotated 90 degrees.
 *
 * Two scales on the value axis, both measuring the same thing: dollars along the
 * bottom and the same quantity as a share of income *over the same range* along
 * the top. That is a unit conversion of one measure, not two measures sharing a
 * plot, so the bars stay honest.
 */
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import ChartCard from '@/components/ChartCard.vue'
import { barSpec, moneyAxis, tooltipStyle } from '@/utils/chartSetup.js'
import { INK, SERIES } from '@/utils/palette.js'
import { vendorStats } from '@/utils/analytics.js'
import { dateLabel, money, moneyExact, percent } from '@/utils/format.js'

const props = defineProps({
  rows: { type: Array, required: true },
  limit: { type: Number, default: 12 },
})

const all = computed(() => vendorStats(props.rows))
const top = computed(() => all.value.slice(0, props.limit))
const totalSpend = computed(() => all.value.reduce((a, v) => a + v.total, 0))

/**
 * Total income over the range on screen - the right yardstick for a total spend
 * over that same range. Comparing a range total against a single month's income
 * produced nonsense like "rent is 237% of income".
 */
const periodIncome = computed(() => props.rows.reduce((a, r) => a + r.income, 0))

const axisMax = computed(() => Math.max(...top.value.map((v) => v.total), 0) * 1.02 || 1)

const truncate = (s, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

const chartData = computed(() => ({
  labels: top.value.map((v) => truncate(v.vendor)),
  datasets: [
    {
      label: 'Total spent',
      data: top.value.map((v) => v.total),
      backgroundColor: SERIES[0],
      ...barSpec({ thickness: 18 }),
    },
  ],
}))

const options = computed(() => {
  const scales = {
    x: { ...moneyAxis({ compact: true, zeroLine: false }), min: 0, max: axisMax.value },
    y: {
      border: { display: false },
      grid: { display: false },
      ticks: { color: INK.secondary, padding: 8, autoSkip: false },
    },
  }

  if (periodIncome.value > 0) {
    const income = periodIncome.value
    scales.x2 = {
      position: 'top',
      min: 0,
      max: axisMax.value,
      border: { display: false },
      grid: { display: false },
      title: { display: true, text: 'Share of all income in this range', color: INK.muted },
      // Place ticks on round percentages rather than wherever the dollar ticks
      // happen to fall - "42%, 83%, 125%" is not a scale anyone reads.
      afterBuildTicks: (axis) => {
        const maxPercent = (axis.max / income) * 100
        const step = maxPercent > 400 ? 100 : maxPercent > 200 ? 50 : maxPercent > 80 ? 25 : 10
        const ticks = []
        for (let p = 0; p <= maxPercent + 1e-6; p += step) ticks.push({ value: (p / 100) * income })
        axis.ticks = ticks
      },
      ticks: {
        color: INK.muted,
        padding: 6,
        autoSkip: false,
        callback: (v) => `${Math.round((v / income) * 100)}%`,
      },
    }
  }

  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    scales,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          title: (items) => top.value[items[0].dataIndex].vendor,
          label: (ctx) => ` Total: ${moneyExact(ctx.parsed.x)}`,
          afterBody: (items) => {
            const v = top.value[items[0].dataIndex]
            const lines = [
              `${v.count} visits · average ${money(v.avg)}`,
              `${percent(totalSpend.value > 0 ? v.total / totalSpend.value : 0, 1)} of all spending`,
            ]
            if (periodIncome.value > 0) {
              lines.push(`${percent(v.total / periodIncome.value, 1)} of all income in this range`)
            }
            lines.push(`Last seen ${dateLabel(new Date(v.lastTs))}`)
            return lines.join('\n')
          },
        },
      },
    },
  }
})

const tableFields = computed(() => [
  { key: 'vendor', label: 'Vendor' },
  { key: 'family', label: 'Category' },
  { key: 'total', label: 'Total spent' },
  ...(periodIncome.value > 0 ? [{ key: 'shareIncome', label: 'Of income in range' }] : []),
  { key: 'count', label: 'Visits' },
  { key: 'avg', label: 'Average' },
  { key: 'last', label: 'Last seen' },
])

const tableRows = computed(() =>
  all.value.slice(0, 100).map((v) => ({
    vendor: v.vendor,
    family: v.family,
    total: money(v.total),
    shareIncome: periodIncome.value > 0 ? percent(v.total / periodIncome.value, 1) : '—',
    count: v.count,
    avg: money(v.avg),
    last: dateLabel(new Date(v.lastTs)),
  })),
)
</script>

<template>
  <ChartCard
    title="Top vendors by spend"
    subtitle="Dollars along the bottom, the same amount as a share of your income for this range along the top."
    :note="periodIncome > 0 ? `Total income in this range: ${money(periodIncome)}.` : ''"
    :height="Math.max(300, top.length * 30 + 96)"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="top.length === 0"
  >
    <Bar :data="chartData" :options="options" />
  </ChartCard>
</template>
