import { createRequire } from "node:module";
import { findMatchingMidiOutput } from "../shared/midi-names.js";
import type { MidiOutCommand } from "../shared/types.js";

const require = createRequire(import.meta.url);

const MIDI_BYTES: Record<MidiOutCommand["type"], number> = {
  clock: 0xf8,
  start: 0xfa,
  continue: 0xfb,
  stop: 0xfc
};

export class MidiOutputAdapter {
  private output: any | null = null;
  private openName = "";
  private openPortName = "";
  private selectedName = "";
  private warning: string | null = null;

  listOutputs(): string[] {
    const midi = this.loadMidi();
    if (!midi) return [];

    const output = new midi.Output();
    const count = output.getPortCount();
    const names: string[] = [];
    for (let index = 0; index < count; index += 1) {
      names.push(output.getPortName(index));
    }
    output.closePort();
    return names;
  }

  openByName(name: string): string | null {
    if (this.output && this.openName === name) {
      return this.warning;
    }

    this.close();
    this.selectedName = name;

    const midi = this.loadMidi();
    if (!midi || !name) return this.warning;

    const output = new midi.Output();
    const count = output.getPortCount();
    const names = Array.from({ length: count }, (_, index) => output.getPortName(index));
    const matchingName = findMatchingMidiOutput(names, name);
    const portIndex = matchingName ? names.indexOf(matchingName) : -1;

    if (portIndex === -1) {
      output.closePort();
      this.warning = `MIDI output not found: ${name}`;
      return this.warning;
    }

    output.openPort(portIndex);
    this.output = output;
    this.openName = name;
    this.openPortName = output.getPortName(portIndex);
    this.warning = null;
    return null;
  }

  send(command: MidiOutCommand): void {
    if (!this.output) return;
    this.output.sendMessage([MIDI_BYTES[command.type]]);
  }

  sendMany(commands: MidiOutCommand[]): void {
    for (const command of commands) {
      this.send(command);
    }
  }

  reopen(): string | null {
    if (!this.selectedName) return null;
    return this.openByName(this.selectedName);
  }

  close(): void {
    if (!this.output) return;
    this.output.closePort();
    this.output = null;
    this.openName = "";
    this.openPortName = "";
  }

  getWarning(): string | null {
    return this.warning;
  }

  getOpenPortName(): string {
    return this.openPortName;
  }

  private loadMidi(): any | null {
    try {
      this.warning = null;
      return require("midi");
    } catch {
      this.warning = "Native MIDI binding is not installed. Install optional dependency 'midi'.";
      return null;
    }
  }
}
