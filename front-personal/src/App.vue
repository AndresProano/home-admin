<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-container">
    <RouterView />
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background-color: #1a1a2e;
  color: #e0e0e0;
}
.app-container {
  max-width: 520px;
  margin: 0 auto;
  min-height: 100vh;
}
</style>
