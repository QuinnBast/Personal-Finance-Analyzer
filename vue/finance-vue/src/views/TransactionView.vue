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
const perPage = 30;
const currentPage = ref(1)
const monthsAgo = ref(2)

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

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    xAxes: {
      type: 'time',
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
      text: "Account History",
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

const chartData = ref({})

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

function formatChartData() {
  chartData.value = {
    labels: [],
    datasets: []
  }

  var categoryList = transactionList.value.map((it) => it.categoryOverride)
  var categories = [...new Set(categoryList)]

  categories.forEach((category) => {
    var currentTotal = 0
    var elements = transactionList.value
        .filter((transaction) => transaction.categoryOverride === category)
        .sort((a, b) => moment(a.date, "YYYY-MM-DDTHH:mm") - moment(b.date, "YYYY-MM-DDTHH:mm"))
        .map((transaction) => { return {x: moment(transaction.date, "YYYY-MM-DDTHH:mm"), y: transaction.amount }})
        .reduce((acc, curr) => {
            if(acc.some((element) => element.x.isSame(curr.x))) {
              acc.filter((it) => it.x.isSame(curr.x))[0].y += curr.y
            } else {
              acc.push(curr)
            }
            return acc
          }, [])
        .map((transaction) => {
          currentTotal += transaction.y
          return {x: transaction.x, y: currentTotal }
        })

    chartData.value.datasets.push({
      label: category,
      data: elements,
    })
  })
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
        <BDropdownItem @click="changeTimeRange(900)">All</BDropdownItem>
      </BDropdown>

      <BCard class="text-center m-3" :key="sumTransactions(true, false)">
        <h2>{{monthsAgo}} Month Summary</h2>
        <BContainer class="m-4" v-if="chartData.datasets?.length !== undefined && chartData.datasets.length > 0">
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
        <div v-if="chartData.datasets?.length !== undefined && chartData.datasets.length > 0">
          <Line :data="chartData" :options="chartOptions" style="width: 100%" />
        </div>
        <div v-else>
          <h1>No data</h1>
        </div>
      </BCard>

      <BCard class="text-center m-3" :key="sumTransactions(true, false)">
        <h2>Insights</h2>
        <BContainer class="m-4" v-if="chartData.datasets?.length !== undefined && chartData.datasets.length > 0">
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
        <BContainer v-if="chartData.datasets?.length !== undefined && chartData.datasets.length > 0">

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
