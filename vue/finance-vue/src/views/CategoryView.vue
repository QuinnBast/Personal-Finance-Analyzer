<script setup>
import {computed, ref} from "vue";
import {BTable, useToast} from "bootstrap-vue-next";
import axios from "axios";

const categoryList = ref([])
const filterText = ref("")
const createCategoryModal = ref(false)

const {show} = useToast()

var newCategoryInput = {
  vendor: "",
  category: ""
}

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
    show?.({ props: {title: "Success", body: "Found " + success.data.vendorCategories.length + " categories.", variant: "success", pos: "bottom-right" }})
    categoryList.value = success.data.vendorCategories;
  }, (failure) => {
    show?.({ props: {title: "Failed to get categories", body: failure.message, variant: "danger", pos: "bottom-right" }})
  })
}

function deleteVendor(toDelete) {
  axios.delete("http://localhost:9000/delete-vendor?id=" + toDelete.id).then((success) => {
    show?.({ props: {title: "Success", body: "Deleted category: " + toDelete.vendor, variant: "success", pos: "bottom-right" }})
    categoryList.value = categoryList.value.filter((it) => it !== toDelete)
  }, (failure) => {
    show?.({ props: {title: "Failed to delete category for " + toDelete.vendor, body: failure.message, variant: "danger", pos: "bottom-right" }})
  })
}

getCategories()

function createCategory() {
  axios.post("http://localhost:9000/add-vendor", JSON.stringify(newCategoryInput), {headers: {'Content-Type': 'application/json'}}).then(
      (success) => {
        categoryList.value.push({
          vendor: newCategoryInput.vendor,
          categoryName: newCategoryInput.category,
          id: success.data.insertId
        })
        show?.({ props: {title: "Successfully created Category", body: "Created category (" + newCategoryInput.vendor + " -> " + newCategoryInput.category + ")", variant: "success", pos: "bottom-right" }})
        newCategoryInput = {
          vendor: "",
          category: ""
        }
      }, (failure) => {
        show?.({ props: {title: "Failed to create Category", body: failure.message, variant: "danger", pos: "bottom-right" }})
      }
  )
}
</script>

<template>
  <div class="m-4">
    <BContainer class="m-2">
      <BButton @click="createCategoryModal = !createCategoryModal" size="lg" variant="success">Add Category</BButton>
    </BContainer>

    <BModal
        v-model="createCategoryModal"
        id="modal-center"
        centered
        title="New Category"
        cancel-title="Cancel"
        cancel-variant="danger"
        ok-title="Create"
        ok-variant="success"
        @ok="createCategory">
      <BForm>
        <BFormGroup
            class="p-2 m-2"
            id="input-vendor-regex"
            label-for="vendorName"
        >
          <BInputGroup prepend="Vendor Regex">
            <BFormInput
                id="vendorName"
                v-model="newCategoryInput.vendor"
                type="text"
                placeholder="Vendor"
                required
            />
          </BInputGroup>
        </BFormGroup>

        <BInputGroup prepend="Category" class="p-2 m-2">
          <BFormInput
              id="category"
              v-model="newCategoryInput.category"
              type="text"
              placeholder="Category"
              required
          />
        </BInputGroup>
      </BForm>
    </BModal>

    <h3>{{ categoryList.length}} Categories</h3>

    <BFormInput
        id="filter-input"
        v-model="filterText"
        type="search"
        placeholder="Type to Search"
    />

    <BTable
        :key="listSize"
        :sort-by="[{key: 'vendor', order: 'asc'}]"
        :fields="fieldTypes"
        :items="categoryList"
        :per-page="perPage"
        :current-page="currentPage"
        :filterable="['vendor']"
        :filter="filterText"
        :responsive="false"
        emptyText="No data"
    >
      <template #cell(actions)="row">
          <BButton size="sm" @click="deleteVendor(row.item)" variant="danger">Delete</BButton>
      </template>
    </BTable>
  </div>
</template>

<style scoped>

</style>