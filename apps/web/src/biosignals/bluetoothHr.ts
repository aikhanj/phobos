// Web Bluetooth client for the standard BLE Heart Rate Service.
// Works with any device advertising GATT service 0x180D (Polar H9/H10, Wahoo Tickr,
// Garmin HRM-Dual, Apple Watch via the phobos-watch-bridge companion app, etc).

const HR_SERVICE = 'heart_rate';
const HR_MEASUREMENT = 'heart_rate_measurement';

export type BluetoothHrStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export class BluetoothHrClient {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private currentBpm = 0;
  private lastSampleAt = 0;

  onBpm: ((bpm: number) => void) | null = null;
  onStatus: ((status: BluetoothHrStatus, detail?: string) => void) | null = null;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  get bpm(): number {
    return this.currentBpm;
  }

  // True if we got a sample within the last ~5s; useful for UI staleness.
  get isLive(): boolean {
    return this.currentBpm > 0 && Date.now() - this.lastSampleAt < 5000;
  }

  async connect(): Promise<void> {
    if (!BluetoothHrClient.isSupported()) {
      this.emitStatus('error', 'Web Bluetooth not supported in this browser');
      throw new Error('Web Bluetooth not supported');
    }

    this.emitStatus('connecting');

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HR_SERVICE] }],
        optionalServices: [HR_SERVICE],
      });

      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);

      const server = await this.device.gatt!.connect();
      const service = await server.getPrimaryService(HR_SERVICE);
      this.characteristic = await service.getCharacteristic(HR_MEASUREMENT);
      this.characteristic.addEventListener(
        'characteristicvaluechanged',
        this.onCharacteristicValueChanged,
      );
      await this.characteristic.startNotifications();

      this.emitStatus('connected', this.device.name ?? 'unnamed HR monitor');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitStatus('error', msg);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.characteristic) {
      try {
        await this.characteristic.stopNotifications();
      } catch {
        // ignore
      }
      this.characteristic.removeEventListener(
        'characteristicvaluechanged',
        this.onCharacteristicValueChanged,
      );
      this.characteristic = null;
    }
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.onDisconnected);
      if (this.device.gatt?.connected) {
        this.device.gatt.disconnect();
      }
      this.device = null;
    }
    this.currentBpm = 0;
    this.emitStatus('disconnected');
  }

  // 0x2A37 encoding per Bluetooth SIG spec:
  //   byte 0: flags (bit 0 = HR format: 0=uint8, 1=uint16 little-endian)
  //   byte 1 (+2 if uint16): the BPM value
  private parseHeartRate(value: DataView): number {
    const flags = value.getUint8(0);
    const is16 = (flags & 0x01) === 0x01;
    return is16 ? value.getUint16(1, /* littleEndian */ true) : value.getUint8(1);
  }

  private onCharacteristicValueChanged = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;
    const bpm = this.parseHeartRate(target.value);
    if (bpm > 0 && bpm < 250) {
      this.currentBpm = bpm;
      this.lastSampleAt = Date.now();
      this.onBpm?.(bpm);
    }
  };

  private onDisconnected = (): void => {
    this.currentBpm = 0;
    this.emitStatus('disconnected', this.device?.name);
  };

  private emitStatus(status: BluetoothHrStatus, detail?: string): void {
    this.onStatus?.(status, detail);
  }
}
