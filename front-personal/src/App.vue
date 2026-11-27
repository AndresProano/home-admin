<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import BarraInferior from '@/components/BarraInferior.vue'
import HojaMovimiento from '@/components/HojaMovimiento.vue'

const route = useRoute()
</script>

<template>
  <div class="app" :class="{ 'con-menu': route.meta.requiresAuth }">
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
@media (min-width: 900px) {
  .app.con-menu {
    max-width: none; margin: 0;
    display: grid; grid-template-columns: 248px minmax(0, 1fr); align-items: start;
  }
  .app.con-menu > .pagina { grid-column: 2; grid-row: 1; }
  .app.con-menu > .barra-inferior { grid-column: 1; grid-row: 1; }
}
</style>
