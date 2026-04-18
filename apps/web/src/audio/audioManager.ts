// Phase 3: Layered ambient audio mixer + creature voice playback via Web Audio API
export class AudioManager {
  private ctx: AudioContext | null = null;

  async init(): Promise<void> {
    this.ctx = new AudioContext();
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  dispose(): void {
    this.ctx?.close();
    this.ctx = null;
  }
}
