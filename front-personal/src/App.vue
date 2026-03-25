<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-container">
    <RouterView />
  </div>
</template>

<style>
/* Estilos globales rápidos para móvil */
body {
  margin: 0;
  font-family: sans-serif;
  background-color: #f4f4f9;
}
.app-container {
  max-width: 500px; /* Tamaño ideal para móvil en pantalla de PC */
  margin: 0 auto;
  min-height: 100vh;
}
</style>