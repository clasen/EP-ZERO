export function findMatchingMidiOutput(outputs: string[], requestedName: string): string | null {
  if (!requestedName) return null;
  return outputs.find((output) => output === requestedName)
    ?? outputs.find((output) => sameMidiDevice(output, requestedName))
    ?? null;
}

export function sameMidiDevice(portName: string, requestedName: string): boolean {
  const port = normalizeMidiName(portName);
  const requested = normalizeMidiName(requestedName);

  if (!port || !requested) return false;
  if (port === requested) return true;

  return port.includes(requested) || requested.includes(port);
}

function normalizeMidiName(name: string): string {
  return name
    .toLowerCase()
    .replace(/k\.?\s*o\.?\s*ii/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
