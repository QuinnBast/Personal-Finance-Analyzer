<script setup>
/**
 * Cumulative net flow over time, one line per account.
 *
 * Fixes in this version over the original "Month Total" line:
 *  - it no longer sorts the shared reactive transaction array in place,
 *  - accounts are separate series instead of one line mixing Chequing + Credit,
 *  - transfers are excluded, so a credit-card payment does not show up as both
 *    an outflow on Chequing and an inflow on Credit,
 *  - the zero line is visible on the dark surface (it used to be #000000),
 *  - the table twin is one row per month instead of 6,000 unreadable points.
 */
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import ChartCard from '@/components/ChartCard.vue'
import { crosshair, moneyAxis, tooltipStyle } from '@/utils/chartSetup.js'
import { INK, SERIES, wash } from '@/utils/palette.js'
import { cumulativeFlow, periodTotals } from '@/utils/analytics.js'
import { dateLabel, money, moneyExact, periodLabel } from '@/utils/format.js'

const props = defineProps({
  rows: { type: Array, required: true },
  interval: { type: String, default: 'month' },
})

const chartRef = ref(null)
const accounts = computed(() => cumulativeFlow(props.rows))

const chartData = computed(() => ({
  datasets: accounts.value.map((a, i) => ({
    label: a.account,
    data: a.points,
    borderColor: SERIES[i] ?? SERIES[SERIES.length - 1],
    backgroundColor: wash(SERIES[i] ?? SERIES[SERIES.length - 1], 0.1),
    fill: i === 0 ? 'origin' : false,
    pointRadius: 0,
    pointHoverRadius: 5,
    borderWidth: 2,
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  parsing: false,
  normalized: true,
  interaction: { ...crosshair, mode: 'nearest', intersect: false },
  scales: {
    x: {
      type: 'time',
      time: { tooltipFormat: 'YYYY-MM-DD', displayFormats: { month: 'MMM YY', year: 'YYYY' } },
      border: { display: false },
      grid: { display: false },
      ticks: { color: INK.muted, padding: 6, maxRotation: 0, autoSkipPadding: 20 },
    },
    y: moneyAxis({ compact: true }),
  },
  plugins: {
    legend: { display: accounts.value.length > 1 },
    tooltip: {
      ...tooltipStyle,
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${moneyExact(ctx.parsed.y)}`,
        afterBody: (items) => {
          const row = items[0]?.raw?.row
          if (!row) return ''
          return `${dateLabel(row.date)} · ${row.vendor}\n${moneyExact(row.amount)} · ${
            row.category || 'Uncategorized'
          }`
        },
      },
    },
    zoom: {
      pan: { enabled: true, mode: 'x', modifierKey: 'shift' },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
    },
  },
}))

function resetZoom() {
  chartRef.value?.chart?.resetZoom()
}

const tableFields = [
  { key: 'period', label: 'Period' },
  { key: 'income', label: 'Money in' },
  { key: 'spend', label: 'Money out' },
  { key: 'net', label: 'Net' },
]

const tableRows = computed(() =>
  periodTotals(props.rows, props.interval)
    .slice()
    .reverse()
    .map((p) => ({
      period: periodLabel(p.period),
      income: money(p.income),
      spend: money(p.spend),
      net: money(p.net),
    })),
)
</script>

<template>
  <ChartCard
    title="Cumulative net flow"
    subtitle="Running total per account, from zero. Scroll to zoom, shift-drag to pan."
    note="Cumulative flow, not a bank balance: imported transactions only, transfers excluded."
    :height="360"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="accounts.length === 0"
  >
    <div class="position-relative h-100">
      <BButton
        size="sm"
        variant="outline-secondary"
        class="reset-zoom"
        @click="resetZoom"
      >
        Reset zoom
      </BButton>
      <Line ref="chartRef" :data="chartData" :options="options" />
    </div>
  </ChartCard>
</template>

<style scoped>
.reset-zoom {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  font-size: 0.75rem;
}
</style>
