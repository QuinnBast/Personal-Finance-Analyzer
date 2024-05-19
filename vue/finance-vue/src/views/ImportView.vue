<script setup>
import {ref} from "vue";
import {BTable} from "bootstrap-vue-next";
import axios from "axios";

const files = ref([])
const categoryList = ref([])
const transactionsToImport = ref([])
const currentPage = ref(1)
const perPage = 30
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
    sortable: true,
    sortDirection: 'desc',
  },
  {
    key: 'amount',
    label: 'Amount',
    sortable: true,
    sortDirection: 'desc',
  },
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
  fileContent.split("\n").forEach((line) => {
    if(line === "") {
      return
    }
    var tokens = line.split(",")

    var shortDate = tokens[0]
    var purchaseAmount = tokens[1]
    var unknown = tokens[2]
    var type = tokens[3]
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

    // Lookup category...
    var category = "Unknown"
    var foundFromList = categoryList.value.filter((it) => vendorString !== "POS" && vendorString === it.vendor)
    if(foundFromList.length > 0) {
      category = foundFromList[0].categoryName
    }

    transactionsToImport.value.push({
      date: shortDate,
      amount: purchaseAmount,
      type: type,
      vendor: vendorString,
      location: locationString,
      category: category
    })
  })
}
</script>

<template>
  <div>
    <BFormFile v-model="files" label="Upload files" multiple accept="text/csv" @update:modelValue="readFiles" />
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
          emptyText="No data"
      />
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
  </div>
</template>

<style scoped>

</style>