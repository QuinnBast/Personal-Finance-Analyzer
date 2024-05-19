<template>
  <Doughnut :data="chartData" :options="options" />
</template>

<script lang="ts">
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'vue-chartjs'

ChartJS.register(ArcElement, Tooltip, Legend)

export default {
  name: 'App',
  props: ["valueMap", "title"],
  setup(props) {
  },
  components: {
    Doughnut
  },
  data() {
    return {
      chartData: {
        labels: Object.keys(this.valueMap),
        datasets: [
          {
            backgroundColor: ['rgb(215 125 126)', '#00D8FF', '#DD1B16', '#82d9d9', 'rgb(171 122 214)', 'rgb(216 195 132)', 'rgb(160 145 106)', 'rgb(129 218 153)', 'rgb(105 160 119)' ],
            data: Object.keys(this.valueMap).map(it => this.valueMap[it]),
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
}
</script>