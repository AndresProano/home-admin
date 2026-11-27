<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Avatar from '@/components/Avatar.vue'
import Icono from '@/components/Icono.vue'
import VincularPareja from '@/components/VincularPareja.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'

/* Selector global "Mío / Nuestro" (arriba a la derecha en Inicio, Movimientos y Presupuestos).
   Cambia toda la app a la vez. Sin pareja vinculada, abre la vinculación. */

const TEXTO = { personal: 'Mío', shared: 'Nuestro' }

const { user } = useAuth()
const { getDisplayName } = useFinances()
const { lista, compartido, tienePareja, parejaId, fotoDe } = useApp()

const vinculando = ref(false)
const yo = computed(() => user.value?.id ?? '')

const tocar = () => {
  if (!tienePareja.value) { vinculando.value = true; return }
  lista.value = compartido.value ? 'personal' : 'shared'
}

// Apenas quedan vinculados, se cierra la hoja y pasa a "Nuestro"
watch(tienePareja, v => { if (v && vinculando.value) { vinculando.value = false; lista.value = 'shared' } })
</script>

<template>
  <button class="selector" :class="{ on: compartido }" :aria-pressed="compartido"
    :aria-label="compartido ? 'Viendo lo de los dos. Tocar para ver solo lo tuyo' : 'Viendo lo tuyo. Tocar para ver lo de los dos'"
    @click="tocar">
    <span class="caras">
      <Avatar :foto="fotoDe(yo)" :nombre="getDisplayName(yo)" :tam="32" />
      <Avatar v-if="compartido && parejaId" class="pareja" :foto="fotoDe(parejaId)" :nombre="getDisplayName(parejaId)" :tam="32" />
    </span>
    <span class="texto">{{ compartido ? TEXTO.shared : TEXTO.personal }}</span>
  </button>

  <Teleport to="body">
    <div v-if="vinculando" class="velo" @click.self="vinculando = false">
      <div class="hoja">
        <div class="agarre"></div>
        <div class="cabecera">
          <h2 class="titulo-pagina" style="font-size: 24px">Finanzas en pareja</h2>
          <button type="button" class="btn-icono" aria-label="Cerrar" @click="vinculando = false"><Icono nombre="cerrar" /></button>
        </div>
        <p style="margin: 0">Vincúlate con tu pareja para ver y armar juntos lo de los dos: presupuestos compartidos y gastos "de los dos". Cada uno entra con su cuenta de Google.</p>
        <VincularPareja />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.selector {
  display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto;
  border: var(--borde); border-radius: 999px; background: var(--fondo);
  padding: 3px 12px 3px 3px; min-height: 44px; cursor: pointer;
  font: 700 14px var(--texto); color: var(--tinta);
  transition: background .2s;
}
.selector.on { background: var(--lila); }
.selector:active { transform: translate(1px, 1px); }
.caras { display: inline-flex; align-items: center; }
.caras :deep(.pareja) { margin-left: -12px; background: var(--lila); }
@media (prefers-reduced-motion: reduce) { .selector { transition: none; } }
</style>
