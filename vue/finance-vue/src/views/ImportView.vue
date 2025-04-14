<script setup>
import {computed, ref} from "vue";
import {BTable, useToast} from "bootstrap-vue-next";
import axios from "axios";
import moment from 'moment';

const {show} = useToast()
const files = ref([])
const categoryList = ref([])
const transactionsToImport = ref([])
const currentPage = ref(1)
const perPage = 30
const regexTest = ref("")
const matchingExistingCategories = ref([])
const account = ref("Chequing")
const fields = [
  {
    key: 'date',
    label: 'Date',
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'vendor',
    label: 'Vendor',
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'location',
    label: 'Location',
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'type',
    label: 'Type',
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'category',
    label: 'Category',
    sortable: false,
    sortDirection: 'desc',
  },
  {
    key: 'account',
    label: 'Account',
    sortable: false,
    sortDirection: 'desc',
  },
  {
    key: 'amount',
    label: 'Amount',
    sortable: true,
    sortDirection: 'desc',
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
    key: 'category',
    label: 'Category',
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'actions',
    label: 'Actions',
  }
]

function readFiles() {
  if(files.value.length > 0) {
    files.value.forEach((file) => {
      var reader = new FileReader()
      reader.onload = readFileContent
      reader.readAsText(file, "UTF-8")
    })
  }
}

function getCategories() {
  return axios.get(`http://localhost:9000/vendor-categories`).then((success) => {
    categoryList.value = success.data.vendorCategories;
  })
}

getCategories()

function readFileContent(evt) {
  var fileContent = evt.target.result
  fileContent.split("\n").forEach((line, index) => {
    if(line === "" || index ===  0) {
      if(index === 0) {
        // Try to dynamically determine the account type so the user doesn't have to set it.
        const headerRegex = /(.*),(.*),(.*),(.*),(.*),(.*),(.*)/g
        const headerTokens = headerRegex.exec(line);

        if(headerTokens.length === 0) {
          show?.({ props: {title: "Unable to parse file.", body: "File format must have changed. Check ImportView.vue", variant: "danger", pos: "bottom-right" }})
          return;
        }

        if(headerTokens[5] === "Status") {
          account.value = "Credit";
        } else {
          account.value = "Chequing";
        }
      }
      return
    }

    if(account.value === "Chequing") {
      const regex = /(\".*\"),(\".*\"),(\".*\"),(\".*\"),(\".*\"),(\".*\"),(\".*\")/g
      const tokens = regex.exec(line);

      if(tokens.length === 0) {
        show?.({ props: {title: "Unable to parse file.", body: "File format must have changed. Check ImportView.vue", variant: "danger", pos: "bottom-right" }})
        return;
      }

      transactionsToImport.value.push(parseChequingTransaction(tokens))
    } else if(account.value === "Credit") {
      const regex = /(\".*\"),(\".*\"),(\".*\"),(\".*\"),(\".*\"),(\".*\"),(\".*\")/g
      const tokens = regex.exec(line);

      if(tokens.length === 0) {
        show?.({ props: {title: "Unable to parse file.", body: "File format must have changed. Check ImportView.vue", variant: "danger", pos: "bottom-right" }})
        return;
      }

      transactionsToImport.value.push(parseCreditTransaction(tokens))
    }
  })
}

function parseChequingTransaction(tokens) {
  var fullString = tokens[0]
  var filter = tokens[1]
  var shortDate = moment(tokens[2].replaceAll('\"', "").trim(), "YYYY-MM-DD").format("YYYY-MM-DDTHH:mm:ss")
  var type = tokens[3]
  var purchaseAmount = tokens[6].replaceAll('\"', "")
  var unknown = tokens[2]
  if(type !== undefined && type !== null && type !== "") {
    type = type.replaceAll('\"', "").trim()
  }

  var vendorString = "Unknown"
  var locationString = "Unknown"
  var vendorAndLocation = tokens[4]
  if(vendorAndLocation !== undefined && vendorAndLocation !== null && vendorAndLocation !== "") {
    vendorAndLocation = vendorAndLocation.replaceAll('\"', "")
    vendorString = vendorAndLocation.slice(0, 25).trim()
    locationString = vendorAndLocation.slice(25, 30).trim()

    if(locationString.includes(" ") || locationString === "") {
      vendorString += locationString
      locationString = "Unknown"
    }
  }

  var category = ""
  var override = checkVendorOverride(vendorString, type)

  if(override.category != null) {
    category = override.category
  }
  if(override.vendorOverride != null) {
    vendorString = override.category
  }

  return {
    date: shortDate,
    amount: purchaseAmount,
    type: type,
    vendor: vendorString,
    location: locationString,
    category: category,
    account: account
  };
}

function parseCreditTransaction(tokens) {
  var shortDate = moment(tokens[2].replaceAll('\"', "").trim(), "YYYY-MM-DD").format("YYYY-MM-DDTHH:mm:ss")
  var purchaseAmount = tokens[7].replaceAll('\"', "")

  var vendorString = "Unknown"
  var locationString = "Unknown"
  var category = "Unknown"
  var vendorAndLocation = tokens[3]

  if(vendorAndLocation !== undefined && vendorAndLocation !== null && vendorAndLocation !== "") {
    vendorAndLocation = vendorAndLocation.replaceAll('\"', "")

    if(vendorAndLocation.includes("FROM")) {
      // This was a transfer. Don't parse and leave as is. There is no location.
      vendorString = vendorAndLocation
      category = "Bills"
    } else {
      vendorString = vendorAndLocation.slice(0, 25).trim() // 25 Character vendor name.
      var city = vendorAndLocation.slice(25, 38) // 13 char city name.
      var province = vendorAndLocation.slice(38, 40).trim() // 3 char province name at end

      var override = checkVendorOverride(vendorString, type)

      if(override.category != null) {
        category = override.category
      }
      if(override.vendorOverride != null) {
        vendorString = override.category
      }

      if(city.trim() !== "") {
        locationString = city + ", " + province
      }
    }
  }

  return {
    date: shortDate,
    amount: purchaseAmount,
    type: "",
    vendor: vendorString,
    location: locationString,
    category: category,
    account: account
  };
}

function checkVendorOverride(vendorString, type = "") {
  var override = {
    category: null,
    vendorOverride: null,
  };
  // Lookup category...
  var foundFromList = categoryList.value.filter((it) => {
    if(it.regexMaybe !== null && it.regexMaybe !== "") {
      var regex = new RegExp(it.regexMaybe.toUpperCase())
      return regex.test(vendorString.toUpperCase())
    } else {
      return vendorString.toUpperCase() === it.vendor.toUpperCase()
    }
  })

  if(foundFromList.length > 0) {
    override.category = foundFromList[0].categoryName
    override.vendorOverride = foundFromList[0].vendor
  } else {
    if(type.includes("Bill Payment")) {
      override.category = "Bills"
    } else if (type.includes("Payroll Deposit")) {
      override.category = "Job"
    }
  }
  return override;
}

const newCategory = ref({})
const createCategoryModal = ref(false)
function addCategoryModal(item) {
  newCategory.value = {
    vendor: item.vendor,
    category: item.category,
    regexMaybe: ""
  }
  createCategoryModal.value = true
}

function createCategory() {
  axios.post("http://localhost:9000/add-vendor", JSON.stringify(newCategory.value), {headers: {'Content-Type': 'application/json'}}).then(
      (success) => {
        show?.({ props: {title: "Successfully created Category", body: "Created category (" + newCategory.value.vendor + " -> " + newCategory.value.category + ")", variant: "success", pos: "bottom-right" }})

        // Update any transactions in the list matching the vendor to have the new category.
        var updatedTransactions = 0
        transactionsToImport.value.forEach((transaction) => {
          if(transaction.vendor === newCategory.value.vendor) {
            transaction.category = newCategory.value.category
            updatedTransactions += 1
          }
        })
        show?.({ props: {title: "Import Updated", body: updatedTransactions.toString() + " transactions were updated with the new vendor.", variant: "success", pos: "bottom-right" }})
        newCategory.value = {
          vendor: "",
          category: ""
        }
      }, (failure) => {
        show?.({ props: {title: "Failed to create Category", body: failure.message, variant: "danger", pos: "bottom-right" }})
      }
  )
}

function importTransactions() {
  var data = {
    transactions: transactionsToImport.value
  }
  axios.post("http://localhost:9000/import-transactions", JSON.stringify(data), {headers: {'Content-Type': 'application/json'}}).then(
      (success) => {
        show?.({ props: {title: "Successful import.", body: "Imported " + transactionsToImport.value.length + " transactions.", variant: "success", pos: "bottom-right" }})
        transactionsToImport.value = []
        files.value = []
      }, (failure) => {
        show?.({ props: {title: "Failed to import " + transactionsToImport.value.length + " transactions.", body: failure.message, variant: "danger", pos: "bottom-right" }})
      }
  )
}

function checkUnknown(transaction) {
  return transaction.category !== null && transaction.category !== "Unknown" && transaction.category !== ""
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
  var matchRegex = newCategory.value.regexMaybe

  if(matchRegex !== undefined && matchRegex !== null && matchRegex !== "") {
    return new RegExp(matchRegex.toUpperCase(), 'g')
  } else {
    return null
  }
}
</script>

<template>
  <BContainer>

    <BRow class="p-3">
      <BCol>
        <BDropdown :text="account">
          <BDropdownItem @click="value => account = value.target.innerText">Chequing</BDropdownItem>
          <BDropdownItem @click="value => account = value.target.innerText">Credit</BDropdownItem>
        </BDropdown>
      </BCol>
      <BCol cols="9">
        <BFormFile v-model="files" multiple accept="text/csv" @update:modelValue="readFiles"/>
      </BCol>
    </BRow>

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
                v-model="newCategory.vendor"
                type="text"
                placeholder="Vendor"
                required
            />
          </BInputGroup>
        </BFormGroup>

        <BInputGroup prepend="Category" class="p-2 m-2">
          <BFormInput
              id="category"
              v-model="newCategory.category"
              type="text"
              placeholder="Category"
              required
          />
        </BInputGroup>

        <BInputGroup prepend="Optional Regex" class="p-2 m-2">
          <BFormInput
              id="regex"
              v-model="newCategory.regexMaybe"
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
            <BButton size="sm" @click="deleteVendor(row.item)" variant="danger">Delete</BButton>
          </template>
        </BTable>
      </BForm>
    </BModal>

    <div class="mt-3">
      Files: <strong>{{ files.map((file) => file.name).join(",") }}</strong>
      <BPagination
          v-model="currentPage"
          :total-rows="transactionsToImport.length"
          :per-page="perPage"
          class="justify-content-center"
          first-number
          last-number
          :limit="5"
      />
      <BTable
          :key="transactionsToImport.length"
          :sort-by="[{key: 'date', order: 'desc'}]"
          :items="transactionsToImport"
          :fields="fields"
          :per-page="perPage"
          :current-page="currentPage"
          :sortInternal="false"
          emptyText="No data">
        <template #cell(category)="row">
          <BFormInput
              v-model="row.item.category"
              type="text"
              @blur="addCategoryModal(row.item)"
              :state="checkUnknown(row.item)"
          />
          <BFormInvalidFeedback :state="checkUnknown(row.item)">
            Unknown Category
          </BFormInvalidFeedback>
        </template>
      </BTable>
      <BPagination
          v-model="currentPage"
          :total-rows="transactionsToImport.length"
          :per-page="perPage"
          class="justify-content-center"
          first-number
          last-number
          :limit="5"
      />
    </div>

    <BButton @click="importTransactions" variant="success">Import</BButton>
  </BContainer>
</template>

<style scoped>

</style>