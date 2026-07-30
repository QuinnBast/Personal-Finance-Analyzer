<script setup>
/**
 * Vendor rules: the vendor -> category mappings the importer applies.
 *
 * The old page rendered all 1,000 rules in one unsorted, unpaginated table with
 * a vendor-only filter, and its "add" form posted `categoryName` to an endpoint
 * that expects `category`, so creating a rule always failed. It also had no way
 * to see the thing that actually matters here: rules are matched first-wins, and
 * because the importer adds a rule for every vendor it encounters without
 * checking for an existing one, more than half of them can never fire.
 *
 * So this page leads with rule health, then gives three views: the rules
 * themselves, the categories they map to, and a cleanup queue for duplicates.
 */
import { computed, ref } from 'vue'
import { useToast } from 'bootstrap-vue-next'
import api from '@/utils/apiProvider.js'
import { analyseRules } from '@/utils/vendorRules.js'
import { categories as canonicalCategories, getCategoryColor } from '@/utils/categoryColors.js'
import { prepare } from '@/utils/analytics.js'
import CategoryRuleModal from '@/components/CategoryRuleModal.vue'

const { show } = useToast()

const rules = ref([])
const loading = ref(false)
const loaded = ref(false)
const busy = ref(false)

const view = ref('rules')
const search = ref('')
const categoryFilter = ref('all')
const onlyPatterns = ref(false)
const onlyUnused = ref(false)
const currentPage = ref(1)
const perPage = 50

const analysis = computed(() => analyseRules(rules.value))

const knownCategories = computed(() =>
  [...new Set([...analysis.value.categories.map((c) => c.name), ...canonicalCategories])]
    .filter((c) => c && c !== 'Uncategorized')
    .sort(),
)

const filteredRules = computed(() => {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return analysis.value.compiled.filter((r) => {
    if (onlyPatterns.value && !r.pattern) return false
    if (onlyUnused.value && !analysis.value.shadowedBy.has(r.id)) return false
    if (categoryFilter.value !== 'all') {
      const name = String(r.categoryName ?? '').trim() || 'Uncategorized'
      if (name !== categoryFilter.value) return false
    }
    if (terms.length) {
      const haystack = `${r.vendor} ${r.categoryName ?? ''} ${r.pattern}`.toLowerCase()
      if (!terms.every((t) => haystack.includes(t))) return false
    }
    return true
  })
})

const tableItems = computed(() =>
  filteredRules.value.map((r) => {
    const shadow = analysis.value.shadowedBy.get(r.id)
    return {
      id: r.id,
      vendor: r.vendor,
      category: String(r.categoryName ?? '').trim() || 'Uncategorized',
      pattern: r.pattern,
      invalid: !!r.regexError,
      shadowedBy: shadow ? shadow.vendor : null,
      raw: r,
    }
  }),
)

const fields = [
  { key: 'vendor', label: 'Vendor', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'pattern', label: 'Pattern', sortable: true },
  { key: 'status', label: 'Status', sortable: false },
  { key: 'actions', label: '', sortable: false },
]

const activeFilters = computed(
  () =>
    [search.value.trim(), categoryFilter.value !== 'all', onlyPatterns.value, onlyUnused.value].filter(
      Boolean,
    ).length,
)

function showCategoryRules(name) {
  categoryFilter.value = name
  currentPage.value = 1
  view.value = 'rules'
}

function clearFilters() {
  search.value = ''
  categoryFilter.value = 'all'
  onlyPatterns.value = false
  onlyUnused.value = false
}

// ---- loading ---------------------------------------------------------------
function loadRules() {
  loading.value = true
  return api.getVendorOverrides().then(
    (list) => {
      rules.value = list ?? []
      loading.value = false
      loaded.value = true
    },
    (failure) => {
      loading.value = false
      loaded.value = true
      toastError('Failed to load rules', failure)
    },
  )
}

loadRules()

function toastError(title, failure) {
  show?.({
    props: {
      title,
      body: failure?.response?.data?.message ?? failure?.message ?? 'Unknown error',
      variant: 'danger',
      pos: 'bottom-right',
    },
  })
}

function toastOk(title, body) {
  show?.({ props: { title, body, variant: 'success', pos: 'bottom-right' } })
}

// ---- pattern tester data (loaded on demand) --------------------------------
const testVendors = ref([])
const testVendorsLoaded = ref(false)
const testVendorsLoading = ref(false)

function loadTestVendors() {
  if (testVendorsLoaded.value || testVendorsLoading.value) return
  testVendorsLoading.value = true
  // The server's OptionalTransaction needs all six keys present; null = no filter.
  api
    .getTransactions({ vendor: null, amount: null, account: null, category: null, type: null, location: null })
    .then(
      (transactions) => {
        const names = new Set(prepare(transactions).map((r) => r.vendorRaw ?? r.vendor))
        for (const r of rules.value) names.add(r.vendor)
        testVendors.value = [...names].filter(Boolean).sort()
        testVendorsLoaded.value = true
        testVendorsLoading.value = false
      },
      (failure) => {
        testVendorsLoading.value = false
        toastError('Could not load transaction vendors', failure)
      },
    )
}

// ---- create / edit ---------------------------------------------------------
const editorOpen = ref(false)
const editing = ref(null)

function openCreate() {
  editing.value = null
  editorOpen.value = true
}

function openEdit(rule) {
  editing.value = rule
  editorOpen.value = true
}

async function saveRule(payload) {
  busy.value = true
  try {
    if (payload.id) {
      // /update-category wants `categoryName`.
      await api.updateCategory({
        id: payload.id,
        vendor: payload.vendor,
        categoryName: payload.categoryName,
        regexMaybe: payload.regexMaybe,
      })
      toastOk('Rule updated', `${payload.vendor} → ${payload.categoryName}`)
    } else {
      // /add-vendor wants `category`, not `categoryName` - the old page sent the
      // wrong key here, which is why creating a rule never worked.
      await api.insertCategory({
        vendor: payload.vendor,
        category: payload.categoryName,
        regexMaybe: payload.regexMaybe,
      })
      toastOk('Rule created', `${payload.vendor} → ${payload.categoryName}`)
    }
    await loadRules()
  } catch (failure) {
    toastError(payload.id ? 'Failed to update rule' : 'Failed to create rule', failure)
  } finally {
    busy.value = false
  }
}

// ---- delete ----------------------------------------------------------------
const deleteTarget = ref(null)
const deleteBatch = ref(null)

function confirmDelete(rule) {
  deleteTarget.value = rule
}

async function doDelete() {
  const rule = deleteTarget.value
  deleteTarget.value = null
  if (!rule) return
  busy.value = true
  try {
    await api.deleteVendor(rule.id)
    toastOk('Rule deleted', rule.vendor)
    await loadRules()
  } catch (failure) {
    toastError('Failed to delete rule', failure)
  } finally {
    busy.value = false
  }
}

/** Small concurrency cap: there is no bulk endpoint, so this is N requests. */
async function runBatched(items, fn, size = 6) {
  let done = 0
  const failures = []
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size)
    await Promise.all(
      slice.map((item) =>
        fn(item).then(
          () => done++,
          (e) => failures.push(e),
        ),
      ),
    )
  }
  return { done, failures }
}

// ---- cleanup: prune duplicates --------------------------------------------
function confirmPrune(groups, label) {
  deleteBatch.value = {
    label,
    rules: groups.flatMap((g) => g.redundant),
    groups: groups.length,
  }
}

async function doPrune() {
  const batch = deleteBatch.value
  deleteBatch.value = null
  if (!batch?.rules.length) return
  busy.value = true
  show?.({
    props: {
      title: `Removing ${batch.rules.length} rules`,
      body: 'No bulk endpoint exists, so this is one request each. Please wait…',
      variant: 'info',
      pos: 'bottom-right',
    },
  })
  const { done, failures } = await runBatched(batch.rules, (r) => api.deleteVendor(r.id))
  await loadRules()
  busy.value = false
  if (failures.length) {
    toastError(`${failures.length} of ${batch.rules.length} deletions failed`, failures[0])
  } else {
    toastOk('Cleanup complete', `Removed ${done} unused rules.`)
  }
}

// ---- cleanup: resolve a conflicting group ---------------------------------
const conflictChoice = ref({})

async function resolveConflict(group) {
  const chosen = conflictChoice.value[group.key]
  if (!chosen) return
  busy.value = true
  try {
    if (String(group.winner.categoryName ?? '').trim() !== chosen) {
      await api.updateCategory({
        id: group.winner.id,
        vendor: group.winner.vendor,
        categoryName: chosen,
        regexMaybe: group.winner.regexMaybe ?? null,
      })
    }
    const { failures } = await runBatched(group.redundant, (r) => api.deleteVendor(r.id))
    await loadRules()
    if (failures.length) toastError(`${failures.length} deletions failed`, failures[0])
    else toastOk('Resolved', `${group.vendor} → ${chosen}, ${group.redundant.length} extras removed.`)
  } catch (failure) {
    toastError('Failed to resolve', failure)
  } finally {
    busy.value = false
  }
}

// ---- rename a category across every rule ---------------------------------
const renameTarget = ref(null)
const renameTo = ref('')

function openRename(category) {
  renameTarget.value = category
  renameTo.value = category.name
}

const renameRules = computed(() => {
  if (!renameTarget.value) return []
  const name = renameTarget.value.name
  return analysis.value.compiled.filter(
    (r) => (String(r.categoryName ?? '').trim() || 'Uncategorized') === name,
  )
})

async function doRename() {
  const target = renameTarget.value
  const to = renameTo.value.trim()
  renameTarget.value = null
  if (!target || !to || to === target.name) return
  const affected = analysis.value.compiled.filter(
    (r) => (String(r.categoryName ?? '').trim() || 'Uncategorized') === target.name,
  )
  busy.value = true
  show?.({
    props: {
      title: `Renaming ${affected.length} rules`,
      body: 'One request per rule — please wait…',
      variant: 'info',
      pos: 'bottom-right',
    },
  })
  const { done, failures } = await runBatched(affected, (r) =>
    api.updateCategory({ id: r.id, vendor: r.vendor, categoryName: to, regexMaybe: r.regexMaybe ?? null }),
  )
  await loadRules()
  busy.value = false
  if (failures.length) toastError(`${failures.length} of ${affected.length} updates failed`, failures[0])
  else toastOk('Category renamed', `${done} rules now use “${to}”.`)
}
</script>

<template>
  <main class="rules-page">
    <!-- Health first: the numbers that explain why this page needs attention. -->
    <BCard class="panel mb-3" body-class="p-3 p-md-4">
      <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div class="text-start">
          <h2 class="page-title mb-1">Vendor rules</h2>
          <p class="page-subtitle mb-0">
            When you import, each transaction is matched against these rules and the
            <strong>first match wins</strong>. A match sets the category and relabels the vendor.
          </p>
        </div>
        <BButton variant="primary" :disabled="busy" @click="openCreate">New rule</BButton>
      </div>

      <div class="stat-row">
        <div class="stat">
          <span class="stat-value">{{ analysis.total.toLocaleString() }}</span>
          <span class="stat-label">rules</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ analysis.categories.length }}</span>
          <span class="stat-label">categories</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ analysis.withPattern }}</span>
          <span class="stat-label">use a pattern</span>
        </div>
        <div class="stat" :class="{ warn: analysis.shadowedCount > 0 }">
          <span class="stat-value">{{ analysis.shadowedCount.toLocaleString() }}</span>
          <span class="stat-label">never used</span>
        </div>
        <div class="stat" :class="{ warn: analysis.blankCategory.length > 0 }">
          <span class="stat-value">{{ analysis.blankCategory.length }}</span>
          <span class="stat-label">no real category</span>
        </div>
      </div>

      <BAlert
        v-if="analysis.shadowedCount"
        :model-value="true"
        variant="warning"
        class="mt-3 mb-0 text-start py-2"
      >
        <strong>{{ analysis.shadowedCount.toLocaleString() }} rules never fire.</strong>
        An earlier rule already matches the same vendor — importing adds a rule per vendor without
        checking, so they accumulate.
        <BButton size="sm" variant="outline-light" class="ms-2" @click="view = 'cleanup'">
          Review cleanup
        </BButton>
      </BAlert>
    </BCard>

    <BButtonGroup class="mb-3">
      <BButton :variant="view === 'rules' ? 'secondary' : 'outline-secondary'" @click="view = 'rules'">
        Rules
      </BButton>
      <BButton
        :variant="view === 'categories' ? 'secondary' : 'outline-secondary'"
        @click="view = 'categories'"
      >
        Categories ({{ analysis.categories.length }})
      </BButton>
      <BButton :variant="view === 'cleanup' ? 'secondary' : 'outline-secondary'" @click="view = 'cleanup'">
        Cleanup
        <BBadge v-if="analysis.shadowedCount" variant="warning" class="ms-1">
          {{ analysis.shadowedCount }}
        </BBadge>
      </BButton>
    </BButtonGroup>

    <!-- ===================== RULES ===================== -->
    <template v-if="view === 'rules'">
      <div class="filter-panel">
        <BFormInput v-model="search" type="search" placeholder="Search vendor, category or pattern…" />
        <div class="filter-row">
          <label class="field">
            <span class="field-label">Category</span>
            <BFormSelect v-model="categoryFilter" size="sm">
              <option value="all">All categories</option>
              <option v-for="c in analysis.categories" :key="c.name" :value="c.name">
                {{ c.name }} ({{ c.count }})
              </option>
            </BFormSelect>
          </label>
          <BFormCheckbox v-model="onlyPatterns" switch>Pattern rules only</BFormCheckbox>
          <BFormCheckbox v-model="onlyUnused" switch>Never-used only</BFormCheckbox>
          <div class="ms-auto d-flex align-items-center gap-2">
            <span class="result-line">
              <strong>{{ filteredRules.length.toLocaleString() }}</strong> of
              {{ analysis.total.toLocaleString() }}
            </span>
            <BButton v-if="activeFilters" size="sm" variant="outline-secondary" @click="clearFilters">
              Clear
            </BButton>
          </div>
        </div>
      </div>

      <BCard class="panel" body-class="p-3 p-md-4">
        <div v-if="loading && !loaded" class="empty-state"><BSpinner small /> Loading rules…</div>
        <template v-else>
          <BPagination
            v-if="tableItems.length > perPage"
            v-model="currentPage"
            :total-rows="tableItems.length"
            :per-page="perPage"
            class="justify-content-center"
            first-number
            last-number
            :limit="5"
            size="sm"
          />
          <BTable
            :items="tableItems"
            :fields="fields"
            :per-page="perPage"
            :current-page="currentPage"
            :sort-by="[{ key: 'vendor', order: 'asc' }]"
            small
            striped
            responsive
            show-empty
            empty-text="No rules match these filters."
            class="mb-0 rules-table"
          >
            <template #cell(category)="row">
              <span class="swatch" :style="{ background: getCategoryColor(row.item.category) }" />
              {{ row.item.category }}
            </template>
            <template #cell(pattern)="row">
              <code v-if="row.item.pattern" class="pattern">{{ row.item.pattern }}</code>
              <span v-else class="muted">exact match</span>
            </template>
            <template #cell(status)="row">
              <BBadge v-if="row.item.invalid" variant="danger">invalid pattern</BBadge>
              <span
                v-else-if="row.item.shadowedBy"
                class="badge-unused"
                :title="`“${row.item.shadowedBy}” matches first, so this rule never fires`"
              >
                never used
              </span>
              <span v-else class="badge-active">active</span>
            </template>
            <template #cell(actions)="row">
              <div class="row-actions">
                <BButton size="sm" variant="outline-secondary" :disabled="busy" @click="openEdit(row.item.raw)">
                  Edit
                </BButton>
                <BButton size="sm" variant="outline-danger" :disabled="busy" @click="confirmDelete(row.item.raw)">
                  Delete
                </BButton>
              </div>
            </template>
          </BTable>
          <BPagination
            v-if="tableItems.length > perPage"
            v-model="currentPage"
            :total-rows="tableItems.length"
            :per-page="perPage"
            class="justify-content-center mt-2 mb-0"
            first-number
            last-number
            :limit="5"
            size="sm"
          />
        </template>
      </BCard>
    </template>

    <!-- ===================== CATEGORIES ===================== -->
    <BCard v-else-if="view === 'categories'" class="panel" body-class="p-3 p-md-4">
      <h3 class="section-title mb-1">Categories in use</h3>
      <p class="section-subtitle mb-3">
        Every distinct category name across your rules. Renaming updates each rule that uses it.
      </p>
      <BAlert v-if="analysis.caseVariants.length" :model-value="true" variant="warning" class="py-2 text-start">
        <strong>Names differing only by case or spacing:</strong>
        {{ analysis.caseVariants.map((v) => v.join(' / ')).join(' · ') }}. These behave as separate
        categories — rename one to merge them.
      </BAlert>

      <ul class="category-list">
        <li v-for="c in analysis.categories" :key="c.name">
          <span class="swatch" :style="{ background: getCategoryColor(c.name) }" />
          <span class="cat-name">{{ c.name }}</span>
          <span class="cat-count">
            {{ c.count }} {{ c.count === 1 ? 'rule' : 'rules' }}
            <span v-if="c.active !== c.count" class="muted">({{ c.active }} active)</span>
          </span>
          <BButton
            size="sm"
            variant="outline-secondary"
            :disabled="busy"
            @click="showCategoryRules(c.name)"
          >
            View
          </BButton>
          <BButton size="sm" variant="outline-secondary" :disabled="busy" @click="openRename(c)">
            Rename
          </BButton>
        </li>
      </ul>
    </BCard>

    <!-- ===================== CLEANUP ===================== -->
    <template v-else>
      <BCard class="panel mb-3" body-class="p-3 p-md-4">
        <h3 class="section-title mb-1">Duplicate vendors</h3>
        <p class="section-subtitle mb-3">
          {{ analysis.duplicateGroups.length }} vendors have more than one rule. Only the first is
          ever used; the rest are dead weight.
        </p>

        <BAlert v-if="analysis.prunableCount" :model-value="true" variant="info" class="py-2 text-start">
          <strong>{{ analysis.prunableCount }} rules can be removed safely</strong> — every copy of
          those vendors already agrees on the category, so nothing changes except the clutter.
          <BButton
            size="sm"
            variant="light"
            class="ms-2"
            :disabled="busy"
            @click="confirmPrune(analysis.duplicateGroups.filter((g) => g.agrees), 'agreeing duplicates')"
          >
            Remove {{ analysis.prunableCount }} unused rules
          </BButton>
        </BAlert>

        <p v-if="analysis.conflictGroups.length" class="section-subtitle mb-2">
          {{ analysis.conflictGroups.length }} need a decision — their copies disagree about the
          category, so pick the one to keep.
        </p>

        <ul class="group-list">
          <li v-for="g in analysis.conflictGroups" :key="g.key">
            <div class="group-head">
              <span class="group-vendor">{{ g.vendor }}</span>
              <span class="group-count">{{ g.rules.length }} rules</span>
              <span class="group-count">
                currently → {{ String(g.winner.categoryName ?? '').trim() || 'Uncategorized' }}
              </span>
            </div>
            <div class="group-body">
              <!-- An empty-string placeholder, so the select has an option that
                   actually matches the unset state and renders its label. -->
              <BFormSelect v-model="conflictChoice[g.key]" size="sm" class="group-select">
                <option value="">Keep which category?</option>
                <option v-for="c in g.categories" :key="c" :value="c">
                  {{ c || 'Uncategorized' }}
                  ({{ g.rules.filter((r) => String(r.categoryName ?? '').trim() === c).length }} rules)
                </option>
              </BFormSelect>
              <BButton
                size="sm"
                variant="outline-primary"
                :disabled="busy || !conflictChoice[g.key]"
                @click="resolveConflict(g)"
              >
                Keep &amp; remove {{ g.redundant.length }}
              </BButton>
            </div>
          </li>
        </ul>
        <p v-if="!analysis.duplicateGroups.length" class="muted mb-0">No duplicate vendors. Nice.</p>
      </BCard>

      <BCard v-if="analysis.blankCategory.length" class="panel" body-class="p-3 p-md-4">
        <h3 class="section-title mb-1">Rules with no real category</h3>
        <p class="section-subtitle mb-3">
          These match transactions but leave them Unknown, so they show up as "Other" in every chart.
        </p>
        <ul class="group-list">
          <li v-for="r in analysis.blankCategory.slice(0, 40)" :key="r.id">
            <div class="group-body">
              <span class="group-vendor grow">{{ r.vendor }}</span>
              <BButton size="sm" variant="outline-secondary" :disabled="busy" @click="openEdit(r)">
                Give it a category
              </BButton>
            </div>
          </li>
        </ul>
        <p v-if="analysis.blankCategory.length > 40" class="muted mb-0">
          …and {{ analysis.blankCategory.length - 40 }} more.
        </p>
      </BCard>
    </template>

    <!-- ===================== MODALS ===================== -->
    <CategoryRuleModal
      v-model="editorOpen"
      :rule="editing"
      :existing-rules="analysis.compiled"
      :known-categories="knownCategories"
      :test-vendors="testVendors"
      :test-vendors-loaded="testVendorsLoaded"
      :test-vendors-loading="testVendorsLoading"
      @save="saveRule"
      @load-test-vendors="loadTestVendors"
    />

    <BModal
      :model-value="!!deleteTarget"
      centered
      title="Delete this rule?"
      ok-title="Delete"
      ok-variant="danger"
      cancel-title="Cancel"
      cancel-variant="secondary"
      @update:model-value="deleteTarget = null"
      @ok="doDelete"
    >
      <p class="mb-1">
        <strong>{{ deleteTarget?.vendor }}</strong> → {{ deleteTarget?.categoryName || 'Uncategorized' }}
      </p>
      <p class="muted mb-0">
        Future imports will stop categorising this vendor. Transactions already imported keep their
        category.
      </p>
    </BModal>

    <BModal
      :model-value="!!deleteBatch"
      centered
      title="Remove unused rules?"
      :ok-title="`Remove ${deleteBatch?.rules.length ?? 0} rules`"
      ok-variant="danger"
      cancel-title="Cancel"
      cancel-variant="secondary"
      @update:model-value="deleteBatch = null"
      @ok="doPrune"
    >
      <p class="mb-1">
        This removes <strong>{{ deleteBatch?.rules.length }}</strong> rules across
        {{ deleteBatch?.groups }} vendors. The first rule for each vendor is kept, so categorisation
        does not change.
      </p>
      <p class="muted mb-0">
        There is no bulk endpoint, so this sends {{ deleteBatch?.rules.length }} separate requests
        and cannot be undone.
      </p>
    </BModal>

    <BModal
      :model-value="!!renameTarget"
      centered
      title="Rename category"
      ok-title="Rename"
      ok-variant="primary"
      cancel-title="Cancel"
      cancel-variant="secondary"
      :ok-disabled="!renameTo.trim() || renameTo.trim() === renameTarget?.name"
      @update:model-value="renameTarget = null"
      @ok="doRename"
    >
      <p class="mb-2">
        Renaming <strong>{{ renameTarget?.name }}</strong> updates
        {{ renameRules.length }} {{ renameRules.length === 1 ? 'rule' : 'rules' }}.
      </p>
      <BFormInput v-model="renameTo" list="rename-category-list" placeholder="New category name" />
      <datalist id="rename-category-list">
        <option v-for="c in knownCategories" :key="c" :value="c" />
      </datalist>
      <p class="muted mb-0 mt-2">
        Type an existing name to merge the two. This only changes future imports — already-imported
        transactions keep their current category.
      </p>
    </BModal>
  </main>
</template>

<style scoped>
.rules-page {
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

.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.stat {
  flex: 1 1 120px;
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

.filter-panel {
  padding: 0.875rem 1rem;
  margin-bottom: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
}

.field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.field-label {
  font-size: 0.75rem;
  color: #898781;
  white-space: nowrap;
}

.result-line {
  font-size: 0.8125rem;
  color: #c3c2b7;
  font-variant-numeric: tabular-nums;
}

.rules-table :deep(td),
.rules-table :deep(th) {
  font-size: 0.875rem;
  vertical-align: middle;
}

.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  margin-right: 0.45rem;
  vertical-align: 0;
}

.pattern {
  font-size: 0.8125rem;
  color: #c3c2b7;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
}

.badge-active,
.badge-unused {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  white-space: nowrap;
}

.badge-active {
  background: rgba(12, 163, 12, 0.18);
  box-shadow: inset 0 0 0 1px rgba(12, 163, 12, 0.45);
  color: #ffffff;
}

.badge-unused {
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  color: #898781;
  cursor: help;
}

.row-actions {
  display: flex;
  gap: 0.35rem;
  justify-content: flex-end;
}

.category-list,
.group-list {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
}

.category-list li {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.cat-name {
  flex: 1 1 auto;
  font-size: 0.9375rem;
  color: #ffffff;
}

.cat-count {
  font-size: 0.8125rem;
  color: #c3c2b7;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.group-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.group-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.group-vendor {
  font-size: 0.9375rem;
  color: #ffffff;
}

.group-count {
  font-size: 0.75rem;
  color: #898781;
}

.group-body {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

.group-select {
  max-width: 260px;
}

.grow {
  flex: 1 1 auto;
}

.muted {
  color: #898781;
  font-size: 0.8125rem;
}

.empty-state {
  padding: 3rem 0;
  text-align: center;
  color: #898781;
}
</style>
