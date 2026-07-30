<script setup>
/**
 * Spending composition per period, stacked.
 *
 * Two levels of detail:
 *   'grouped'  - the seven category families. Fixed order, fixed colour slots.
 *   'detailed' - the raw category names as stored, using composite encoding:
 *                hue still comes from the family, and a lightness step
 *                separates siblings inside it, so ~12 series stay readable and
 *                same-family segments sit together in the stack.
 *
 * The Data view always lists *every* category, including the ones folded into
 * "Everything else" in the chart, so the cap never hides anything.
 */
import { computed, ref } from 'vue'
import { Bar } from 'vue-chartjs'
import ChartCard from '@/components/ChartCard.vue'
import { barSpec, categoryAxis, crosshair, moneyAxis, tooltipStyle } from '@/utils/chartSetup.js'
import { categoryByPeriod, familyByPeriod, partialPeriods } from '@/utils/analytics.js'
import { categoryShade, familyColor } from '@/utils/categoryColors.js'
import { money, moneyExact, percent, periodLabel } from '@/utils/format.js'

const props = defineProps({
  rows: { type: Array, required: true },
  interval: { type: String, default: 'month' },
})

const detail = ref('grouped')

const families = computed(() => familyByPeriod(props.rows, props.interval))
const detailed = computed(() => categoryByPeriod(props.rows, props.interval, { limit: 12 }))

const periods = computed(() =>
  detail.value === 'grouped' ? families.value.periods : detailed.value.periods,
)

const series = computed(() =>
  detail.value === 'grouped'
    ? families.value.series.map((s) => ({
        label: s.family,
        values: s.values,
        color: familyColor(s.family),
      }))
    : detailed.value.series.map((s) => ({
        label: s.category,
        values: s.values,
        color: categoryShade(s.family, s.shade),
      })),
)

const chartData = computed(() => ({
  labels: periods.value.map(periodLabel),
  datasets: series.value.map((s) => ({
    label: s.label,
    data: s.values,
    backgroundColor: s.color,
    ...barSpec({ stacked: true, thickness: 28 }),
  })),
}))

const totals = computed(() =>
  periods.value.map((_, i) => series.value.reduce((a, s) => a + s.values[i], 0)),
)

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: crosshair,
  scales: {
    x: categoryAxis({ stacked: true, maxRotation: 45 }),
    y: moneyAxis({ compact: true, stacked: true }),
  },
  plugins: {
    legend: { display: true },
    tooltip: {
      ...tooltipStyle,
      // A 13-series stack would otherwise print every zero row.
      filter: (item) => Math.abs(item.parsed.y) > 0.005,
      callbacks: {
        label: (ctx) => {
          const total = totals.value[ctx.dataIndex] || 0
          const share = total > 0 ? ctx.parsed.y / total : 0
          return ` ${ctx.dataset.label}: ${moneyExact(ctx.parsed.y)} (${percent(share)})`
        },
        footer: (items) => `Total: ${moneyExact(totals.value[items[0].dataIndex])}`,
      },
    },
  },
}))

const partialNote = computed(() => {
  const list = partialPeriods(props.rows, props.interval)
  if (!list.length) return ''
  return `Partial ${list.length === 1 ? 'period' : 'periods'}: ${list
    .map((p) => `${periodLabel(p.period)} covers ${p.months} of ${p.expected} months`)
    .join('; ')}.`
})

const note = computed(() => {
  const parts = []
  if (detail.value === 'detailed') {
    const shown = detailed.value.series.length
    const total = detailed.value.all.length
    if (total > shown) {
      parts.push(
        `Chart shows the ${shown - 1} largest of ${total} categories; the rest are grouped as "Everything else". The Data view lists all ${total}.`,
      )
    }
  }
  if (partialNote.value) parts.push(partialNote.value)
  return parts.join(' ')
})

// ---- table: grouped by period, or every category with its own row ----------
const tableFields = computed(() =>
  detail.value === 'grouped'
    ? [
        { key: 'period', label: 'Period' },
        ...families.value.series.map((s) => ({ key: s.family, label: s.family })),
        { key: 'Total', label: 'Total' },
      ]
    : [
        { key: 'category', label: 'Category', sortable: true },
        ...detailed.value.periods.map((p) => ({ key: p, label: periodLabel(p) })),
        { key: 'total', label: 'Total', sortable: true },
        { key: 'share', label: 'Share', sortable: true },
        { key: 'count', label: 'Transactions', sortable: true },
        { key: 'avg', label: 'Average', sortable: true },
      ],
)

const tableRows = computed(() => {
  if (detail.value === 'grouped') {
    return families.value.periods
      .map((period, i) => {
        const row = { period: periodLabel(period), Total: money(totals.value[i]) }
        for (const s of families.value.series) row[s.family] = money(s.values[i])
        return row
      })
      .reverse()
  }
  return detailed.value.all.map((c) => {
    const row = {
      category: c.category,
      total: money(c.total),
      share: percent(c.share, 1),
      count: c.count,
      avg: money(c.avg),
    }
    c.values.forEach((v, i) => {
      row[detailed.value.periods[i]] = money(v)
    })
    return row
  })
})
</script>

<template>
  <ChartCard
    title="Spending by category"
    subtitle="Column height is the period total, so size and mix read at once."
    :note="note"
    :height="detail === 'detailed' ? 460 : 400"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="series.length === 0"
  >
    <div class="stack-wrap">
      <div class="stack-controls">
        <span class="control-label">Detail</span>
        <BButtonGroup size="sm">
          <BButton
            :variant="detail === 'grouped' ? 'secondary' : 'outline-secondary'"
            @click="detail = 'grouped'"
          >
            Grouped
          </BButton>
          <BButton
            :variant="detail === 'detailed' ? 'secondary' : 'outline-secondary'"
            @click="detail = 'detailed'"
          >
            Detailed
          </BButton>
        </BButtonGroup>
      </div>
      <div class="stack-frame">
        <Bar :data="chartData" :options="options" />
      </div>
    </div>
  </ChartCard>
</template>

<style scoped>
.stack-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.stack-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.75rem;
  color: #898781;
}

.stack-frame {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
