<script setup lang="ts">
import Icono from './Icono.vue'

/** Pantalla mientras se dicta: ondas, barras, texto en vivo y botones Listo / Cancelar */
defineProps<{
  estado: 'escuchando' | 'procesando' | 'sin-voz'
  texto: string
  mensaje?: string
}>()
const emit = defineEmits<{ (e: 'listo'): void; (e: 'cancelar'): void; (e: 'reintentar'): void }>()
</script>

<template>
  <div class="velo-voz" role="dialog" aria-modal="true" aria-label="Dictar un gasto" @click.self="emit('cancelar')">
    <div class="tarjeta-voz bloque sombra">
      <!-- micrófono con ondas -->
      <div class="mic-zona" :class="estado" aria-hidden="true">
        <span v-if="estado === 'escuchando'" class="onda o1"></span>
        <span v-if="estado === 'escuchando'" class="onda o2"></span>
        <span v-if="estado === 'escuchando'" class="onda o3"></span>
        <span class="mic-grande">
          <span v-if="estado === 'procesando'" class="girando"></span>
          <Icono v-else :nombre="estado === 'sin-voz' ? 'cerrar' : 'mic'" :tam="38" :grosor="2.4" />
        </span>
      </div>

      <template v-if="estado === 'escuchando'">
        <p class="titulo-voz">Te escucho…</p>
        <div class="barras" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <p class="texto-vivo" :class="{ vacio: !texto }" aria-live="polite">{{ texto || 'Ej: “gasté 12,50 en almuerzo con la Visa”' }}</p>
        <div class="acciones">
          <button class="btn" @click="emit('cancelar')">Cancelar</button>
          <button class="btn primario" @click="emit('listo')">Listo</button>
        </div>
      </template>

      <template v-else-if="estado === 'procesando'">
        <p class="titulo-voz">Guardando…</p>
        <p class="texto-vivo">“{{ texto }}”</p>
      </template>

      <template v-else>
        <p class="titulo-voz">{{ mensaje || 'No te escuché' }}</p>
        <p class="texto-vivo vacio">Habla cerca del teléfono y di el monto. Ej: “20 dólares en Uber ayer”.</p>
        <div class="acciones">
          <button class="btn" @click="emit('cancelar')">Cerrar</button>
          <button class="btn primario" @click="emit('reintentar')">Intentar de nuevo</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.velo-voz {
  position: fixed; inset: 0; z-index: 120; background: rgba(17, 17, 17, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 18px;
  animation: aparecer 0.15s ease;
}
.tarjeta-voz {
  width: 100%; max-width: 420px; background: var(--azul); color: #fff;
  display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 28px 20px 20px;
  animation: subirVoz 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.mic-zona { position: relative; width: 150px; height: 150px; display: flex; align-items: center; justify-content: center; }
.mic-grande {
  position: relative; z-index: 2; width: 96px; height: 96px; border-radius: 50%;
  background: var(--amarillo); color: var(--tinta); border: 3px solid var(--tinta); box-shadow: 4px 4px 0 var(--tinta);
  display: flex; align-items: center; justify-content: center;
}
.mic-zona.escuchando .mic-grande { animation: latido 1.1s ease-in-out infinite; }
.mic-zona.sin-voz .mic-grande { background: var(--durazno); }
.onda {
  position: absolute; inset: 27px; border-radius: 50%; border: 3px solid var(--amarillo);
  animation: onda 1.8s ease-out infinite; opacity: 0;
}
.o2 { animation-delay: 0.6s; }
.o3 { animation-delay: 1.2s; }
.girando { width: 40px; height: 40px; border-radius: 50%; border: 4px solid rgba(17, 17, 17, 0.2); border-top-color: var(--tinta); animation: girar 0.8s linear infinite; }

.titulo-voz { margin: 0; font-family: var(--titulo); font-size: 26px; font-weight: 700; }
.barras { display: flex; align-items: center; gap: 5px; height: 34px; }
.barras span { width: 6px; height: 100%; background: var(--amarillo); border-radius: 3px; animation: barra 0.9s ease-in-out infinite; transform-origin: center; }
.barras span:nth-child(2) { animation-delay: 0.1s; }
.barras span:nth-child(3) { animation-delay: 0.25s; }
.barras span:nth-child(4) { animation-delay: 0.05s; }
.barras span:nth-child(5) { animation-delay: 0.3s; }
.barras span:nth-child(6) { animation-delay: 0.15s; }
.barras span:nth-child(7) { animation-delay: 0.2s; }
.texto-vivo {
  margin: 0; width: 100%; min-height: 56px; background: #fff; color: var(--tinta); border: var(--borde); border-radius: 14px;
  padding: 12px 14px; font-size: 17px; font-weight: 600; text-align: center; line-height: 1.35;
}
.texto-vivo.vacio { color: var(--gris); font-weight: 500; font-size: 15px; }
.acciones { width: 100%; }
.acciones .btn { flex: 1; }

@keyframes onda { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes latido { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
@keyframes barra { 0%, 100% { transform: scaleY(0.25); } 50% { transform: scaleY(1); } }
@keyframes girar { to { transform: rotate(360deg); } }
@keyframes aparecer { from { opacity: 0; } to { opacity: 1; } }
@keyframes subirVoz { from { transform: translateY(30px) scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .onda, .barras span, .mic-zona.escuchando .mic-grande, .tarjeta-voz { animation: none; }
  .onda { display: none; }
  .barras span { transform: scaleY(0.6); }
}
</style>
