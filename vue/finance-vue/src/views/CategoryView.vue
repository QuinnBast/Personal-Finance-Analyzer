<script setup>
import {computed, ref} from "vue";
import {BTable, useToast} from "bootstrap-vue-next";
import axios from "axios";

const categoryList = ref([])
const matchingExistingCategories = ref([])
const filterText = ref("")
const createCategoryModal = ref(false)
const regexTest = ref("")

const updateCategoryModal = ref(false)
var selectedCategory = {
  id: 0,
  vendor: "",
  categoryName: "",
  regexMaybe: "",
}

const {show} = useToast()

var newCategoryInput = {
  vendor: "",
  category: "",
  regexMaybe: "",
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
    key: 'regexMaybe',
    label: 'Regex',
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'actions',
    label: 'Actions',
  }
]

const regexMatchFieldTypes = [
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

function getVendorOverrides() {
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
    matchingExistingCategories.value = matchingExistingCategories.value.filter((it) => it !== toDelete)
  }, (failure) => {
    show?.({ props: {title: "Failed to delete category for " + toDelete.vendor, body: failure.message, variant: "danger", pos: "bottom-right" }})
  })
}

getVendorOverrides()

function createVendorOverride() {
  if(newCategoryInput.regexMaybe === "" ) {
    newCategoryInput.regexMaybe = null
  }
  axios.post("http://localhost:9000/add-vendor", JSON.stringify(newCategoryInput), {headers: {'Content-Type': 'application/json'}}).then(
      (success) => {
        categoryList.value.push({
          vendor: newCategoryInput.vendor,
          category: newCategoryInput.category,
          regexMaybe: newCategoryInput.regexMaybe,
          id: success.data.insertId
        })
        show?.({ props: {title: "Successfully created Category", body: "Created category (" + newCategoryInput.vendor + " -> " + newCategoryInput.category + ")", variant: "success", pos: "bottom-right" }})
        newCategoryInput = {
          vendor: "",
          category: "",
          regexMaybe: ""
        }
      }, (failure) => {
        show?.({ props: {title: "Failed to create Category", body: failure.message, variant: "danger", pos: "bottom-right" }})
      }
  )
}

const validateRegex = computed(() => {
  var regex = getRegexp()
  if(regex !== null) {
    return regex.test(regexTest.value.toUpperCase())
  } else {
    return false
  }
})

function getExistingMatchingCategories() {
  var regex = getRegexp()

  if(regex !== null) {
    matchingExistingCategories.value = categoryList.value
        .filter((it) => regex.test(it.vendor.toUpperCase()))
  } else {
    matchingExistingCategories.value = []
  }
}

function getRegexp() {
  var matchRegex = ""
  if(updateCategoryModal.value) {
    matchRegex = selectedCategory.regexMaybe
  } else {
    matchRegex = newCategoryInput.regexMaybe
  }

  if(matchRegex !== null && matchRegex !== "") {
    return new RegExp(matchRegex.toUpperCase(), 'g')
  } else {
    return null
  }
}

function editVendor(categoryToUpdate) {
  updateCategoryModal.value = true
  matchingExistingCategories.value = []
  selectedCategory = {
    id: categoryToUpdate.id,
    vendor: categoryToUpdate.vendor,
    categoryName: categoryToUpdate.categoryName,
    regexMaybe: categoryToUpdate.regexMaybe
  }
}

function updateVendorOverride() {
    if(selectedCategory.regexMaybe === "" ) {
      selectedCategory.regexMaybe = null
    }

    axios.post("http://localhost:9000/update-category", JSON.stringify(selectedCategory), {headers: {'Content-Type': 'application/json'}}).then(
        (success) => {
          // Update list in place.
          const indexToReplace = categoryList.value.findIndex((it) => it.id === selectedCategory.id)
          categoryList.value.splice(indexToReplace, 1, selectedCategory)

          show?.({ props: {title: "Successfully updated Category", body: "Updated category (" + selectedCategory.vendor + " -> " + selectedCategory.category + ")", variant: "success", pos: "bottom-right" }})
          selectedCategory = {
            id: 0,
            vendor: "",
            categoryName: "",
            regexMaybe: "",
          }
        }, (failure) => {
          show?.({ props: {title: "Failed to update Category", body: failure.message, variant: "danger", pos: "bottom-right" }})
        }
    )
}
</script>

<template>
  <div class="m-4">
    <BContainer class="m-2">
      <BButton @click="createCategoryModal = !createCategoryModal" size="lg" variant="success">Add Vendor Mapping</BButton>
    </BContainer>

    <BModal
        v-model="createCategoryModal"
        id="modal-center"
        centered
        title="Add Vendor Mapping"
        cancel-title="Cancel"
        cancel-variant="danger"
        ok-title="Create"
        ok-variant="success"
        @ok="createVendorOverride">
      <BForm>
        <BCard title="If Import matches:">
          <BInputGroup prepend="Vendor Regex" class="p-2 m-2">
            <BFormInput
                id="regex"
                v-model="newCategoryInput.regexMaybe"
                type="text"
                placeholder="Regex"
                required
                @change="getExistingMatchingCategories"
            />
          </BInputGroup>
        </BCard>
        <BCard title="Update it to:">
          <BFormGroup
              class="p-2 m-2"
              id="input-vendor-regex"
              label-for="vendorName"
          >
            <BInputGroup prepend="Vendor Name">
              <BFormInput
                  id="vendorName"
                  v-model="newCategoryInput.vendor"
                  type="text"
                  placeholder="Vendor"
                  required
              />
            </BInputGroup>
            <BInputGroup prepend="Category" class="p-2 m-2">
              <BFormInput
                  id="category"
                  v-model="newCategoryInput.categoryName"
                  type="text"
                  placeholder="Category"
                  required
              />
            </BInputGroup>
          </BFormGroup>
        </BCard>


        <BCard title="Regex Testing:">

          <BInputGroup prepend="Regex Test String" class="p-2 m-2">
            <BFormInput
                id="regexTest"
                v-model="regexTest"
                type="text"
                placeholder="Regex Test String"
                required
                :state="validateRegex"
            />

          </BInputGroup>

          <BTable
              :key="matchingExistingCategories"
              :items="matchingExistingCategories"
              :fields="regexMatchFieldTypes"
              emptyText="No existing categories match"
          >
            <template #cell(actions)="row">
              <BButton size="sm" @click="deleteVendor(row.item)" variant="danger">Delete</BButton>
            </template>
          </BTable>

        </BCard>
      </BForm>
    </BModal>

    <BModal
        v-model="updateCategoryModal"
        id="update-modal"
        centered
        title="Update Category"
        cancel-title="Cancel"
        cancel-variant="danger"
        ok-title="Update"
        ok-variant="primary"
        @ok="updateVendorOverride">
      <BForm>
        <BFormGroup
            class="p-2 m-2"
            id="input-vendor-regex"
            label-for="vendorName"
        >
          <BInputGroup prepend="Vendor Name">
            <BFormInput
                id="vendorName"
                v-model="selectedCategory.vendor"
                type="text"
                placeholder="Vendor"
                required
            />
          </BInputGroup>
        </BFormGroup>

        <BInputGroup prepend="Category" class="p-2 m-2">
          <BFormInput
              id="category"
              v-model="selectedCategory.categoryName"
              type="text"
              placeholder="Category"
              required
          />
        </BInputGroup>

        <BInputGroup prepend="Optional Regex" class="p-2 m-2">
          <BFormInput
              id="regex"
              v-model="selectedCategory.regexMaybe"
              type="text"
              placeholder="Regex"
              required
              @change="getExistingMatchingCategories"
          />
        </BInputGroup>

        <BInputGroup prepend="Regex Test String" class="p-2 m-2">
          <BFormInput
              id="regexTest"
              v-model="regexTest"
              type="text"
              placeholder="Regex Test String"
              required
              :state="validateRegex"
          />

        </BInputGroup>

        <BTable
            :key="matchingExistingCategories"
            :items="matchingExistingCategories"
            :fields="regexMatchFieldTypes"
            emptyText="No existing categories match"
        >
          <template #cell(actions)="row">
            <BButton size="sm" v-if="row.item.id !== selectedCategory.id" @click="deleteVendor(row.item)" variant="danger">Delete</BButton>
            <BBadge variant="warning" v-else>Editing</BBadge>
          </template>
        </BTable>
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
        :sort-by="[{key: 'vendor', order: 'asc'}]"
        :fields="fieldTypes"
        :items="categoryList"
        :filterable="['vendor']"
        :filter="filterText"
        :responsive="false"
        emptyText="No data"
    >
      <template #cell(actions)="row">
          <BButton class="m-1" size="sm" @click="editVendor(row.item)" variant="primary">Edit</BButton>
          <BButton class="m-1" size="sm" @click="deleteVendor(row.item)" variant="danger">Delete</BButton>
      </template>
    </BTable>
  </div>
</template>

<style scoped>

</style>