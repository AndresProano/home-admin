<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import BarraInferior from '@/components/BarraInferior.vue'
import HojaMovimiento from '@/components/HojaMovimiento.vue'

const route = useRoute()
</script>

<template>
  <div class="app">
    <RouterView />
    <template v-if="route.meta.requiresAuth">
      <BarraInferior />
      <HojaMovimiento />
    </template>
  </div>
</template>

<style>
.app {
  max-width: 520px;
  margin: 0 auto;
  min-height: 100vh;
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
</style>
