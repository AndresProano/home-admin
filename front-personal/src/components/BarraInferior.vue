<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Icono from './Icono.vue'
import { useApp } from '@/composables/useApp'

const { abrirNuevo } = useApp()
</script>

<template>
  <nav class="barra-inferior" aria-label="Navegación principal">
    <RouterLink to="/finances" class="tab" active-class="activo">
      <Icono nombre="inicio" :tam="22" :grosor="2.2" /><span>Inicio</span>
    </RouterLink>
    <RouterLink to="/presupuestos" class="tab" active-class="activo">
      <Icono nombre="presupuestos" :tam="22" :grosor="2.2" /><span>Presupuestos</span>
    </RouterLink>
    <span class="centro">
      <button class="mas" aria-label="Nuevo movimiento" @click="abrirNuevo()">
        <Icono nombre="mas" :tam="26" :grosor="2.8" />
      </button>
    </span>
    <RouterLink to="/movimientos" class="tab" active-class="activo">
      <Icono nombre="movimientos" :tam="22" :grosor="2.2" /><span>Movimientos</span>
    </RouterLink>
    <RouterLink to="/ajustes" class="tab" active-class="activo">
      <Icono nombre="ajustes" :tam="22" :grosor="2.2" /><span>Ajustes</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.barra-inferior {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  max-width: 520px; margin: 0 auto;
  background: var(--fondo); border-top: var(--borde);
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: start;
  padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
}
.tab {
  display: flex; flex-direction: column; align-items: center; gap: 3px; min-height: 48px; justify-content: center;
  font-size: 11px; font-weight: 600; text-decoration: none; color: var(--tinta);
}
.tab.activo { color: var(--azul); font-weight: 800; }
.centro { display: flex; justify-content: center; }
.mas {
  width: 56px; height: 56px; margin-top: -18px; border-radius: 16px; border: var(--borde);
  background: var(--amarillo); color: var(--tinta); box-shadow: 3px 3px 0 var(--tinta);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.mas:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--tinta); }
</style>
