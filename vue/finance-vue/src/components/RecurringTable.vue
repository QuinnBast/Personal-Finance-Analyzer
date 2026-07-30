<script setup>
/**
 * Detected recurring charges - subscriptions, bills, memberships.
 *
 * A table, not a chart: this is a list of ~20 rows of numbers to scan and act
 * on, and no chart form makes "cancel this one" easier to see.
 */
import { computed, ref } from 'vue'
import { recurringCharges } from '@/utils/analytics.js'
import { dateLabel, money } from '@/utils/format.js'
import { familyColor } from '@/utils/categoryColors.js'

const props = defineProps({ rows: { type: Array, required: true } })

const activeOnly = ref(true)

const detected = computed(() => recurringCharges(props.rows))
const shown = computed(() => (activeOnly.value ? detected.value.filter((r) => r.active) : detected.value))

const monthlyTotal = computed(() =>
  detected.value.filter((r) => r.active).reduce((a, r) => a + r.monthlyEquivalent, 0),
)

const fields = [
  { key: 'vendor', label: 'Vendor', sortable: true },
  { key: 'cadence', label: 'Cadence', sortable: true },
  { key: 'avgAmount', label: 'Each time', sortable: true },
  { key: 'monthlyEquivalent', label: 'Per month', sortable: true },
  { key: 'yearlyEquivalent', label: 'Per year', sortable: true },
  { key: 'occurrences', label: 'Seen', sortable: true },
  { key: 'lastDate', label: 'Last charge', sortable: true },
  { key: 'nextExpected', label: 'Next expected', sortable: true },
]

const items = computed(() =>
  shown.value.map((r) => ({
    ...r,
    _rowVariant: r.active ? null : 'secondary',
  })),
)
</script>

<template>
  <BCard class="recurring-card mb-4" body-class="p-3 p-md-4">
    <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
      <div class="text-start">
        <h3 class="card-title-sm mb-1">Recurring charges</h3>
        <p class="card-subtitle-sm mb-0">
          Vendors billing a steady amount on a steady cadence. Detected from patterns, so review
          before trusting.
        </p>
      </div>
      <BFormCheckbox v-model="activeOnly" switch class="flex-shrink-0 text-nowrap">
        Active only
      </BFormCheckbox>
    </div>

    <BAlert v-if="detected.length" :model-value="true" variant="info" class="text-start py-2">
      <strong>{{ money(monthlyTotal) }}/month</strong> in still-active recurring charges
      — <strong>{{ money(monthlyTotal * 12) }}/year</strong> across
      {{ detected.filter((r) => r.active).length }} vendors.
    </BAlert>

    <BTable
      :items="items"
      :fields="fields"
      :sort-by="[{ key: 'monthlyEquivalent', order: 'desc' }]"
      small
      striped
      responsive
      empty-text="No recurring pattern found in this time range."
      show-empty
      class="mb-0 recurring-table"
    >
      <template #cell(vendor)="row">
        <span class="family-dot" :style="{ background: familyColor(row.item.family) }" />
        {{ row.item.vendor }}
        <BBadge v-if="!row.item.active" variant="secondary" class="ms-1">lapsed</BBadge>
      </template>
      <template #cell(cadence)="row">
        {{ row.item.cadence }}
        <span class="text-body-secondary">(~{{ row.item.cadenceDays }}d)</span>
      </template>
      <template #cell(avgAmount)="row">{{ money(row.item.avgAmount) }}</template>
      <template #cell(monthlyEquivalent)="row">{{ money(row.item.monthlyEquivalent) }}</template>
      <template #cell(yearlyEquivalent)="row">{{ money(row.item.yearlyEquivalent) }}</template>
      <template #cell(lastDate)="row">{{ dateLabel(row.item.lastDate) }}</template>
      <template #cell(nextExpected)="row">{{ dateLabel(row.item.nextExpected) }}</template>
    </BTable>
  </BCard>
</template>

<style scoped>
.recurring-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.card-title-sm {
  font-size: 1.15rem;
  font-weight: 600;
  color: #ffffff;
}

.card-subtitle-sm {
  font-size: 0.875rem;
  color: #c3c2b7;
  max-width: 80ch;
}

.recurring-table :deep(td),
.recurring-table :deep(th) {
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
}

/* Identity comes from a coloured mark beside the text, never coloured text. */
.family-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.5rem;
  vertical-align: 1px;
}
</style>
