<script setup>
/**
 * One month in isolation.
 *
 * A single month's total means nothing on its own, so everything here is a
 * comparison: against the month before, against the median month in range, and
 * a ranked list of what actually moved.
 */
import { computed, watch } from 'vue'
import PieChart from '@/components/PieChart.vue'
import { availableMonths, monthDetail } from '@/utils/analytics.js'
import { familyColor } from '@/utils/categoryColors.js'
import { dateLabel, money, monthLabel, percent } from '@/utils/format.js'

const props = defineProps({
  rows: { type: Array, required: true },
  month: { type: String, default: '' },
})
const emit = defineEmits(['update:month'])

const months = computed(() => availableMonths(props.rows))
const selected = computed(() => (months.value.includes(props.month) ? props.month : months.value[0] ?? ''))
const detail = computed(() => monthDetail(props.rows, selected.value))

// Keep the parent's selection valid when the range or account filter changes.
watch(
  () => months.value.join(),
  () => {
    if (props.month && !months.value.includes(props.month)) emit('update:month', months.value[0] ?? '')
  },
)

const index = computed(() => months.value.indexOf(selected.value))
const step = (delta) => {
  const next = months.value[index.value + delta]
  if (next) emit('update:month', next)
}

const tone = (delta) => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat')
</script>

<template>
  <BCard v-if="detail" class="panel mb-4" body-class="p-3 p-md-4">
    <div class="d-flex justify-content-between align-items-start gap-3 mb-3 flex-wrap">
      <div class="text-start">
        <h3 class="panel-title mb-1">Single month</h3>
        <p class="panel-subtitle mb-0">
          Against the month before and the median month in range. Green means less spending, red
          means more.
        </p>
      </div>

      <div class="d-flex align-items-center gap-1">
        <BButton
          size="sm"
          variant="outline-secondary"
          :disabled="index >= months.length - 1"
          aria-label="Previous month"
          @click="step(1)"
        >
          ‹
        </BButton>
        <BFormSelect
          :model-value="selected"
          size="sm"
          style="width: auto"
          @update:model-value="emit('update:month', $event)"
        >
          <option v-for="m in months" :key="m" :value="m">{{ monthLabel(m) }}</option>
        </BFormSelect>
        <BButton
          size="sm"
          variant="outline-secondary"
          :disabled="index <= 0"
          aria-label="Next month"
          @click="step(-1)"
        >
          ›
        </BButton>
      </div>
    </div>

    <BRow class="g-3">
      <BCol cols="12" lg="5">
        <div class="month-figures">
          <div class="figure-row">
            <span class="figure-label">Spent</span>
            <span class="figure-value">{{ money(detail.current.spend) }}</span>
          </div>
          <div class="figure-row">
            <span class="figure-label">Received</span>
            <span class="figure-value">{{ money(detail.current.income) }}</span>
          </div>
          <div class="figure-row">
            <span class="figure-label">Net</span>
            <span class="figure-value">
              {{ money(detail.current.net) }}
              <small v-if="detail.current.savingsRate != null" class="figure-sub">
                {{ percent(detail.current.savingsRate) }} of income
              </small>
            </span>
          </div>
          <hr class="my-2" />
          <div class="figure-row">
            <span class="figure-label">
              Spending vs. {{ detail.previous ? monthLabel(detail.previous.period) : 'previous month' }}
            </span>
            <span v-if="detail.vsPrevious != null" class="figure-value" :class="tone(detail.vsPrevious)">
              {{ money(Math.abs(detail.vsPrevious)) }}
              <small class="direction">{{ detail.vsPrevious > 0 ? 'more' : 'less' }}</small>
            </span>
            <span v-else class="figure-value muted">—</span>
          </div>
          <div class="figure-row">
            <span class="figure-label">
              Spending vs. a typical month ({{ money(detail.typicalSpend) }})
            </span>
            <span class="figure-value" :class="tone(detail.vsTypical)">
              {{ money(Math.abs(detail.vsTypical)) }}
              <small class="direction">{{ detail.vsTypical > 0 ? 'more' : 'less' }}</small>
            </span>
          </div>
          <div class="figure-row">
            <span class="figure-label">Transactions</span>
            <span class="figure-value">{{ detail.transactionCount }}</span>
          </div>
        </div>
      </BCol>

      <BCol cols="12" lg="7">
        <div class="donut-frame">
          <PieChart :value-map="detail.composition" center-label="spent" />
        </div>
      </BCol>
    </BRow>

    <BRow class="g-3 mt-2">
      <BCol cols="12" lg="6">
        <h4 class="sub-head">
          What changed{{ detail.previous ? ` vs. ${monthLabel(detail.previous.period)}` : '' }}
        </h4>
        <ul v-if="detail.changes.length" class="plain-list">
          <li class="list-head">
            <span class="family-dot invisible" />
            <span class="grow">Category</span>
            <span class="col">Spending</span>
            <span class="col">This month</span>
          </li>
          <li v-for="c in detail.changes" :key="c.family">
            <span class="family-dot" :style="{ background: familyColor(c.family) }" />
            <span class="grow">{{ c.family }}</span>
            <span class="mono col" :class="tone(c.delta)">
              {{ c.delta > 0 ? '+' : '−' }}{{ money(Math.abs(c.delta)) }}
            </span>
            <span class="mono col muted">{{ money(c.total) }}</span>
          </li>
        </ul>
        <p v-else class="muted small mb-0">No earlier month in range to compare against.</p>
      </BCol>

      <BCol cols="12" lg="6">
        <h4 class="sub-head">Biggest purchases</h4>
        <ul class="plain-list">
          <li v-for="r in detail.biggest" :key="r.id ?? r.ts + r.vendor">
            <span class="family-dot" :style="{ background: familyColor(r.family) }" />
            <span class="grow">{{ r.vendor }}</span>
            <span class="muted small">{{ dateLabel(r.date) }}</span>
            <span class="mono">{{ money(r.spend) }}</span>
          </li>
        </ul>
      </BCol>
    </BRow>
  </BCard>
</template>

<style scoped>
.panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: #ffffff;
}

.panel-subtitle {
  font-size: 0.875rem;
  color: #c3c2b7;
}

.sub-head {
  font-size: 0.875rem;
  font-weight: 600;
  color: #c3c2b7;
  text-align: left;
  margin-bottom: 0.5rem;
}

.month-figures {
  text-align: left;
}

.figure-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3rem 0;
}

.figure-label {
  font-size: 0.875rem;
  color: #898781;
}

.figure-value {
  font-size: 1.0625rem;
  font-weight: 600;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
}

.direction {
  font-size: 0.75rem;
  font-weight: 400;
  margin-left: 0.125rem;
}

.figure-sub {
  font-size: 0.75rem;
  font-weight: 400;
  color: #898781;
  margin-left: 0.375rem;
}

.donut-frame {
  position: relative;
  height: 260px;
}

.plain-list {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
}

.plain-list li {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.875rem;
}

.grow {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.col {
  flex: 0 0 auto;
  min-width: 5.5rem;
  text-align: right;
}

.list-head {
  font-size: 0.75rem;
  color: #898781;
  border-bottom-color: rgba(255, 255, 255, 0.12);
}

.invisible {
  visibility: hidden;
}

.muted {
  color: #898781;
  font-weight: 400;
}

/* Spending more is not good news; spending less is. */
.up {
  color: #d03b3b;
}

.down {
  color: #0ca30c;
}

.flat {
  color: #898781;
}

.family-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
