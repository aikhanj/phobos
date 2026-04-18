import type { CornerBox } from '../ui/cornerBox';
import type { FadeOverlay } from '../ui/fadeOverlay';
import type { VoiceEngine } from '@phobos/voice';

export interface IntroSequenceDeps {
  cornerBox: CornerBox;
  fade: FadeOverlay;
  voice: VoiceEngine | null;
  defaultVoiceId: string | undefined;
}

/**
 * Opening cinematic. The screen is already black — we hold it, scroll a
 * handful of agent-log lines to frame the player as "subject 4722" looking
 * for "subject 4721" at Tower Club, let Phobos speak the premise, then
 * fade into Prospect Ave.
 *
 * Everything is layered *above* the fade (z-index 31 on the title card,
 * fade is 30) so the street stays hidden until the fade resolves.
 */
export class IntroSequence {
  private card: HTMLDivElement | null = null;

  constructor(private deps: IntroSequenceDeps) {}

  async run(): Promise<void> {
    const { cornerBox, fade, voice, defaultVoiceId } = this.deps;

    fade.holdBlack();

    this.card = this.createCard();
    document.body.appendChild(this.card);

    await sleep(900);

    const lines = [
      'intake begin. subject 4722.',
      'prior subject: 4721. status: terminated.',
      'last known location: tower club. bicker night. 23:14.',
      'calibration environment: prospect avenue.',
    ];
    for (const line of lines) {
      cornerBox.appendLog({ source: 'phobos', message: line, timestamp: Date.now() });
      await sleep(650);
    }

    await sleep(500);

    let ttsDone: Promise<void> = Promise.resolve();
    if (voice && defaultVoiceId) {
      try {
        const handle = voice.speak({
          text: 'welcome, four seven two two. subject four seven two one walked this street before you. begin at tower club.',
          voiceId: defaultVoiceId,
          gain: 0.85,
        });
        ttsDone = handle.done;
      } catch {
        // non-fatal
      }
    }

    await Promise.race([ttsDone, sleep(6500)]);
    await sleep(800);

    await this.fadeCardOut(600);
    await fade.fadeFromBlack(900);

    if (this.card?.parentElement) this.card.parentElement.removeChild(this.card);
    this.card = null;
  }

  private createCard(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '31',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.6rem',
      background: '#000',
      fontFamily: "'Courier New', monospace",
      color: '#c09030',
      letterSpacing: '0.35rem',
      textTransform: 'uppercase',
      pointerEvents: 'none',
      userSelect: 'none',
      opacity: '0',
      transition: 'opacity 1.2s ease',
    });

    const title = document.createElement('div');
    title.textContent = 'prospect avenue';
    Object.assign(title.style, {
      fontSize: '1.4rem',
      letterSpacing: '0.55rem',
      color: '#c09030',
      textShadow: '0 0 20px rgba(192,144,48,0.4)',
    });

    const sub = document.createElement('div');
    sub.textContent = 'bicker night. year unknown.';
    Object.assign(sub.style, {
      fontSize: '0.75rem',
      color: '#604020',
      letterSpacing: '0.3rem',
    });

    el.appendChild(title);
    el.appendChild(sub);

    // Fade in after first reflow.
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });
    return el;
  }

  private async fadeCardOut(ms: number): Promise<void> {
    if (!this.card) return;
    this.card.style.transition = `opacity ${ms}ms ease`;
    this.card.style.opacity = '0';
    await sleep(ms);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
