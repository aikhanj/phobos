import type { CornerBox } from '../ui/cornerBox';
import type { FadeOverlay } from '../ui/fadeOverlay';
import type { VoiceEngine } from '@phobos/voice';
import { playerProfile } from '../game/playerProfile';
import { PhonePanel } from '../ui/phonePanel';
import { PHONE_THREAD, ROOMMATE, DAYS_SILENT } from './storyline';

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

    // ── Phone thread: the last conversation with Elliot, a year ago. ──
    // Concretizes "subject 4721" as a real person before the abstract
    // system-voice framing takes over. The thread's final message is
    // unanswered — that silence is the player's complicity.
    const phone = new PhonePanel({
      messages: PHONE_THREAD,
      contactName: ROOMMATE.fullName,
      contactSubtitle: `last seen ${DAYS_SILENT} days ago · forbes college · '${ROOMMATE.classYear.slice(2)}`,
    });
    await phone.show();
    await phone.hide();

    this.card = this.createCard();
    document.body.appendChild(this.card);

    await sleep(900);

    const profile = playerProfile.get();
    const nameLine = playerProfile.isSubmitted
      ? `referring member: ${profile.name.toLowerCase()}. form 7b on file.`
      : 'referring member: [redacted]. form 7b on file.';
    const collegeLine = playerProfile.isSubmitted
      ? `residential college: ${profile.college}. cross-ref: prior subject match.`
      : 'residential college: [unknown].';
    const fearLine = playerProfile.isSubmitted && profile.fear !== 'the dark'
      ? `section 3.7 response logged: "${profile.fear.toLowerCase()}". noted.`
      : 'section 3.7 response logged.';
    const lines = [
      'intake begin. subject 4722.',
      nameLine,
      `prior subject: 4721 — chen, elliot. status: absorbed.`,
      `last message: "come to tower. something is wrong." · ${DAYS_SILENT} days unanswered.`,
      collegeLine,
      fearLine,
      'last known location: tower club. bicker night. 23:14.',
      'calibration environment: prospect avenue.',
      'protocol author: c.l. eisgruber · office of the president · nassau hall.',
      'authorizing signature on file: dean eisgruber · 03/14/2025 · 23:41.',
      'FRG_LOCK: egress denied. dean eisgruber is holding the key.',
    ];
    for (const line of lines) {
      cornerBox.appendLog({ source: 'phobos', message: line, timestamp: Date.now() });
      await sleep(650);
    }

    await sleep(500);

    let ttsDone: Promise<void> = Promise.resolve();
    if (voice && defaultVoiceId) {
      try {
        const personalizedOpener = playerProfile.isSubmitted
          ? `welcome, ${profile.name.toLowerCase()}. dean eisgruber read your form. elliot walked this street before you. he went to tower first. you should too.`
          : 'welcome, four seven two two. dean eisgruber read your form. elliot walked this street before you. he went to tower first. you should too.';
        const handle = voice.speak({
          text: personalizedOpener,
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
    sub.textContent = `bicker night. ${DAYS_SILENT} days later.`;
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
