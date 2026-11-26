<script setup lang="ts">
import { computed } from 'vue'

/** Íconos de línea (trazos) por nombre de categoría o de interfaz */
const ICONOS: Record<string, string[]> = {
  comida: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7'],
  supermercado: ['M2 2h2l2.7 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L22 7H5.1', 'M9 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0z', 'M20 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0z'],
  transporte: ['M5 17h14v-5l-2-5H7l-2 5z', 'M5 12h14', 'M9 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z', 'M18 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z'],
  servicios: ['M13 2L3 14h9l-1 8 10-12h-9z'],
  arriendo: ['M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  entretenimiento: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z', 'M14 5v14'],
  salidas: ['M8 22h8', 'M12 15v7', 'M5 3h14l-1 7a6 6 0 0 1-12 0z'],
  salud: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.6 1-1.1a5.5 5.5 0 0 0 0-7.8z'],
  compras: ['M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  educacion: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
  suscripciones: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
  otros: ['M21 8l-9-5-9 5v8l9 5 9-5z', 'M3 8l9 5 9-5', 'M12 13v8'],
  total: ['M20 7H5a2 2 0 0 1 0-4h13v4', 'M3 5v14a2 2 0 0 0 2 2h15V7', 'M16 14h.01'],
  'sin clasificar': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8v4', 'M12 16h.01'],
  ingreso: ['M12 19V5', 'M5 12l7-7 7 7'],
  // interfaz
  inicio: ['M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  presupuestos: ['M21 12A9 9 0 1 1 12 3v9z', 'M15 3.5A9 9 0 0 1 20.5 9H15z'],
  mas: ['M12 5v14', 'M5 12h14'],
  movimientos: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  ajustes: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  flecha: ['M5 12h14', 'M13 6l6 6-6 6'],
  atras: ['M15 6l-6 6 6 6'],
  adelante: ['M9 6l6 6-6 6'],
  buscar: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-3.5-3.5'],
  cerrar: ['M18 6L6 18', 'M6 6l12 12'],
  salir: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  mic: ['M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v1a7 7 0 0 1-14 0v-1', 'M12 18v4'],
  pareja: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21v-1a6 6 0 0 1 12 0v1', 'M16 3.1a4 4 0 0 1 0 7.8', 'M22 21v-1a6 6 0 0 0-4-5.7'],
  copiar: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  banco: ['M3 21h18', 'M3 10h18', 'M5 6l7-3 7 3', 'M4 10v11', 'M20 10v11', 'M8 14v3', 'M12 14v3', 'M16 14v3'],
  efectivo: ['M2 6h20v12H2z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 12h.01', 'M18 12h.01'],
  meta: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  inversion: ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  tarjeta: ['M2 5h20v14H2z', 'M2 10h20'],
  transferencia: ['M17 3l4 4-4 4', 'M21 7H7', 'M7 21l-4-4 4-4', 'M3 17h14'],
  editar: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  comisiones: ['M19 5L5 19', 'M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
}

const props = withDefaults(defineProps<{ nombre: string; tam?: number; grosor?: number }>(), { tam: 20, grosor: 2 })

const clave = computed(() => props.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
const trazos = computed(() => ICONOS[clave.value] ?? ICONOS.otros!)
</script>

<template>
  <svg :width="tam" :height="tam" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    :stroke-width="grosor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(d, i) in trazos" :key="i" :d="d" />
  </svg>
</template>
