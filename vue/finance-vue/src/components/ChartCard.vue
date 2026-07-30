<script setup>
/**
 * Wrapper for every chart on the dashboard.
 *
 * It supplies the title (so no chart draws its own 36px canvas title), the
 * "why you care" subtitle, and the table view - every chart is required to have
 * a table twin so no value is reachable by colour or hover alone.
 */
import { computed, ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  note: { type: String, default: '' },
  height: { type: Number, default: 340 },
  tableFields: { type: Array, default: () => [] },
  tableRows: { type: Array, default: () => [] },
  empty: { type: Boolean, default: false },
  emptyText: { type: String, default: 'No data in this time range.' },
})

const showTable = ref(false)
const hasTable = computed(() => props.tableFields.length > 0 && props.tableRows.length > 0)
</script>

<template>
  <BCard class="chart-card mb-4" body-class="p-3 p-md-4">
    <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
      <div class="text-start">
        <h3 class="chart-title mb-1">{{ title }}</h3>
        <p v-if="subtitle" class="chart-subtitle mb-0">{{ subtitle }}</p>
      </div>
      <BButtonGroup v-if="hasTable" size="sm" class="flex-shrink-0">
        <BButton :variant="showTable ? 'outline-secondary' : 'secondary'" @click="showTable = false">
          Chart
        </BButton>
        <BButton :variant="showTable ? 'secondary' : 'outline-secondary'" @click="showTable = true">
          Data
        </BButton>
      </BButtonGroup>
    </div>

    <div v-if="empty" class="chart-empty" :style="{ height: height + 'px' }">
      {{ emptyText }}
    </div>

    <template v-else>
      <div v-show="!showTable" class="chart-frame" :style="{ height: height + 'px' }">
        <slot />
      </div>

      <div v-if="hasTable" v-show="showTable" class="chart-table">
        <BTable
          :items="tableRows"
          :fields="tableFields"
          small
          striped
          responsive
          class="mb-0"
        />
      </div>
    </template>

    <p v-if="note" class="chart-note mt-3 mb-0">{{ note }}</p>
  </BCard>
</template>

<style scoped>
.chart-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.chart-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: #ffffff;
  line-height: 1.3;
}

.chart-subtitle {
  font-size: 0.875rem;
  color: #c3c2b7;
  max-width: 70ch;
}

.chart-note {
  font-size: 0.8125rem;
  color: #898781;
  text-align: left;
}

/* Sized to include the axis band, so the card never grows an inner scrollbar. */
.chart-frame {
  position: relative;
  width: 100%;
}

.chart-table :deep(td),
.chart-table :deep(th) {
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
}

.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #898781;
  font-size: 0.9375rem;
}
</style>
