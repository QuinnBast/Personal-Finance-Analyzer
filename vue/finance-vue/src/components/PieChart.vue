<template>
  <Doughnut :data="chartData" :options="options" />
</template>

<script lang="ts">
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { getCategoryColor } from '@/utils/categoryColors';
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
            backgroundColor: Object.keys(this.valueMap).map(it => getCategoryColor(it)),
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