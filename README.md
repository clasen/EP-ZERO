# EP-ZERO

EP-ZERO is a lightweight macOS Electron app for bridging an Ableton Link session into USB MIDI Clock.

The MVP flow is:

```text
Ableton Link source -> EP-ZERO -> USB MIDI Clock + Transport -> USB MIDI device
```

## What is implemented

- Ableton Link reader adapter for BPM, beat, phase, peer count and play state.
- USB MIDI output selection through the optional native `midi` package.
- MIDI Timing Clock generation at 24 PPQN.
- MIDI Start and Stop transport output.
- Launch scheduling for Next Beat, Next Bar and Next 4-Bar Phrase.
- Kick Offset from `-250 ms` to `+250 ms`.
- Fine/coarse nudge buttons, Arm, Start Now, Stop and Resync.
- Persisted output device, launch mode and offset configuration through Electron Store.
- Single-window Svelte UI with Link BPM, beat, phase, peers, transport and MIDI output state.

## Setup

```bash
npm install
npm run dev
```

Native MIDI and Ableton Link support depends on optional native packages:

```bash
npm install midi abletonlink
npm run rebuild:native
```

If those bindings are not present, the UI and timing engine still run and show a warning.

## USB MIDI setup

Set the receiving device MIDI Clock mode to receive clock over USB. It should not be configured as the clock source for this MVP.

## Verification

```bash
npm test
npm run build
```
