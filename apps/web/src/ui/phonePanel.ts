import type { PhoneMessage } from '../horror/storyline';

/**
 * iMessage-style phone panel shown during the opening cinematic.
 *
 * Purpose: concretize the missing roommate as a real person (Elliot Chen)
 * with a dated text thread the player scrolls through. Every bubble fades
 * in on its own timer; the final unanswered message pulses red. When the
 * panel dismisses, the intro sequence continues to the PROSPECT AVENUE
 * title card.
 *
 * Shipped as its own class rather than DOM in introSequence so the
 * intro file stays scannable. Styled to feel diegetic — iOS-ish but with
 * Phobos-coded color drift.
 */

export interface PhonePanelOptions {
  /** The thread to render. */
  messages: PhoneMessage[];
  /** Contact name shown at the top of the phone. */
  contactName: string;
  /** Right under the contact name — "last seen 400 days ago" etc. */
  contactSubtitle: string;
}

export class PhonePanel {
  private root: HTMLDivElement;
  /** Definite-assignment — buildDom() (called in constructor) populates this. */
  private bubbles!: HTMLDivElement;
  private options: PhonePanelOptions;

  constructor(options: PhonePanelOptions) {
    this.options = options;
    this.root = this.buildDom();
  }

  /**
   * Mount + animate in. Resolves once the full thread has been typed in
   * and the final unanswered message has pulsed a couple of times — caller
   * then dismisses via hide().
   */
  async show(): Promise<void> {
    document.body.appendChild(this.root);
    await sleep(60);
    this.root.style.opacity = '1';
    // Staggered reveal of each bubble so the player reads them in order.
    // ~900ms per message keeps the thread tense without dragging.
    for (let i = 0; i < this.options.messages.length; i++) {
      const msg = this.options.messages[i];
      await sleep(i === 0 ? 800 : 850);
      this.appendBubble(msg, i);
      // Auto-scroll to bottom as the thread grows.
      this.bubbles.scrollTop = this.bubbles.scrollHeight;
    }
    // Let the final unanswered bubble linger + pulse.
    await sleep(2400);
  }

  async hide(): Promise<void> {
    this.root.style.opacity = '0';
    await sleep(700);
    if (this.root.parentElement) this.root.parentElement.removeChild(this.root);
  }

  private buildDom(): HTMLDivElement {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '32',
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '0',
      transition: 'opacity 900ms ease',
      pointerEvents: 'none',
      userSelect: 'none',
      fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
    });

    // Phone frame — iOS-ish proportions with subtle Phobos drift.
    const phone = document.createElement('div');
    Object.assign(phone.style, {
      width: 'min(360px, 90vw)',
      height: 'min(720px, 90vh)',
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: '34px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 0 60px rgba(192,144,48,0.12), 0 0 120px rgba(0,0,0,0.9)',
      position: 'relative',
    });

    // Status bar — fake time + battery + signal
    const status = document.createElement('div');
    Object.assign(status.style, {
      padding: '0.5rem 1.2rem 0.3rem',
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '0.7rem',
      color: '#ccc',
      fontWeight: '600',
    });
    status.innerHTML = `<span>11:14 PM</span><span>● ● ●  97%</span>`;
    phone.appendChild(status);

    // Contact header
    const header = document.createElement('div');
    Object.assign(header.style, {
      textAlign: 'center',
      padding: '0.2rem 0 0.8rem',
      borderBottom: '1px solid #1a1a1a',
    });
    const avatar = document.createElement('div');
    Object.assign(avatar.style, {
      width: '40px',
      height: '40px',
      margin: '0 auto 0.3rem',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #3a3a3a, #1a1a1a)',
      color: '#888',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: '600',
      letterSpacing: '0.05rem',
      border: '1px solid #2a2a2a',
    });
    avatar.textContent = 'EC';
    header.appendChild(avatar);

    const name = document.createElement('div');
    name.textContent = this.options.contactName;
    Object.assign(name.style, {
      fontSize: '0.88rem',
      color: '#e4e4e4',
      fontWeight: '500',
    });
    header.appendChild(name);

    const subtitle = document.createElement('div');
    subtitle.textContent = this.options.contactSubtitle;
    Object.assign(subtitle.style, {
      fontSize: '0.62rem',
      color: '#a04040',
      marginTop: '0.15rem',
      letterSpacing: '0.05rem',
    });
    header.appendChild(subtitle);

    phone.appendChild(header);

    // Scrollable bubble area
    const bubbles = document.createElement('div');
    Object.assign(bubbles.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '0.6rem 0.7rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.3rem',
      scrollBehavior: 'smooth',
    });
    phone.appendChild(bubbles);
    this.bubbles = bubbles;

    // Bottom "text field" — greyed out, dormant.
    const compose = document.createElement('div');
    Object.assign(compose.style, {
      padding: '0.6rem 0.8rem 1rem',
      borderTop: '1px solid #1a1a1a',
      color: '#3a3a3a',
      fontSize: '0.75rem',
      fontStyle: 'italic',
    });
    compose.textContent = '       Message';
    phone.appendChild(compose);

    root.appendChild(phone);
    return root;
  }

  private appendBubble(msg: PhoneMessage, index: number): void {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: msg.from === 'me' ? 'flex-end' : 'flex-start',
      opacity: '0',
      transform: 'translateY(6px)',
      transition: 'opacity 300ms ease, transform 300ms ease',
    });

    const bubble = document.createElement('div');
    bubble.textContent = msg.text;
    Object.assign(bubble.style, {
      maxWidth: '72%',
      padding: '0.5rem 0.75rem',
      borderRadius: '16px',
      fontSize: '0.82rem',
      lineHeight: '1.3',
      wordBreak: 'break-word',
    });

    if (msg.from === 'me') {
      // Player's sent bubbles — iMessage blue, faintly desaturated.
      Object.assign(bubble.style, {
        background: '#2b6cb0',
        color: '#fff',
      });
    } else {
      // Elliot's bubbles — iOS grey.
      Object.assign(bubble.style, {
        background: '#2a2a2a',
        color: '#e4e4e4',
      });
    }

    // Unanswered final message — red cast + slow pulse.
    if (msg.unanswered) {
      bubble.style.background = '#3a1818';
      bubble.style.color = '#ff8080';
      bubble.style.border = '1px solid #4a2020';
      bubble.style.animation = 'phobosUnanswered 2s ease-in-out infinite';
      ensureKeyframes();
    }

    wrap.appendChild(bubble);

    const ts = document.createElement('div');
    ts.textContent = msg.unanswered
      ? `${msg.timestamp} · delivered · never read`
      : msg.timestamp;
    Object.assign(ts.style, {
      fontSize: '0.58rem',
      color: msg.unanswered ? '#a04040' : '#555',
      marginTop: '0.2rem',
      padding: '0 0.4rem',
    });
    wrap.appendChild(ts);

    this.bubbles.appendChild(wrap);

    // Fade-in next frame.
    requestAnimationFrame(() => {
      wrap.style.opacity = '1';
      wrap.style.transform = 'translateY(0)';
    });

    void index;
  }
}

let keyframesInjected = false;
function ensureKeyframes(): void {
  if (keyframesInjected) return;
  keyframesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes phobosUnanswered {
      0%, 100% { box-shadow: 0 0 0 rgba(255,80,80,0); }
      50%      { box-shadow: 0 0 16px rgba(255,80,80,0.35); }
    }
  `;
  document.head.appendChild(style);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
