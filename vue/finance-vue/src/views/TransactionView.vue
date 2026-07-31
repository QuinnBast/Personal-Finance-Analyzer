<script setup>
/**
 * Dashboard.
 *
 * Every aggregation is a `computed` over one prepared row set, so changing the
 * range, interval or account re-derives once instead of on every re-render.
 *
 * Data is imported one whole month at a time, so every month here is complete:
 * nothing projects, nothing is "so far", and the newest month counts toward the
 * average and median like any other.
 */
import { computed, ref, watch } from 'vue'
import { useToast } from 'bootstrap-vue-next'
import api from '@/utils/apiProvider.js'
import {
  INTERVALS,
  availableMonths,
  dataQuality,
  prepare,
  recurringCharges,
  summary,
} from '@/utils/analytics.js'
import { dateLabel, money, percent } from '@/utils/format.js'
import StatTile from '@/components/StatTile.vue'
import TransactionTable from '@/components/TransactionTable.vue'
import MonthDetail from '@/components/MonthDetail.vue'
import SavingsIdeas from '@/components/SavingsIdeas.vue'
import RecurringTable from '@/components/RecurringTable.vue'
import CashflowChart from '@/components/charts/CashflowChart.vue'
import SavingsRateChart from '@/components/charts/SavingsRateChart.vue'
import CategoryStackChart from '@/components/charts/CategoryStackChart.vue'
import CategoryShareChart from '@/components/charts/CategoryShareChart.vue'
import CategoryHeatmap from '@/components/charts/CategoryHeatmap.vue'
import TopVendorsChart from '@/components/charts/TopVendorsChart.vue'
import WeekdayProfileChart from '@/components/charts/WeekdayProfileChart.vue'
import TicketSizeChart from '@/components/charts/TicketSizeChart.vue'
import BalanceChart from '@/components/charts/BalanceChart.vue'

const { show } = useToast()

const ALL_MONTHS = 900
const RANGES = [
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: '5Y', months: 60 },
  { label: 'All', months: ALL_MONTHS },
]

const rawTransactions = ref([])
const monthsAgo = ref(12)
const interval = ref('month')
const accountFilter = ref('all')
const focusMonth = ref('')
const loading = ref(false)
const loaded = ref(false)

// ---- data -----------------------------------------------------------------
/**
 * The API cuts at "today minus N months", which lands mid-month. We ask for one
 * extra month and trim to a month boundary so every bucket is a whole month.
 */
const rangeStart = computed(() => {
  if (monthsAgo.value >= ALL_MONTHS) return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  d.setMonth(d.getMonth() - (monthsAgo.value - 1))
  return d.getTime()
})

const allRows = computed(() => {
  const prepared = prepare(rawTransactions.value)
  const start = rangeStart.value
  return start == null ? prepared : prepared.filter((r) => r.ts >= start)
})

const accounts = computed(() => [...new Set(allRows.value.map((r) => r.account))].sort())
const rows = computed(() =>
  accountFilter.value === 'all'
    ? allRows.value
    : allRows.value.filter((r) => r.account === accountFilter.value),
)

const stats = computed(() => summary(rows.value))
const quality = computed(() => dataQuality(rows.value))
const months = computed(() => availableMonths(rows.value))
const monthlySpendTrend = computed(() => stats.value.monthly.map((m) => m.spend))
const monthlyIncomeTrend = computed(() => stats.value.monthly.map((m) => m.income))

const activeRecurringMonthly = computed(() =>
  recurringCharges(rows.value)
    .filter((r) => r.active)
    .reduce((a, r) => a + r.monthlyEquivalent, 0),
)

const rangeLabel = computed(() => {
  const m = months.value
  if (!m.length) return ''
  return m.length === 1 ? monthText(m[0]) : `${monthText(m[m.length - 1])} – ${monthText(m[0])}`
})

function monthText(key) {
  const [y, mo] = String(key).split('-')
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1]} ${y}`
}

// Default the month selector to the newest month, and keep it valid.
watch(
  months,
  (list) => {
    if (!list.length) focusMonth.value = ''
    else if (!list.includes(focusMonth.value)) focusMonth.value = list[0]
  },
  { immediate: true },
)

// ---- data-quality actions --------------------------------------------------
/**
 * Where each issue can actually be fixed. The Transactions page reads these
 * filters from the URL, so the link lands on exactly the flagged rows and its
 * bulk-edit can correct them in one pass.
 */
const FIX_ACTIONS = computed(() => {
  // Carry the dashboard's range across, so the count on the button matches the
  // count on the page you land on.
  const from = rangeStart.value ? new Date(rangeStart.value).toISOString().slice(0, 10) : undefined
  const link = (issue) => ({ path: '/transactions', query: from ? { issue, from } : { issue } })
  return {
    uncategorized: { label: 'Categorise these', to: link('uncategorized') },
    'blank-type': { label: 'Review these', to: link('blank-type') },
    duplicates: { label: 'Review these', to: link('duplicates') },
  }
})

const categoryLink = (name) => {
  const from = rangeStart.value ? new Date(rangeStart.value).toISOString().slice(0, 10) : undefined
  return { path: '/transactions', query: from ? { category: name, from } : { category: name } }
}

/** Issues with nothing to fix - said plainly rather than offering a dead button. */
const NO_FIX = {
  reversals: 'handled automatically',
  'category-case': 'pick a spelling below',
}

// ---- transaction table -----------------------------------------------------
// prepare() returns oldest-first; the history reads newest-first.
const recentFirst = computed(() => rows.value.slice().reverse())

// ---- fetching --------------------------------------------------------------
function getTransactions() {
  loading.value = true
  // One month of slack so trimming to a month boundary never starves the range.
  const request = monthsAgo.value >= ALL_MONTHS ? monthsAgo.value : monthsAgo.value + 1
  return api.getTransactionsSinceMonthsAgo(request).then(
    (transactions) => {
      rawTransactions.value = transactions ?? []
      loading.value = false
      loaded.value = true
    },
    (failure) => {
      loading.value = false
      loaded.value = true
      show?.({
        props: {
          title: 'Failed to get transactions',
          body: failure.message,
          variant: 'danger',
          pos: 'bottom-right',
        },
      })
    },
  )
}

function changeTimeRange(newMonthsAgo) {
  if (monthsAgo.value === newMonthsAgo) return
  monthsAgo.value = newMonthsAgo
  getTransactions()
}

getTransactions()
</script>

<template>
  <main class="dashboard">
    <!-- One filter row, scoping everything below it. -->
    <div class="filter-row">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <span class="filter-label">Range</span>
        <BButtonGroup size="sm">
          <BButton
            v-for="r in RANGES"
            :key="r.months"
            :variant="monthsAgo === r.months ? 'primary' : 'outline-secondary'"
            @click="changeTimeRange(r.months)"
          >
            {{ r.label }}
          </BButton>
        </BButtonGroup>
      </div>

      <div class="d-flex align-items-center gap-2 flex-wrap">
        <span class="filter-label">Group by</span>
        <BButtonGroup size="sm">
          <BButton
            v-for="i in INTERVALS"
            :key="i.value"
            :variant="interval === i.value ? 'primary' : 'outline-secondary'"
            @click="interval = i.value"
          >
            {{ i.label }}
          </BButton>
        </BButtonGroup>
      </div>

      <div v-if="accounts.length > 1" class="d-flex align-items-center gap-2">
        <span class="filter-label">Account</span>
        <BFormSelect v-model="accountFilter" size="sm" style="width: auto">
          <option value="all">All accounts</option>
          <option v-for="a in accounts" :key="a" :value="a">{{ a }}</option>
        </BFormSelect>
      </div>

      <div class="ms-auto filter-meta">
        <span v-if="rangeLabel">{{ rangeLabel }} · </span>
        {{ stats.transactionCount.toLocaleString() }} transactions
      </div>
    </div>

    <div v-if="rows.length" class="dashboard-body" :class="{ 'is-loading': loading }">
      <!-- KPI row: headline numbers are tiles, not one-bar charts. -->
      <BRow class="g-3 mb-4">
        <BCol cols="12" sm="6" lg="3">
          <StatTile
            label="Money out"
            :value="money(stats.spend)"
            :hint="`Everything spent across ${stats.months} ${stats.months === 1 ? 'month' : 'months'}`"
            :trend="monthlySpendTrend"
          />
        </BCol>
        <BCol cols="12" sm="6" lg="3">
          <StatTile
            label="Money in"
            :value="money(stats.income)"
            :hint="`Everything received across ${stats.months} ${stats.months === 1 ? 'month' : 'months'}`"
            :trend="monthlyIncomeTrend"
          />
        </BCol>
        <BCol cols="12" sm="6" lg="3">
          <StatTile
            label="Net"
            :value="money(stats.net)"
            :delta="stats.savingsRate == null ? '' : `${percent(stats.savingsRate)} of income`"
            :delta-tone="stats.net >= 0 ? 'good' : 'bad'"
            delta-direction="none"
            :hint="`Excludes ${money(stats.transfers)} in transfers`"
          />
        </BCol>
        <BCol cols="12" sm="6" lg="3">
          <StatTile
            label="Recurring charges"
            :value="`${money(activeRecurringMonthly)}/mo`"
            :hint="`${money(activeRecurringMonthly * 12)} per year`"
          />
        </BCol>
      </BRow>

      <BRow class="g-3 mb-4">
        <BCol cols="12" sm="6" lg="4">
          <StatTile
            label="A typical single month"
            :value="money(stats.medianMonthlySpend)"
            unit="out"
            second-label="In"
            :second-value="money(stats.medianMonthlyIncome)"
            :hint="`Middle month of the ${stats.months} in range — not the total above`"
          />
        </BCol>
        <BCol cols="12" sm="6" lg="4">
          <StatTile
            v-if="stats.topFamily"
            label="Biggest category"
            :value="stats.topFamily.family"
            :delta="`${money(stats.topFamily.total)} · ${percent(stats.topFamily.share)}`"
            delta-tone="neutral"
            hint="Share of spending in range"
          />
        </BCol>
        <BCol cols="12" sm="6" lg="4">
          <StatTile
            v-if="stats.biggestExpense"
            label="Largest single purchase"
            :value="money(stats.biggestExpense.spend)"
            :hint="`${stats.biggestExpense.vendor} · ${dateLabel(stats.biggestExpense.date)}`"
          />
        </BCol>
      </BRow>

      <!-- Time series: all respect the Group by interval. -->
      <CashflowChart :rows="rows" :interval="interval" />
      <CategoryStackChart :rows="rows" :interval="interval" />
      <SavingsRateChart :rows="rows" :interval="interval" />
      <CategoryHeatmap :rows="rows" :interval="interval" @select-month="focusMonth = $event" />

      <!-- A single month in isolation. -->
      <MonthDetail :rows="rows" :month="focusMonth" @update:month="focusMonth = $event" />

      <CategoryShareChart :rows="rows" />
      <TopVendorsChart :rows="rows" />

      <BRow class="g-0">
        <BCol cols="12" xl="6" class="pe-xl-2">
          <WeekdayProfileChart :rows="rows" />
        </BCol>
        <BCol cols="12" xl="6" class="ps-xl-2">
          <TicketSizeChart :rows="rows" />
        </BCol>
      </BRow>

      <BalanceChart :rows="rows" :interval="interval" />
      <RecurringTable :rows="rows" />

      <!-- The two action panels sit together: what to change, then what to tidy. -->
      <SavingsIdeas :rows="rows" />

      <!-- Data-quality panel: the numbers above are only as good as the input. -->
      <BCard v-if="quality.length" class="panel mb-4" body-class="p-3 p-md-4">
        <h3 class="panel-title mb-1">Worth cleaning up</h3>
        <p class="panel-subtitle mb-3">
          Each of these links through to the rows it found, pre-filtered, so you can fix them there.
        </p>
        <BAlert
          v-for="issue in quality"
          :key="issue.label"
          :model-value="true"
          :variant="issue.severity === 'warning' ? 'warning' : 'secondary'"
          class="text-start py-2 mb-2"
        >
          <div class="issue-row">
            <div class="issue-body">
              <strong>{{ issue.label }}</strong>
              <span v-if="issue.value"> — {{ money(issue.value) }}</span>
              <div class="small">{{ issue.detail }}</div>

              <!-- Case-variant spellings get one link each: filter to that exact
                   name, then bulk-rename it to the one you keep. -->
              <div v-if="issue.id === 'category-case'" class="variant-links">
                <template v-for="(group, gi) in issue.variants ?? []" :key="gi">
                  <RouterLink
                    v-for="name in group"
                    :key="name"
                    class="variant-chip"
                    :to="categoryLink(name)"
                  >
                    {{ name }}
                  </RouterLink>
                </template>
              </div>
            </div>

            <RouterLink
              v-if="FIX_ACTIONS[issue.id]"
              class="btn btn-sm btn-outline-light flex-shrink-0"
              :to="FIX_ACTIONS[issue.id].to"
            >
              {{ FIX_ACTIONS[issue.id].label }}
            </RouterLink>
            <span v-else class="issue-note flex-shrink-0">{{ NO_FIX[issue.id] }}</span>
          </div>
        </BAlert>
      </BCard>

      <!-- Transaction history. -->
      <BCard class="panel mb-4" body-class="p-3 p-md-4">
        <h3 class="panel-title mb-3">Transaction history</h3>
        <TransactionTable :rows="recentFirst" :per-page="25" />
      </BCard>
    </div>

    <!-- Empty states -->
    <div v-else-if="loading && !loaded" class="empty-state">
      <BSpinner small /> Loading transactions…
    </div>

    <BCard v-else class="panel">
      <BAlert :model-value="true" variant="info" class="text-start">
        <h4>First time here?</h4>
        <p class="mb-0">Start with the <strong>Import</strong> tab. All data stays in your browser.</p>
      </BAlert>
      <BAlert :model-value="true" variant="warning" class="text-start mb-0">
        <h4>Returning?</h4>
        <p class="mb-0">Nothing in the last {{ monthsAgo }} months — try a longer range above.</p>
      </BAlert>
    </BCard>
  </main>
</template>

<style scoped>
.dashboard {
  padding: 0 0.5rem 3rem;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  margin-bottom: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
  position: sticky;
  top: var(--app-header-h);
  z-index: 10;
  backdrop-filter: blur(8px);
}

.filter-label {
  font-size: 0.8125rem;
  color: #898781;
}

.filter-meta {
  font-size: 0.8125rem;
  color: #898781;
  font-variant-numeric: tabular-nums;
}

/* Refetch holds the previous render instead of flashing a skeleton. */
.dashboard-body {
  transition: opacity 0.2s;
}

.dashboard-body.is-loading {
  opacity: 0.55;
}

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

.num-table :deep(td),
.num-table :deep(th) {
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
}

.issue-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.issue-body {
  min-width: 0;
}

.issue-note {
  font-size: 0.75rem;
  opacity: 0.7;
  white-space: nowrap;
  padding-top: 0.2rem;
}

.variant-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.4rem;
}

.variant-chip {
  font-size: 0.75rem;
  padding: 0.05rem 0.4rem;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  text-decoration: none;
}

.variant-chip:hover {
  background: rgba(255, 255, 255, 0.22);
  color: inherit;
}

.family-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.5rem;
  vertical-align: 1px;
}


.empty-state {
  padding: 4rem 0;
  text-align: center;
  color: #898781;
}
</style>
