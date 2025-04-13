<script setup>
import {ref, reactive} from "vue";
import moment from 'moment';
import {BTable, useToast} from 'bootstrap-vue-next';
import axios from 'axios';


const {show} = useToast()

const updateTransactionModal = ref(false)

const transactionList = ref([])
const currentPage = ref(1)
const perPage = 100
const transactionUpdateOptions = ref({
  vendor: null,
  amount: null,
  account: null,
  category: null,
  type: null,
  location: null,
})
const transactionQuery = ref({
  vendor: null,
  amount: null,
  account: null,
  category: null,
  type: null,
  location: null,
})
const fields = [
  {key: 'date', sortable: true},
  {key: 'vendor', sortable: true},
  {key: 'account', sortable: true},
  {key: 'location', sortable: true},
  {key: 'purchaseType', sortable: true},
  {key: 'categoryOverride', sortable: true},
  {key: 'amount', sortable: true},
]

function getTransactions() {
  transactionList.value = []
  if(isAnyQuery()) {
    transactionQuery.value = fixOptionalTransaction(transactionQuery.value)
    return axios.post("http://localhost:9000/get-transactions", transactionQuery.value).then((success) => {
      show?.({
        props: {
          title: "Success",
          body: "Found " + success.data.transactions.length + " transactions matching filter.",
          variant: "success",
          pos: "bottom-right"
        }
      })
      transactionList.value = success.data.transactions;
    }, (failure) => {
      show?.({
        props: {
          title: "Failed to get transactions",
          body: failure.message,
          variant: "danger",
          pos: "bottom-right"
        }
      })
    })
  } else {
    transactionList.value = []
    show?.({
      props: {
        title: "Update Query",
        body: "Must filter to query.",
        variant: "info",
        pos: "bottom-right"
      }
    })
  }
}

function isAnyQuery() {
  return transactionQuery.value.vendor !== null ||
      transactionQuery.value.amount !== null ||
      transactionQuery.value.account !== null ||
      transactionQuery.value.category !== null ||
      transactionQuery.value.type !== null ||
      transactionQuery.value.location !== null
}

function fixOptionalTransaction(optionalTransaction) {
  if(optionalTransaction.vendor === "") {
    optionalTransaction.vendor = null
  }
  if(optionalTransaction.amount === "") {
    optionalTransaction.amount = null
  }
  if(optionalTransaction.account === "") {
    optionalTransaction.account = null
  }
  if(optionalTransaction.category === "") {
    optionalTransaction.category = null
  }
  if(optionalTransaction.type === "") {
    optionalTransaction.type = null
  }
  if(optionalTransaction.location === "") {
    optionalTransaction.location = null
  }
  return optionalTransaction
}

function updateAllTransactions() {
  // Update empty strings to null
  transactionUpdateOptions.value = fixOptionalTransaction(transactionUpdateOptions.value)
  var ids = transactionList.value.map((it) => it.id)

  show?.({
    props: {
      title: `Updating Transactions.`,
      body: "Please wait. This may take a while...",
      variant: "info",
      pos: "bottom-right"
    }
  })

  var promises = ids.map((id) => {
    return axios.post("http://localhost:9000/update-transaction", { id: id, update: transactionUpdateOptions.value }).then(
        (success) => {}, (failure) => {
      show?.({
        props: {
          title: `Failed to update transaction ${id}`,
          body: failure.message,
          variant: "danger",
          pos: "bottom-right"
        }
      })
    })
  })

  Promise.all(promises).then((success) => {
    show?.({
      props: {
        title: `Success.`,
        body: "Successfully updated all transactions.",
        variant: "success",
        pos: "bottom-right"
      }
    })

    getTransactions()
  })
}

function openUpdateModal() {
  transactionUpdateOptions.value = {
    vendor: null,
    amount: null,
    account: null,
    category: null,
    type: null,
    location: null,
  }
  updateTransactionModal.value = true
}

getTransactions()
</script>

<template>
  <main>
    <div>
      <BModal
          v-model="updateTransactionModal"
          id="modal-center"
          centered
          title="Bulk Update Transactions"
          cancel-title="Cancel"
          cancel-variant="danger"
          ok-title="Update ALL"
          ok-variant="warning"
          @ok="updateAllTransactions">

        <BAlert :model-value="true" variant="warning">
          Performing this update will change {{ transactionList.length }} transactions.
          Proceed with caution!
        </BAlert>

        <BForm>
          <BFormGroup
              class="p-2 m-2"
              id="update-transaction-form"
              label-for="updateTransactions"
          >
            <BInputGroup prepend="Vendor" class="p-2 m-2">
              <BFormInput
                  id="updateVendor"
                  v-model="transactionUpdateOptions.vendor"
                  type="text"
                  placeholder="Vendor"
                  required
              />
            </BInputGroup>
            <BInputGroup prepend="Amount" class="p-2 m-2">
              <BFormInput
                  id="updateAmount"
                  v-model="transactionUpdateOptions.amount"
                  type="number"
                  placeholder="Amount"
                  required
              />
            </BInputGroup>
            <BInputGroup prepend="Account" class="p-2 m-2">
              <BFormInput
                  id="updateAccount"
                  v-model="transactionUpdateOptions.account"
                  type="text"
                  placeholder="Account"
                  required
              />
            </BInputGroup>
            <BInputGroup prepend="Category" class="p-2 m-2">
              <BFormInput
                  id="updateCategory"
                  v-model="transactionUpdateOptions.category"
                  type="text"
                  placeholder="Category"
                  required
              />
            </BInputGroup>
            <BInputGroup prepend="Type" class="p-2 m-2">
              <BFormInput
                  id="updateType"
                  v-model="transactionUpdateOptions.type"
                  type="text"
                  placeholder="Type"
                  required
              />
            </BInputGroup>
            <BInputGroup prepend="Location" class="p-2 m-2">
              <BFormInput
                  id="updateLocation"
                  v-model="transactionUpdateOptions.location"
                  type="text"
                  placeholder="Location"
                  required
              />
            </BInputGroup>
          </BFormGroup>
        </BForm>
      </BModal>

      <BCard class="text-center m-3" >
        <h2>Transactions</h2>
        <BContainer>

          <BPagination
              v-model="currentPage"
              :total-rows="transactionList.length"
              :per-page="perPage"
              class="justify-content-center"
              first-number
              last-number
              :limit="5"
          />
          <BTable
              :key="transactionList.length"
              :sort-by="[{key: 'date', order: 'desc'}]"
              :items="transactionList"
              :fields="fields"
              :per-page="perPage"
              :current-page="currentPage"
              emptyText="No data"
          >
            <template #head(vendor)="data">
              <BFormGroup>
                <BInputGroup prepend="Vendor">
                  <BFormInput
                      id="updateVendor"
                      v-model="transactionQuery.vendor"
                      type="text"
                      placeholder="Vendor"
                      required
                      @change="getTransactions"
                  />
                </BInputGroup>
              </BFormGroup>
            </template>
            <template #head(account)="data">
              <BFormGroup>
                <BInputGroup prepend="Account">
                  <BFormInput
                      id="updateAccount"
                      v-model="transactionQuery.account"
                      type="text"
                      placeholder="Account"
                      required
                      @change="getTransactions"
                  />
                </BInputGroup>
              </BFormGroup>
            </template>
            <template #head(location)="data">
              <BFormGroup>
                <BInputGroup prepend="Location">
                  <BFormInput
                      id="updateLocation"
                      v-model="transactionQuery.location"
                      type="text"
                      placeholder="Location"
                      required
                      @change="getTransactions"
                  />
                </BInputGroup>
              </BFormGroup>
            </template>
            <template #head(purchaseType)="data">
              <BFormGroup>
                <BInputGroup prepend="Type">
                  <BFormInput
                      id="updateType"
                      v-model="transactionQuery.type"
                      type="text"
                      placeholder="Type"
                      required
                      @change="getTransactions"
                  />
                </BInputGroup>
              </BFormGroup>
            </template>
            <template #head(categoryOverride)="data">
              <BFormGroup>
                <BInputGroup prepend="Category">
                  <BFormInput
                      id="updateCategory"
                      v-model="transactionQuery.category"
                      type="text"
                      placeholder="Category"
                      required
                      @change="getTransactions"
                  />
                </BInputGroup>
              </BFormGroup>
            </template>
            <template #head(amount)="data">
              <BFormGroup>
                <BInputGroup prepend="Amount">
                  <BFormInput
                      id="updateAmount"
                      v-model="transactionQuery.amount"
                      type="text"
                      placeholder="Amount"
                      required
                      @change="getTransactions"
                  />
                </BInputGroup>
              </BFormGroup>
            </template>
          </BTable>
          <BPagination
              v-model="currentPage"
              :total-rows="transactionList.length"
              :per-page="perPage"
              class="justify-content-center"
              first-number
              last-number
              :limit="5"
          />
        </BContainer>
      </BCard>

      <BCard>
        <BButton variant="warning" @click="openUpdateModal()" >Update Showing Transactions</BButton>
      </BCard>
    </div>
  </main>
</template>
