<script setup>
/**
 * Category x period heatmap, shaded by how each period compares with that
 * category's own average: green = spent less than usual, red = spent more.
 *
 * Two bases, because they answer different questions:
 *   'row'  - deviation as a percentage of the category's average, on fixed
 *            thresholds, so the same colour means the same relative miss in
 *            every row.
 *   'grid' - deviation in dollars against the worst miss anywhere, so the
 *            reddest cell is the overspend that actually cost the most money.
 *
 * Red/green is the pole pair that collapses under the most common colour
 * blindness, so colour is never the only channel: every cell prints its amount
 * and an up/down marker, and the table view carries the same figures.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import ChartCard from '@/components/ChartCard.vue'
import { DIVERGING, INK, SURFACE, inkOn } from '@/utils/palette.js'
import { familyByPeriod, mean, partialPeriods } from '@/utils/analytics.js'
import { money, moneyCompact, percentSigned, periodLabel, periodShort } from '@/utils/format.js'

const props = defineProps({
  rows: { type: Array, required: true },
  interval: { type: String, default: 'month' },
})
const emit = defineEmits(['selectMonth'])

const basis = ref('row')

/** Relative thresholds for the 'row' basis: within 10% of average reads neutral. */
const RELATIVE_STEPS = [0.1, 0.35, 0.75]
/** Fractions of the worst dollar deviation for the 'grid' basis. */
const ABSOLUTE_STEPS = [0.15, 0.4, 0.7]

const matrix = computed(() => familyByPeriod(props.rows, props.interval))

const columns = computed(() => {
  let lastYear = null
  return matrix.value.periods.map((period) => {
    const year = period.slice(0, 4)
    const showYear = props.interval !== 'year' && year !== lastYear
    lastYear = year
    return { period, label: periodShort(period), year, showYear }
  })
})

const showValues = computed(() => columns.value.length > 0 && columns.value.length <= 14)

/** Each row's own average, over the periods where it actually had spending. */
const averages = computed(() =>
  matrix.value.series.map((s) => mean(s.values.filter((v) => v > 0))),
)

const worstDeviation = computed(() => {
  let worst = 0
  matrix.value.series.forEach((s, i) => {
    const avg = averages.value[i]
    if (!(avg > 0)) return
    s.values.forEach((v) => {
      if (v > 0) worst = Math.max(worst, Math.abs(v - avg))
    })
  })
  return worst
})

const grid = computed(() =>
  matrix.value.series.map((s, rowIndex) => {
    const avg = averages.value[rowIndex]
    return {
      family: s.family,
      average: avg,
      cells: s.values.map((value, i) => {
        const period = matrix.value.periods[i]
        if (!(value > 0) || !(avg > 0)) {
          return { period, value, empty: true, delta: 0, ratio: null, step: 0 }
        }
        const delta = value - avg
        const ratio = delta / avg
        const magnitude =
          basis.value === 'row'
            ? Math.abs(ratio)
            : worstDeviation.value > 0
              ? Math.abs(delta) / worstDeviation.value
              : 0
        const steps = basis.value === 'row' ? RELATIVE_STEPS : ABSOLUTE_STEPS
        // 0 = neutral band, 1..3 = increasingly strong.
        let step = 0
        if (magnitude >= steps[2]) step = 3
        else if (magnitude >= steps[1]) step = 2
        else if (magnitude >= steps[0]) step = 1
        return { period, value, empty: false, delta, ratio, step }
      }),
    }
  }),
)

const hovered = ref(null)

const caption = computed(() => {
  const h = hovered.value
  if (!h) {
    const how =
      basis.value === 'row'
        ? 'Shaded by how far each period sits from that category’s average.'
        : `Shaded by how many dollars each period is off its category average, against the biggest miss anywhere (${moneyCompact(worstDeviation.value)}).`
    return props.interval === 'month' ? `${how} Click a cell to open that month.` : how
  }
  if (h.empty) return `${h.family} · ${periodLabel(h.period)} · nothing spent`
  const dir = h.delta > 0 ? 'more than' : 'less than'
  return `${h.family} · ${periodLabel(h.period)} · ${money(h.value)} — ${money(
    Math.abs(h.delta),
  )} ${dir} its ${money(h.average)} average (${percentSigned(h.ratio)})`
})

function cellStyle(cell) {
  if (cell.empty) {
    return { background: SURFACE, boxShadow: `inset 0 0 0 1px ${INK.grid}`, color: INK.muted }
  }
  if (cell.step === 0) return { background: DIVERGING.neutral, color: inkOn(DIVERGING.neutral) }
  const arm = cell.delta > 0 ? DIVERGING.bad : DIVERGING.good
  const fill = arm[cell.step - 1]
  return { background: fill, color: inkOn(fill) }
}

/** The marker that keeps this readable without colour. */
const marker = (cell) => (cell.empty || cell.step === 0 ? '' : cell.delta > 0 ? '▲' : '▼')

const scroller = ref(null)
const scrollToNewest = () => {
  nextTick(() => {
    const el = scroller.value
    if (el) el.scrollLeft = el.scrollWidth
  })
}
onMounted(scrollToNewest)
watch(() => matrix.value.periods.join(), scrollToNewest)

const partialNote = computed(() => {
  const list = partialPeriods(props.rows, props.interval)
  if (!list.length) return ''
  return `Partial ${list.length === 1 ? 'period' : 'periods'}: ${list
    .map((p) => `${periodLabel(p.period)} covers ${p.months} of ${p.expected} months`)
    .join('; ')}.`
})

const tableFields = computed(() => [
  { key: 'family', label: 'Category' },
  { key: 'average', label: 'Average' },
  ...matrix.value.periods.map((p) => ({ key: p, label: periodLabel(p) })),
])

const tableRows = computed(() =>
  grid.value.map((row) => {
    const out = { family: row.family, average: money(row.average) }
    row.cells.forEach((c) => {
      out[c.period] = c.empty
        ? '—'
        : `${money(c.value)} (${percentSigned(c.ratio)})`
    })
    return out
  }),
)
</script>

<template>
  <ChartCard
    title="Category heatmap"
    subtitle="Green means you spent less than usual for that category, red means more."
    :note="partialNote"
    :height="Math.max(240, grid.length * 38 + 128)"
    :table-fields="tableFields"
    :table-rows="tableRows"
    :empty="grid.length === 0"
  >
    <div class="heatmap-wrap">
      <div class="heatmap-controls">
        <span class="control-label">Compare</span>
        <BButtonGroup size="sm">
          <BButton :variant="basis === 'row' ? 'secondary' : 'outline-secondary'" @click="basis = 'row'">
            Within each category
          </BButton>
          <BButton :variant="basis === 'grid' ? 'secondary' : 'outline-secondary'" @click="basis = 'grid'">
            Across all categories
          </BButton>
        </BButtonGroup>
      </div>

      <div ref="scroller" class="heatmap-scroll">
        <div class="heatmap" :style="{ '--cols': columns.length }">
          <div class="corner" />
          <div v-for="c in columns" :key="'h' + c.period" class="col-head">
            <span class="year" :class="{ hidden: !c.showYear }">{{ c.year }}</span>
            <span>{{ c.label }}</span>
          </div>

          <template v-for="row in grid" :key="row.family">
            <div class="row-head">
              <span class="row-name">{{ row.family }}</span>
              <span v-if="row.average" class="row-average">avg {{ moneyCompact(row.average) }}</span>
            </div>
            <button
              v-for="cell in row.cells"
              :key="row.family + cell.period"
              class="cell"
              :class="{ clickable: interval === 'month' }"
              type="button"
              :style="cellStyle(cell)"
              :aria-label="`${row.family}, ${periodLabel(cell.period)}: ${
                cell.empty ? 'nothing spent' : `${money(cell.value)}, ${percentSigned(cell.ratio)} vs average`
              }`"
              @mouseenter="hovered = { ...cell, family: row.family, average: row.average }"
              @focus="hovered = { ...cell, family: row.family, average: row.average }"
              @mouseleave="hovered = null"
              @blur="hovered = null"
              @click="interval === 'month' && emit('selectMonth', cell.period)"
            >
              <template v-if="cell.empty">—</template>
              <template v-else-if="showValues">
                <span class="marker" aria-hidden="true">{{ marker(cell) }}</span>{{ moneyCompact(cell.value) }}
              </template>
            </button>
          </template>
        </div>
      </div>

      <p class="caption">{{ caption }}</p>

      <div class="legend">
        <span class="legend-label">Less than usual</span>
        <span
          v-for="(c, i) in [...DIVERGING.good].reverse()"
          :key="'g' + i"
          class="swatch"
          :style="{ background: c }"
        />
        <span class="swatch" :style="{ background: DIVERGING.neutral }" />
        <span v-for="(c, i) in DIVERGING.bad" :key="'b' + i" class="swatch" :style="{ background: c }" />
        <span class="legend-label">More than usual</span>
        <span class="legend-sep">·</span>
        <span class="legend-label">— nothing spent</span>
      </div>
    </div>
  </ChartCard>
</template>

<style scoped>
.heatmap-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.heatmap-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.75rem;
  color: #898781;
}

/* Wide content scrolls inside its own container; the page never scrolls sideways. */
.heatmap-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1 1 auto;
}

.heatmap {
  display: grid;
  grid-template-columns: 148px repeat(var(--cols), minmax(30px, 1fr));
  gap: 2px; /* the 2px surface gap doing the separating */
  min-width: max-content;
}

.col-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.6875rem;
  color: #898781;
  line-height: 1.2;
  padding-bottom: 0.25rem;
}

.col-head .year {
  font-size: 0.625rem;
  color: #c3c2b7;
}

.col-head .year.hidden {
  visibility: hidden;
}

.row-head {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  padding-right: 0.625rem;
  overflow: hidden;
}

.row-name {
  font-size: 0.8125rem;
  color: #c3c2b7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.row-average {
  font-size: 0.625rem;
  color: #898781;
  white-space: nowrap;
}

.cell {
  height: 28px;
  border: 0;
  border-radius: 3px;
  padding: 0;
  cursor: default;
  font-size: 0.6875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.marker {
  font-size: 0.5625rem;
  margin-right: 0.1rem;
}

.cell.clickable {
  cursor: pointer;
}

.cell:hover,
.cell:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 1px;
}

.caption {
  margin: 0;
  font-size: 0.8125rem;
  color: #c3c2b7;
  min-height: 1.4em;
  text-align: left;
}

.legend {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.legend-label {
  font-size: 0.75rem;
  color: #898781;
}

.legend-sep {
  color: #4a5158;
  margin: 0 0.25rem;
}

.swatch {
  width: 18px;
  height: 10px;
  border-radius: 2px;
}
</style>
