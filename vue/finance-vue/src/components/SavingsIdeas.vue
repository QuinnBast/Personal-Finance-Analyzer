<script setup>
/**
 * Suggested ways to save money.
 *
 * A ranked list, not a chart - each row is something to act on, and a bar chart
 * of estimates would imply more precision than a heuristic deserves.
 *
 * Annual figures are deliberately never summed: the small-purchase idea overlaps
 * the per-vendor habit ideas, so a total would double-count.
 */
import { computed } from 'vue'
import { savingsBenchmark, savingsIdeas } from '@/utils/analytics.js'
import { money, monthLabel, percent } from '@/utils/format.js'

const props = defineProps({ rows: { type: Array, required: true } })

const ideas = computed(() => savingsIdeas(props.rows))
const benchmark = computed(() => savingsBenchmark(props.rows))

const fixed = computed(() => ideas.value.filter((i) => i.kind === 'fixed'))
const fixedTotal = computed(() => fixed.value.reduce((a, i) => a + i.annual, 0))
</script>

<template>
  <BCard class="panel mb-4" body-class="p-3 p-md-4">
    <h3 class="panel-title mb-1">Suggested ways to save money</h3>
    <p class="panel-subtitle mb-3">
      Each row is one change you could make. The figure is what it would keep you per year, worked
      out from your own history. They overlap, so don't add them together.
    </p>

    <BAlert v-if="fixed.length" :model-value="true" variant="info" class="text-start py-2">
      <strong>{{ money(fixedTotal) }}/year</strong> of this needs no change in habits — just
      cancelling or renegotiating.
    </BAlert>

    <ul v-if="ideas.length" class="idea-list">
      <li class="list-head">
        <div class="idea-amount">Saves per year</div>
        <div class="idea-body">The change</div>
      </li>
      <li v-for="idea in ideas" :key="idea.id">
        <div class="idea-amount">{{ money(idea.annual) }}<span class="per">/yr</span></div>
        <div class="idea-body">
          <div class="idea-title">
            {{ idea.title }}
            <BBadge :variant="idea.kind === 'fixed' ? 'success' : 'secondary'" class="ms-1 kind">
              {{ idea.kind === 'fixed' ? 'fixed cost' : 'habit' }}
            </BBadge>
          </div>
          <div class="idea-detail">{{ idea.detail }}</div>
        </div>
      </li>
    </ul>
    <p v-else class="muted mb-0">
      Nothing stands out in this range. Try a longer range — subscriptions and price rises need a
      few months of history to detect.
    </p>

    <p v-if="benchmark" class="benchmark mb-0">
      Your best three months of the last {{ benchmark.windowMonths }}
      ({{ benchmark.bestMonths.map(monthLabel).join(', ') }}) averaged a
      {{ percent(benchmark.bestRate) }} savings rate against a {{ percent(benchmark.typicalRate) }}
      median. Matching that pace is about
      <strong>{{ money(benchmark.annualGap) }}/year</strong> — a target rather than a specific cut.
    </p>
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
  text-align: left;
}

.panel-subtitle {
  font-size: 0.875rem;
  color: #c3c2b7;
  text-align: left;
}

.idea-list {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
}

.idea-list li {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.idea-list li:last-child {
  border-bottom: 0;
}

/* Anchors what the number in the left column means. */
.list-head {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #898781;
  padding-bottom: 0.35rem !important;
}

.list-head .idea-amount {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #898781;
}

.idea-amount {
  flex: 0 0 auto;
  min-width: 6.5rem;
  text-align: right;
  font-size: 1.0625rem;
  font-weight: 600;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
}

.per {
  font-size: 0.75rem;
  font-weight: 400;
  color: #898781;
  margin-left: 0.125rem;
}

.idea-body {
  flex: 1 1 auto;
}

.idea-title {
  font-size: 0.9375rem;
  color: #ffffff;
}

.kind {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  vertical-align: 2px;
}

.idea-detail {
  font-size: 0.8125rem;
  color: #898781;
  margin-top: 0.125rem;
}

.benchmark {
  margin-top: 1rem;
  padding-top: 0.875rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.8125rem;
  color: #c3c2b7;
  text-align: left;
}

.muted {
  color: #898781;
  font-size: 0.875rem;
  text-align: left;
}
</style>
