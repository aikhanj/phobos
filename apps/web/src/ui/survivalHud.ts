import type { SurvivalHudState } from '../horror/survival';

/**
 * Top-left HUD panel showing the Granny-survival state:
 *   - 3 heart icons (red = alive, grey = spent)
 *   - 3 item slots (KEY / CODE / BOLTS) — dim when missing, bright
 *     with gold border when collected
 *   - A "HIDDEN" badge that appears when the player is in a hide zone
 *
 * All CSS, no images. Rendered in the top-left corner so it doesn't
 * collide with the corner-box webcam panel (top-right).
 */
export class SurvivalHud {
  private root: HTMLDivElement;
  private hearts: HTMLDivElement[] = [];
  private itemSlots: Record<'key' | 'code' | 'bolts', HTMLDivElement>;
  private hiddenBadge: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '16px',
      left: '16px',
      zIndex: '28',
      padding: '12px 14px',
      background: 'rgba(12, 8, 6, 0.75)',
      border: '1px solid #3a2818',
      borderRadius: '4px',
      fontFamily: "'Courier New', monospace",
      color: '#c8b89a',
      fontSize: '12px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      pointerEvents: 'none',
      userSelect: 'none',
      minWidth: '200px',
      boxShadow: '0 2px 14px rgba(0,0,0,0.6)',
    });

    // ── Row 1: hearts ──
    const heartsRow = document.createElement('div');
    Object.assign(heartsRow.style, {
      display: 'flex',
      gap: '6px',
      marginBottom: '10px',
      alignItems: 'center',
    });
    const label = document.createElement('div');
    label.textContent = 'lives';
    Object.assign(label.style, {
      fontSize: '10px',
      color: '#8a7060',
      letterSpacing: '0.25em',
      marginRight: '8px',
    });
    heartsRow.appendChild(label);
    for (let i = 0; i < 3; i++) {
      const heart = document.createElement('div');
      Object.assign(heart.style, {
        width: '14px',
        height: '12px',
        background: '#d02020',
        clipPath: 'polygon(50% 100%, 0 40%, 10% 15%, 30% 15%, 50% 30%, 70% 15%, 90% 15%, 100% 40%)',
        transition: 'background 0.4s',
        boxShadow: '0 0 6px rgba(200,30,30,0.55)',
      });
      heartsRow.appendChild(heart);
      this.hearts.push(heart);
    }
    this.root.appendChild(heartsRow);

    // ── Row 2: escape items ──
    const itemsLabel = document.createElement('div');
    itemsLabel.textContent = 'escape items';
    Object.assign(itemsLabel.style, {
      fontSize: '10px',
      color: '#8a7060',
      letterSpacing: '0.25em',
      marginBottom: '4px',
    });
    this.root.appendChild(itemsLabel);

    const itemsRow = document.createElement('div');
    Object.assign(itemsRow.style, {
      display: 'flex',
      gap: '8px',
    });
    const slotDefs: Array<{ id: 'key' | 'code' | 'bolts'; label: string }> = [
      { id: 'key',   label: 'KEY' },
      { id: 'code',  label: 'CODE' },
      { id: 'bolts', label: 'BOLTS' },
    ];
    const slots: Partial<Record<'key' | 'code' | 'bolts', HTMLDivElement>> = {};
    for (const def of slotDefs) {
      const slot = document.createElement('div');
      slot.textContent = def.label;
      Object.assign(slot.style, {
        flex: '1',
        padding: '6px 4px',
        textAlign: 'center',
        background: 'rgba(30,22,12,0.55)',
        border: '1px solid #3a2818',
        color: '#5a4838',
        fontSize: '10px',
        letterSpacing: '0.2em',
        borderRadius: '2px',
        transition: 'all 0.3s',
      });
      itemsRow.appendChild(slot);
      slots[def.id] = slot;
    }
    this.itemSlots = slots as Record<'key' | 'code' | 'bolts', HTMLDivElement>;
    this.root.appendChild(itemsRow);

    // ── Row 3: hidden badge ──
    this.hiddenBadge = document.createElement('div');
    this.hiddenBadge.textContent = '· HIDDEN ·';
    Object.assign(this.hiddenBadge.style, {
      marginTop: '10px',
      padding: '6px 10px',
      textAlign: 'center',
      background: 'rgba(20, 40, 60, 0.85)',
      border: '1px solid #4080c0',
      color: '#a0d8ff',
      fontSize: '11px',
      letterSpacing: '0.3em',
      fontWeight: '700',
      borderRadius: '2px',
      boxShadow: '0 0 12px rgba(64,128,192,0.4)',
      display: 'none',
      animation: 'survivalHudPulse 1.5s ease-in-out infinite',
    });
    this.root.appendChild(this.hiddenBadge);

    // Animation keyframes.
    const style = document.createElement('style');
    style.textContent = `
      @keyframes survivalHudPulse {
        0%, 100% { opacity: 0.75; }
        50%      { opacity: 1.00; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(this.root);
  }

  update(state: SurvivalHudState): void {
    // Hearts.
    for (let i = 0; i < this.hearts.length; i++) {
      const alive = i < state.lives;
      this.hearts[i].style.background = alive ? '#d02020' : '#2a1010';
      this.hearts[i].style.boxShadow = alive
        ? '0 0 6px rgba(200,30,30,0.55)'
        : 'none';
    }

    // Items.
    const applySlot = (slot: HTMLDivElement, collected: boolean): void => {
      if (collected) {
        slot.style.background = 'rgba(80,60,20,0.85)';
        slot.style.border = '1px solid #e0b060';
        slot.style.color = '#ffd880';
        slot.style.boxShadow = '0 0 10px rgba(224,176,96,0.4)';
      } else {
        slot.style.background = 'rgba(30,22,12,0.55)';
        slot.style.border = '1px solid #3a2818';
        slot.style.color = '#5a4838';
        slot.style.boxShadow = 'none';
      }
    };
    applySlot(this.itemSlots.key, state.inventory.key);
    applySlot(this.itemSlots.code, state.inventory.code);
    applySlot(this.itemSlots.bolts, state.inventory.bolts);

    // Hidden badge.
    this.hiddenBadge.style.display = state.hidden ? 'block' : 'none';
  }

  show(): void {
    this.root.style.display = 'block';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
  dispose(): void {
    this.root.remove();
  }
}
