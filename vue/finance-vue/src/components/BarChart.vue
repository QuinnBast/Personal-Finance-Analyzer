<script setup>
/**
 * Generic "label -> amount" bar chart.
 *
 * Rewritten from the Options-API version, which (a) read `valueMap` in `data()`
 * so it never updated after mount, (b) called `sortValueMap()` three times per
 * render, and (c) gave every bar a different randomly-generated colour. These
 * are nominal categories in a single series, so every bar takes slot 1 and the
 * axis carries the identity.
 */
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import { barSpec, categoryAxis, moneyAxis, tooltipStyle } from '@/utils/chartSetup.js'
import { INK, SERIES } from '@/utils/palette.js'
import { moneyExact, percent } from '@/utils/format.js'

const props = defineProps({
  valueMap: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
  limit: { type: Number, default: 15 },
  /** Long labels read better sideways. */
  horizontal: { type: Boolean, default: false },
  seriesLabel: { type: String, default: 'Amount' },
})

const bars = computed(() =>
  Object.entries(props.valueMap ?? {})
    .map(([label, value]) => ({ label, value: Math.abs(Number(value) || 0) }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, props.limit),
)

const total = computed(() => bars.value.reduce((a, b) => a + b.value, 0))

const chartData = computed(() => ({
  labels: bars.value.map((b) => b.label),
  datasets: [
    {
      label: props.seriesLabel,
      data: bars.value.map((b) => b.value),
      backgroundColor: SERIES[0],
      ...barSpec({ thickness: props.horizontal ? 18 : 32 }),
    },
  ],
}))

const options = computed(() => {
  const value = moneyAxis({ compact: true, zeroLine: false })
  const label = props.horizontal
    ? { border: { display: false }, grid: { display: false }, ticks: { color: INK.secondary, autoSkip: false, padding: 8 } }
    : categoryAxis({ maxRotation: 45 })
  return {
    indexAxis: props.horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    scales: props.horizontal ? { x: value, y: label } : { x: label, y: value },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          label: (ctx) => {
            const v = props.horizontal ? ctx.parsed.x : ctx.parsed.y
            return ` ${moneyExact(v)} (${percent(total.value > 0 ? v / total.value : 0, 1)} of shown)`
          },
        },
      },
    },
  }
})
</script>

<template>
  <div class="bar-wrap">
    <h4 v-if="title" class="bar-title">{{ title }}</h4>
    <div class="bar-frame">
      <Bar :data="chartData" :options="options" />
    </div>
  </div>
</template>

<style scoped>
.bar-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.bar-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #c3c2b7;
  margin-bottom: 0.25rem;
}

.bar-frame {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
