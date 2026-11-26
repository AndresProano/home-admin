<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import Icono from '@/components/Icono.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'
import { dinero, fechaLarga } from '@/lib/fechas'
import { resumenCuentas } from '@/lib/cuentas'
import type { Lectura } from '@/lib/excel'
import { CATEGORIAS } from '@/lib/categorias'

const router = useRouter()
const { user, signOut } = useAuth()
const { accounts, expenses, importarMovimientos, addAccount, partner, apiKey, createPartnerInvite, joinPartner, removePartner,
  generateApiKey, getDisplayName } = useFinances()
const { cargar, olvidarCarga, parejaId, esMio } = useApp()

onMounted(() => cargar())

const nombre = computed(() => user.value ? getDisplayName(user.value.id) : '')

/* Cuentas */
const resumen = computed(() => resumenCuentas(accounts.value.filter(a => esMio(a.owner_id))))

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
const urlAtajo = `${supabaseUrl}/rest/v1/rpc/registrar_gasto_atajo`
// Enlace de iCloud: iOS solo importa atajos de forma confiable desde aquí (al instalar pide la clave de cada uno)
const urlInstalar = 'https://www.icloud.com/shortcuts/68e699e8f81a488d936d5ac95468061c'
const urlApp = `${window.location.origin}${import.meta.env.BASE_URL}finances?clasificar=1`
const menu = [...CATEGORIAS.map(c => c.nombre), 'Después'].join(', ')
const copiado = ref('')
const copiar = async (texto: string | null | undefined, que: string) => {
  if (!texto) return
  try { await navigator.clipboard.writeText(texto); copiado.value = que; setTimeout(() => { copiado.value = '' }, 1500) } catch { /* sin permiso */ }
}
const generarClave = async () => { if (user.value) await generateApiKey(user.value.id) }
const claveCambiada = ref(false)
const cambiarClave = async () => {
  if (!confirm('¿Cambiar tu clave? La actual deja de funcionar al instante: tendrás que pegar la nueva en el atajo.')) return
  await generateApiKey()
  claveCambiada.value = true
}

/* Excel */
const ocupado = ref(false)
const lectura = ref<Lectura | null>(null)
const afectarSaldos = ref(false)
const mensajeExcel = ref('')
const errorExcel = ref(false)
const avisar = (m: string, err = false) => { mensajeExcel.value = m; errorExcel.value = err }
const bajarPlantilla = async () => {
  ocupado.value = true
  try { (await import('@/lib/excel')).descargarPlantilla(accounts.value.filter(a => esMio(a.owner_id))) }
  catch (e: any) { avisar('No se pudo crear la plantilla: ' + (e.message ?? e), true) }
  finally { ocupado.value = false }
}
const bajarMovimientos = async () => {
  ocupado.value = true
  try { (await import('@/lib/excel')).exportarMovimientos(expenses.value.filter(e => esMio(e.owner_id)), accounts.value) }
  catch (e: any) { avisar('No se pudo exportar: ' + (e.message ?? e), true) }
  finally { ocupado.value = false }
}
const elegirArchivo = async (ev: Event) => {
  const input = ev.target as HTMLInputElement
  const archivo = input.files?.[0]
  input.value = ''
  if (!archivo || !user.value) return
  ocupado.value = true
  avisar('')
  lectura.value = null
  try {
    lectura.value = await (await import('@/lib/excel')).leerArchivo(archivo, accounts.value, user.value.id)
    if (!lectura.value.filas.length && !lectura.value.cuentas.length) avisar('No encontré cuentas ni movimientos nuevos para importar en ese archivo.', true)
  } catch (e: any) {
    avisar(e.message ?? 'No se pudo leer el archivo', true)
  } finally { ocupado.value = false }
}
const importar = async () => {
  if (!lectura.value || !user.value) return
  ocupado.value = true
  try {
    // 1) cuentas nuevas primero, para que los movimientos puedan usarlas
    const ids: Record<string, string> = {}
    for (const c of lectura.value.cuentas) {
      const creada = await addAccount(user.value.id, c)
      ids[c.name] = creada.id
    }
    // 2) movimientos (los que apuntan a una cuenta nueva toman su id)
    const filas = lectura.value.filas.map(({ cuenta_nueva, ...f }) => ({
      ...f, account_id: cuenta_nueva ? ids[cuenta_nueva] ?? null : f.account_id,
    }))
    const n = filas.length ? await importarMovimientos(filas, afectarSaldos.value) : 0
    const partes = [
      lectura.value.cuentas.length ? `${lectura.value.cuentas.length} cuenta${lectura.value.cuentas.length > 1 ? 's' : ''}` : '',
      n ? `${n} movimiento${n > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' y ')
    avisar(`¡Listo! Se importaron ${partes}.${n && afectarSaldos.value ? ' Los saldos de tus cuentas se actualizaron.' : ''}`)
    lectura.value = null
    afectarSaldos.value = false
  } catch (e: any) {
    avisar('No se pudo importar: ' + (e.message ?? e), true)
  } finally { ocupado.value = false }
}

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
    <RouterLink to="/cuentas" class="bloque seccion enlace-cuentas">
      <span class="cabecera" style="min-height: 0">
        <h2 class="subtitulo" style="margin: 0">Mis cuentas</h2>
        <Icono nombre="flecha" :grosor="2.5" />
      </span>
      <span v-if="accounts.length" class="totales-cuentas">
        <span>Tienes <strong class="cifra">${{ dinero(resumen.disponible + resumen.ahorro) }}</strong></span>
        <span v-if="resumen.deuda > 0">Debes <strong class="cifra rojo">${{ dinero(resumen.deuda) }}</strong></span>
      </span>
      <span class="muted" style="color: var(--tinta)">Bancos, cuenta meta, pólizas, tarjetas y efectivo. Edítalas, transfiere entre ellas y mira cuánto te rinden.</span>
    </RouterLink>

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
          <button class="btn peligro" style="background: #fff" @click="cambiarClave">Cambiar mi clave</button>
          <p v-if="claveCambiada" class="bloque amarillo" style="margin: 0; font-size: 14px">
            Clave nueva lista. Cópiala y pégala en el atajo: en <b>Atajos</b>, mantén presionado <b>Registrar gasto</b> → <b>Editar</b> → reemplaza el texto del primer bloque.
          </p>
          <span class="muted" style="color: var(--tinta); font-weight: 500">Si pierdes el teléfono o crees que alguien la vio, cámbiala: la anterior deja de servir.</span>
        </div>
        <ol class="pasos grandes">
          <li>
            <strong>Copia tu clave</strong> (ya la tienes arriba).
            <button class="btn negro" style="margin-top: 6px" @click="copiar(apiKey, 'clave')">{{ copiado === 'clave' ? '¡Clave copiada!' : 'Copiar mi clave' }}</button>
          </li>
          <li>
            <strong>Instala el atajo</strong> desde el iPhone. Cuando lo pida, pega tu clave. Cada vez que pagues te mostrará el monto y te preguntará <b>de qué cuenta salió</b> (tu lista de arriba) y <b>en qué gastaste</b>.
            <a class="btn primario" style="margin-top: 6px" :href="urlInstalar" target="_blank" rel="noopener">Instalar “Registrar gasto”</a>
          </li>
          <li>
            <strong>Crea la automatización</strong> (Apple no deja compartirla, son 3 toques):
            <ol class="sub">
              <li>App <b>Atajos</b> → <b>Automatización</b> → <b>+</b> → <b>Transacción</b> → elige tus tarjetas → <b>Ejecutar inmediatamente</b>.</li>
              <li>Agrega <b>Texto</b> y escribe dentro: <b>Importe</b> | <b>Comercio</b> (las dos son variables del pago, separadas por la barra <code>|</code>).</li>
              <li>Agrega <b>Ejecutar atajo</b> → <b>Registrar gasto</b>. Listo.</li>
            </ol>
          </li>
        </ol>
        <p style="margin: 0; font-size: 14px">Si eliges “Elegir después”, el gasto queda por clasificar y la app te pregunta la cuenta y la categoría.</p>
        <p style="margin: 0; font-size: 14px">Bonus: si pagas en efectivo, ejecuta “Registrar gasto” a mano (o desde un widget) y escribe algo como <i>12,50 almuerzo</i>.</p>

        <details class="manual">
          <summary>Configurarlo a mano (avanzado)</summary>
          <ol class="pasos">
            <li><b>Elegir del menú</b> con: <code>{{ menu }}</code>.</li>
            <li><b>Obtener contenido de URL</b> → POST
              <button class="btn mini" @click="copiar(urlAtajo, 'url')">{{ copiado === 'url' ? 'URL copiada' : 'Copiar URL' }}</button>
              con encabezado <code>apikey</code>
              <button class="btn mini" @click="copiar(supabaseAnonKey, 'anon')">{{ copiado === 'anon' ? 'Copiado' : 'Copiar valor' }}</button>
              y JSON: <code>p_api_key</code>, <code>p_texto</code> (Importe | Comercio), <code>p_category</code>, opcional <code>p_account_name</code> y <code>p_compartido</code>.</li>
            <li><b>Obtener valor del diccionario</b> <code>mensaje</code> → <b>Mostrar notificación</b>.</li>
          </ol>
          <p style="margin: 0; font-size: 14px">Para que el atajo abra la app en “por clasificar”: <b>Abrir URL</b>
            <button class="btn mini" @click="copiar(urlApp, 'app')">{{ copiado === 'app' ? 'Copiado' : 'Copiar enlace' }}</button></p>
        </details>
      </template>
      <button v-else class="btn primario" @click="generarClave">Generar mi API key</button>
    </section>

    <!-- Importar / exportar -->
    <section class="bloque seccion" style="background: var(--lima)">
      <h2 class="subtitulo" style="margin: 0">Importar desde Excel</h2>
      <p style="margin: 0">¿Llevabas tus cuentas y gastos en otra app o en una hoja? Pásalos a la plantilla y súbela. Todo es opcional.</p>
      <ol class="pasos">
        <li><button class="btn" style="background: #fff; width: 100%" :disabled="ocupado" @click="bajarPlantilla">Descargar plantilla de Excel</button></li>
        <li>Llena la hoja <b>Cuentas</b> (tus bancos, cuenta meta, pólizas, tarjetas…) y/o la hoja <b>Movimientos</b>. Deja vacío lo que no tengas. La hoja “Instrucciones” explica cada columna.</li>
        <li>
          <label class="btn primario subir">
            {{ ocupado ? 'Leyendo…' : 'Subir mi Excel' }}
            <input type="file" accept=".xlsx,.xls,.csv,.numbers,.ods" @change="elegirArchivo" :disabled="ocupado" />
          </label>
        </li>
      </ol>

      <div v-if="lectura" class="bloque" style="background: #fff; display: flex; flex-direction: column; gap: 10px">
        <strong v-if="lectura.cuentas.length">{{ lectura.cuentas.length }} cuenta{{ lectura.cuentas.length > 1 ? 's' : '' }} nueva{{ lectura.cuentas.length > 1 ? 's' : '' }}</strong>
        <ul v-if="lectura.cuentas.length" class="lista-avisos" style="margin-top: -4px">
          <li v-for="c in lectura.cuentas" :key="c.name">{{ c.name }} · {{ c.subtipo === 'credito' ? `debes $${dinero(-Number(c.balance))}` : `$${dinero(Number(c.balance ?? 0))}` }}<template v-if="c.tasa_anual"> · {{ Number(c.tasa_anual).toLocaleString('es-EC') }}% anual</template></li>
        </ul>
        <strong v-if="lectura.filas.length">{{ lectura.filas.length }} movimientos listos para importar</strong>
        <span v-if="lectura.desde" class="muted" style="color: var(--tinta)">Del {{ fechaLarga(lectura.desde) }} al {{ fechaLarga(lectura.hasta!) }} · gastos ${{ dinero(lectura.gastos) }} · ingresos ${{ dinero(lectura.ingresos) }}</span>
        <details v-if="lectura.avisos.length">
          <summary class="resumen-lista">{{ lectura.avisos.length }} con ajustes</summary>
          <ul class="lista-avisos"><li v-for="a in lectura.avisos.slice(0, 30)" :key="a">{{ a }}</li></ul>
        </details>
        <details v-if="lectura.omitidas.length">
          <summary class="resumen-lista rojo">{{ lectura.omitidas.length }} filas que no se pueden importar</summary>
          <ul class="lista-avisos"><li v-for="o in lectura.omitidas.slice(0, 30)" :key="o">{{ o }}</li></ul>
        </details>
        <label v-if="lectura.filas.length" class="check">
          <input v-model="afectarSaldos" type="checkbox" />
          <span>Sumar y restar estos movimientos en el saldo de mis cuentas<br>
            <span class="muted" style="font-weight: 500">Déjalo apagado si es historial viejo y tus cuentas ya tienen el saldo de hoy.</span></span>
        </label>
        <div class="acciones">
          <button class="btn" @click="lectura = null">Cancelar</button>
          <button class="btn primario" :disabled="ocupado || (!lectura.filas.length && !lectura.cuentas.length)" @click="importar">Importar</button>
        </div>
      </div>
      <p v-if="mensajeExcel" class="bloque" style="margin: 0; background: #fff" :class="{ rojo: errorExcel }">{{ mensajeExcel }}</p>

      <button class="btn" style="background: #fff" :disabled="ocupado || (!expenses.length && !accounts.length)" @click="bajarMovimientos">Descargar mis cuentas y movimientos (Excel)</button>
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
.enlace-cuentas { text-decoration: none; color: var(--tinta); box-shadow: var(--sombra-chica); }
.totales-cuentas { display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; border-top: var(--borde); padding-top: 10px; }
.totales-cuentas .cifra { font-size: 18px; }
.etiqueta-tipo { font-size: 11px; font-weight: 800; border: var(--borde); border-radius: 8px; padding: 3px 6px; text-transform: uppercase; background: var(--menta); }
.etiqueta-tipo.credito { background: var(--durazno); }
.fila-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: var(--borde); }
.codigo { justify-content: space-between; }
.clave { display: flex; flex-direction: column; gap: 6px; }
.clave .btn { justify-content: space-between; background: #fff; }
.pasos { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.45; }
code { font-size: 12px; background: rgba(255, 255, 255, 0.7); border: 1.5px solid var(--tinta); border-radius: 6px; padding: 1px 5px; word-break: break-word; }
.grandes > li { margin-bottom: 6px; }
.grandes .btn { width: 100%; }
.sub { margin: 8px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.manual summary { font-weight: 700; cursor: pointer; min-height: 44px; display: flex; align-items: center; }
.manual { border-top: var(--borde); padding-top: 6px; }
.subir { position: relative; overflow: hidden; width: 100%; cursor: pointer; }
.subir input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.resumen-lista { font-weight: 700; cursor: pointer; min-height: 36px; display: flex; align-items: center; }
.lista-avisos { margin: 4px 0 0; padding-left: 18px; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.mini { min-height: 34px; padding: 0 10px; font-size: 12px; margin: 4px 0; background: #fff; }
</style>
