<script setup lang="ts">
import { ref, computed, watch } from 'vue'

/** Foto de la cuenta de Google; si no hay (o no carga), la inicial del nombre */
const props = withDefaults(defineProps<{ foto?: string | null; nombre?: string | null; tam?: number }>(), { tam: 44 })

const fallo = ref(false)
watch(() => props.foto, () => { fallo.value = false })
const inicial = computed(() => (props.nombre || '?').trim().charAt(0).toUpperCase())
</script>

<template>
  <span class="avatar" :style="{ width: tam + 'px', height: tam + 'px', fontSize: Math.round(tam * 0.42) + 'px' }">
    <img v-if="foto && !fallo" :src="foto" alt="" referrerpolicy="no-referrer" @error="fallo = true" />
    <template v-else>{{ inicial }}</template>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  border: var(--borde); border-radius: 50%; overflow: hidden; background: var(--amarillo);
  font-family: var(--titulo); font-weight: 700; color: var(--tinta);
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
