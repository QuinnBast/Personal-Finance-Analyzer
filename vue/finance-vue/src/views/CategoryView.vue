<script setup>
import {ref} from "vue";
import {BTable} from "bootstrap-vue-next";
import axios from "axios";

const categoryList = ref([])
const filterText = ref("")

const fieldTypes = [
  {
    key: 'vendor',
    label: 'Vendor',
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'categoryName',
    label: 'Category',
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'actions',
    label: 'Actions',
  }
]

function getCategories() {
  return axios.get(`http://localhost:9000/vendor-categories`).then((success) => {
    console.log(success.data)
    categoryList.value = success.data.vendorCategories;
  })
}

function deleteVendor(index) {
  var toDelete = categoryList.value[index]
  axios.delete("http://localhost:9000/delete-vendor?id=" + toDelete.id).then((success) => {
    categoryList.value = categoryList.value.filter((it) => it !== toDelete)
  })
}

getCategories()
</script>

<template>
  <div class="m-4">
    <BContainer class="m-2">
      <BButton size="lg" variant="success">Add Category</BButton>
    </BContainer>

    <h3>{{ categoryList.length}} Categories</h3>

    <BFormInput
        id="filter-input"
        v-model="filterText"
        type="search"
        placeholder="Type to Search"
    />

    <BTable
        :key="listSize"
        :sort-by="[{key: 'date', order: 'desc'}]"
        :fields="fieldTypes"
        :items="categoryList"
        :per-page="perPage"
        :current-page="currentPage"
        :filterable="['vendor']"
        :filter="filterText"
        emptyText="No data"
    >
      <template #cell(actions)="row">
          <BButton size="sm" @click="deleteVendor(row.index)" variant="danger">Delete</BButton>
      </template>
    </BTable>
  </div>
</template>

<style scoped>

</style>