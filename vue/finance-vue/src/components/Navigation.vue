<script setup>

</script>

<template>
  <BNav pills class="p-4 custom-nav">
    <BNavItem href="/">Home</BNavItem>
    <BNavItem href="/categories">Category List</BNavItem>
    <BNavItem href="/import"><BButton variant="success">Import</BButton></BNavItem>
  </BNav>
</template>

<style scoped>
.custom-nav {
  background-color: rgb(225,225,225);
  border-radius: 10px;
}
</style>