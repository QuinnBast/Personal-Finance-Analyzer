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
import { getCategoryColor } from "@/utils/categoryColors.js";
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
          backgroundColor: this.sortValueMap().map((it) =>  getCategoryColor(it.label)),
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