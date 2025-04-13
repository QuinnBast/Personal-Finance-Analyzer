<script setup>
import BarChart from "@/components/BarChart.vue";
import {ref, reactive} from "vue";
import moment from 'moment';
import {BTable, useToast} from 'bootstrap-vue-next';
import zoomPlugin from 'chartjs-plugin-zoom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js'
import autocolors from 'chartjs-plugin-autocolors';
import 'chartjs-adapter-moment';
import {Bar, Line} from 'vue-chartjs'
import axios from 'axios';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    autocolors,
    zoomPlugin
)

const shouldShow = ref(false)
const {show} = useToast()

const sortFields = [
  {key: 'date', sortable: true},
  {key: 'vendor', sortable: true},
  {key: 'account', sortable: true},
  {key: 'location', sortable: true},
  {key: 'purchaseType', sortable: true},
  {key: 'categoryOverride', sortable: true},
  {key: 'amount', sortable: true},
]

const transactionList = reactive(ref([]));
const perPage = 20;
const currentPage = ref(1)
const monthsAgo = ref(2)


const monthlyCategoryList = reactive(ref([]));
const categoryPerPage = 20;
const categoryCurrentPage = ref(1)

const filterText = ref("")

function categoryListToTableList() {
  // Have: [{month, monthlyTotal, Category}]
  // Need: [{month, c1Total, c2Total, c3Total, ....}]

  var months = monthlyCategoryList.value
      .map((it) => it.month)
  var uniqueMonths = [...new Set(months)]

  var rows = uniqueMonths.map((month) => {
    var monthlyTotals = monthlyCategoryList.value.filter((it) => it.month === month)

    var monthlyTotal = monthlyTotals.reduce((acc, value) => acc + value.value, 0)

    // Need to transform each "category" into a key, and then sum it.
    return monthlyTotals.reduce((acc, value) => {
      acc[value.category] = Math.round(value.value * 100) / 100
      return acc
    }, { month: month, total: Math.round(monthlyTotal * 100) / 100 })
  })

  rows.sort((a, b) => moment(a.month, "MMMM YYYY") - moment(b.month, "MMMM YYYY"))

  return rows
}

function getTransactions() {
  return axios.get(`http://localhost:9000/transactions?monthsAgo=` + monthsAgo.value).then((success) => {
    show?.({ props: {title: "Success", body: "Found " + success.data.transactions.length + " transactions within the past " + monthsAgo.value + " months.", variant: "success", pos: "bottom-right" }})
    transactionList.value = success.data.transactions;
    formatChartData()
  }, (failure) => {
    show?.({ props: {title: "Failed to get transactions", body: failure.message, variant: "danger", pos: "bottom-right" }})
  })
}

function changeTimeRange(newMonthsAgo) {
  monthsAgo.value = newMonthsAgo;
  getTransactions()
}

const categoryChartData = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
    },
    y: {
      grid: {
        lineWidth: function(context) {
          if(context.tick.value === 0) {
            return 3
          }
          return 1
        },
        color: function(context) {
          if(context.tick.value === 0) {
            return "#000000"
          }
          return "#717171"
        }
      }
    }
  },
  plugins: {
    autocolors,
    title: {
      display: true,
      fullSize: true,
      font: {
        size: 36
      },
      text: "Monthly Sum",
    },
    zoom: {
      pan: {
        enabled: true,
        mode: 'xy',
      },
      limits: {
        // axis limits
      },
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true
        },
        mode: 'xy',
      }
    }
  }
}

const transactionChartData = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      time: {
        displayFormats: {
          quarter: 'MMM YYYY'
        }
      }
    },
    y: {
      grid: {
        lineWidth: function(context) {
          if(context.tick.value === 0) {
            return 3
          }
          return 1
        },
        color: function(context) {
          if(context.tick.value === 0) {
            return "#000000"
          }
          return "#717171"
        }
      }
    }
  },
  plugins: {
    autocolors,
    title: {
      display: true,
      fullSize: true,
      font: {
        size: 36
      },
    },
    tooltip: {
      callbacks: {
        afterBody: function(context) {
          var transaction = context[0].raw.transaction
          return `Vendor: ${transaction.vendor}\n` +
            `Amount: ${transaction.amount}\n` +
            `Category: ${transaction.categoryOverride}\n`
        }
      }
    },
    zoom: {
      pan: {
        enabled: true,
        mode: 'xy',
      },
      limits: {
        // axis limits
      },
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true
        },
        mode: 'xy',
      }
    }
  }
}

const categorySpendingPerMonthChartData = ref({})
const allTransactionChartData = ref({})

getTransactions()

function sumTransactions(income = true, expenses = true, ignoreInvestments = false) {
  var total = 0
  transactionList.value.forEach((transaction) => {
    // Corrections should only apply to expenses to reduce them.
    if(transaction.purchaseType === "Correction") {
      if(expenses) {
        total += transaction.amount
      }
    } else {
      if ((expenses && transaction.amount < 0) || (income && transaction.amount > 0)) {
        if (ignoreInvestments) {
          if (transaction.categoryOverride !== "Investment") {
            total += transaction.amount
          }
        } else {
          total += transaction.amount
        }
      }
    }
  })
  return Math.round(total * 100) / 100
}

function sumTransactionsByField(field, income = true, expenses = true) {
  var categoryTotals = {}

  function addToCategoryTotal(transaction) {
    var categoryName = transaction[field]

    if(categoryName === "" || categoryName === undefined) {
      categoryName = "Unknown"
    }

    if (categoryTotals[categoryName] === undefined) {
      categoryTotals[categoryName] = transaction.amount;
    } else {
      categoryTotals[categoryName] += transaction.amount;
    }
  }

  var shouldCountAsExpense = (transaction) => expenses && transaction.amount < 0
  var shouldCountAsIncome = (transaction) => income && transaction.amount > 0

  transactionList.value.forEach((transaction) => {
    // If the transaction is a Correction we need to:
    // Consider it in expenses - even if we made money from it.
    // But not consider it in income.
    if(transaction.purchaseType === "Correction") {
      if(expenses) {
        addToCategoryTotal(transaction)
      }
    } else {
      if(shouldCountAsExpense(transaction) || shouldCountAsIncome(transaction)) {
        addToCategoryTotal(transaction)
      }
    }


  });

  return categoryTotals;
}

function getCumulativeTransactionHistory() {
  var currentBalance = 0
  var data = transactionList.value
      .sort((a, b) => b.amount - a.amount)
      .sort((a, b) => moment(a.date, "YYYY-MM-DDTHH:mm") - moment(b.date, "YYYY-MM-DDTHH:mm"))
      .map((transaction) => {
        currentBalance = currentBalance + transaction.amount
        return {
          x: moment(transaction.date, "YYYY-MM-DDTHH:mm"),
          y: currentBalance,
          transaction: transaction
        }
      })

  return [{
    label: "Account",
    data: data,
  }]
}

function getMonthlySpendingByCategory() {
  monthlyCategoryList.value = []
  // Get months
  var monthsAsList = transactionList.value
      .map((value) => moment(value.date, "YYYY-MM-DDTHH:mm"))
      .sort((a, b) => a - b)
      .map((value) => value.format("MMMM YYYY"))

  // Filter unique values
  var months = [...new Set(monthsAsList)]

  // Get unique category names
  var categoryList = transactionList.value.map((it) => it.categoryOverride)
  var categories = [...new Set(categoryList)]
      .map((categoryName) => {
        return {
          label: categoryName,
          data: [],
        }
      })

  categories.forEach((category) => {

    var transactionsInCategory = transactionList.value
        .filter((transaction) => transaction.categoryOverride === category.label)

    // Also loop each month...
    months.forEach((month) => {
      var monthlyTotal = transactionsInCategory
          .filter((transaction) => moment(transaction.date, "YYYY-MM-DDTHH:mm").format("MMMM YYYY") === month)
          .reduce((acc, value) => acc + value.amount, 0)

      category.data.push({x: moment(month, "MMMM YYYY"), y: monthlyTotal})

      monthlyCategoryList.value.push({
        category: category.label,
        month: month,
        value: monthlyTotal,
      })
    })
  })

  return categories
}

function filterTable(item, filter) {
  return item.month.startsWith(filter)
}

function sumColumn(items, field) {
  return items.reduce((acc, item) => acc + item[field.key], 0)
}

function formatChartData() {
  // Populate chart data.
  categorySpendingPerMonthChartData.value = {
    labels: [],
    datasets: getMonthlySpendingByCategory()
  }

  allTransactionChartData.value = {
    labels: [],
    datasets: getCumulativeTransactionHistory()
  }
}
</script>

<template>
  <main>
    <div>
      <BDropdown v-model="shouldShow" text="TimeScale" class="m-3">
        <BDropdownItem @click="changeTimeRange(1)">1 Month</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(3)">3 Months</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(6)">6 Months</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(12)">1 Year</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(24)">2 Years</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(36)">3 Years</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(48)">4 Years</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(60)">5 Years</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(600)">10 Years</BDropdownItem>
        <BDropdownItem @click="changeTimeRange(900)">All</BDropdownItem>
      </BDropdown>

      <BCard class="text-center m-3" :key="sumTransactions(true, false)">
        <h2>{{monthsAgo}} Month Summary</h2>
        <BContainer class="m-4" v-if="categorySpendingPerMonthChartData.datasets?.length !== undefined && categorySpendingPerMonthChartData.datasets.length > 0">
          <h3><b>Total:</b> ${{ sumTransactions() }}</h3>
          <h3><b>Total (w/o Investments):</b> ${{ sumTransactions(true, true, true) }}</h3>
          <BRow style="height: 400px">
            <BCol>
              <PieChart :valueMap="sumTransactionsByField('categoryOverride', true, false)" :title="'Income: $' + sumTransactions(true, false)"/>
            </BCol>
            <BCol>
              <PieChart :valueMap="sumTransactionsByField('categoryOverride', false)" :title="'Expenses: $' + sumTransactions(false, true)"/>
            </BCol>
          </BRow>
        </BContainer>
        <BContainer v-else>
          <h1>No data</h1>
        </BContainer>
      </BCard>

      <BCard class="text-center m-3" :key="sumTransactions(true, false)" >
        <h2>{{monthsAgo}} Month Total</h2>
        <div v-if="allTransactionChartData.datasets?.length !== undefined && allTransactionChartData.datasets.length > 0">
          <Line :data="allTransactionChartData" :options="transactionChartData" style="width: 100%" />
        </div>
        <div v-else>
          <h1>No data</h1>
        </div>
      </BCard>

      <BCard class="text-center m-3" :key="sumTransactions(true, false)" >
        <div v-if="categorySpendingPerMonthChartData.datasets?.length !== undefined && categorySpendingPerMonthChartData.datasets.length > 0">
          <Line :data="categorySpendingPerMonthChartData" :options="categoryChartData" style="width: 100%" />
        </div>
        <div v-else>
          <h1>No data</h1>
        </div>
      </BCard>

      <BCard class="text-center m-3" >
        <h2>Category Totals</h2>

        <BFormGroup
            class="p-2 m-2"
            id="input-vendor-regex"
            label-for="filterText"
        >
          <BInputGroup prepend="Month Filter">
            <BFormInput
                id="filterText"
                v-model="filterText"
                type="text"
                placeholder="Month Filter"
            />
          </BInputGroup>
        </BFormGroup>

        <BContainer v-if="categoryListToTableList().length !== undefined && categoryListToTableList().length > 0">

          <BPagination
              v-model="categoryCurrentPage"
              :total-rows="categoryListToTableList().length"
              :per-page="categoryPerPage"
              class="justify-content-center"
              first-number
              last-number
              :limit="5"
          />
          <BTable
              :key="listSize"
              :sort-by="[{key: 'date', order: 'desc'}]"
              :items="categoryListToTableList()"
              :per-page="categoryPerPage"
              :current-page="categoryCurrentPage"
              :filterable="['month']"
              :filter="filterText"
              :filter-function="filterTable"
              emptyText="No data"
              striped
              small
              bordered
              responsive
          >
            <template #custom-foot="ctx">
              <BTr>
                <BTh v-for="field in ctx.fields">
                  <p v-if="field.key === 'month'">
                    TOTAL:
                  </p>
                  <p v-else>
                    {{ Math.round(sumColumn(ctx.items, field) * 100) / 100 }}
                  </p>
                </BTh>
              </BTr>
            </template>
          </BTable>
          <BPagination
              v-model="categoryCurrentPage"
              :total-rows="categoryListToTableList().length"
              :per-page="categoryPerPage"
              class="justify-content-center"
              first-number
              last-number
              :limit="5"
          />
        </BContainer>
        <BContainer v-else>
          <h1>No data</h1>
        </BContainer>
      </BCard>

      <BCard class="text-center m-3" :key="sumTransactions(true, false)">
        <h2>Insights</h2>
        <BContainer class="m-4" v-if="categorySpendingPerMonthChartData.datasets?.length !== undefined && categorySpendingPerMonthChartData.datasets.length > 0">
          <BRow style="height: 400px">
            <BCol>
              <PieChart :valueMap="sumTransactionsByField('location', false)" title="Location"/>
            </BCol>
            <BCol>
              <PieChart :valueMap="sumTransactionsByField('account', false)" title="Account"/>
            </BCol>
          </BRow>
          <BRow>
            <BarChart :valueMap="sumTransactionsByField('vendor', false)" title="Spending By Vendor"/>
          </BRow>

        </BContainer>
        <BContainer v-else>
          <h1>No data</h1>
        </BContainer>
      </BCard>

      <BCard class="text-center m-3" >
        <h2>Transaction History</h2>
        <BContainer v-if="categorySpendingPerMonthChartData.datasets?.length !== undefined && categorySpendingPerMonthChartData.datasets.length > 0">

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
              :key="listSize"
              :sort-by="[{key: 'date', order: 'desc'}]"
              :items="transactionList"
              :fields="sortFields"
              :per-page="perPage"
              :current-page="currentPage"
              emptyText="No data"
          />
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
        <BContainer v-else>
          <h1>No data</h1>
        </BContainer>
      </BCard>
    </div>
  </main>
</template>
