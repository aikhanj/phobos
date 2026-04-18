import type { NoteId } from '@phobos/types';
import { getNoteById } from '../agents/phobosPrompt';

/**
 * Full-screen overlay that displays a found document when the player
 * interacts with a note prop. Input is disabled while reading.
 */
export class NoteOverlay {
  private container: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private visible = false;
  private onDismiss: (() => void) | null = null;
  private handleKey: (e: KeyboardEvent) => void;

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '25',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.82)',
      cursor: 'default',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      maxWidth: '520px',
      width: '90%',
      maxHeight: '70vh',
      overflowY: 'auto',
      padding: '32px 28px',
      background: 'rgba(30, 25, 20, 0.95)',
      border: '1px solid #3a3228',
      borderRadius: '2px',
      fontFamily: "'Courier New', monospace",
      color: '#c8b89a',
      lineHeight: '1.7',
      fontSize: '13px',
      boxShadow: '0 0 40px rgba(0,0,0,0.6)',
      scrollbarWidth: 'thin',
      scrollbarColor: '#3a3228 transparent',
    });

    this.titleEl = document.createElement('div');
    Object.assign(this.titleEl.style, {
      fontSize: '11px',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: '#8a7a6a',
      marginBottom: '16px',
      borderBottom: '1px solid #3a3228',
      paddingBottom: '12px',
    });

    this.contentEl = document.createElement('div');
    Object.assign(this.contentEl.style, {
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    });

    this.hintEl = document.createElement('div');
    Object.assign(this.hintEl.style, {
      marginTop: '20px',
      fontSize: '10px',
      color: '#5a5040',
      textAlign: 'center',
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
    });
    this.hintEl.textContent = 'press [E] or [ESC] to close';

    card.appendChild(this.titleEl);
    card.appendChild(this.contentEl);
    card.appendChild(this.hintEl);
    this.container.appendChild(card);
    document.body.appendChild(this.container);

    this.handleKey = (e: KeyboardEvent) => {
      if (!this.visible) return;
      if (e.code === 'KeyE' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      }
    };
    document.addEventListener('keydown', this.handleKey, true);
  }

  /**
   * Show a note by id. Calls onDismissCallback when the player closes it.
   */
  show(noteId: NoteId, onDismissCallback?: () => void): void {
    const note = getNoteById(noteId);
    if (!note) return;

    this.titleEl.textContent = note.title;
    this.contentEl.textContent = note.content;
    this.container.style.display = 'flex';
    this.visible = true;
    this.onDismiss = onDismissCallback ?? null;
  }

  hide(): void {
    if (!this.visible) return;
    this.container.style.display = 'none';
    this.visible = false;
    this.onDismiss?.();
    this.onDismiss = null;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleKey, true);
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
