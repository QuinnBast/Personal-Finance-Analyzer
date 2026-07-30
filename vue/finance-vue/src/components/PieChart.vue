<script setup>
/**
 * Part-to-whole donut for a single period.
 *
 * Rewritten from the Options-API version, which read `valueMap` inside `data()`.
 * That snapshots the prop once at construction, so the chart silently kept the
 * first slice values forever - the old view papered over it by forcing a
 * re-mount with `:key="sumTransactions(true, false)"`.
 *
 * Also: the tail now folds into "Other" at 6 segments (past that, adjacent
 * slices blur), values are currency-formatted, and slice colours are the
 * deterministic family colours instead of random hues.
 */
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { tooltipStyle } from '@/utils/chartSetup.js'
import { INK, OTHER, SURFACE } from '@/utils/palette.js'
import { getCategoryColor } from '@/utils/categoryColors.js'
import { money, moneyExact, percent } from '@/utils/format.js'

const props = defineProps({
  valueMap: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
  /** Segments to show before folding the tail into "Other". */
  limit: { type: Number, default: 6 },
  centerLabel: { type: String, default: '' },
})

const slices = computed(() => {
  const all = Object.entries(props.valueMap ?? {})
    .map(([label, value]) => ({ label, value: Math.abs(Number(value) || 0) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  if (all.length <= props.limit) return all

  const head = all.slice(0, props.limit - 1)
  const tail = all.slice(props.limit - 1)
  return [
    ...head,
    { label: `Other (${tail.length})`, value: tail.reduce((a, s) => a + s.value, 0), isOther: true },
  ]
})

const total = computed(() => slices.value.reduce((a, s) => a + s.value, 0))

const chartData = computed(() => ({
  labels: slices.value.map((s) => s.label),
  datasets: [
    {
      data: slices.value.map((s) => s.value),
      backgroundColor: slices.value.map((s) => (s.isOther ? OTHER : getCategoryColor(s.label))),
      borderColor: SURFACE, // 2px surface gap between segments, not a border
      borderWidth: 2,
      hoverOffset: 6,
    },
  ],
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  layout: { padding: 4 },
  plugins: {
    legend: { display: true, position: 'bottom' },
    tooltip: {
      ...tooltipStyle,
      callbacks: {
        label: (ctx) =>
          ` ${ctx.label}: ${moneyExact(ctx.parsed)} (${percent(
            total.value > 0 ? ctx.parsed / total.value : 0,
            1,
          )})`,
      },
    },
  },
}))

// The total belongs in the hole, where a donut otherwise wastes its centre.
const centerText = {
  id: 'centerText',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart
    const x = (chartArea.left + chartArea.right) / 2
    const y = (chartArea.top + chartArea.bottom) / 2
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = INK.primary
    ctx.font = `600 20px ${chart.options.font?.family ?? 'system-ui, sans-serif'}`
    ctx.fillText(money(total.value), x, y - (props.centerLabel ? 8 : 0))
    if (props.centerLabel) {
      ctx.fillStyle = INK.muted
      ctx.font = '400 11px system-ui, sans-serif'
      ctx.fillText(props.centerLabel, x, y + 12)
    }
    ctx.restore()
  },
}
</script>

<template>
  <div class="pie-wrap">
    <h4 v-if="title" class="pie-title">{{ title }}</h4>
    <div class="pie-frame">
      <Doughnut :data="chartData" :options="options" :plugins="[centerText]" />
    </div>
  </div>
</template>

<style scoped>
.pie-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* A 36px canvas title used to eat a third of the plot; this is a real heading. */
.pie-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #c3c2b7;
  margin-bottom: 0.25rem;
}

.pie-frame {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
