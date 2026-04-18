/**
 * Full-screen black overlay used for scene transitions and the final cut.
 * Also supports a brief "pulse" used for hard flicker / blackout effects.
 */
export class FadeOverlay {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      inset: '0',
      background: '#000',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.6s ease',
      zIndex: '30',
    });
    document.body.appendChild(this.el);
  }

  /** Fade to black over `ms` ms. */
  fadeToBlack(ms = 800): Promise<void> {
    return new Promise((resolve) => {
      this.el.style.transition = `opacity ${ms}ms ease`;
      // Force reflow so the transition fires
      void this.el.offsetWidth;
      this.el.style.opacity = '1';
      setTimeout(resolve, ms);
    });
  }

  /** Fade back in from black. */
  fadeFromBlack(ms = 800): Promise<void> {
    return new Promise((resolve) => {
      this.el.style.transition = `opacity ${ms}ms ease`;
      void this.el.offsetWidth;
      this.el.style.opacity = '0';
      setTimeout(resolve, ms);
    });
  }

  /** Hard blackout + restore — used as a flicker beat. */
  blink(ms = 180): Promise<void> {
    return new Promise((resolve) => {
      this.el.style.transition = 'none';
      this.el.style.opacity = '1';
      void this.el.offsetWidth;
      this.el.style.transition = `opacity ${ms}ms ease`;
      this.el.style.opacity = '0';
      setTimeout(resolve, ms);
    });
  }

  /** Instant hold black — caller resolves manually with fadeFromBlack. */
  holdBlack(): void {
    this.el.style.transition = 'none';
    this.el.style.opacity = '1';
  }
}
