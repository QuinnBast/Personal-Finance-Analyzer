<script setup>
/**
 * Stat tile: label / value / optional delta / optional sparkline.
 * The right form for a single headline number - a one-bar bar chart is not.
 */
import { computed } from 'vue'
import { INK, SERIES, STATUS } from '@/utils/palette.js'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  /** Small qualifier after the value, e.g. "out" - keeps a lone figure unambiguous. */
  unit: { type: String, default: '' },
  /** Optional second figure on its own line, for tiles that must show a pair. */
  secondLabel: { type: String, default: '' },
  secondValue: { type: String, default: '' },
  delta: { type: String, default: '' },
  // Colour = direction x whether up is good. The caller decides, because "spent
  // more" and "earned more" are the same direction and opposite news.
  deltaTone: { type: String, default: 'neutral' },
  // Which way the number moved: 'up' | 'down' | 'none'. Kept separate from tone
  // so a good change never draws an arrow pointing the wrong way.
  deltaDirection: { type: String, default: 'none' },
  hint: { type: String, default: '' },
  trend: { type: Array, default: () => [] },
})

const deltaColor = computed(() =>
  props.deltaTone === 'good' ? STATUS.good : props.deltaTone === 'bad' ? STATUS.critical : INK.muted,
)

const deltaIcon = computed(() =>
  props.deltaDirection === 'up' ? '▲' : props.deltaDirection === 'down' ? '▼' : '',
)

// 12-point sparkline: de-emphasis line, accent dot on the current period.
const spark = computed(() => {
  const values = props.trend.slice(-12).map((v) => Number(v) || 0)
  if (values.length < 2) return null
  const w = 96
  const h = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i) => (i / (values.length - 1)) * (w - 4) + 2
  const y = (v) => h - 3 - ((v - min) / span) * (h - 6)
  return {
    w,
    h,
    points: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    lastX: x(values.length - 1).toFixed(1),
    lastY: y(values[values.length - 1]).toFixed(1),
  }
})
</script>

<template>
  <div class="stat-tile">
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value">
      {{ value }}<span v-if="unit" class="stat-unit">{{ unit }}</span>
    </div>

    <div v-if="secondValue" class="stat-second">
      <span class="stat-second-label">{{ secondLabel }}</span>
      <span class="stat-second-value">{{ secondValue }}</span>
    </div>

    <div class="stat-footer">
      <span v-if="delta" class="stat-delta" :style="{ color: deltaColor }">
        <span v-if="deltaIcon" aria-hidden="true">{{ deltaIcon }}</span> {{ delta }}
      </span>
      <span v-else-if="hint" class="stat-hint">{{ hint }}</span>

      <svg
        v-if="spark"
        class="stat-spark"
        :viewBox="`0 0 ${spark.w} ${spark.h}`"
        :width="spark.w"
        :height="spark.h"
        role="img"
        aria-hidden="true"
      >
        <polyline
          :points="spark.points"
          fill="none"
          :stroke="INK.muted"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <circle :cx="spark.lastX" :cy="spark.lastY" r="2.5" :fill="SERIES[0]" />
      </svg>
    </div>

    <div v-if="delta && hint" class="stat-hint mt-1">{{ hint }}</div>
  </div>
</template>

<style scoped>
.stat-tile {
  height: 100%;
  padding: 1rem 1.125rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
  text-align: left;
}

.stat-label {
  font-size: 0.8125rem;
  color: #c3c2b7;
  line-height: 1.3;
}

/* Proportional figures: tabular-nums makes a big standalone number look loose. */
.stat-value {
  font-size: 1.75rem;
  font-weight: 600;
  color: #ffffff;
  line-height: 1.2;
  margin-top: 0.25rem;
}

.stat-unit {
  font-size: 0.8125rem;
  font-weight: 400;
  color: #898781;
  margin-left: 0.3rem;
}

.stat-second {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.stat-second-label {
  font-size: 0.75rem;
  color: #898781;
}

.stat-second-value {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #c3c2b7;
  font-variant-numeric: tabular-nums;
}

.stat-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.375rem;
  min-height: 28px;
}

.stat-delta {
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}

.stat-hint {
  font-size: 0.75rem;
  color: #898781;
  line-height: 1.35;
}

.stat-spark {
  flex-shrink: 0;
}
</style>
