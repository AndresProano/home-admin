<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'

/* Vincular pareja: invitar con código, unirse con el código del otro o cancelar la invitación.
   Se usa en Ajustes y en Presupuestos → "Con mi pareja". */

const { user } = useAuth()
const { partner, createPartnerInvite, joinPartner, cancelarInvitacion } = useFinances()
const { cargar } = useApp()

const modo = ref<'invitar' | 'unirme'>('invitar')
const codigo = ref('')
const error = ref('')
const ocupado = ref(false)
const copiado = ref(false)

const correr = async (fn: () => Promise<unknown>) => {
  error.value = ''
  ocupado.value = true
  try { await fn() } catch (e: any) { error.value = e.message ?? 'No se pudo' } finally { ocupado.value = false }
}

const invitar = () => correr(async () => { if (user.value) await createPartnerInvite(user.value.id) })
const unirme = () => correr(async () => {
  if (!codigo.value.trim()) { error.value = 'Escribe el código'; return }
  await joinPartner(codigo.value.trim())
  codigo.value = ''
  await cargar(true)
})
const cancelar = () => correr(async () => { await cancelarInvitacion(); modo.value = 'invitar' })

const mensaje = (c: string) =>
  `Únete a nuestras finanzas en pareja: entra a ${window.location.origin}${import.meta.env.BASE_URL} con Google, ve a Ajustes → Finanzas en pareja → "Tengo un código" y pon: ${c}`

const compartir = async (c: string) => {
  const texto = mensaje(c)
  try {
    if (navigator.share) { await navigator.share({ text: texto }); return }
  } catch { /* canceló o no se pudo: copiar */ }
  try { await navigator.clipboard.writeText(texto); copiado.value = true; setTimeout(() => { copiado.value = false }, 1500) } catch { /* sin permiso */ }
}
</script>

<template>
  <div class="vincular">
    <!-- Ya generé un código: lo comparto, o uso el de mi pareja -->
    <template v-if="partner && partner.status === 'pending' && modo === 'invitar'">
      <p style="margin: 0">Pásale este código a tu pareja. Cuando lo ponga en su app, quedan vinculados:</p>
      <button class="btn negro codigo" @click="compartir(partner.invite_code)">
        <span class="cifra" style="font-size: 22px; letter-spacing: 2px">{{ partner.invite_code }}</span>
        <span style="font-size: 13px">{{ copiado ? 'Copiado' : 'Enviar' }}</span>
      </button>
      <div class="fila-botones">
        <button class="btn" :disabled="ocupado" @click="cargar(true)">Ya lo puso</button>
        <button class="btn" @click="modo = 'unirme'">Tengo su código</button>
      </div>
      <button class="enlace" :disabled="ocupado" @click="cancelar">Cancelar este código</button>
    </template>

    <template v-else>
      <div class="seg">
        <button :class="{ on: modo === 'invitar' }" @click="modo = 'invitar'">Invitar</button>
        <button :class="{ on: modo === 'unirme' }" @click="modo = 'unirme'">Tengo un código</button>
      </div>
      <form v-if="modo === 'unirme'" class="form" @submit.prevent="unirme">
        <label class="campo">Código de tu pareja<input v-model="codigo" type="text" autocapitalize="none" autocomplete="off" placeholder="Ej: a1b2c3d4" /></label>
        <button class="btn primario" type="submit" :disabled="ocupado">Unirme</button>
      </form>
      <template v-else>
        <p style="margin: 0">Genera un código y pásaselo a tu pareja. Solo uno de los dos lo genera; el otro lo pone en "Tengo un código".</p>
        <button class="btn primario" :disabled="ocupado" @click="invitar">Generar código</button>
      </template>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.vincular { display: flex; flex-direction: column; gap: 12px; }
.form { display: flex; flex-direction: column; gap: 10px; }
.codigo { justify-content: space-between; }
.fila-botones { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.enlace { background: none; border: 0; font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; color: var(--tinta); align-self: center; }
</style>
