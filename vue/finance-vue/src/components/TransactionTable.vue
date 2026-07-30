<script setup>
/**
 * The transaction table, shared by the dashboard and the Transactions page so
 * the two never drift apart.
 *
 * Presentation rules:
 *  - the Kind chip is filled with its flow colour, matching the cash-flow chart
 *    (blue in, red out) rather than introducing a second colour language;
 *  - the amount carries a direction arrow instead of a +/- sign, coloured the
 *    same way, with the sign still recoverable from the arrow and the chip;
 *  - a family dot sits beside the category, so identity never rides on text
 *    colour.
 */
import { computed, ref, watch } from 'vue'
import { FLOW, INK, wash } from '@/utils/palette.js'
import { familyColor } from '@/utils/categoryColors.js'
import { dateLabel, money } from '@/utils/format.js'

const props = defineProps({
  /** Prepared rows from analytics.prepare(). */
  rows: { type: Array, required: true },
  perPage: { type: Number, default: 25 },
  emptyText: { type: String, default: 'No transactions match.' },
  showLocation: { type: Boolean, default: false },
})

const currentPage = ref(1)
watch(
  () => props.rows.length,
  () => {
    currentPage.value = 1
  },
)

const KIND_LABEL = { expense: 'Spent', income: 'Received', transfer: 'Transfer', reversal: 'Reversed' }
const KIND_COLOR = {
  expense: FLOW.expense,
  income: FLOW.income,
  transfer: FLOW.transfer,
  reversal: INK.muted,
}

const KIND_TITLE = {
  expense: 'Counted as spending',
  income: 'Counted as income',
  transfer: 'Moved between your own accounts — not counted either way',
  reversal: 'A hold or refund paired with its opposite — excluded from both',
}

const fields = computed(() => [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'vendor', label: 'Vendor', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  ...(props.showLocation ? [{ key: 'location', label: 'Location', sortable: true }] : []),
  { key: 'account', label: 'Account', sortable: true },
  { key: 'flow', label: 'Kind', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
])

const items = computed(() =>
  props.rows.map((r) => ({
    date: dateLabel(r.date),
    vendor: r.vendor,
    category: r.category || 'Uncategorized',
    family: r.family,
    location: r.location,
    account: r.account,
    flow: r.flow,
    amount: r.amount,
    // Sorting on the displayed magnitude rather than the signed value, so the
    // biggest transactions group together regardless of direction.
    _sortAmount: Math.abs(r.amount),
  })),
)

const chipStyle = (flow) => {
  const c = KIND_COLOR[flow] ?? INK.muted
  return { background: wash(c, 0.22), boxShadow: `inset 0 0 0 1px ${wash(c, 0.55)}` }
}

const amountArrow = (row) => {
  if (row.flow === 'reversal') return '↺'
  if (row.flow === 'transfer') return '→'
  return row.amount > 0 ? '↑' : '↓'
}

const amountColor = (row) => {
  if (row.flow === 'reversal' || row.flow === 'transfer') return INK.muted
  return row.amount > 0 ? FLOW.income : FLOW.expense
}
</script>

<template>
  <div>
    <BPagination
      v-if="items.length > perPage"
      v-model="currentPage"
      :total-rows="items.length"
      :per-page="perPage"
      class="justify-content-center"
      first-number
      last-number
      :limit="5"
      size="sm"
    />

    <BTable
      :items="items"
      :fields="fields"
      :per-page="perPage"
      :current-page="currentPage"
      small
      striped
      responsive
      show-empty
      :empty-text="emptyText"
      class="mb-0 txn-table"
    >
      <template #cell(category)="row">
        <span class="family-dot" :style="{ background: familyColor(row.item.family) }" />
        {{ row.item.category }}
      </template>
      <template #cell(flow)="row">
        <span class="kind-chip" :style="chipStyle(row.item.flow)" :title="KIND_TITLE[row.item.flow]">
          {{ KIND_LABEL[row.item.flow] ?? row.item.flow }}
        </span>
      </template>
      <template #cell(amount)="row">
        <span class="amount" :style="{ color: amountColor(row.item) }">
          <span class="arrow" aria-hidden="true">{{ amountArrow(row.item) }}</span>
          {{ money(Math.abs(row.item.amount)) }}
        </span>
      </template>
    </BTable>

    <BPagination
      v-if="items.length > perPage"
      v-model="currentPage"
      :total-rows="items.length"
      :per-page="perPage"
      class="justify-content-center mt-2 mb-0"
      first-number
      last-number
      :limit="5"
      size="sm"
    />
  </div>
</template>

<style scoped>
.txn-table :deep(td),
.txn-table :deep(th) {
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
}

.family-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.5rem;
  vertical-align: 1px;
}

.kind-chip {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #ffffff;
  white-space: nowrap;
  cursor: help;
}

.amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.arrow {
  display: inline-block;
  width: 0.85em;
  text-align: center;
}
</style>
