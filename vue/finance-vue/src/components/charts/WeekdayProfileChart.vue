<script setup>
/**
 * Spend by day of week. One series, so one colour for every bar - colouring
 * nominal bars by their own value would just re-encode bar length as hue.
 */
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import ChartCard from '@/components/ChartCard.vue'
import { barSpec, categoryAxis, moneyAxis, tooltipStyle } from '@/utils/chartSetup.js'
import { SERIES } from '@/utils/palette.js'
import { weekdayProfile } from '@/utils/analytics.js'
import { money, moneyExact } from '@/utils/format.js'

const props = defineProps({ rows: { type: Array, required: true } })

const days = computed(() => weekdayProfile(props.rows))

const chartData = computed(() => ({
  labels: days.value.map((d) => d.short),
  datasets: [
    {
      label: 'Average spend per active day',
      data: days.value.map((d) => d.avgPerActiveDay),
      backgroundColor: SERIES[0],
      ...barSpec({ thickness: 36 }),
    },
  ],
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: categoryAxis(), y: moneyAxis({ zeroLine: false }) },
  plugins: {
    // One series: the title names it, so a one-swatch legend box is just noise.
    legend: { display: false },
    tooltip: {
      ...tooltipStyle,
      callbacks: {
        title: (items) => days.value[items[0].dataIndex].name,
        label: (ctx) => ` Average day: ${moneyExact(ctx.parsed.y)}`,
        afterBody: (items) => {
          const d = days.value[items[0].dataIndex]
          return `${money(d.total)} over ${d.count} purchases on ${d.activeDays} ${
            d.activeDays === 1 ? 'day' : 'days'
          }\nAverage purchase ${money(d.avgTicket)}`
        },
      },
    },
  },
}))

const tableFields = [
  { key: 'name', label: 'Day' },
  { key: 'avgPerActiveDay', label: 'Average spend per active day' },
  { key: 'total', label: 'Total spent' },
  { key: 'count', label: 'Purchases' },
  { key: 'avgTicket', label: 'Average purchase' },
]

const tableRows = computed(() =>
  days.value.map((d) => ({
    name: d.name,
    avgPerActiveDay: money(d.avgPerActiveDay),
    total: money(d.total),
    count: d.count,
    avgTicket: money(d.avgTicket),
  })),
)
</script>

<template>
  <ChartCard
    title="Which days cost the most"
    subtitle="Average spend per day you actually spent."
    note="Posting dates, not purchase dates - weekend activity usually posts on Monday."
    :height="300"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="days.every((d) => d.total === 0)"
  >
    <Bar :data="chartData" :options="options" />
  </ChartCard>
</template>
