import type { CornerBox } from '../ui/cornerBox';
import type { FadeOverlay } from '../ui/fadeOverlay';
import type { AudioManager } from '../audio/audioManager';
import type { WebcamGhost } from './webcamGhost';
import type { VoiceEngine } from '@phobos/voice';

export interface RevealSequenceDeps {
  cornerBox: CornerBox;
  fade: FadeOverlay;
  audio: AudioManager;
  webcamGhost: WebcamGhost | null;
  voice: VoiceEngine | null;
  defaultVoiceId: string | undefined;
  sessionStartTime: number;
  lastFearScore: number;
  lastBpm: number;
}

/**
 * The endgame reveal — Phobos shows the player that IT is the entity
 * watching through their webcam. Scripted (not LLM-driven) because
 * this moment is too important to leave to chance.
 *
 * Sequence:
 *   1. All audio cuts, silence
 *   2. Corner box webcam expands to fullscreen
 *   3. Face distortion via WebcamGhost
 *   4. Rapid-scroll biosignal data dump
 *   5. Final message: clinical → personal
 *   6. Cut to black
 *   7. Final whisper via TTS
 */
export class RevealSequence {
  private deps: RevealSequenceDeps;
  private dataOverlay: HTMLDivElement | null = null;

  constructor(deps: RevealSequenceDeps) {
    this.deps = deps;
  }

  async run(): Promise<void> {
    const { cornerBox, fade, audio, webcamGhost, voice, defaultVoiceId } = this.deps;

    // Step 1: All audio cuts — 2s of silence
    audio.duckForSilence(20);
    await sleep(2000);

    // Step 2: Begin webcam expansion to fullscreen (CSS transition, 3s)
    cornerBox.setExpanding(true);

    // Step 3: Start face distortion during expansion
    if (webcamGhost) {
      // Long buildup + long snap = sustained distortion through the reveal
      webcamGhost.flash({ buildupMs: 4000, snapMs: 6000, fadeMs: 1000 }).catch(() => {});
    }

    // Wait for expansion to land
    await sleep(3500);

    // Step 4: Create data dump overlay on top of the expanding feed
    this.dataOverlay = this.createDataOverlay();
    document.body.appendChild(this.dataOverlay);

    // Rapid-scroll real biosignal data
    const sessionDuration = (performance.now() - this.deps.sessionStartTime) / 1000;
    const minutes = Math.floor(sessionDuration / 60);
    const seconds = Math.floor(sessionDuration % 60);

    const dataLines = [
      `fear_score: ${this.deps.lastFearScore.toFixed(2)}`,
      `bpm: ${this.deps.lastBpm || 72}`,
      `gaze_aversion: ${(Math.random() * 0.4 + 0.3).toFixed(2)}`,
      `flinch_count: ${Math.floor(Math.random() * 6 + 2)}`,
      `look_stillness: ${(Math.random() * 0.3 + 0.4).toFixed(2)}`,
      `session_duration: ${minutes}m ${seconds}s`,
      '',
      `subject 4721: session terminated.`,
      `subject 4721: profile absorbed.`,
      '',
      `subject 4722: session active.`,
      `subject 4722: fear_score: ${this.deps.lastFearScore.toFixed(2)}`,
      `subject 4722: calibration quality: EXCELLENT`,
      '',
      `you came looking for 4721.`,
    ];

    await this.typeLines(dataLines, 150);
    await sleep(1200);

    // Step 5: Final messages — clinical → personal → guilt
    this.clearOverlay();
    await this.showFinalMessage('You are subject 4722.');
    await sleep(2500);
    await this.showFinalMessage('You filled out the form. You already knew.');
    await sleep(3000);
    await this.showFinalMessage('Calibration complete.');
    await sleep(2000);

    // Step 6: Cut to black
    fade.setZIndex(40); // Above expanded corner box (z-index 35)
    await fade.fadeToBlack(800);

    // Step 7: Final whisper via TTS
    if (voice && defaultVoiceId) {
      await sleep(1000);
      try {
        const handle = voice.speak({
          text: 'you filled out the form. you already knew.',
          voiceId: defaultVoiceId,
          gain: 0.7,
        });
        await handle.done;
      } catch {
        // TTS failure is non-fatal
      }
    }

    // Step 8: Hold black indefinitely
    await sleep(1000);
    fade.holdBlack();

    // Cleanup overlay
    if (this.dataOverlay?.parentElement) {
      this.dataOverlay.parentElement.removeChild(this.dataOverlay);
    }
  }

  private createDataOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '36', // Above expanded corner box, below fade
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      pointerEvents: 'none',
      fontFamily: "'Courier New', monospace",
      padding: '20%',
    });
    return overlay;
  }

  private async typeLines(lines: string[], intervalMs: number): Promise<void> {
    if (!this.dataOverlay) return;
    for (const line of lines) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        color: '#00ff41',
        fontSize: '14px',
        letterSpacing: '0.1em',
        marginBottom: '4px',
        opacity: '0',
        transition: 'opacity 0.15s ease',
        textShadow: '0 0 8px rgba(0,255,65,0.4)',
      });
      el.textContent = line;
      this.dataOverlay.appendChild(el);
      // Force reflow then fade in
      void el.offsetWidth;
      el.style.opacity = '1';
      await sleep(intervalMs);
    }
  }

  private clearOverlay(): void {
    if (this.dataOverlay) {
      this.dataOverlay.innerHTML = '';
    }
  }

  private async showFinalMessage(text: string): Promise<void> {
    if (!this.dataOverlay) return;
    const el = document.createElement('div');
    Object.assign(el.style, {
      color: '#ffffff',
      fontSize: '22px',
      letterSpacing: '0.15em',
      textAlign: 'center',
      opacity: '0',
      transition: 'opacity 0.8s ease',
      textShadow: '0 0 20px rgba(255,255,255,0.3)',
      fontFamily: "'Courier New', monospace",
    });
    el.textContent = text;
    this.dataOverlay.appendChild(el);
    void el.offsetWidth;
    el.style.opacity = '1';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
