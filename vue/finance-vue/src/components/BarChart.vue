<template>
  <Bar
      :options="chartOptions"
      :data="chartData"
      style="width: 100%"
  />
</template>

<script>
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js'
import autocolors from 'chartjs-plugin-autocolors';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, autocolors)

export default {
  name: 'BarChart',
  props: {
    valueMap: {
      type: Object,
      default: {}
    },
    title: {
      type: String,
      default: ""
    },
    limit: {
      type: Number,
      default: 30
    }
  },
  setup(props) {
  },
  components: { Bar },
  data() {
    return {
      chartData: {
        labels: this.sortValueMap().map((it) => it.label),
        datasets: [ {
          backgroundColor: ['rgb(215 125 126)', '#00D8FF', '#DD1B16', '#82d9d9', 'rgb(171 122 214)', 'rgb(216 195 132)', 'rgb(160 145 106)', 'rgb(129 218 153)', 'rgb(105 160 119)' ],
          data: this.sortValueMap().map((it) => it.value),
        }]
      },
      chartOptions: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            fullSize: true,
            font: {
              size: 36
            },
            text: this.title,
          }
        }
      }
    }
  },
  methods: {
    sortValueMap() {
      var array = Object.keys(this.valueMap)
          .map(it => {
            return {label: it, value: Math.abs(this.valueMap[it])}
          })
          .sort((a, b) => b.value - a.value)
      array.length = Math.min(array.length, this.limit)
      return array;
    }
  }
}
</script>