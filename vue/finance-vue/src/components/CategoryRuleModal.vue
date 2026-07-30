<script setup>
/**
 * Create or edit one vendor rule.
 *
 * The old version had two different modals - one to add (no pattern field) and
 * one to edit (pattern field plus a tester that listed *other* rules with delete
 * buttons in them). This is one form, and the tester answers the question you
 * actually have while writing a pattern: which of my vendors would this catch,
 * and is an earlier rule already going to win?
 */
import { computed, ref, watch } from 'vue'
import { compileRule, ruleMatches, vendorKeyOf } from '@/utils/vendorRules.js'
import { getCategoryColor } from '@/utils/categoryColors.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** null to create, or the rule being edited. */
  rule: { type: Object, default: null },
  /** Compiled rules in API order, for precedence and duplicate warnings. */
  existingRules: { type: Array, default: () => [] },
  knownCategories: { type: Array, default: () => [] },
  /** Vendor strings to test a pattern against. */
  testVendors: { type: Array, default: () => [] },
  testVendorsLoaded: { type: Boolean, default: false },
  testVendorsLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'save', 'loadTestVendors'])

const form = ref({ vendor: '', categoryName: '', regexMaybe: '' })

watch(
  () => [props.modelValue, props.rule],
  ([open]) => {
    if (!open) return
    form.value = {
      vendor: props.rule?.vendor ?? '',
      categoryName: props.rule?.categoryName ?? '',
      regexMaybe: props.rule?.regexMaybe ?? '',
    }
  },
  { immediate: true },
)

const isEdit = computed(() => !!props.rule?.id)
const pattern = computed(() => String(form.value.regexMaybe ?? '').trim())

const compiled = computed(() =>
  compileRule({ vendor: form.value.vendor, categoryName: form.value.categoryName, regexMaybe: pattern.value }),
)

const patternState = computed(() => {
  if (!pattern.value) return null
  return compiled.value.regexError ? false : true
})

const vendorValid = computed(() => vendorKeyOf(form.value.vendor).length > 0)
const categoryValid = computed(() => String(form.value.categoryName ?? '').trim().length > 0)
const canSave = computed(() => vendorValid.value && categoryValid.value && patternState.value !== false)

/** Another rule already claims this exact vendor name. */
const duplicateOf = computed(() => {
  const key = vendorKeyOf(form.value.vendor)
  if (!key) return null
  return props.existingRules.find((r) => r.key === key && r.id !== props.rule?.id) ?? null
})

/** An earlier rule that would match first, making this one dead on arrival. */
const shadowedBy = computed(() => {
  const key = vendorKeyOf(form.value.vendor)
  if (!key) return null
  const order = props.rule ? props.existingRules.find((r) => r.id === props.rule.id)?.order : Infinity
  return (
    props.existingRules.find(
      (r) => r.id !== props.rule?.id && r.order < (order ?? Infinity) && ruleMatches(r, key),
    ) ?? null
  )
})

/** What this rule would catch, out of every vendor name we know about. */
const matches = computed(() => {
  if (!props.testVendors.length) return null
  const rule = compiled.value
  if (pattern.value && !rule.regex) return null
  const hits = props.testVendors.filter((v) => ruleMatches(rule, v))
  return { hits, shown: hits.slice(0, 14) }
})

function save() {
  emit('save', {
    id: props.rule?.id,
    vendor: String(form.value.vendor).trim(),
    categoryName: String(form.value.categoryName).trim(),
    regexMaybe: pattern.value || null,
  })
}
</script>

<template>
  <BModal
    :model-value="modelValue"
    centered
    size="lg"
    :title="isEdit ? 'Edit rule' : 'New rule'"
    cancel-title="Cancel"
    cancel-variant="secondary"
    :ok-title="isEdit ? 'Save changes' : 'Create rule'"
    ok-variant="primary"
    :ok-disabled="!canSave"
    @update:model-value="emit('update:modelValue', $event)"
    @ok="save"
  >
    <BForm @submit.prevent>
      <div class="field">
        <label class="field-label" for="rule-vendor">Vendor name</label>
        <BFormInput
          id="rule-vendor"
          v-model="form.vendor"
          placeholder="e.g. Tim Hortons"
          :state="form.vendor ? vendorValid : null"
        />
        <p class="field-help">
          Matching transactions are also <strong>relabelled</strong> with this name, so use the
          tidy version you want to see in charts.
        </p>
      </div>

      <div class="field">
        <label class="field-label" for="rule-category">Category</label>
        <BInputGroup>
          <BInputGroupText class="swatch-cell">
            <span class="swatch" :style="{ background: getCategoryColor(form.categoryName) }" />
          </BInputGroupText>
          <BFormInput
            id="rule-category"
            v-model="form.categoryName"
            list="rule-category-list"
            placeholder="e.g. Food - Take out"
            :state="form.categoryName ? categoryValid : null"
          />
        </BInputGroup>
        <datalist id="rule-category-list">
          <option v-for="c in knownCategories" :key="c" :value="c" />
        </datalist>
      </div>

      <div class="field">
        <label class="field-label" for="rule-pattern">
          Pattern <span class="optional">optional</span>
        </label>
        <BFormInput
          id="rule-pattern"
          v-model="form.regexMaybe"
          placeholder="e.g. WAL-?MART"
          :state="patternState"
        />
        <p v-if="compiled.regexError" class="field-error">{{ compiled.regexError }}</p>
        <p class="field-help">
          Leave blank to match the vendor name exactly. A pattern is a regular expression, matched
          against the upper-cased vendor text — so <code>WAL-?MART</code> catches both spellings, and
          <code>SAFEWAY(?! GAS)</code> catches Safeway but not Safeway Gas.
        </p>
      </div>

      <BAlert v-if="duplicateOf" :model-value="true" variant="warning" class="py-2 small">
        <strong>{{ duplicateOf.vendor }}</strong> already has a rule
        (→ {{ duplicateOf.categoryName || 'Uncategorized' }}). Two rules for the same vendor means
        only the first one is ever used — edit that rule instead of adding another.
      </BAlert>

      <BAlert v-else-if="shadowedBy" :model-value="true" variant="warning" class="py-2 small">
        An earlier rule (<strong>{{ shadowedBy.vendor }}</strong
        ><span v-if="shadowedBy.pattern">, pattern <code>{{ shadowedBy.pattern }}</code></span>) already
        matches this vendor, so this rule would never fire.
      </BAlert>

      <div class="tester">
        <div class="tester-head">
          <span class="field-label mb-0">What this would catch</span>
          <BButton
            v-if="!testVendorsLoaded"
            size="sm"
            variant="outline-secondary"
            :disabled="testVendorsLoading"
            @click="emit('loadTestVendors')"
          >
            <BSpinner v-if="testVendorsLoading" small /> Test against my transactions
          </BButton>
        </div>

        <p v-if="!testVendorsLoaded" class="field-help mb-0">
          Load your transaction vendors to preview the matches before saving.
        </p>
        <template v-else-if="matches">
          <p class="tester-count mb-1">
            <strong>{{ matches.hits.length.toLocaleString() }}</strong> of
            {{ testVendors.length.toLocaleString() }} known vendor names match.
          </p>
          <div v-if="matches.shown.length" class="chips">
            <span v-for="v in matches.shown" :key="v" class="chip">{{ v }}</span>
            <span v-if="matches.hits.length > matches.shown.length" class="chip more">
              +{{ matches.hits.length - matches.shown.length }} more
            </span>
          </div>
          <p v-else class="field-help mb-0">Nothing matches yet.</p>
        </template>
        <p v-else class="field-help mb-0">Fix the pattern to preview matches.</p>
      </div>
    </BForm>
  </BModal>
</template>

<style scoped>
.field {
  margin-bottom: 1rem;
}

.field-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #c3c2b7;
  margin-bottom: 0.25rem;
}

.optional {
  font-weight: 400;
  color: #898781;
  text-transform: none;
}

.field-help {
  font-size: 0.75rem;
  color: #898781;
  margin: 0.3rem 0 0;
  line-height: 1.45;
}

.field-help code {
  color: #c3c2b7;
  background: rgba(255, 255, 255, 0.06);
  padding: 0 0.25rem;
  border-radius: 3px;
}

.field-error {
  font-size: 0.75rem;
  color: #e66767;
  margin: 0.3rem 0 0;
}

.swatch-cell {
  padding-inline: 0.6rem;
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.tester {
  margin-top: 1rem;
  padding: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
}

.tester-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.35rem;
}

.tester-count {
  font-size: 0.8125rem;
  color: #c3c2b7;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  max-height: 7.5rem;
  overflow-y: auto;
}

.chip {
  font-size: 0.6875rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: rgba(57, 135, 229, 0.18);
  box-shadow: inset 0 0 0 1px rgba(57, 135, 229, 0.4);
  color: #ffffff;
  white-space: nowrap;
}

.chip.more {
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  color: #898781;
}
</style>
