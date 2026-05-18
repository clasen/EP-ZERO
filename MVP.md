# MVP-1 · djay Pro → Ableton Link → USB MIDI device USB Sync

## Objetivo

Crear una app liviana para macOS que lea la sesión Ableton Link donde djay Pro actúa como referencia de tempo y fase, y use esa información para sincronizar el USB MIDI device por USB MIDI.

El flujo correcto para esta versión es:

```text
djay Pro
↓
Ableton Link session
↓
EP-ZERO
↓
USB MIDI Clock + Start/Stop
↓
USB MIDI device
```

La app no debe reemplazar a djay Pro ni a Ableton Live como DAW. Su función es ser un puente de sincronización: leer el tempo y la fase musical desde Ableton Link, generar MIDI Clock estable y disparar el USB MIDI device justo en el punto correcto para que el kick caiga alineado con el kick de djay Pro.

djay Pro soporta Ableton Link y, cuando entra en una sesión Link, sincroniza tempo y posición de beat con la sesión compartida. Además puede seguir otra app, tomar el rol de master o actuar como master desde el inicio, según cómo esté configurada la sesión y qué deck esté activo. ([Algoriddim Support][1])

---

# 1. Principio central

El MVP no debe pensar en “poner BPM” como si el USB MIDI device recibiera un número tipo `124.00 BPM`.

En MIDI clásico, lo correcto es enviar:

```text
MIDI Timing Clock
MIDI Start
MIDI Stop
MIDI Continue
```

El estándar MIDI define `Timing Clock` como un mensaje enviado 24 veces por negra cuando se necesita sincronización, y también define mensajes de `Start`, `Continue` y `Stop` para controlar transporte. ([MIDI.org][2])

Entonces, para el USB MIDI device, “poner los BPM” significa:

```text
generar un flujo MIDI Clock a 24 PPQN
```

y “poner play sincronizado con el kick” significa:

```text
enviar MIDI Start justo antes del beat objetivo
```

con compensación de latencia.

El USB MIDI device puede funcionar por USB-C como dispositivo MIDI con clock y transport. Para este MVP, el USB MIDI device debe estar en modo receptor de clock, no en modo clock out.

---

# 2. Alcance exacto del MVP-1

## Incluido

* Conectarse a una sesión Ableton Link.
* Leer BPM, beat position, phase y estado de reproducción de Link.
* Tomar djay Pro como fuente de referencia práctica.
* Generar USB MIDI Clock hacia el USB MIDI device.
* Enviar MIDI Start/Stop/Continue.
* Lanzar el USB MIDI device en el próximo beat o compás configurado.
* Alinear el inicio del USB MIDI device con el kick de djay Pro.
* Aplicar offset manual en milisegundos.
* Permitir nudge fino durante reproducción.
* Mostrar estado de Link, peers, BPM, phase, transporte y salida MIDI.
* Guardar presets de offset por dispositivo.

## No incluido en MVP-1

* Detección automática de kick por audio.
* Escuchar el master de djay Pro.
* Escuchar el retorno de audio del USB MIDI device.
* Auto-corrección por transientes.
* Warping.
* Mezcla de audio.
* Timeline visual.
* Clips.
* VST.
* Análisis de beatgrid.

La sincronización del kick en MVP-1 se basa en la beatgrid/fase de djay Pro publicada por Link. Si el track de djay Pro tiene la beatgrid mal puesta, el MVP-1 no puede saberlo. Eso queda para MVP-2 con análisis de audio.

---

# 3. Supuesto operativo

Para que funcione bien, djay Pro debe ser la referencia musical activa.

Condiciones:

```text
djay Pro Link: ON
djay Pro Sync: ON
Active Deck correcto
Track con beatgrid correcta
USB MIDI device MIDI Clock: ON / receive
USB MIDI device conectado por USB-C
```

Ableton Link sincroniza beat, tempo, phase y start/stop entre apps, pero no impone una timeline absoluta única. Cada app mantiene su propia timeline y Link mantiene la relación temporal entre ellas. Esto es importante porque la app debe mapear la fase Link a mensajes MIDI Clock y transporte de forma controlada. ([Ableton on GitHub][5])

---

# 4. Flujo de usuario

## Preparación

1. Abrir djay Pro.
2. Activar Ableton Link.
3. Reproducir el deck que será referencia.
4. Activar Sync en djay Pro.
5. Conectar USB MIDI device por USB.
6. En USB MIDI device, configurar MIDI Clock como receptor.
7. Abrir EP-ZERO.

## Uso

1. EP-ZERO detecta la sesión Link.
2. EP-ZERO detecta BPM y phase desde Link.
3. El usuario selecciona `USB MIDI device` como MIDI Output.
4. El usuario pulsa `ARM DEVICE`.
5. La app espera el próximo beat o compás configurado.
6. La app envía `MIDI Start`.
7. La app comienza a emitir `MIDI Clock` a 24 PPQN.
8. El USB MIDI device arranca sincronizado.
9. El usuario ajusta `Kick Offset` hasta que el kick del USB MIDI device caiga con el kick de djay Pro.

---

# 5. UI mínima

```text
┌──────────────────────────────────────┐
│ EP-ZERO                          │
├──────────────────────────────────────┤
│ Ableton Link        [ ON ]           │
│ Link Peers          2                │
│ djay Status         Playing          │
│                                      │
│ Link BPM            124.00           │
│ Link Beat           128.3            │
│ Phase               1.3 / 4          │
│ Quantum             4 beats          │
│                                      │
│ MIDI Output         USB MIDI device   │
│ MIDI Clock Out      [ ON ]           │
│ Transport Out       [ ON ]           │
│                                      │
│ Launch Mode         Next Bar         │
│ Kick Offset         -18 ms           │
│                                      │
│ [ ARM DEVICE ] [ START NOW ]         │
│ [ STOP DEVICE ] [ RESYNC ]           │
│                                      │
│ Nudge: [ -10 ] [ -1 ] [ +1 ] [ +10 ] │
│                                      │
│ Status: Waiting for next bar         │
└──────────────────────────────────────┘
```

---

# 6. Modos de lanzamiento

## Next Beat

La app lanza el USB MIDI device en el próximo beat entero de Link.

Uso:

```text
útil para pruebas rápidas
```

## Next Bar

La app lanza el USB MIDI device en el próximo inicio de compás.

Uso:

```text
modo principal para sincronizar kicks 4x4
```

## Next 4-Bar Phrase

La app lanza el USB MIDI device en el próximo bloque de 4 compases.

Uso:

```text
más musical para entrar en frase
```

## Manual Start Now

Envía Start inmediatamente, usando el offset configurado.

Uso:

```text
modo emergencia / performance manual
```

---

# 7. Sincronización del kick

La app debe tratar el kick como el primer golpe fuerte del patrón del USB MIDI device.

Regla del MVP:

```text
USB MIDI device pattern step 1
=
Link bar beat 1
=
kick de djay Pro según beatgrid
```

Para que eso funcione:

* el patrón del USB MIDI device debe tener el kick en el primer step;
* djay Pro debe tener la beatgrid correcta;
* EP-ZERO debe lanzar el USB MIDI device en el próximo boundary musical;
* el usuario debe ajustar el `Kick Offset`.

Ableton Link recomienda el concepto de phase synchronization usando un quantum en beats. Con un quantum de 4 beats, las apps pueden alinear límites de compás o loop. ([Ableton on GitHub][5])

Para este MVP:

```text
Default quantum: 4 beats
Default launch mode: Next Bar
Default offset: 0 ms
Offset range: -250 ms to +250 ms
Fine offset step: 1 ms
Coarse offset step: 10 ms
```

---

# 8. Por qué hace falta offset

Aunque el BPM sea correcto, el kick puede caer tarde o temprano por:

```text
USB MIDI latency
scheduler latency de macOS
buffer de audio de djay Pro
latencia interna del USB MIDI device
latencia del mixer/audio interface
percepción acústica del sistema
```

Por eso el MVP debe incluir `Kick Offset`.

Interpretación:

```text
Kick Offset negativo:
  enviar Start/Clock antes para compensar que el USB MIDI device llega tarde.

Kick Offset positivo:
  enviar Start/Clock después si el USB MIDI device se adelanta.
```

Este control es obligatorio. Sin offset, el sistema puede estar “sincronizado” en BPM pero sentirse mal en el kick.

---

# 9. Arquitectura

```text
┌──────────────────────────────┐
│          Svelte UI            │
└──────────────┬───────────────┘
               │ IPC
┌──────────────▼───────────────┐
│        Electron Main          │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│        Sync Engine            │
├──────────────────────────────┤
│ Link Reader                   │
│ Tempo Tracker                 │
│ Phase Mapper                  │
│ Launch Scheduler              │
│ MIDI Clock Generator          │
│ Kick Offset Engine            │
│ Transport Controller          │
└──────────────┬───────────────┘
               │ USB MIDI
┌──────────────▼───────────────┐
│        USB MIDI device         │
└──────────────────────────────┘
```

---

# 10. Componentes técnicos

## Link Reader

Responsabilidad:

```text
Conectarse a Ableton Link
Leer tempo actual
Leer beat actual
Leer phase actual
Detectar peers
Detectar start/stop si está disponible
```

Ableton Link expone una sesión con timeline y start/stop state. La timeline se representa como beat, time y tempo, y las apps capturan un snapshot de ese estado para consultarlo o modificarlo. ([Ableton on GitHub][5])

## Tempo Tracker

Responsabilidad:

```text
Convertir Link tempo en BPM estable para MIDI Clock
Detectar cambios reales de tempo
Ignorar microfluctuaciones innecesarias
```

Reglas:

```text
BPM follows Link tempo
Small changes: smooth over 100–300 ms
Large changes: follow faster
No abrupt clock jumps unless user presses Resync
```

## Phase Mapper

Responsabilidad:

```text
Mapear Link beat/phase a posición musical de salida MIDI
```

Ejemplo:

```text
Link quantum: 4
Target: next bar
Current phase: 2.3
Start target: next phase 0.0
```

## Launch Scheduler

Responsabilidad:

```text
Programar el momento exacto del MIDI Start
Aplicar Kick Offset
Empezar clock antes o justo al Start según modo
```

Regla principal:

```text
scheduledStartTime = nextLinkBoundaryTime + kickOffsetMs
```

## MIDI Clock Generator

Responsabilidad:

```text
Emitir MIDI Timing Clock a 24 PPQN
Mantener continuidad
Ajustar tempo sin jitter brusco
```

Mensajes:

```text
0xF8 MIDI Timing Clock
0xFA MIDI Start
0xFB MIDI Continue
0xFC MIDI Stop
```

MIDI Timing Clock se envía 24 veces por negra, y Start indica que la secuencia debe empezar, seguido por clocks. ([MIDI.org][2])

## Kick Offset Engine

Responsabilidad:

```text
Permitir corrección manual del golpe percibido
Guardar preset
Aplicar offset al launch y al clock phase
```

## Transport Controller

Responsabilidad:

```text
Start device
Stop device
Continue device
Resync device
```

---

# 11. Stack recomendado

```text
Electron
SvelteKit
TailwindCSS
Skeleton UI
Node.js
Native addon C++ para Ableton Link
CoreMIDI para USB MIDI
```

Para el primer prototipo, Electron es más práctico que una app nativa completa. Para el motor de timing, conviene evitar depender solo de timers de JavaScript, porque el MIDI Clock necesita regularidad. La interfaz puede estar en SvelteKit, pero el scheduler de clock debería vivir en el proceso nativo o en un worker dedicado.

---

# 12. Timing engine

## Requisito

El MIDI Clock debe salir con timing estable.

A 120 BPM:

```text
1 beat = 500 ms
24 clocks per beat
1 MIDI clock cada 20.833 ms
```

A 124 BPM:

```text
1 beat = 483.871 ms
24 clocks per beat
1 MIDI clock cada 20.161 ms
```

La app debe calcular esto continuamente desde el BPM de Link.

## Reglas del scheduler

```text
Use high-resolution monotonic clock
Pre-schedule MIDI ticks
Avoid UI thread
Avoid setInterval as timing source principal
Keep clock running even if UI lags
```

---

# 13. Configuración

```json
{
  "link": {
    "enabled": true,
    "quantum": 4,
    "startStopSync": true
  },
  "midi": {
    "outputName": "USB MIDI device",
    "sendClock": true,
    "sendTransport": true
  },
  "launch": {
    "mode": "next_bar",
    "kickOffsetMs": -18,
    "preRollClocks": 0
  },
  "clock": {
    "ppqn": 24,
    "smoothingMs": 150,
    "maxInstantBpmJump": 3
  },
  "ui": {
    "showAdvancedTiming": true
  }
}
```

---

# 14. Estados de la app

```text
NO_LINK_SESSION
LINK_CONNECTED
NO_MIDI_OUTPUT
MIDI_READY
ARMED
WAITING_FOR_BOUNDARY
RUNNING
STOPPED
CLOCK_LOST
ERROR
```

## Ejemplo de estados

```text
LINK_CONNECTED:
  djay Pro detectado como peer o sesión activa.

MIDI_READY:
  USB MIDI device seleccionado como salida MIDI.

ARMED:
  el usuario pidió lanzar el USB MIDI device.

WAITING_FOR_BOUNDARY:
  la app espera el próximo beat/bar/phrase.

RUNNING:
  MIDI Clock y transport están activos.

CLOCK_LOST:
  Link dejó de publicar un estado útil o djay se detuvo.
```

---

# 15. Pantalla avanzada de diagnóstico

```text
Link tempo: 124.00 BPM
Smoothed tempo: 124.00 BPM
Link beat: 128.723
Phase: 0.723 / 4
Next bar in: 1.277 beats
Next start in: 618 ms
Kick offset: -18 ms
MIDI tick interval: 20.16 ms
MIDI ticks sent: 18432
MIDI output jitter avg: 1.8 ms
MIDI output jitter max: 5.4 ms
```

---

# 16. Acceptance criteria

## Conexión

* La app detecta sesión Ableton Link activa.
* La app muestra BPM de Link.
* La app muestra peers Link.
* La app detecta salida MIDI USB del USB MIDI device.
* La app permite seleccionar USB MIDI device como MIDI Output.

## Sincronización

* Si djay Pro reproduce a 124 BPM, la app genera MIDI Clock equivalente a 124 BPM.
* El USB MIDI device sigue el BPM de djay Pro por USB MIDI.
* Al presionar `ARM DEVICE`, el USB MIDI device arranca en el próximo beat o compás configurado.
* Con un patrón de kick en el primer step del USB MIDI device, el kick cae alineado con el beatgrid de djay Pro después de calibrar offset.
* El usuario puede corregir desfasaje con botones de nudge.

## Transporte

* `STOP DEVICE` envía MIDI Stop.
* `START NOW` envía MIDI Start inmediato.
* `RESYNC` detiene y relanza el USB MIDI device en el próximo boundary configurado.
* Si djay Pro cambia de BPM, el USB MIDI device sigue el cambio sin saltos bruscos.

## Estabilidad

* La UI puede trabarse brevemente sin cortar MIDI Clock.
* La app recuerda el último MIDI Output y Kick Offset.
* Si se desconecta el USB MIDI device, la app muestra error sin crashear.
* Si vuelve a conectarse, permite reconectar sin reiniciar.

---

# 17. Métrica principal de éxito

La métrica musical del MVP no es solamente “BPM correcto”.

La métrica real es:

```text
kick alignment error
```

Objetivo inicial:

```text
Después de calibración manual:
kick USB MIDI device vs kick djay Pro ≤ ±20 ms
```

Objetivo deseable:

```text
≤ ±10 ms en setup estable
```

Para MVP-1, esa medición puede ser auditiva/manual. En MVP-2 se puede medir por audio.

---

# 18. Limitaciones conocidas

## 1. Link no garantiza que todas las apps arranquen exactamente al mismo sample

Ableton Link v3 puede compartir start/stop, pero las apps manejan start/stop según sus propias capacidades y cuantización. No se espera que todas empiecen exactamente al mismo instante físico; cada app arranca según su phase y quantum. ([Ableton on GitHub][5])

Mitigación:

```text
La app no depende solo de Link Start/Stop.
La app genera su propio MIDI Start hacia USB MIDI device.
```

## 2. djay Pro puede cambiar el rol de master

djay Pro puede seguir otra app, actuar como master desde el inicio o tomar el control si otras apps paran. ([Algoriddim Support][1])

Mitigación:

```text
La app debe mostrar claramente:
Current Link BPM
BPM source confidence
djay playing / not playing
```

## 3. Sin audio no hay “kick real”

MVP-1 alinea contra la fase Link y la beatgrid de djay Pro, no contra el bombo real del archivo de audio.

Mitigación:

```text
Asumir beatgrid correcta.
Agregar Kick Offset manual.
Dejar audio detection para MVP-2.
```

---

# 19. MVP-2 recomendado

El MVP-2 sí debería escuchar audio.

Flujo:

```text
djay Pro master audio
↓
kick/transient detector
↓
compare against USB MIDI device audio return
↓
suggest offset
↓
optional auto-correction
```

Primero no haría auto-sync completo. Haría un asistente:

```text
Current offset: -18 ms
Suggested offset: -23 ms
Confidence: 82%
[Apply Suggested Offset]
```

Eso reduce el riesgo de que la app corrija mal en vivo.

---

# 20. Spec resumida

```text
EP-ZERO MVP-1 is a lightweight macOS app that joins the same Ableton Link session as djay Pro, reads the shared BPM, beat position and phase, and converts that timing into USB MIDI Clock plus MIDI Start/Stop messages for the USB MIDI device.

The app launches the USB MIDI device on the next beat/bar/phrase boundary and applies a user-configurable Kick Offset so the first step/kick of the USB MIDI device pattern lands aligned with the djay Pro beatgrid. MVP-1 does not perform audio kick detection; it relies on djay Pro’s Link beat position and manual offset calibration.
```

La versión correcta del MVP-1 no es “djay Pro le manda BPM al USB MIDI device”. Es más precisa: **djay Pro publica tempo/fase por Ableton Link, EP-ZERO convierte eso en MIDI Clock + Start por USB, y el USB MIDI device arranca en el boundary musical correcto con offset calibrado**.

[1]: https://help.algoriddim.com/user-manual/djay-pro-mac/dj-tools/performance-tools/ableton-link "Connecting Ableton Link | Algoriddim Support"
[2]: https://midi.org/summary-of-midi-1-0-messages?utm_source=chatgpt.com "Summary of MIDI 1.0 Messages"
[5]: https://ableton.github.io/link/ "Link Documentation | Ableton"
