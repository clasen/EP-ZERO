const midi = require("midi");

const output = new midi.Output();
const outputs = [];

for (let index = 0; index < output.getPortCount(); index += 1) {
  outputs.push(output.getPortName(index));
}

console.log("MIDI outputs:");
outputs.forEach((port, index) => console.log(`${index}: ${port}`));

const requestedPort = process.argv[3];
const portIndex = requestedPort
  ? outputs.findIndex((port) => port.toLowerCase().includes(requestedPort.toLowerCase()))
  : preferredOutputIndex(outputs);
if (portIndex < 0) {
  console.error("MIDI output port not found.");
  process.exit(2);
}

console.log(`MIDI candidate output: ${portIndex}: ${outputs[portIndex]}`);
const moveWarning = moveStandaloneWarning(outputs);
if (moveWarning) console.warn(moveWarning);
output.closePort();

function preferredOutputIndex(outputs) {
  const priorityChecks = [
    (port) => /ableton\s+move.*standalone\s+port/i.test(port),
    (port) => !/virtual|iac|network session/i.test(port) && !isMoveNonStandalonePort(port),
    (port) => !/virtual|iac|network session/i.test(port) && /midi|usb|port|ep-\d+/i.test(port),
    (port) => /midi|usb/i.test(port)
  ];

  for (const check of priorityChecks) {
    const index = outputs.findIndex(check);
    if (index >= 0) return index;
  }

  return -1;
}

function moveStandaloneWarning(outputs) {
  const hasMove = outputs.some((port) => /ableton\s+move/i.test(port));
  const hasStandalone = outputs.some((port) => /ableton\s+move.*standalone\s+port/i.test(port));
  if (!hasMove || hasStandalone) return null;
  return "Ableton Move detected, but Ableton Move Standalone Port is missing. On Move, use Standalone Mode, set MIDI Sync to In, turn Link Off, then reconnect it.";
}

function isMoveNonStandalonePort(port) {
  return /ableton\s+move/i.test(port) && !/ableton\s+move.*standalone\s+port/i.test(port);
}
