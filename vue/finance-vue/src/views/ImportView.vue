<script setup>
/**
 * Import bank statements.
 *
 * The old page dropped you straight into a 30-row-per-page grid of every parsed
 * transaction with a free-text category box on each one, and left the risky
 * parts to a paragraph of instructions: "DO NOT select the current month, as the
 * application does not filter out duplicate transactions."
 *
 * This version does the checking instead of warning about it:
 *  - rows already in the database are detected and skipped by default;
 *  - categories are filled in per *vendor*, not per row - a 140-row month is
 *    usually 15 distinct vendors, most already covered by a rule;
 *  - unparseable lines are listed with a reason rather than silently dropped;
 *  - it says up front that the server discards credit-card payment rows, so the
 *    "imported" count matching the row count is not a surprise;
 *  - new vendor rules are created once per vendor, and only for vendors that do
 *    not already have one.
 */
import { computed, ref } from 'vue'
import { useToast } from 'bootstrap-vue-next'
import api from '@/utils/apiProvider.js'
import {
  ACCOUNTS,
  duplicateKey,
  isCreditCardPayment,
  parseStatement,
} from '@/utils/statementParser.js'
import { compileRules, findMatchingRule, vendorKeyOf } from '@/utils/vendorRules.js'
import { categories as canonicalCategories, getCategoryColor } from '@/utils/categoryColors.js'
import { money } from '@/utils/format.js'

const { show } = useToast()

const files = ref([])
const rules = ref([])
const existingKeys = ref(new Set())
const contextLoaded = ref(false)
const importing = ref(false)
const lastResult = ref(null)

const skipKnown = ref(true)
const skipRepeats = ref(false)
const createRules = ref(true)
const showAllRows = ref(false)
const rowFilter = ref('all')

const compiledRules = computed(() => compileRules(rules.value))
const knownCategories = computed(() =>
  [...new Set([...rules.value.map((r) => r.categoryName), ...canonicalCategories])]
    .filter(Boolean)
    .sort(),
)

// ---- context: rules + what is already stored -------------------------------
function loadContext() {
  return Promise.all([
    api.getVendorOverrides(),
    // All six keys required, null = no filter (the server's OptionalTransaction
    // has no defaults, so a partial object is a 400).
    api.getTransactions({
      vendor: null,
      amount: null,
      account: null,
      category: null,
      type: null,
      location: null,
    }),
  ]).then(
    ([vendorRules, transactions]) => {
      rules.value = vendorRules ?? []
      existingKeys.value = new Set(
        (transactions ?? []).map((t) =>
          duplicateKey({
            date: t.date,
            vendor: t.vendor,
            amount: t.amount,
            account: t.account,
          }),
        ),
      )
      contextLoaded.value = true
    },
    (failure) => {
      contextLoaded.value = true
      toast('Could not load existing data', failure?.message ?? '', 'danger')
    },
  )
}

loadContext()

function toast(title, body, variant = 'success') {
  show?.({ props: { title, body, variant, pos: 'bottom-right' } })
}

// ---- file handling ---------------------------------------------------------
const dragging = ref(false)

function onDrop(event) {
  dragging.value = false
  addFiles([...(event.dataTransfer?.files ?? [])])
}

function onPick(event) {
  addFiles([...(event.target.files ?? [])])
  event.target.value = '' // let the same file be re-picked after removal
}

function addFiles(list) {
  const csvs = list.filter((f) => /\.csv$/i.test(f.name))
  if (!csvs.length) {
    toast('No CSV files', 'Statements need to be exported as CSV.', 'warning')
    return
  }
  for (const file of csvs) {
    if (files.value.some((f) => f.name === file.name && f.size === file.size)) {
      toast('Already added', `${file.name} is already in the list.`, 'warning')
      continue
    }
    readFile(file)
  }
}

function readFile(file) {
  const reader = new FileReader()
  reader.onload = (event) => {
    // Parsing is pure and returns the account it detected, so several files can
    // be read at once without fighting over one shared `account` value.
    const parsed = parseStatement(event.target.result)
    files.value.push({
      name: file.name,
      size: file.size,
      account: parsed.account,
      text: event.target.result,
      rows: parsed.rows.map(applyRules),
      skipped: parsed.skipped,
    })
  }
  reader.onerror = () => toast('Could not read file', file.name, 'danger')
  reader.readAsText(file, 'UTF-8')
}

function removeFile(name) {
  files.value = files.value.filter((f) => f.name !== name)
}

/** Re-parse one file as the other account type. */
function switchAccount(file, account) {
  const parsed = parseStatement(file.text, { account })
  file.account = parsed.account
  file.rows = parsed.rows.map(applyRules)
  file.skipped = parsed.skipped
}

/**
 * Apply the vendor rules exactly as the importer always has: a match sets the
 * category AND relabels the vendor, with a type-based fallback.
 */
function applyRules(row) {
  const match = findMatchingRule(compiledRules.value, row.vendor)
  if (match) {
    return {
      ...row,
      vendor: match.vendor,
      category: String(match.categoryName ?? '').trim(),
      matchedRule: match,
    }
  }
  const type = String(row.type ?? '')
  let category = row.category ?? ''
  if (!category && type.includes('Bill Payment')) category = 'Bills'
  if (!category && type.includes('Payroll Deposit')) category = 'Job'
  return { ...row, category, matchedRule: null }
}

// ---- derived rows ----------------------------------------------------------
const allRows = computed(() => {
  const seen = new Map()
  const out = []
  for (const file of files.value) {
    for (const row of file.rows) {
      const key = duplicateKey(row)
      const repeat = seen.has(key)
      seen.set(key, true)
      out.push({
        ...row,
        file: file.name,
        key,
        known: existingKeys.value.has(key),
        repeat,
        ccPayment: isCreditCardPayment(row),
      })
    }
  }
  return out
})

const excluded = (row) =>
  (skipKnown.value && row.known) || (skipRepeats.value && row.repeat)

const rowsToImport = computed(() => allRows.value.filter((r) => !excluded(r)))
const uncategorized = computed(() => rowsToImport.value.filter((r) => !r.category))

const stats = computed(() => {
  const rows = rowsToImport.value
  const inbound = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0)
  const outbound = rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0)
  const dates = rows.map((r) => r.date.slice(0, 10)).sort()
  return {
    parsed: allRows.value.length,
    toImport: rows.length,
    known: allRows.value.filter((r) => r.known).length,
    repeats: allRows.value.filter((r) => r.repeat).length,
    ccPayments: rows.filter((r) => r.ccPayment).length,
    skippedLines: files.value.reduce((a, f) => a + f.skipped.length, 0),
    inbound,
    outbound,
    from: dates[0],
    to: dates[dates.length - 1],
    willStore: rows.length - rows.filter((r) => r.ccPayment).length,
  }
})

/** Distinct vendors needing a category - the actual unit of work. */
const vendorsNeedingCategory = computed(() => {
  const groups = new Map()
  for (const row of uncategorized.value) {
    const key = vendorKeyOf(row.vendor)
    const entry = groups.get(key) ?? { key, vendor: row.vendor, rows: [], total: 0 }
    entry.rows.push(row)
    entry.total += row.amount
    groups.set(key, entry)
  }
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length)
})

/** Vendors in this batch with no rule yet - candidates for being remembered. */
const newVendorCandidates = computed(() => {
  const existing = new Set(compiledRules.value.map((r) => r.key))
  const groups = new Map()
  for (const row of rowsToImport.value) {
    const key = vendorKeyOf(row.vendor)
    if (existing.has(key) || groups.has(key)) continue
    groups.set(key, { vendor: row.vendor, category: row.category })
  }
  return [...groups.values()]
})

/** Only those that have a category are worth saving as a rule. */
const newVendors = computed(() => newVendorCandidates.value.filter((v) => v.category))

/** Set a category on every row for one vendor, across all loaded files. */
function setVendorCategory(vendorKey, category) {
  const value = String(category ?? '').trim()
  for (const file of files.value) {
    for (const row of file.rows) {
      if (vendorKeyOf(row.vendor) === vendorKey) row.category = value
    }
  }
}

function setRowCategory(row, category) {
  const value = String(category ?? '').trim()
  for (const file of files.value) {
    for (const candidate of file.rows) {
      if (candidate === row.source) candidate.category = value
    }
  }
}

const visibleRows = computed(() => {
  if (rowFilter.value === 'needs') return allRows.value.filter((r) => !r.category && !excluded(r))
  if (rowFilter.value === 'known') return allRows.value.filter((r) => r.known)
  if (rowFilter.value === 'matched') return allRows.value.filter((r) => r.matchedRule)
  return allRows.value
})

const rowFields = [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'vendor', label: 'Vendor', sortable: true },
  { key: 'category', label: 'Category' },
  { key: 'type', label: 'Type', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'state', label: '' },
]

const tableItems = computed(() =>
  visibleRows.value.map((r) => ({
    date: r.date.slice(0, 10),
    vendor: r.vendor,
    category: r.category,
    type: r.type || '—',
    amount: r.amount,
    known: r.known,
    repeat: r.repeat,
    ccPayment: r.ccPayment,
    matchedRule: r.matchedRule,
    excluded: excluded(r),
    source: findSource(r),
  })),
)

/** The mutable row inside `files` that a derived row came from. */
function findSource(row) {
  const file = files.value.find((f) => f.name === row.file)
  return file?.rows.find(
    (r) => r.date === row.date && r.amount === row.amount && r.vendor === row.vendor,
  )
}

// ---- import ----------------------------------------------------------------
const canImport = computed(
  () => contextLoaded.value && !importing.value && rowsToImport.value.length > 0,
)

async function runImport() {
  const rows = rowsToImport.value
  if (!rows.length) return
  importing.value = true
  lastResult.value = null

  const payload = {
    transactions: rows.map((r) => ({
      date: r.date,
      amount: Number(r.amount),
      type: r.type ?? '',
      vendor: r.vendor,
      location: r.location ?? 'Unknown',
      category: r.category || 'Unknown',
      account: r.account,
    })),
  }

  try {
    const response = await api.importTransactions(payload)
    const stored = response?.data?.insertedIds?.length ?? null

    let rulesCreated = 0
    if (createRules.value && newVendors.value.length) {
      // One rule per new vendor - not one per transaction.
      for (const vendor of newVendors.value) {
        try {
          await api.addVendor({ vendor: vendor.vendor, category: vendor.category, regexMaybe: null })
          rulesCreated++
        } catch {
          /* a failed rule should not fail the import */
        }
      }
    }

    lastResult.value = { sent: payload.transactions.length, stored, rulesCreated }
    files.value = []
    await loadContext()
    toast('Import complete', `${stored ?? payload.transactions.length} transactions stored.`)
  } catch (failure) {
    toast('Import failed', failure?.message ?? 'Unknown error', 'danger')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <main class="import-page">
    <BCard class="panel mb-3" body-class="p-3 p-md-4">
      <h2 class="page-title mb-1">Import statements</h2>
      <p class="page-subtitle mb-0">
        Export a month as CSV from Scotiabank and drop it below. Rows already in your database are
        detected, so re-importing a month is safe.
      </p>
      <BButton v-b-toggle.import-help size="sm" variant="outline-secondary" class="mt-2">
        How to export from your bank
      </BButton>
      <BCollapse id="import-help">
        <ol class="help-list mt-3 mb-0">
          <li>Log in to Scotiabank and open an account.</li>
          <li>Filter to a single month — not “Current statement period”.</li>
          <li>Download as CSV, then drop the file here.</li>
        </ol>
        <p class="help-note mb-0">
          Chequing and credit exports have different columns; the account is detected from the
          file's header and can be overridden per file.
        </p>
      </BCollapse>
    </BCard>

    <!-- ---------- drop zone ---------- -->
    <div
      class="dropzone"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <p class="drop-title mb-1">Drop CSV statements here</p>
      <p class="drop-sub mb-2">or</p>
      <label class="btn btn-primary btn-sm mb-0">
        Choose files
        <input type="file" accept=".csv,text/csv" multiple hidden @change="onPick" />
      </label>
      <p v-if="!contextLoaded" class="drop-sub mt-2 mb-0">
        <BSpinner small /> Loading your rules and existing transactions…
      </p>
    </div>

    <!-- ---------- per-file results ---------- -->
    <div v-if="files.length" class="file-list">
      <div v-for="file in files" :key="file.name" class="file-card">
        <div class="file-head">
          <div>
            <span class="file-name">{{ file.name }}</span>
            <span class="file-meta">
              {{ file.rows.length }} rows
              <template v-if="file.skipped.length">
                · <span class="warn">{{ file.skipped.length }} unreadable</span>
              </template>
            </span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <BFormSelect
              :model-value="file.account"
              size="sm"
              style="width: auto"
              @update:model-value="switchAccount(file, $event)"
            >
              <option v-for="a in ACCOUNTS" :key="a" :value="a">{{ a }}</option>
            </BFormSelect>
            <BButton size="sm" variant="outline-danger" @click="removeFile(file.name)">Remove</BButton>
          </div>
        </div>
        <details v-if="file.skipped.length" class="skipped">
          <summary>{{ file.skipped.length }} lines could not be read</summary>
          <ul>
            <li v-for="s in file.skipped" :key="s.line">
              <strong>Line {{ s.line }}:</strong> {{ s.reason }}
              <code>{{ s.text }}</code>
            </li>
          </ul>
        </details>
      </div>
    </div>

    <!-- ---------- review ---------- -->
    <template v-if="allRows.length">
      <BCard class="panel my-3" body-class="p-3 p-md-4">
        <h3 class="section-title mb-3">Ready to import</h3>
        <div class="stat-row">
          <div class="stat">
            <span class="stat-value">{{ stats.toImport }}</span>
            <span class="stat-label">will be imported</span>
          </div>
          <div class="stat" :class="{ warn: stats.known > 0 }">
            <span class="stat-value">{{ stats.known }}</span>
            <span class="stat-label">already in database</span>
          </div>
          <div class="stat" :class="{ warn: uncategorized.length > 0 }">
            <span class="stat-value">{{ uncategorized.length }}</span>
            <span class="stat-label">need a category</span>
          </div>
          <div class="stat">
            <span class="stat-value out">{{ money(stats.outbound) }}</span>
            <span class="stat-label">out</span>
          </div>
          <div class="stat">
            <span class="stat-value in">{{ money(stats.inbound) }}</span>
            <span class="stat-label">in</span>
          </div>
        </div>
        <p class="range-line mb-0" v-if="stats.from">{{ stats.from }} → {{ stats.to }}</p>

        <div class="toggles">
          <BFormCheckbox v-model="skipKnown" switch>
            Skip the {{ stats.known }} rows already in my database
          </BFormCheckbox>
          <BFormCheckbox v-if="stats.repeats" v-model="skipRepeats" switch>
            Skip {{ stats.repeats }} repeats within these files
          </BFormCheckbox>
          <BFormCheckbox v-if="newVendorCandidates.length" v-model="createRules" switch>
            Remember new vendors as rules
            <span class="toggle-hint">
              {{ newVendors.length }} of {{ newVendorCandidates.length }}
              {{ newVendorCandidates.length === 1 ? 'new vendor has' : 'new vendors have' }} a
              category and will be saved
            </span>
          </BFormCheckbox>
        </div>

        <BAlert v-if="stats.ccPayments" :model-value="true" variant="info" class="mt-3 mb-0 py-2 text-start">
          {{ stats.ccPayments }} credit-card payment
          {{ stats.ccPayments === 1 ? 'row' : 'rows' }} will not be stored — the server matches each
          one against the chequing transfer that paid it, so the purchases are not double-counted.
          Expect <strong>{{ stats.willStore }}</strong> transactions to land.
        </BAlert>
      </BCard>

      <!-- ---------- categorise by vendor ---------- -->
      <BCard v-if="vendorsNeedingCategory.length" class="panel mb-3" body-class="p-3 p-md-4">
        <h3 class="section-title mb-1">
          {{ vendorsNeedingCategory.length }}
          {{ vendorsNeedingCategory.length === 1 ? 'vendor needs' : 'vendors need' }} a category
        </h3>
        <p class="section-subtitle mb-3">
          Setting one here applies to every row for that vendor. The rest were categorised
          automatically by your existing rules.
        </p>
        <ul class="vendor-list">
          <li v-for="v in vendorsNeedingCategory" :key="v.key">
            <span class="v-name">{{ v.vendor }}</span>
            <span class="v-meta">
              {{ v.rows.length }} {{ v.rows.length === 1 ? 'row' : 'rows' }} ·
              {{ money(Math.abs(v.total)) }}
            </span>
            <BFormInput
              list="import-category-list"
              size="sm"
              class="v-input"
              placeholder="Category"
              @change="setVendorCategory(v.key, $event)"
            />
          </li>
        </ul>
      </BCard>

      <!-- ---------- all rows ---------- -->
      <BCard class="panel mb-3" body-class="p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
          <h3 class="section-title mb-0">Transactions</h3>
          <div class="d-flex align-items-center gap-2">
            <BButtonGroup size="sm">
              <BButton
                v-for="f in [
                  { id: 'all', label: `All (${allRows.length})` },
                  { id: 'needs', label: `Needs category (${uncategorized.length})` },
                  { id: 'matched', label: 'Auto-categorised' },
                  { id: 'known', label: `Already imported (${stats.known})` },
                ]"
                :key="f.id"
                :variant="rowFilter === f.id ? 'secondary' : 'outline-secondary'"
                @click="rowFilter = f.id"
              >
                {{ f.label }}
              </BButton>
            </BButtonGroup>
            <BButton size="sm" variant="outline-secondary" @click="showAllRows = !showAllRows">
              {{ showAllRows ? 'Hide' : 'Show' }} table
            </BButton>
          </div>
        </div>

        <BTable
          v-if="showAllRows"
          :items="tableItems"
          :fields="rowFields"
          :sort-by="[{ key: 'date', order: 'desc' }]"
          small
          striped
          responsive
          show-empty
          empty-text="Nothing matches this filter."
          class="mb-0 import-table"
        >
          <template #cell(category)="row">
            <div class="cat-cell">
              <span class="swatch" :style="{ background: getCategoryColor(row.item.category) }" />
              <BFormInput
                :model-value="row.item.category"
                list="import-category-list"
                size="sm"
                placeholder="Uncategorized"
                :state="row.item.category ? null : false"
                @change="setRowCategory(row.item, $event)"
              />
            </div>
          </template>
          <template #cell(amount)="row">
            <span class="amount" :class="row.item.amount > 0 ? 'in' : 'out'">
              {{ row.item.amount > 0 ? '↑' : '↓' }} {{ money(Math.abs(row.item.amount)) }}
            </span>
          </template>
          <template #cell(state)="row">
            <span v-if="row.item.known" class="tag known" title="Already in your database">
              already imported
            </span>
            <span v-else-if="row.item.repeat" class="tag" title="Appears more than once in these files">
              repeat
            </span>
            <span
              v-else-if="row.item.ccPayment"
              class="tag"
              title="The server reconciles this against your chequing transfer instead of storing it"
            >
              not stored
            </span>
            <span
              v-else-if="row.item.matchedRule"
              class="tag matched"
              :title="`Matched rule: ${row.item.matchedRule.vendor}${
                row.item.matchedRule.pattern ? ` (${row.item.matchedRule.pattern})` : ''
              }`"
            >
              auto
            </span>
          </template>
        </BTable>
        <p v-else class="section-subtitle mb-0">
          {{ allRows.length }} rows parsed. Open the table to check or change individual rows.
        </p>
      </BCard>

      <!-- ---------- action ---------- -->
      <BCard class="panel" body-class="p-3 p-md-4">
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <BButton variant="success" size="lg" :disabled="!canImport" @click="runImport">
            <BSpinner v-if="importing" small />
            Import {{ stats.toImport }} {{ stats.toImport === 1 ? 'transaction' : 'transactions' }}
          </BButton>
          <span v-if="uncategorized.length" class="hint">
            {{ uncategorized.length }} rows will be stored as <strong>Unknown</strong> — you can fix
            them later from the Transactions page.
          </span>
        </div>
      </BCard>
    </template>

    <BCard v-else-if="lastResult" class="panel mt-3" body-class="p-3 p-md-4">
      <h3 class="section-title mb-2">Import complete</h3>
      <ul class="result-list mb-0">
        <li>{{ lastResult.sent }} rows sent</li>
        <li v-if="lastResult.stored !== null">
          <strong>{{ lastResult.stored }}</strong> transactions stored
          <span v-if="lastResult.stored !== lastResult.sent" class="hint">
            (the difference is credit-card payments, reconciled against your chequing transfers)
          </span>
        </li>
        <li v-if="lastResult.rulesCreated">{{ lastResult.rulesCreated }} new vendor rules created</li>
      </ul>
    </BCard>

    <datalist id="import-category-list">
      <option v-for="c in knownCategories" :key="c" :value="c" />
    </datalist>
  </main>
</template>

<style scoped>
.import-page {
  padding: 0 0.5rem 3rem;
}

.panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.page-title {
  font-size: 1.35rem;
  font-weight: 600;
  color: #ffffff;
}

.page-subtitle,
.section-subtitle {
  font-size: 0.875rem;
  color: #c3c2b7;
  max-width: 80ch;
}

.section-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #ffffff;
  text-align: left;
}

.help-list {
  font-size: 0.875rem;
  color: #c3c2b7;
  padding-left: 1.25rem;
}

.help-note {
  font-size: 0.8125rem;
  color: #898781;
  margin-top: 0.5rem;
}

.dropzone {
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 0.5rem;
  padding: 1.75rem 1rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.02);
  transition: border-color 0.15s, background 0.15s;
}

.dropzone.dragging {
  border-color: #3987e5;
  background: rgba(57, 135, 229, 0.08);
}

.drop-title {
  font-size: 1rem;
  color: #ffffff;
}

.drop-sub {
  font-size: 0.8125rem;
  color: #898781;
}

.file-list {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.file-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  padding: 0.625rem 0.875rem;
  background: rgba(255, 255, 255, 0.02);
}

.file-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.file-name {
  font-size: 0.9375rem;
  color: #ffffff;
  margin-right: 0.5rem;
}

.file-meta {
  font-size: 0.8125rem;
  color: #898781;
}

.warn {
  color: #fab219;
}

.skipped {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: #c3c2b7;
}

.skipped summary {
  cursor: pointer;
  color: #fab219;
}

.skipped ul {
  margin: 0.4rem 0 0;
  padding-left: 1.1rem;
}

.skipped code {
  display: block;
  color: #898781;
  font-size: 0.75rem;
  margin-top: 0.1rem;
}

.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.stat {
  flex: 1 1 130px;
  padding: 0.5rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.02);
  text-align: left;
}

.stat.warn {
  border-color: rgba(250, 178, 25, 0.4);
}

.stat-value {
  display: block;
  font-size: 1.25rem;
  font-weight: 600;
  color: #ffffff;
}

.stat-label {
  font-size: 0.75rem;
  color: #898781;
}

.range-line {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: #898781;
  font-variant-numeric: tabular-nums;
}

.toggle-hint {
  display: block;
  font-size: 0.75rem;
  color: #898781;
}

.toggles {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.875rem;
  font-size: 0.875rem;
}

.vendor-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.vendor-list li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.v-name {
  flex: 1 1 auto;
  font-size: 0.9375rem;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v-meta {
  font-size: 0.75rem;
  color: #898781;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.v-input {
  flex: 0 0 220px;
}

.import-table :deep(td),
.import-table :deep(th) {
  font-size: 0.875rem;
  vertical-align: middle;
}

.cat-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 200px;
}

.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}

.amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.in {
  color: #3987e5;
}

.out {
  color: #e66767;
}

.tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  color: #898781;
  cursor: help;
  white-space: nowrap;
}

.tag.known {
  background: rgba(250, 178, 25, 0.18);
  box-shadow: inset 0 0 0 1px rgba(250, 178, 25, 0.45);
  color: #ffffff;
}

.tag.matched {
  background: rgba(12, 163, 12, 0.16);
  box-shadow: inset 0 0 0 1px rgba(12, 163, 12, 0.4);
  color: #ffffff;
}

.hint {
  font-size: 0.8125rem;
  color: #898781;
}

.result-list {
  list-style: none;
  padding: 0;
  font-size: 0.9375rem;
  color: #c3c2b7;
}

.result-list li {
  padding: 0.15rem 0;
}
</style>
