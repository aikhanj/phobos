/**
 * Fullscreen chapter title card — the "Silent Hill / Resident Evil"
 * style transition that fires at each plot beat. Big roman numeral,
 * title, subtitle (date + venue), brief date stamp pulse in the corner.
 *
 * Design: pure black background, amber-gold type, CRT scanlines over
 * the top to match Phobos's terminal aesthetic. Fades in, holds, fades
 * out — self-contained async so main.ts can `await card.show(...)`
 * between a scene transition and the club entry sting.
 */
export interface ChapterCardOptions {
  roman: string;
  title: string;
  subtitle: string;
  holdMs?: number;
}

export class ChapterCard {
  private root: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '36',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      background: '#000',
      fontFamily: "'Courier New', monospace",
      color: '#c09030',
      textAlign: 'center',
      pointerEvents: 'none',
      userSelect: 'none',
      opacity: '0',
      transition: 'opacity 800ms ease',
      gap: '1.1rem',
    });

    // CRT scanlines
    const scanlines = document.createElement('div');
    Object.assign(scanlines.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0 1px, transparent 1px 3px)',
      mixBlendMode: 'multiply',
    });
    this.root.appendChild(scanlines);

    // Vignette
    const vignette = document.createElement('div');
    Object.assign(vignette.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      boxShadow: 'inset 0 0 240px 60px rgba(0,0,0,0.95)',
    });
    this.root.appendChild(vignette);

    document.body.appendChild(this.root);
  }

  /** Show a chapter card. Resolves when it has fully faded out. */
  async show(opts: ChapterCardOptions): Promise<void> {
    const hold = opts.holdMs ?? 3600;

    // Clear previous content (keep scanlines/vignette which are first two)
    while (this.root.children.length > 2) {
      this.root.removeChild(this.root.lastChild!);
    }

    // CHAPTER small label
    const label = document.createElement('div');
    label.textContent = 'CHAPTER';
    Object.assign(label.style, {
      position: 'relative',
      zIndex: '2',
      fontSize: '0.82rem',
      letterSpacing: '0.6rem',
      color: '#886040',
      marginBottom: '-0.4rem',
    });
    this.root.appendChild(label);

    // Roman numeral — huge
    const roman = document.createElement('div');
    roman.textContent = opts.roman;
    Object.assign(roman.style, {
      position: 'relative',
      zIndex: '2',
      fontSize: 'clamp(5rem, 14vw, 11rem)',
      fontWeight: '900',
      letterSpacing: '0.2rem',
      color: '#e0b060',
      textShadow: '0 0 22px rgba(224,176,96,0.5), 0 0 60px rgba(224,176,96,0.2)',
      lineHeight: '1',
      animation: 'phobosChapterRomanIn 1200ms cubic-bezier(0.2, 0.6, 0.3, 1) both',
    });
    this.root.appendChild(roman);

    // Title
    const title = document.createElement('div');
    title.textContent = opts.title;
    Object.assign(title.style, {
      position: 'relative',
      zIndex: '2',
      fontSize: 'clamp(1.4rem, 3.2vw, 2.3rem)',
      letterSpacing: '0.55rem',
      color: '#e0b060',
      marginTop: '0.5rem',
    });
    this.root.appendChild(title);

    // Subtitle
    const subtitle = document.createElement('div');
    subtitle.textContent = opts.subtitle;
    Object.assign(subtitle.style, {
      position: 'relative',
      zIndex: '2',
      fontSize: '0.78rem',
      letterSpacing: '0.32rem',
      color: '#886040',
      marginTop: '0.1rem',
      fontStyle: 'italic',
    });
    this.root.appendChild(subtitle);

    // Separator bar
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'relative',
      zIndex: '2',
      width: '120px',
      height: '1px',
      background: 'linear-gradient(90deg, transparent, #c09030, transparent)',
      marginTop: '0.8rem',
    });
    this.root.appendChild(bar);

    // Flicker date stamp bottom-right
    const stamp = document.createElement('div');
    stamp.textContent = '● REC · PROSPECT AVE · 4722';
    Object.assign(stamp.style, {
      position: 'absolute',
      bottom: '1.4rem',
      right: '1.8rem',
      fontSize: '0.65rem',
      letterSpacing: '0.2rem',
      color: '#a04020',
      zIndex: '2',
      animation: 'phobosChapterRecPulse 1.2s ease-in-out infinite',
    });
    this.root.appendChild(stamp);

    ensureKeyframes();

    // Show + animate
    this.root.style.display = 'flex';
    await sleep(16);
    this.root.style.opacity = '1';
    await sleep(hold);
    this.root.style.opacity = '0';
    await sleep(820);
    this.root.style.display = 'none';
  }
}

let kf = false;
function ensureKeyframes(): void {
  if (kf) return;
  kf = true;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes phobosChapterRomanIn {
      0%   { opacity: 0; transform: translateY(18px) scale(0.88); filter: blur(10px); }
      60%  { opacity: 1; transform: translateY(0) scale(1.03); filter: blur(0); }
      100% { opacity: 1; transform: translateY(0) scale(1.00); }
    }
    @keyframes phobosChapterRecPulse {
      0%,100% { opacity: 0.35; }
      50%     { opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
