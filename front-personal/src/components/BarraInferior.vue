<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Icono from './Icono.vue'
import { useApp } from '@/composables/useApp'

const { abrirNuevo } = useApp()
</script>

<template>
  <nav class="barra-inferior" aria-label="Navegación principal">
    <span class="marca">Mis Finanzas</span>
    <RouterLink to="/finances" class="tab" active-class="activo">
      <Icono nombre="inicio" :tam="22" :grosor="2.2" /><span>Inicio</span>
    </RouterLink>
    <RouterLink to="/presupuestos" class="tab" active-class="activo">
      <Icono nombre="presupuestos" :tam="22" :grosor="2.2" /><span>Presupuestos</span>
    </RouterLink>
    <span class="centro">
      <button class="mas" aria-label="Nuevo movimiento" @click="abrirNuevo()">
        <Icono nombre="mas" :tam="26" :grosor="2.8" /><span class="mas-texto">Nuevo movimiento</span>
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
.marca, .mas-texto { display: none; }

@media (min-width: 900px) {
  .barra-inferior {
    position: sticky; top: 0; height: 100vh; max-width: none; margin: 0;
    border-top: none; border-right: var(--borde);
    display: flex; flex-direction: column; align-items: stretch; gap: 6px;
    padding: 28px 18px;
  }
  .marca { display: block; order: -2; font-family: var(--titulo); font-size: 22px; font-weight: 700; letter-spacing: -0.5px; padding: 0 6px 18px; }
  .centro { order: -1; margin-bottom: 18px; }
  .mas { width: 100%; height: 52px; margin-top: 0; gap: 8px; font: 700 15px var(--texto); }
  .mas-texto { display: inline; }
  .tab {
    flex-direction: row; justify-content: flex-start; gap: 12px; min-height: 48px; padding: 0 14px;
    font-size: 15px; border: 2px solid transparent; border-radius: 14px;
  }
  .tab:hover { background: var(--neutro); }
  .tab.activo { color: var(--tinta); background: var(--cielo); border-color: var(--tinta); }
}
</style>
