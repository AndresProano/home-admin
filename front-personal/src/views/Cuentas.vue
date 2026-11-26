<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Icono from '@/components/Icono.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type BankAccount } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'
import { dinero, fechaLarga, hoy } from '@/lib/fechas'
import { resumenISD, ISD_EXENTO_ANUAL, ISD_TASA } from '@/lib/impuestos'
import {
  SUBTIPOS, ENTIDADES, infoSubtipo, esDeuda, deudaDe, rendimiento, avanceMeta, diasParaVencer, resumenCuentas,
  type Subtipo,
} from '@/lib/cuentas'

const { user } = useAuth()
const { accounts, expenses, addAccount, updateAccount, removeAccount, comisionDe, guardarComision, ivaDigitalDe, guardarIvaDigital } = useFinances()
const { cargar, tienePareja, esMio, nombreDe, abrirNuevo } = useApp()

onMounted(() => cargar())

const mias = computed(() => accounts.value.filter(a => esMio(a.owner_id)))
const deLaPareja = computed(() => accounts.value.filter(a => !esMio(a.owner_id)))
const resumen = computed(() => resumenCuentas(mias.value))

const grupos = computed(() => [
  { id: 'disponible', titulo: 'Disponible', cuentas: mias.value.filter(c => infoSubtipo(c.subtipo).grupo === 'disponible') },
  { id: 'ahorro', titulo: 'Ahorro e inversión', cuentas: mias.value.filter(c => infoSubtipo(c.subtipo).grupo === 'ahorro') },
  { id: 'deuda', titulo: 'Tarjetas de crédito', cuentas: mias.value.filter(c => infoSubtipo(c.subtipo).grupo === 'deuda') },
].filter(g => g.cuentas.length))

/* ---------- formulario crear / editar ---------- */
interface Form {
  abierto: boolean; id: string | null
  subtipo: Subtipo; entidad: string; nombre: string; monto: number | null
  tasa: number | null; metaMonto: number | null; metaFecha: string; vencimiento: string
  compartida: boolean; nota: string
}
const vacio = (): Form => ({ abierto: true, id: null, subtipo: 'ahorros', entidad: '', nombre: '', monto: null,
  tasa: null, metaMonto: null, metaFecha: '', vencimiento: '', compartida: false, nota: '' })
const form = ref<Form>({ ...vacio(), abierto: false })
const error = ref('')
const guardando = ref(false)

const esCredito = computed(() => form.value.subtipo === 'credito')
const conTasa = computed(() => ['ahorros', 'meta', 'inversion'].includes(form.value.subtipo))
const nombreSugerido = computed(() => {
  const ent = form.value.entidad.replace(/^(Banco( de| del)?|Cooperativa)\s+/i, '').trim()
  const tipo = infoSubtipo(form.value.subtipo).corto
  if (form.value.subtipo === 'efectivo') return 'Efectivo'
  return ent ? `${ent} ${tipo === 'Ahorros' ? '' : tipo}`.trim() : ''
})

const nueva = (subtipo: Subtipo = 'ahorros') => { form.value = { ...vacio(), subtipo }; error.value = '' }
const editar = (c: BankAccount) => {
  form.value = {
    abierto: true, id: c.id, subtipo: c.subtipo ?? (c.tipo === 'credito' ? 'credito' : 'ahorros'),
    entidad: c.entidad ?? '', nombre: c.name,
    monto: esDeuda(c) ? deudaDe(c) : Number(c.balance),
    tasa: c.tasa_anual != null ? Number(c.tasa_anual) : null,
    metaMonto: c.meta_monto != null ? Number(c.meta_monto) : null,
    metaFecha: c.meta_fecha ?? '', vencimiento: c.vencimiento ?? '',
    compartida: c.is_shared, nota: c.nota ?? '',
  }
  error.value = ''
}

const guardar = async () => {
  error.value = ''
  if (!user.value) return
  const f = form.value
  const nombre = f.nombre.trim() || nombreSugerido.value
  if (!nombre) { error.value = 'Ponle un nombre (o elige la entidad)'; return }
  const monto = Number(f.monto || 0)
  const datos = {
    name: nombre,
    subtipo: f.subtipo,
    entidad: f.entidad.trim() || null,
    balance: f.subtipo === 'credito' ? -Math.abs(monto) : monto,
    tasa_anual: conTasa.value && f.tasa != null && String(f.tasa) !== '' ? Number(f.tasa) : null,
    meta_monto: f.subtipo === 'meta' && f.metaMonto ? Number(f.metaMonto) : null,
    meta_fecha: f.subtipo === 'meta' && f.metaFecha ? f.metaFecha : null,
    vencimiento: f.subtipo === 'inversion' && f.vencimiento ? f.vencimiento : null,
    is_shared: tienePareja.value ? f.compartida : false,
    nota: f.nota.trim() || null,
  }
  guardando.value = true
  try {
    if (f.id) await updateAccount(f.id, datos)
    else await addAccount(user.value.id, datos)
    form.value.abierto = false
  } catch (e: any) {
    error.value = 'No se pudo guardar: ' + (e.message ?? e)
  } finally { guardando.value = false }
}

const borrar = async () => {
  const f = form.value
  if (!f.id || !confirm(`¿Borrar "${f.nombre}"? Los movimientos se quedan, solo pierden la cuenta.`)) return
  await removeAccount(f.id)
  form.value.abierto = false
}

/* ---------- comisión interbancaria ---------- */
const editandoComision = ref(false)
const comisionTexto = ref<number | null>(null)
const comision = computed(() => user.value ? comisionDe(user.value.id) : 0.4)
const abrirComision = () => { comisionTexto.value = comision.value; editandoComision.value = true }
const guardarLaComision = async () => {
  if (!user.value) return
  const v = Math.max(0, Number(comisionTexto.value || 0))
  try { await guardarComision(user.value.id, v); editandoComision.value = false }
  catch (e: any) { alert('No se pudo guardar: ' + (e.message ?? e)) }
}

/* ---------- IVA servicios digitales + ISD ---------- */
const editandoIva = ref(false)
const ivaTexto = ref<number | null>(null)
const ivaDigital = computed(() => user.value ? ivaDigitalDe(user.value.id) : 15)
const abrirIva = () => { ivaTexto.value = ivaDigital.value; editandoIva.value = true }
const guardarElIva = async () => {
  if (!user.value) return
  try { await guardarIvaDigital(user.value.id, Math.min(50, Math.max(0, Number(ivaTexto.value || 0)))); editandoIva.value = false }
  catch (e: any) { alert('No se pudo guardar: ' + (e.message ?? e)) }
}
const isd = computed(() => user.value ? resumenISD(expenses.value, user.value.id) : null)

/* ---------- transferencias ---------- */
const transferir = (hacia?: BankAccount) => {
  const origen = mias.value.find(c => infoSubtipo(c.subtipo).grupo === 'disponible' && c.id !== hacia?.id)
  abrirNuevo({ type: 'transfer', account_id: origen?.id ?? null, to_account_id: hacia?.id ?? null,
    description: hacia ? (esDeuda(hacia) ? `Pago ${hacia.name}` : `Ahorro a ${hacia.name}`) : '' })
}

const saldoTexto = (c: BankAccount) => esDeuda(c) ? `Debes $${dinero(deudaDe(c))}` : `$${dinero(Number(c.balance))}`
const subtitulo = (c: BankAccount) => [c.entidad, infoSubtipo(c.subtipo).corto, c.is_shared ? 'compartida' : ''].filter(Boolean).join(' · ')
const textoVence = (c: BankAccount) => {
  const d = diasParaVencer(c)
  if (d == null) return ''
  if (d < 0) return `Venció el ${fechaLarga(c.vencimiento!)}`
  if (d === 0) return 'Vence hoy'
  return `Vence el ${fechaLarga(c.vencimiento!)} (en ${d} días)`
}
</script>

<template>
  <main class="pagina">
    <header class="cabecera">
      <h1 class="titulo-pagina">Mis cuentas</h1>
      <button class="btn-icono amarillo" aria-label="Nueva cuenta" @click="nueva()"><Icono nombre="mas" :grosor="2.8" /></button>
    </header>

    <!-- Resumen -->
    <section v-if="mias.length" class="bloque azul sombra resumen">
      <span style="font-weight: 600">Patrimonio neto</span>
      <span class="cifra" style="font-size: 40px; line-height: 1" :style="resumen.patrimonio < 0 ? 'color: var(--amarillo)' : ''">
        {{ resumen.patrimonio < 0 ? '−' : '' }}${{ dinero(resumen.patrimonio) }}</span>
      <div class="pastillas">
        <span class="pastilla blanca">Disponible ${{ dinero(resumen.disponible) }}</span>
        <span v-if="resumen.ahorro" class="pastilla">Ahorro e inversión ${{ dinero(resumen.ahorro) }}</span>
        <span v-if="resumen.deuda" class="pastilla">Debes ${{ dinero(resumen.deuda) }}</span>
        <span v-if="resumen.rendMes" class="pastilla">Rinde ~${{ dinero(resumen.rendMes) }} al mes</span>
      </div>
    </section>

    <div v-if="mias.length" class="fila">
      <button class="btn" @click="transferir()"><Icono nombre="transferencia" :tam="18" /> Transferir</button>
      <button v-if="mias.some(esDeuda)" class="btn" @click="transferir(mias.find(esDeuda))"><Icono nombre="tarjeta" :tam="18" /> Pagar tarjeta</button>
    </div>

    <!-- Grupos -->
    <section v-for="g in grupos" :key="g.id" class="grupo">
      <h2 class="subtitulo">{{ g.titulo }}</h2>
      <div v-for="c in g.cuentas" :key="c.id" class="bloque cuenta">
        <button class="tocar" :aria-label="`Editar ${c.name}`" @click="editar(c)">
        <span class="fila-arriba">
          <span class="icono-cat" :style="{ background: infoSubtipo(c.subtipo).color }"><Icono :nombre="infoSubtipo(c.subtipo).icono" :tam="18" /></span>
          <span class="mov-info"><strong>{{ c.name }}</strong><span>{{ subtitulo(c) }}</span></span>
          <span class="cifra saldo" :class="{ rojo: esDeuda(c) && deudaDe(c) > 0 }">{{ saldoTexto(c) }}</span>
        </span>

        <template v-if="avanceMeta(c)">
          <span class="barra"><div :style="{ width: avanceMeta(c)!.porcentaje * 100 + '%' }"></div></span>
          <span class="detalle">
            <template v-if="avanceMeta(c)!.lograda">¡Meta de ${{ dinero(avanceMeta(c)!.meta) }} lograda!</template>
            <template v-else>Meta ${{ dinero(avanceMeta(c)!.meta) }} · faltan ${{ dinero(avanceMeta(c)!.falta) }}<template v-if="avanceMeta(c)!.porMes"> · aparta ${{ dinero(avanceMeta(c)!.porMes!) }} al mes hasta {{ fechaLarga(c.meta_fecha!) }}</template></template>
          </span>
        </template>
        <span v-if="rendimiento(c)" class="detalle">
          {{ Number(c.tasa_anual).toLocaleString('es-EC') }}% anual · te rinde ~${{ dinero(rendimiento(c)!.mensual) }} al mes (${{ dinero(rendimiento(c)!.anual) }} al año)
        </span>
        <span v-if="textoVence(c)" class="detalle" :class="{ rojo: (diasParaVencer(c) ?? 1) <= 7 }">{{ textoVence(c) }}</span>
        <span v-if="c.nota" class="detalle">{{ c.nota }}</span>
        </button>
        <span v-if="infoSubtipo(c.subtipo).grupo !== 'disponible'" class="acciones-cuenta">
          <button class="btn mini" @click="transferir(c)">
            <Icono :nombre="esDeuda(c) ? 'tarjeta' : 'mas'" :tam="16" /> {{ esDeuda(c) ? 'Pagar' : 'Agregar plata' }}
          </button>
        </span>
      </div>
    </section>

    <section v-if="deLaPareja.length" class="grupo">
      <h2 class="subtitulo">De tu pareja (compartidas)</h2>
      <div v-for="c in deLaPareja" :key="c.id" class="bloque cuenta" style="cursor: default">
        <span class="fila-arriba">
          <span class="icono-cat" :style="{ background: infoSubtipo(c.subtipo).color }"><Icono :nombre="infoSubtipo(c.subtipo).icono" :tam="18" /></span>
          <span class="mov-info"><strong>{{ c.name }}</strong><span>{{ [c.entidad, infoSubtipo(c.subtipo).corto, nombreDe(c.owner_id)].filter(Boolean).join(' · ') }}</span></span>
          <span class="cifra saldo">{{ saldoTexto(c) }}</span>
        </span>
      </div>
    </section>

    <section v-if="mias.length" class="bloque comision-ajuste">
      <span class="mov-info">
        <strong>Comisión por transferencia a otro banco</strong>
        <span>Se propone al transferir entre bancos distintos y la puedes quitar en cada transferencia.</span>
      </span>
      <form v-if="editandoComision" class="fila" style="align-items: flex-end" @submit.prevent="guardarLaComision">
        <label class="campo">Monto ($)<input v-model.number="comisionTexto" type="number" step="0.01" min="0" max="50" inputmode="decimal" /></label>
        <button class="btn primario" type="submit" style="flex: 0 0 auto">Guardar</button>
      </form>
      <button v-else class="btn" @click="abrirComision">${{ dinero(comision) }} · cambiar</button>

      <span class="mov-info" style="border-top: var(--borde); padding-top: 10px">
        <strong>IVA a servicios digitales del exterior</strong>
        <span>Netflix, Spotify, Apple… El banco lo cobra aparte; se agrega solo al marcar "Servicio digital / del exterior".</span>
      </span>
      <form v-if="editandoIva" class="fila" style="align-items: flex-end" @submit.prevent="guardarElIva">
        <label class="campo">Porcentaje (%)<input v-model.number="ivaTexto" type="number" step="0.01" min="0" max="50" inputmode="decimal" /></label>
        <button class="btn primario" type="submit" style="flex: 0 0 auto">Guardar</button>
      </form>
      <button v-else class="btn" @click="abrirIva">{{ ivaDigital.toLocaleString('es-EC') }}% · cambiar</button>
    </section>

    <section v-if="isd && isd.total > 0" class="bloque isd" :class="{ pasado: isd.exceso > 0 }">
      <strong>Consumos en el exterior {{ isd.anio }}</strong>
      <span class="cifra" style="font-size: 22px">${{ dinero(isd.total) }} <small class="muted">de ${{ dinero(ISD_EXENTO_ANUAL) }} exentos de ISD</small></span>
      <span class="barra" :class="{ pasado: isd.exceso > 0 }"><div :style="{ width: isd.porcentaje * 100 + '%' }"></div></span>
      <span v-if="isd.exceso > 0" class="detalle rojo">Te pasaste ${{ dinero(isd.exceso) }}: ISD estimado {{ ISD_TASA }}% = ${{ dinero(isd.isdEstimado) }}. Se declara y paga en abril del próximo año.</span>
      <span v-else class="detalle">Te quedan ${{ dinero(isd.restanteExento) }} antes de pagar ISD ({{ ISD_TASA }}% sobre el exceso).</span>
    </section>

    <div v-if="!mias.length" class="bloque punteado vacio">
      <strong>Agrega tus cuentas</strong>
      <span class="muted">Tus bancos (Pichincha, Guayaquil, Produbanco…), tu cuenta meta o ahorro programado, tus pólizas, tus tarjetas de crédito y tu efectivo.</span>
      <button class="btn primario" @click="nueva()">Agregar mi primera cuenta</button>
    </div>

    <!-- Formulario -->
    <div v-if="form.abierto" class="velo" @click.self="form.abierto = false">
      <form class="hoja" @submit.prevent="guardar">
        <div class="agarre"></div>
        <div class="cabecera">
          <h2 class="titulo-pagina" style="font-size: 24px">{{ form.id ? 'Editar cuenta' : 'Nueva cuenta' }}</h2>
          <button type="button" class="btn-icono" aria-label="Cerrar" @click="form.abierto = false"><Icono nombre="cerrar" /></button>
        </div>

        <div>
          <p class="subtitulo" style="margin-bottom: 10px">¿Qué tipo de cuenta es?</p>
          <div class="tipos">
            <button v-for="t in SUBTIPOS" :key="t.id" type="button" class="tipo-op" :class="{ on: form.subtipo === t.id }" @click="form.subtipo = t.id">
              <span class="icono-cat" :style="{ background: t.color, width: '32px', height: '32px' }"><Icono :nombre="t.icono" :tam="16" /></span>
              <strong>{{ t.nombre }}</strong>
              <span>{{ t.ayuda }}</span>
            </button>
          </div>
        </div>

        <label v-if="form.subtipo !== 'efectivo'" class="campo">
          Banco o entidad
          <input v-model="form.entidad" type="text" list="entidades" placeholder="Ej: Banco Guayaquil" autocomplete="off" />
          <datalist id="entidades"><option v-for="e in ENTIDADES" :key="e" :value="e" /></datalist>
        </label>

        <label class="campo">
          Nombre
          <input v-model="form.nombre" type="text" :placeholder="nombreSugerido || 'Ej: Cuenta Meta'" />
        </label>

        <label class="campo">
          {{ esCredito ? '¿Cuánto debes hoy? ($)' : form.id ? 'Saldo actual ($)' : 'Saldo de hoy ($)' }}
          <input v-model.number="form.monto" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0,00" />
          <span v-if="form.id" class="muted" style="font-weight: 500">Cámbialo para cuadrar con tu banco (por ejemplo cuando te acreditan intereses).</span>
        </label>

        <div v-if="conTasa" class="fila">
          <label class="campo">
            Tasa anual % (si tiene)
            <input v-model.number="form.tasa" type="number" step="0.01" min="0" max="100" inputmode="decimal" placeholder="Vacío si no paga intereses" />
          </label>
          <label v-if="form.subtipo === 'inversion'" class="campo">
            Vence el
            <input v-model="form.vencimiento" type="date" :min="hoy()" />
          </label>
        </div>

        <template v-if="form.subtipo === 'meta'">
          <p class="subtitulo" style="margin: 0">Tu meta (opcional)</p>
          <div class="fila">
            <label class="campo">Quiero llegar a ($)<input v-model.number="form.metaMonto" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Ej: 1.200" /></label>
            <label class="campo">Para el<input v-model="form.metaFecha" type="date" :min="hoy()" /></label>
          </div>
        </template>

        <label class="campo">
          Nota (opcional)
          <input v-model="form.nota" type="text" placeholder="Ej: para el viaje, fondo de emergencia" />
        </label>

        <label v-if="tienePareja" class="check"><input v-model="form.compartida" type="checkbox" /> Es una cuenta compartida con mi pareja</label>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="acciones">
          <button v-if="form.id" type="button" class="btn peligro" @click="borrar">Borrar</button>
          <button v-else type="button" class="btn" @click="form.abierto = false">Cancelar</button>
          <button type="submit" class="btn primario" :disabled="guardando">Guardar</button>
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
.resumen { display: flex; flex-direction: column; gap: 10px; padding: 18px; }
.pastillas { display: flex; flex-wrap: wrap; gap: 8px; }
.pastilla { border-radius: 999px; padding: 6px 10px; font-size: 13px; font-weight: 600; background: rgba(255, 255, 255, 0.18); }
.pastilla.blanca { background: #fff; color: var(--tinta); }
.grupo { display: flex; flex-direction: column; gap: 8px; }
.cuenta { display: flex; flex-direction: column; gap: 8px; }
.tocar { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 0; border: none; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.fila-arriba { display: flex; align-items: center; gap: 12px; }
.saldo { font-size: 18px; white-space: nowrap; }
.detalle { font-size: 13px; color: var(--gris); }
.acciones-cuenta { display: flex; justify-content: flex-end; }
.mini { min-height: 36px; padding: 0 12px; font-size: 13px; }
.tipos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.tipo-op { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px; border: var(--borde); border-radius: 14px; background: var(--fondo); text-align: left; font: inherit; color: inherit; cursor: pointer; }
.tipo-op strong { font-size: 14px; }
.tipo-op span:last-child { font-size: 12px; color: var(--gris); }
.tipo-op.on { background: var(--tinta); color: #fff; }
.tipo-op.on span:last-child { color: #ddd; }
.comision-ajuste { display: flex; flex-direction: column; gap: 10px; }
.isd { display: flex; flex-direction: column; gap: 8px; background: var(--cielo); }
.isd.pasado { background: var(--durazno); }
.check { display: flex; gap: 10px; align-items: center; font-size: 14px; font-weight: 600; }
.check input { width: 22px; height: 22px; accent-color: var(--azul); }
</style>
