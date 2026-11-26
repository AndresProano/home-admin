<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Icono from '@/components/Icono.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'
import { dinero } from '@/lib/fechas'
import { CATEGORIAS } from '@/lib/categorias'

const router = useRouter()
const { user, signOut } = useAuth()
const { accounts, partner, apiKey, addAccount, removeAccount, createPartnerInvite, joinPartner, removePartner,
  generateApiKey, getDisplayName } = useFinances()
const { cargar, olvidarCarga, parejaId, tienePareja, nombreDe, esMio } = useApp()

onMounted(() => cargar())

const nombre = computed(() => user.value ? getDisplayName(user.value.id) : '')

/* Cuentas */
const formCuenta = ref(false)
const cuentaNombre = ref('')
const cuentaSaldo = ref<number | null>(null)
const cuentaCompartida = ref(false)
const misCuentas = computed(() => accounts.value.filter(a => !a.is_shared))
const compartidas = computed(() => accounts.value.filter(a => a.is_shared))
const agregarCuenta = async () => {
  if (!cuentaNombre.value.trim() || !user.value) return
  await addAccount(user.value.id, cuentaNombre.value.trim(), Number(cuentaSaldo.value || 0), cuentaCompartida.value)
  cuentaNombre.value = ''; cuentaSaldo.value = null; cuentaCompartida.value = false; formCuenta.value = false
}
const borrarCuenta = async (id: string, nombre: string) => {
  if (confirm(`¿Borrar la cuenta "${nombre}"? Los movimientos se quedan, solo pierden la cuenta.`)) await removeAccount(id)
}

/* Pareja */
const modoPareja = ref<'unirme' | 'invitar'>('unirme')
const codigo = ref('')
const errorPareja = ref('')
const invitar = async () => {
  errorPareja.value = ''
  if (!user.value) return
  try { await createPartnerInvite(user.value.id) } catch (e: any) { errorPareja.value = e.message }
}
const unirme = async () => {
  errorPareja.value = ''
  if (!codigo.value.trim()) return
  try { await joinPartner(codigo.value.trim()); await cargar(true) } catch (e: any) { errorPareja.value = e.message }
}
const desvincular = async () => {
  if (confirm('¿Desvincular a tu pareja? Los presupuestos compartidos dejarán de verse.')) await removePartner()
}

/* Atajo */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const urlAtajo = `${supabaseUrl}/rest/v1/rpc/add_expense_via_api_key`
const urlApp = `${window.location.origin}${import.meta.env.BASE_URL}finances?clasificar=1`
const menu = [...CATEGORIAS.map(c => c.nombre), 'Después'].join(', ')
const copiado = ref('')
const copiar = async (texto: string | null | undefined, que: string) => {
  if (!texto) return
  try { await navigator.clipboard.writeText(texto); copiado.value = que; setTimeout(() => { copiado.value = '' }, 1500) } catch { /* sin permiso */ }
}
const generarClave = async () => { if (user.value) await generateApiKey(user.value.id) }

const salir = async () => {
  await signOut()
  olvidarCarga()
  router.push('/')
}
</script>

<template>
  <main class="pagina">
    <header class="cabecera">
      <h1 class="titulo-pagina">Ajustes</h1>
    </header>

    <!-- Cuentas -->
    <section class="bloque seccion">
      <div class="cabecera" style="min-height: 0">
        <h2 class="subtitulo" style="margin: 0">Cuentas</h2>
        <button class="btn-icono amarillo" aria-label="Agregar cuenta" @click="formCuenta = !formCuenta"><Icono nombre="mas" :grosor="2.6" /></button>
      </div>
      <form v-if="formCuenta" class="form" @submit.prevent="agregarCuenta">
        <label class="campo">Nombre<input v-model="cuentaNombre" type="text" placeholder="Ej: Pichincha" required /></label>
        <label class="campo">Saldo de hoy ($)<input v-model.number="cuentaSaldo" type="number" step="0.01" inputmode="decimal" placeholder="0,00" /></label>
        <label v-if="tienePareja" class="check"><input v-model="cuentaCompartida" type="checkbox" /> Es una cuenta compartida con mi pareja</label>
        <button class="btn primario" type="submit">Agregar cuenta</button>
      </form>
      <div v-for="a in [...misCuentas, ...compartidas]" :key="a.id" class="fila-item">
        <span class="mov-info"><strong>{{ a.name }}</strong><span>{{ a.is_shared ? `Compartida${esMio(a.owner_id) ? '' : ' · ' + nombreDe(a.owner_id)}` : 'Personal' }}</span></span>
        <span class="cifra" :class="{ rojo: Number(a.balance) < 0 }">${{ dinero(Number(a.balance)) }}</span>
        <button v-if="esMio(a.owner_id)" class="btn-icono" :aria-label="`Borrar ${a.name}`" @click="borrarCuenta(a.id, a.name)"><Icono nombre="cerrar" :tam="18" /></button>
      </div>
      <p v-if="!accounts.length" class="muted" style="margin: 0">Agrega tus cuentas con el saldo de hoy; los gastos que les asignes se descuentan solos.</p>
    </section>

    <!-- Pareja -->
    <section class="bloque seccion" style="background: var(--lila)">
      <h2 class="subtitulo" style="margin: 0">Finanzas en pareja</h2>
      <template v-if="partner && partner.status === 'active' && parejaId">
        <p style="margin: 0">Vinculado con <strong>{{ getDisplayName(parejaId) }}</strong>. Pueden armar presupuestos compartidos y marcar gastos como "de los dos".</p>
        <button class="btn peligro" @click="desvincular">Desvincular</button>
      </template>
      <template v-else-if="partner && partner.status === 'pending'">
        <p style="margin: 0">Comparte este código con tu pareja para que lo ponga en "Unirme":</p>
        <button class="btn negro codigo" @click="copiar(partner.invite_code, 'codigo')">
          <span class="cifra" style="font-size: 22px; letter-spacing: 2px">{{ partner.invite_code }}</span>
          <span style="font-size: 13px">{{ copiado === 'codigo' ? 'Copiado' : 'Copiar' }}</span>
        </button>
      </template>
      <template v-else>
        <div class="seg">
          <button :class="{ on: modoPareja === 'unirme' }" @click="modoPareja = 'unirme'">Unirme</button>
          <button :class="{ on: modoPareja === 'invitar' }" @click="modoPareja = 'invitar'">Invitar</button>
        </div>
        <form v-if="modoPareja === 'unirme'" class="form" @submit.prevent="unirme">
          <label class="campo">Código de tu pareja<input v-model="codigo" type="text" autocapitalize="none" placeholder="Ej: a1b2c3d4" /></label>
          <button class="btn primario" type="submit">Unirme</button>
        </form>
        <template v-else>
          <p style="margin: 0">Genera un código y compártelo con tu pareja.</p>
          <button class="btn primario" @click="invitar">Generar código</button>
        </template>
        <p v-if="errorPareja" class="error">{{ errorPareja }}</p>
      </template>
    </section>

    <!-- Atajo -->
    <section class="bloque seccion" style="background: var(--cielo)">
      <h2 class="subtitulo" style="margin: 0">Atajo de iPhone (Apple Pay)</h2>
      <p style="margin: 0">Cada vez que pagas con Apple Pay, el atajo registra el gasto, te pregunta en qué fue y te avisa cuánto te queda.</p>
      <template v-if="apiKey">
        <div class="clave">
          <span class="muted" style="color: var(--tinta)">Tu API key (no la compartas)</span>
          <button class="btn" @click="copiar(apiKey, 'clave')"><code>{{ apiKey.slice(0, 8) }}…{{ apiKey.slice(-4) }}</code> {{ copiado === 'clave' ? 'Copiada' : 'Copiar' }}</button>
        </div>
        <ol class="pasos">
          <li>App <b>Atajos</b> → <b>Automatización</b> → <b>+</b> → <b>Transacción</b>. Elige tus tarjetas y marca <b>Ejecutar inmediatamente</b>.</li>
          <li><b>Elegir del menú</b> con el texto “¿En qué gastaste?” y estas opciones: <code>{{ menu }}</code>. En cada opción pon un <b>Texto</b> con el mismo nombre (en “Después”, vacío).</li>
          <li><b>Obtener contenido de URL</b> → método <b>POST</b>.
            <button class="btn mini" @click="copiar(urlAtajo, 'url')">{{ copiado === 'url' ? 'URL copiada' : 'Copiar URL' }}</button>
            Encabezados: <code>apikey</code>
            <button class="btn mini" @click="copiar(supabaseAnonKey, 'anon')">{{ copiado === 'anon' ? 'Copiado' : 'Copiar valor' }}</button>
            y <code>Content-Type</code> = <code>application/json</code>.
            Cuerpo JSON: <code>p_api_key</code> (tu API key), <code>p_amount</code> = <b>Importe</b>, <code>p_merchant</code> = <b>Comercio</b>,
            <code>p_category</code> = <b>Elemento elegido</b>, y opcionales <code>p_account_name</code> (nombre exacto de tu cuenta) y <code>p_compartido</code> (Sí para gastos de pareja).</li>
          <li><b>Obtener valor del diccionario</b>: clave <code>mensaje</code>.</li>
          <li><b>Mostrar notificación</b> con ese valor: “$12,50 en Comida. Te quedan $87,50 de $100 este mes.”</li>
        </ol>
        <p style="margin: 0; font-size: 14px">Si eliges “Después”, el gasto queda por clasificar. Para que el atajo abra la app ahí, agrega <b>Abrir URL</b>:
          <button class="btn mini" @click="copiar(urlApp, 'app')">{{ copiado === 'app' ? 'Copiado' : 'Copiar enlace' }}</button></p>
      </template>
      <button v-else class="btn primario" @click="generarClave">Generar mi API key</button>
    </section>

    <!-- Sesión -->
    <section class="bloque seccion">
      <h2 class="subtitulo" style="margin: 0">Tu cuenta</h2>
      <p style="margin: 0">{{ nombre }}<br><span class="muted">{{ user?.email }}</span></p>
      <button class="btn" @click="salir"><Icono nombre="salir" :tam="18" /> Cerrar sesión</button>
    </section>
  </main>
</template>

<style scoped>
.seccion { display: flex; flex-direction: column; gap: 12px; }
.form { display: flex; flex-direction: column; gap: 10px; }
.check { display: flex; gap: 10px; align-items: center; font-size: 14px; font-weight: 600; }
.check input { width: 22px; height: 22px; accent-color: var(--azul); }
.fila-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: var(--borde); }
.codigo { justify-content: space-between; }
.clave { display: flex; flex-direction: column; gap: 6px; }
.clave .btn { justify-content: space-between; background: #fff; }
.pasos { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.45; }
code { font-size: 12px; background: rgba(255, 255, 255, 0.7); border: 1.5px solid var(--tinta); border-radius: 6px; padding: 1px 5px; word-break: break-word; }
.mini { min-height: 34px; padding: 0 10px; font-size: 12px; margin: 4px 0; background: #fff; }
</style>
