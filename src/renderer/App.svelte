<script lang="ts">
  import { onMount } from "svelte";
  import type { AppSnapshot, EpZeroConfig, EpZeroStatus, LaunchMode } from "../main/shared/types";

  const METER_REFRESH_MS = 120;

  let snapshot: AppSnapshot | null = null;
  let displayStatus: EpZeroStatus | null = null;
  let loading = true;
  let error = "";
  const bridge = window.epZero;

  onMount(() => {
    let unsubscribe = () => {};

    if (!bridge) {
      error = "EP-ZERO desktop bridge is not connected. Open the Electron app, not the browser preview.";
      loading = false;
      return () => {};
    }

    bridge
      .getSnapshot()
      .then((next) => {
        snapshot = next;
        displayStatus = next.status;
        loading = false;
      })
      .catch((cause: Error) => {
        error = cause.message;
        loading = false;
      });

    unsubscribe = bridge.onStatus((next) => {
      snapshot = next;
      if (!displayStatus) displayStatus = next.status;
      loading = false;
    });

    const meterTimer = setInterval(() => {
      if (snapshot) displayStatus = snapshot.status;
    }, METER_REFRESH_MS);

    return () => {
      unsubscribe();
      clearInterval(meterTimer);
    };
  });

  async function updateConfig(config: Partial<EpZeroConfig>) {
    if (!bridge) return;
    snapshot = await bridge.setConfig(config);
  }

  async function selectMidiOutput(event: Event) {
    if (!bridge) return;
    const target = event.target as HTMLSelectElement;
    snapshot = await bridge.selectMidiOutput(target.value);
  }

  async function arm() {
    if (!bridge) return;
    snapshot = await bridge.arm();
  }

  async function startNow() {
    if (!bridge) return;
    snapshot = await bridge.startNow();
  }

  async function stop() {
    if (!bridge) return;
    snapshot = await bridge.stop();
  }

  async function nudge(deltaMs: number) {
    if (!bridge) return;
    snapshot = await bridge.nudge(deltaMs);
  }

  async function nudgeFine(direction: -1 | 1) {
    if (!snapshot) return;
    await nudge(snapshot.config.nudge.fineMs * direction);
  }

  async function nudgeCoarse(direction: -1 | 1) {
    if (!snapshot) return;
    await nudge(snapshot.config.nudge.coarseMs * direction);
  }

  async function resync() {
    if (!bridge) return;
    snapshot = await bridge.resync();
  }

  function fmt(value: number, digits = 2) {
    if (!Number.isFinite(value) || value <= 0) return "--";
    return value.toFixed(digits);
  }

  function ms(value: number, digits = 0) {
    if (!Number.isFinite(value)) return "-- ms";
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${value.toFixed(digits)} ms`;
  }

  function linkSourceStatus(status: EpZeroStatus) {
    if (status.linkPlaying) return "Playing";
    if (status.linkPeers > 0 && status.linkBpm > 0) return "Linked";
    return "Stopped";
  }

  function displayAppState(status: EpZeroStatus) {
    return status.appState.replaceAll("_", " ");
  }

  function isMoveNonSyncPort(output: string) {
    return /ableton\s+move/i.test(output) && !/ableton\s+move.*standalone\s+port/i.test(output);
  }

  function visibleMidiOutputs(outputs: string[]) {
    return outputs.filter((output) => !isMoveNonSyncPort(output));
  }
</script>

{#if loading}
  <main class="shell loading">EP-ZERO</main>
{:else if error || !snapshot}
  <main class="shell loading">{error || "Unable to load EP-ZERO"}</main>
{:else}
  <main class="shell">
    <div class="device">
      <header class="top-strip" aria-label="Connection strip">
        <span aria-hidden="true"></span>
        <span class="hot">INPUT</span>
        <span>SYNC</span>
        <span>MIDI</span>
        <span>USB</span>
      </header>

      <section class="brand-panel" aria-label="EP-ZERO status">
        <div class="brand-copy">
          <p class="kicker">Ableton Link MIDI Sync</p>
          <h1>EP-ZERO</h1>
        </div>
      </section>

      <section class="display-panel" aria-label="Clock status">
        <div class="track-stack" aria-hidden="true">
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>D</span>
        </div>
        <div class="display-main">
          <span class="display-label">BPM</span>
          <strong>{fmt(displayStatus?.linkBpm ?? snapshot.status.linkBpm)}</strong>
          <div class:active={snapshot.status.clockQuality === "Stable"} class:jittery={snapshot.status.clockQuality === "Jittery"} class:lost={snapshot.status.clockQuality === "Lost"} class:running={snapshot.status.appState === "RUNNING"} class="quality">
            {displayAppState(snapshot.status)}
          </div>
        </div>
        <div class="display-side">
          <div>
            <span>Peers</span>
            <strong>{displayStatus?.linkPeers ?? snapshot.status.linkPeers}</strong>
          </div>
          <div>
            <span>Phase / {snapshot.config.quantum}</span>
            <strong>{fmt(displayStatus?.linkPhase ?? snapshot.status.linkPhase, 2)}</strong>
          </div>
          <div class="status-metric">
            <span>Status</span>
            <strong class="link-state">{linkSourceStatus(snapshot.status)}</strong>
          </div>
        </div>
      </section>

      <section class="control-panel">
        <div class="control-row">
          <label for="midi-output">MIDI OUT</label>
          <select id="midi-output" value={snapshot.config.midiOutputName} on:change={selectMidiOutput}>
            {#if visibleMidiOutputs(snapshot.status.availableMidiOutputs).length === 0}
              <option value="">No outputs found</option>
            {:else}
              {#each visibleMidiOutputs(snapshot.status.availableMidiOutputs) as output}
                <option value={output}>{output}</option>
              {/each}
            {/if}
          </select>
        </div>

        <div class="offset-block">
          <div class="delay-head">
            <label for="kick-offset">Kick Offset</label>
            <output for="kick-offset">{ms(snapshot.config.kickOffsetMs)}</output>
          </div>
          <input
            id="kick-offset"
            type="range"
            min="-250"
            max="250"
            step="1"
            value={snapshot.config.kickOffsetMs}
            on:input={(event) => updateConfig({ kickOffsetMs: Number((event.target as HTMLInputElement).value) })}
          />
          <div class="nudge">
            <button type="button" class="pad pad-dark" on:click={() => nudgeCoarse(-1)}>-10</button>
            <button type="button" class="pad pad-dark" on:click={() => nudgeFine(-1)}>-1</button>
            <button type="button" class="pad pad-light" on:click={() => updateConfig({ kickOffsetMs: 0 })}>0</button>
            <button type="button" class="pad pad-dark" on:click={() => nudgeFine(1)}>+1</button>
            <button type="button" class="pad pad-dark" on:click={() => nudgeCoarse(1)}>+10</button>
          </div>
        </div>

        <div class="control-row">
          <label for="launch-mode">LAUNCH MODE</label>
          <select
            id="launch-mode"
            value={snapshot.config.launchMode}
          on:change={(event) => updateConfig({ launchMode: (event.target as HTMLSelectElement).value as LaunchMode })}
        >
            <option value="next_4_bar_phrase">Next 4-Bar Phrase</option>
            <option value="next_bar">Next Bar</option>
            <option value="next_beat">Next Beat</option>
          </select>
        </div>

        <section class="actions four" aria-label="Transport controls">
          <button type="button" class="pad pad-orange" on:click={arm}>SYNC</button>
          <button type="button" class="pad pad-light" on:click={startNow}>START</button>
          <button type="button" class="pad pad-dark" on:click={stop}>STOP</button>
          <button type="button" class="pad pad-dark" on:click={resync}>RESYNC</button>
        </section>
      </section>
    </div>
    {#if snapshot.status.warning}
      <p class="warning">{snapshot.status.warning}</p>
    {/if}
  </main>
{/if}
