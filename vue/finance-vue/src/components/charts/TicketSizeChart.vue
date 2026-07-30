<script setup>
/**
 * Spend by purchase size. Buckets are an ordered scale, so they take the
 * validated ordinal ramp (one hue, monotone lightness) rather than category
 * colours - the order is part of the meaning.
 *
 * Answers the "death by a thousand cuts vs. a few big hits" question, which no
 * category chart can: $2,000 of $8 coffees and one $2,000 flight look identical
 * in a category total.
 */
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import ChartCard from '@/components/ChartCard.vue'
import { barSpec, categoryAxis, moneyAxis, tooltipStyle } from '@/utils/chartSetup.js'
import { ORDINAL } from '@/utils/palette.js'
import { ticketBuckets } from '@/utils/analytics.js'
import { money, moneyExact, percent } from '@/utils/format.js'

const props = defineProps({ rows: { type: Array, required: true } })

const buckets = computed(() => ticketBuckets(props.rows))

const chartData = computed(() => ({
  labels: buckets.value.map((b) => b.label),
  datasets: [
    {
      label: 'Total spent',
      data: buckets.value.map((b) => b.total),
      // Darkest step = smallest bucket, so the ramp reads in the same direction
      // as the axis it sits on.
      backgroundColor: buckets.value.map((_, i) => ORDINAL[ORDINAL.length - 1 - i]),
      ...barSpec({ thickness: 40 }),
    },
  ],
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: { ...categoryAxis(), title: { display: true, text: 'Purchase size', color: '#898781' } },
    y: moneyAxis({ compact: true, zeroLine: false }),
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      ...tooltipStyle,
      callbacks: {
        label: (ctx) => ` Total: ${moneyExact(ctx.parsed.y)}`,
        afterBody: (items) => {
          const b = buckets.value[items[0].dataIndex]
          return `${b.count} purchases · ${percent(b.share)} of spending\nAverage ${money(b.avg)}`
        },
      },
    },
  },
}))

const tableFields = [
  { key: 'label', label: 'Purchase size' },
  { key: 'total', label: 'Total spent' },
  { key: 'share', label: 'Share of spending' },
  { key: 'count', label: 'Purchases' },
  { key: 'avg', label: 'Average' },
]

const tableRows = computed(() =>
  buckets.value.map((b) => ({
    label: b.label,
    total: money(b.total),
    share: percent(b.share, 1),
    count: b.count,
    avg: money(b.avg),
  })),
)
</script>

<template>
  <ChartCard
    title="Small purchases vs. big ones"
    subtitle="Spending grouped by purchase size. Hover for the count behind each bar."
    :height="300"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="buckets.every((b) => b.total === 0)"
  >
    <Bar :data="chartData" :options="options" />
  </ChartCard>
</template>
