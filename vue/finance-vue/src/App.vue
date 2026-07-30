<script setup>
import { RouterView } from 'vue-router'
import Navigation from '@/components/Navigation.vue'
</script>

<template>
  <div class="app-shell">
    <Navigation />
    <BToastOrchestrator />

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
/*
 * The starter styles that used to live here (`header { max-height: 100vh }`,
 * `nav a { border-left: 1px solid … }`, `nav a.router-link-exact-active`) were
 * left over from the Vue scaffold and targeted markup this app no longer has.
 * The header owns its own styling now.
 */
.app-shell {
  min-height: 100vh;
}

.app-main {
  padding-top: 1.25rem;
}
</style>
