/**
 * Centre-screen crosshair. Two visual states:
 *   idle     — 4px white dot, slightly translucent.
 *   target   — 10px hollow ring, brighter, with a hint word below (e.g. "climb").
 *
 * Engine owns the interactable picker and calls `setTarget(hint | null)` on
 * transitions. Keep the DOM work cheap; this is touched each frame indirectly.
 */
export class Crosshair {
  private root: HTMLDivElement;
  private dot: HTMLDivElement;
  private ring: HTMLDivElement;
  private hint: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: '8',
      display: 'none',
      width: '24px',
      height: '24px',
    });

    this.dot = document.createElement('div');
    Object.assign(this.dot.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '4px',
      height: '4px',
      marginTop: '-2px',
      marginLeft: '-2px',
      borderRadius: '50%',
      background: '#ffffff',
      boxShadow: '0 0 2px rgba(0,0,0,0.9)',
      opacity: '0.85',
      transition: 'opacity 120ms ease, transform 120ms ease',
    });

    this.ring = document.createElement('div');
    Object.assign(this.ring.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '14px',
      height: '14px',
      marginTop: '-7px',
      marginLeft: '-7px',
      borderRadius: '50%',
      border: '1.5px solid #ffffff',
      boxShadow: '0 0 6px rgba(255,255,255,0.35)',
      opacity: '0',
      transform: 'scale(0.6)',
      transition: 'opacity 140ms ease, transform 140ms ease',
    });

    this.hint = document.createElement('div');
    Object.assign(this.hint.style, {
      position: 'absolute',
      top: '26px',
      left: '50%',
      transform: 'translateX(-50%)',
      whiteSpace: 'nowrap',
      fontFamily: "'Courier New', monospace",
      fontSize: '11px',
      letterSpacing: '0.2em',
      color: '#f0e0b0',
      textShadow: '0 0 6px rgba(0,0,0,0.9)',
      opacity: '0',
      transition: 'opacity 140ms ease',
      textTransform: 'uppercase',
    });

    this.root.appendChild(this.dot);
    this.root.appendChild(this.ring);
    this.root.appendChild(this.hint);
    document.body.appendChild(this.root);
  }

  show(): void { this.root.style.display = 'block'; }
  hide(): void { this.root.style.display = 'none'; }

  setTarget(hint: string | null): void {
    if (hint === null) {
      this.ring.style.opacity = '0';
      this.ring.style.transform = 'scale(0.6)';
      this.dot.style.opacity = '0.85';
      this.dot.style.transform = 'scale(1)';
      this.hint.style.opacity = '0';
      return;
    }
    this.ring.style.opacity = '1';
    this.ring.style.transform = 'scale(1)';
    this.dot.style.opacity = '1';
    this.dot.style.transform = 'scale(1.35)';
    this.hint.textContent = `[E] ${hint}`;
    this.hint.style.opacity = '1';
  }
}
