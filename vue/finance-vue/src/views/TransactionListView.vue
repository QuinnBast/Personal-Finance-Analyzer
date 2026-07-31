<script setup>
/**
 * Transactions page: search and filter everything, then optionally bulk-edit
 * what is showing.
 *
 * Filtering used to happen server-side - every keystroke in a column header
 * fired a request, and each field was an exact-match test, so "amount" only
 * worked if you typed the cents correctly. Now the range is fetched once and
 * filtered in the browser: instant, case-insensitive, and it can express things
 * the old query could not (amount ranges, date ranges, kind, family).
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'bootstrap-vue-next'
import api from '@/utils/apiProvider.js'
import { FAMILIES, ISSUE_TESTS, OTHER_FAMILY, duplicateRows, prepare } from '@/utils/analytics.js'
import { categories } from '@/utils/categoryColors.js'
import { money } from '@/utils/format.js'
import TransactionTable from '@/components/TransactionTable.vue'

const { show } = useToast()
const route = useRoute()
const router = useRouter()

const rawTransactions = ref([])
const loading = ref(false)
const loaded = ref(false)

// ---- filters ---------------------------------------------------------------
const search = ref('')
const accountFilter = ref('all')
const familyFilter = ref('all')
const kindFilter = ref('all')
const minAmount = ref('')
const maxAmount = ref('')
const dateFrom = ref('')
const dateTo = ref('')
/** Exact raw category name, used when merging case-variant spellings. */
const categoryName = ref('')
/** A data-quality issue to isolate: uncategorized | duplicates | blank-type | reversals. */
const issue = ref('all')

const ISSUES = [
  { value: 'all', label: 'No issue filter' },
  { value: 'uncategorized', label: 'Uncategorized' },
  { value: 'duplicates', label: 'Possible duplicates' },
  { value: 'blank-type', label: 'No purchase type' },
  { value: 'reversals', label: 'Holds & refunds' },
]

const KINDS = [
  { value: 'all', label: 'All kinds' },
  { value: 'expense', label: 'Spent' },
  { value: 'income', label: 'Received' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'reversal', label: 'Reversed (holds & refunds)' },
]

const allRows = computed(() => prepare(rawTransactions.value))

/**
 * Filters live in the URL, so the dashboard's "fix these" buttons can deep-link
 * straight to the flagged rows and any view stays bookmarkable.
 */
const FILTER_REFS = {
  q: search,
  account: accountFilter,
  family: familyFilter,
  kind: kindFilter,
  min: minAmount,
  max: maxAmount,
  from: dateFrom,
  to: dateTo,
  category: categoryName,
  issue,
}
const DEFAULTS = { account: 'all', family: 'all', kind: 'all', issue: 'all' }

function readQuery() {
  for (const [key, target] of Object.entries(FILTER_REFS)) {
    const v = route.query[key]
    if (v != null) target.value = String(v)
  }
}
readQuery()
watch(() => route.query, readQuery)

let syncing = false
watch(
  Object.values(FILTER_REFS),
  () => {
    if (syncing) return
    syncing = true
    const query = {}
    for (const [key, target] of Object.entries(FILTER_REFS)) {
      const v = String(target.value ?? '')
      if (v && v !== (DEFAULTS[key] ?? '')) query[key] = v
    }
    router.replace({ query }).finally(() => {
      syncing = false
    })
  },
)

const duplicates = computed(() => duplicateRows(allRows.value))
const accounts = computed(() => [...new Set(allRows.value.map((r) => r.account))].sort())

const activeFilterCount = computed(
  () =>
    [
      search.value.trim(),
      accountFilter.value !== 'all',
      familyFilter.value !== 'all',
      kindFilter.value !== 'all',
      minAmount.value,
      maxAmount.value,
      dateFrom.value,
      dateTo.value,
      categoryName.value,
      issue.value !== 'all',
    ].filter(Boolean).length,
)

function clearFilters() {
  search.value = ''
  accountFilter.value = 'all'
  familyFilter.value = 'all'
  kindFilter.value = 'all'
  minAmount.value = ''
  maxAmount.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  categoryName.value = ''
  issue.value = 'all'
}

const filtered = computed(() => {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const min = minAmount.value === '' ? null : Math.abs(Number(minAmount.value))
  const max = maxAmount.value === '' ? null : Math.abs(Number(maxAmount.value))
  const from = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`).getTime() : null
  const to = dateTo.value ? new Date(`${dateTo.value}T23:59:59`).getTime() : null

  const wantCategory = categoryName.value.trim().toLowerCase()

  return allRows.value.filter((r) => {
    if (accountFilter.value !== 'all' && r.account !== accountFilter.value) return false
    if (wantCategory && String(r.category ?? '').trim().toLowerCase() !== wantCategory) return false
    if (issue.value !== 'all') {
      if (issue.value === 'duplicates') {
        if (!duplicates.value.has(r)) return false
      } else if (ISSUE_TESTS[issue.value] && !ISSUE_TESTS[issue.value](r)) {
        return false
      }
    }
    if (kindFilter.value !== 'all' && r.flow !== kindFilter.value) return false
    if (familyFilter.value !== 'all') {
      const family = FAMILIES.includes(r.family) ? r.family : OTHER_FAMILY
      if (family !== familyFilter.value) return false
    }
    const magnitude = Math.abs(r.amount)
    if (min != null && magnitude < min) return false
    if (max != null && magnitude > max) return false
    if (from != null && r.ts < from) return false
    if (to != null && r.ts > to) return false

    if (terms.length) {
      // Every word has to appear somewhere in the row, so "shell march" works.
      const haystack = `${r.vendor} ${r.category} ${r.account} ${r.location} ${r.type} ${r.family}`.toLowerCase()
      if (!terms.every((t) => haystack.includes(t))) return false
    }
    return true
  })
})

const recentFirst = computed(() => filtered.value.slice().reverse())

const totals = computed(() => {
  let out = 0
  let inc = 0
  for (const r of filtered.value) {
    out += r.spend
    inc += r.income
  }
  return { out, inc, net: inc - out }
})

// ---- fetching --------------------------------------------------------------
/**
 * The server deserialises this into a Kotlin `OptionalTransaction` whose six
 * fields have no defaults, so kotlinx.serialization rejects a partial object
 * with a 400 - every key has to be present even when null. Null means "do not
 * filter on this field", so an all-null query returns everything.
 */
const emptyQuery = () => ({
  vendor: null,
  amount: null,
  account: null,
  category: null,
  type: null,
  location: null,
})

function getTransactions() {
  loading.value = true
  return api.getTransactions(emptyQuery()).then(
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

getTransactions()

// ---- bulk edit -------------------------------------------------------------
const updateTransactionModal = ref(false)
const transactionUpdateOptions = ref(emptyQuery())

function openUpdateModal() {
  transactionUpdateOptions.value = emptyQuery()
  updateTransactionModal.value = true
}

/**
 * Same all-keys-required contract as the query. The server skips null and empty
 * fields, so a blank input means "leave it alone". `amount` has to arrive as a
 * JSON number, not the string the input gives us, or the Double decode 400s.
 */
function buildUpdate() {
  const form = transactionUpdateOptions.value
  const text = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())
  const amount = Number(form.amount)
  return {
    vendor: text(form.vendor),
    amount: form.amount == null || String(form.amount).trim() === '' || !Number.isFinite(amount) ? null : amount,
    account: text(form.account),
    category: text(form.category),
    type: text(form.type),
    location: text(form.location),
  }
}

function updateAllTransactions() {
  const update = buildUpdate()
  if (Object.values(update).every((v) => v === null)) {
    show?.({
      props: { title: 'Nothing to change', body: 'Fill in at least one field.', variant: 'warning', pos: 'bottom-right' },
    })
    return
  }

  const ids = filtered.value.map((r) => r.id).filter((id) => id !== undefined)
  show?.({
    props: {
      title: `Updating ${ids.length} transactions`,
      body: 'Please wait…',
      variant: 'info',
      pos: 'bottom-right',
    },
  })

  Promise.all(
    ids.map((id) =>
      api.updateTransaction(id, { ...update }).catch((failure) => {
        show?.({
          props: {
            title: `Failed to update transaction ${id}`,
            body: failure.message,
            variant: 'danger',
            pos: 'bottom-right',
          },
        })
      }),
    ),
  ).then(() => {
    show?.({
      props: { title: 'Done', body: `Updated ${ids.length} transactions.`, variant: 'success', pos: 'bottom-right' },
    })
    getTransactions()
  })
}
</script>

<template>
  <main class="txn-page">
    <datalist id="filter-category-list">
      <option v-for="category in categories" :key="category" :value="category" />
    </datalist>

    <!-- One filter row, scoping the table below it. -->
    <div class="filter-panel">
      <BFormInput
        v-model="search"
        type="search"
        placeholder="Search vendor, category, account, location…"
        class="search-input"
      />

      <div class="filter-grid">
        <label class="field">
          <span class="field-label">Kind</span>
          <BFormSelect v-model="kindFilter" size="sm">
            <option v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
          </BFormSelect>
        </label>

        <label class="field">
          <span class="field-label">Needs attention</span>
          <BFormSelect v-model="issue" size="sm">
            <option v-for="i in ISSUES" :key="i.value" :value="i.value">{{ i.label }}</option>
          </BFormSelect>
        </label>

        <label class="field">
          <span class="field-label">Category</span>
          <BFormSelect v-model="familyFilter" size="sm">
            <option value="all">All categories</option>
            <option v-for="f in FAMILIES" :key="f" :value="f">{{ f }}</option>
            <option :value="OTHER_FAMILY">{{ OTHER_FAMILY }}</option>
          </BFormSelect>
        </label>

        <label class="field">
          <span class="field-label">Account</span>
          <BFormSelect v-model="accountFilter" size="sm">
            <option value="all">All accounts</option>
            <option v-for="a in accounts" :key="a" :value="a">{{ a }}</option>
          </BFormSelect>
        </label>

        <label class="field">
          <span class="field-label">Amount between</span>
          <div class="pair">
            <BFormInput v-model="minAmount" type="number" size="sm" placeholder="min" min="0" />
            <BFormInput v-model="maxAmount" type="number" size="sm" placeholder="max" min="0" />
          </div>
        </label>

        <label class="field">
          <span class="field-label">Date from</span>
          <BFormInput v-model="dateFrom" type="date" size="sm" />
        </label>

        <label class="field">
          <span class="field-label">Date to</span>
          <BFormInput v-model="dateTo" type="date" size="sm" />
        </label>
      </div>

      <div v-if="categoryName" class="exact-category">
        Showing only the exact category
        <code>{{ categoryName }}</code>
        <BButton size="sm" variant="outline-secondary" @click="categoryName = ''">Clear</BButton>
        <span class="hint">
          Use <strong>Bulk-edit</strong> below to rename these to the spelling you want to keep.
        </span>
      </div>

      <div class="filter-footer">
        <span class="result-line">
          <strong>{{ filtered.length.toLocaleString() }}</strong>
          of {{ allRows.length.toLocaleString() }} transactions
          <span class="sep">·</span>
          <span class="out">{{ money(totals.out) }} out</span>
          <span class="sep">·</span>
          <span class="in">{{ money(totals.inc) }} in</span>
          <span class="sep">·</span>
          net {{ money(totals.net) }}
        </span>
        <BButton
          v-if="activeFilterCount"
          size="sm"
          variant="outline-secondary"
          @click="clearFilters"
        >
          Clear {{ activeFilterCount }} filter{{ activeFilterCount === 1 ? '' : 's' }}
        </BButton>
      </div>
    </div>

    <BCard class="panel mb-3" body-class="p-3 p-md-4">
      <div v-if="loading && !loaded" class="empty-state"><BSpinner small /> Loading transactions…</div>
      <TransactionTable
        v-else
        :rows="recentFirst"
        :per-page="50"
        show-location
        empty-text="No transactions match these filters."
      />
    </BCard>

    <BCard class="panel">
      <BButton variant="warning" :disabled="!filtered.length" @click="openUpdateModal">
        Bulk-edit the {{ filtered.length.toLocaleString() }} showing transactions
      </BButton>
      <p class="hint mb-0 mt-2">
        Applies only to rows matching the filters above. Leave a field blank to leave it unchanged.
      </p>
    </BCard>

    <BModal
      v-model="updateTransactionModal"
      centered
      title="Bulk update transactions"
      cancel-title="Cancel"
      cancel-variant="secondary"
      ok-title="Apply to all showing"
      ok-variant="warning"
      @ok="updateAllTransactions"
    >
      <BAlert :model-value="true" variant="warning" class="py-2">
        This will change <strong>{{ filtered.length.toLocaleString() }}</strong> transactions. There is
        no undo.
      </BAlert>

      <BForm>
        <BInputGroup prepend="Vendor" class="mb-2">
          <BFormInput v-model="transactionUpdateOptions.vendor" placeholder="leave blank to keep" />
        </BInputGroup>
        <BInputGroup prepend="Category" class="mb-2">
          <BFormInput
            v-model="transactionUpdateOptions.category"
            list="filter-category-list"
            placeholder="leave blank to keep"
          />
        </BInputGroup>
        <BInputGroup prepend="Account" class="mb-2">
          <BFormInput v-model="transactionUpdateOptions.account" placeholder="leave blank to keep" />
        </BInputGroup>
        <BInputGroup prepend="Type" class="mb-2">
          <BFormInput v-model="transactionUpdateOptions.type" placeholder="leave blank to keep" />
        </BInputGroup>
        <BInputGroup prepend="Location" class="mb-2">
          <BFormInput v-model="transactionUpdateOptions.location" placeholder="leave blank to keep" />
        </BInputGroup>
        <BInputGroup prepend="Amount" class="mb-0">
          <BFormInput
            v-model="transactionUpdateOptions.amount"
            type="number"
            placeholder="leave blank to keep"
          />
        </BInputGroup>
      </BForm>
    </BModal>
  </main>
</template>

<style scoped>
.txn-page {
  padding: 0 0.5rem 3rem;
}

.filter-panel {
  padding: 1rem;
  margin-bottom: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
}

.search-input {
  margin-bottom: 0.875rem;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
}

.field-label {
  font-size: 0.75rem;
  color: #898781;
}

.pair {
  display: flex;
  gap: 0.375rem;
}

.exact-category {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: #c3c2b7;
}

.exact-category code {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
}

.filter-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.875rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.result-line {
  font-size: 0.875rem;
  color: #c3c2b7;
  font-variant-numeric: tabular-nums;
}

.result-line strong {
  color: #ffffff;
}

.out {
  color: #e66767;
}

.in {
  color: #3987e5;
}

.sep {
  color: #4a5158;
  margin: 0 0.25rem;
}

.panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.hint {
  font-size: 0.8125rem;
  color: #898781;
}

.empty-state {
  padding: 3rem 0;
  text-align: center;
  color: #898781;
}
</style>
