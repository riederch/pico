export type VersionVector = Record<string, number>;

const MAX_LAMPORT_VALUE = Number.MAX_SAFE_INTEGER;

export class LamportClock {
  private currentValue: number;

  public constructor(initialValue = 0) {
    assertLamportValue(initialValue, 'LamportClock initialValue');

    this.currentValue = initialValue;
  }

  public current(): number {
    return this.currentValue;
  }

  public tick(): number {
    assertCanAdvance(this.currentValue);

    this.currentValue += 1;
    return this.currentValue;
  }

  public receive(remoteValue: number): number {
    assertLamportValue(remoteValue, 'Remote Lamport value');

    const nextValue = Math.max(this.currentValue, remoteValue);
    assertCanAdvance(nextValue);

    this.currentValue = nextValue + 1;
    return this.currentValue;
  }
}

export function mergeVersionVector(local: VersionVector, remote: VersionVector): VersionVector {
  assertVersionVector(local, 'local version vector');
  assertVersionVector(remote, 'remote version vector');

  const merged: VersionVector = { ...local };

  for (const [deviceId, value] of Object.entries(remote)) {
    merged[deviceId] = Math.max(merged[deviceId] ?? 0, value);
  }

  return merged;
}

export function updateVersionVector(vector: VersionVector, deviceId: string, lamport: number): VersionVector {
  assertVersionVector(vector, 'version vector');

  if (!deviceId.trim()) {
    throw new Error('deviceId must not be empty.');
  }

  assertLamportValue(lamport, 'lamport');

  return {
    ...vector,
    [deviceId]: Math.max(vector[deviceId] ?? 0, lamport),
  };
}

function assertVersionVector(vector: VersionVector, label: string): void {
  for (const [deviceId, value] of Object.entries(vector)) {
    if (!deviceId.trim()) {
      throw new Error(`${label} contains an empty deviceId.`);
    }

    assertLamportValue(value, `${label} entry for ${deviceId}`);
  }
}

function assertLamportValue(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function assertCanAdvance(value: number): void {
  if (value >= MAX_LAMPORT_VALUE) {
    throw new Error('LamportClock cannot advance beyond Number.MAX_SAFE_INTEGER.');
  }
}
