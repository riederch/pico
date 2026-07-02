export type VersionVector = Record<string, number>;

export class LamportClock {
  private currentValue: number;

  public constructor(initialValue = 0) {
    if (!Number.isInteger(initialValue) || initialValue < 0) {
      throw new Error('LamportClock initialValue must be a non-negative integer.');
    }

    this.currentValue = initialValue;
  }

  public current(): number {
    return this.currentValue;
  }

  public tick(): number {
    this.currentValue += 1;
    return this.currentValue;
  }

  public receive(remoteValue: number): number {
    if (!Number.isInteger(remoteValue) || remoteValue < 0) {
      throw new Error('Remote Lamport value must be a non-negative integer.');
    }

    this.currentValue = Math.max(this.currentValue, remoteValue) + 1;
    return this.currentValue;
  }
}

export function mergeVersionVector(local: VersionVector, remote: VersionVector): VersionVector {
  const merged: VersionVector = { ...local };

  for (const [deviceId, value] of Object.entries(remote)) {
    merged[deviceId] = Math.max(merged[deviceId] ?? 0, value);
  }

  return merged;
}

export function updateVersionVector(vector: VersionVector, deviceId: string, lamport: number): VersionVector {
  if (!deviceId) {
    throw new Error('deviceId must not be empty.');
  }

  if (!Number.isInteger(lamport) || lamport < 0) {
    throw new Error('lamport must be a non-negative integer.');
  }

  return {
    ...vector,
    [deviceId]: Math.max(vector[deviceId] ?? 0, lamport),
  };
}
