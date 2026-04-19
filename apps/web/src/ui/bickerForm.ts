import type { PlayerProfile } from '@phobos/types';
import { playerProfile } from '../game/playerProfile';

/**
 * Bicker Compatibility Assessment — Form 7B.
 *
 * The in-universe intake paperwork the player "fills out" before the game
 * begins. Every answer is weaponized: name goes into whispers, hometown into
 * the final log, fear into the climax taunt. The form itself is the horror
 * premise delivered as UI — players think they're characterizing themselves
 * when they're actually filling out a targeting dossier on Subject 4722.
 *
 * Designed to feel like a Princeton ICC (Inter-Club Council) paper form
 * digitized badly: amber CRT phosphor, Courier type, honor-code footer,
 * mild uncanny escalation as the player answers.
 */

interface BickerFormOptions {
  onSubmit: (profile: PlayerProfile) => void;
}

interface FormField {
  id: keyof Omit<PlayerProfile, 'submittedAt'>;
  label: string;
  placeholder: string;
  /** Uncanny after-note that appears below the field after blur. */
  afterNote?: string;
  /** Optional select options — if provided, renders a dropdown. */
  options?: string[];
  /** Soft max length. */
  maxLen?: number;
}

// Princeton residential colleges — real list (Yeh + NCW opened 2022).
const RES_COLLEGES = [
  'rockefeller',
  'mathey',
  'whitman',
  'butler',
  'forbes',
  'yeh',
  'new college west',
  'first / yeh 2.0',
] as const;

// Real Princeton concentrations — flavored for eating-club stereotypes.
const CONCENTRATIONS = [
  'ORFE',
  'computer science',
  'economics',
  'SPIA',
  'politics',
  'molecular biology',
  'english',
  'history',
  'math',
  'philosophy',
  'neuroscience',
  'architecture',
  'chemistry',
  'psychology',
  'other',
] as const;

const FIELDS: FormField[] = [
  {
    id: 'name',
    label: 'PREFERRED NAME',
    placeholder: 'first name only',
    afterNote: 'this is how you will be addressed during evaluation.',
    maxLen: 24,
  },
  {
    id: 'hometown',
    label: 'CITY OF ORIGIN',
    placeholder: 'where did you grow up?',
    afterNote: 'geographic baseline for fear-response normalization.',
    maxLen: 40,
  },
  {
    id: 'college',
    label: 'RESIDENTIAL COLLEGE',
    placeholder: '',
    options: [...RES_COLLEGES],
    afterNote: 'cross-reference: prior subject 4721 was also in this college.',
  },
  {
    id: 'concentration',
    label: 'DEPARTMENT / CONCENTRATION',
    placeholder: '',
    options: [...CONCENTRATIONS],
    afterNote: 'used to calibrate personalized stimulus vocabulary.',
  },
  {
    id: 'fear',
    label: 'SECTION 3.7 — NAME ONE THING THAT FRIGHTENS YOU',
    placeholder: 'be specific. one sentence.',
    afterNote: 'thank you. that was useful.',
    maxLen: 60,
  },
  {
    id: 'objectInRoom',
    label: 'SECTION 3.8 — NAME AN OBJECT YOU CAN SEE RIGHT NOW',
    placeholder: 'something in the room with you.',
    afterNote: 'we will remember it.',
    maxLen: 40,
  },
  {
    id: 'missedPerson',
    label: 'SECTION 3.9 — NAME SOMEONE YOU MISS',
    placeholder: 'first name only.',
    afterNote: 'they did not complete their evaluation.',
    maxLen: 24,
  },
  {
    id: 'watchedPlace',
    label: 'SECTION 4.1 — WHERE DO YOU FEEL WATCHED',
    placeholder: 'location. be specific.',
    afterNote: 'you are correct. you have been.',
    maxLen: 60,
  },
];

export class BickerForm {
  private container: HTMLDivElement;
  private inputs: Map<FormField['id'], HTMLInputElement | HTMLSelectElement> = new Map();
  private options: BickerFormOptions;

  constructor(options: BickerFormOptions) {
    this.options = options;
    this.container = this.buildDom();
  }

  async show(): Promise<void> {
    document.body.appendChild(this.container);
    requestAnimationFrame(() => {
      this.container.style.opacity = '1';
    });
    // Focus first input after fade-in
    setTimeout(() => {
      const first = this.container.querySelector('input, select') as HTMLElement | null;
      first?.focus();
    }, 400);
  }

  hide(): void {
    this.container.style.opacity = '0';
    setTimeout(() => {
      if (this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
      }
    }, 600);
  }

  private buildDom(): HTMLDivElement {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '95',
      background: '#0a0806',
      fontFamily: "'Courier New', monospace",
      color: '#c09030',
      opacity: '0',
      transition: 'opacity 900ms ease',
      overflowY: 'auto',
      padding: '2rem 1rem 4rem',
    });

    // CRT scanline overlay for the whole form
    const scanlines = document.createElement('div');
    Object.assign(scanlines.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 1px, transparent 1px 3px)',
      mixBlendMode: 'multiply',
      zIndex: '1',
    });
    root.appendChild(scanlines);

    const vignette = document.createElement('div');
    Object.assign(vignette.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      boxShadow: 'inset 0 0 200px 40px rgba(0,0,0,0.9)',
      zIndex: '1',
    });
    root.appendChild(vignette);

    const form = document.createElement('form');
    Object.assign(form.style, {
      position: 'relative',
      zIndex: '2',
      maxWidth: '720px',
      margin: '0 auto',
      padding: '2.5rem 2rem',
      border: '1px solid #604020',
      background: 'rgba(18,12,8,0.85)',
      boxShadow: '0 0 60px rgba(192,144,48,0.08) inset',
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    // ── Header ────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '2rem';

    const seal = document.createElement('div');
    seal.textContent = 'PROSPECT AVENUE INTER-CLUB COUNCIL';
    Object.assign(seal.style, {
      fontSize: '0.68rem',
      letterSpacing: '0.4rem',
      color: '#886040',
      marginBottom: '0.5rem',
    });
    header.appendChild(seal);

    const title = document.createElement('h1');
    title.textContent = 'BICKER COMPATIBILITY ASSESSMENT';
    Object.assign(title.style, {
      fontSize: '1.3rem',
      letterSpacing: '0.5rem',
      color: '#e0b060',
      margin: '0 0 0.4rem 0',
      textShadow: '0 0 18px rgba(224,176,96,0.35)',
    });
    header.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent = 'FORM 7B — REFERRING MEMBER QUESTIONNAIRE · REV. 47.2';
    Object.assign(subtitle.style, {
      fontSize: '0.65rem',
      letterSpacing: '0.25rem',
      color: '#886040',
      marginBottom: '0.4rem',
    });
    header.appendChild(subtitle);

    const confidential = document.createElement('div');
    confidential.textContent = '[ CONFIDENTIAL — DO NOT DISCUSS WITH PROSPECT ]';
    Object.assign(confidential.style, {
      fontSize: '0.65rem',
      letterSpacing: '0.25rem',
      color: '#a05020',
    });
    header.appendChild(confidential);

    form.appendChild(header);

    // Preamble paragraph — sets the tone
    const preamble = document.createElement('p');
    preamble.innerHTML = [
      'Thank you for agreeing to refer a prospect for Spring Bicker. This ',
      'questionnaire calibrates our evaluation protocols to your prospect\'s ',
      'psychological baseline. Your responses are <span style="color:#e0b060">confidential</span> and ',
      'retained by the system.',
      '<br><br>',
      'Please answer <span style="color:#e0b060">honestly</span>. The form adapts to you. ',
      'Incomplete submissions will be completed on your behalf.',
    ].join('');
    Object.assign(preamble.style, {
      fontSize: '0.78rem',
      lineHeight: '1.6',
      color: '#a08060',
      marginBottom: '2rem',
      padding: '0.8rem 1rem',
      borderLeft: '2px solid #604020',
      background: 'rgba(0,0,0,0.3)',
    });
    form.appendChild(preamble);

    // Honor code checkbox (real Princeton convention)
    const honor = document.createElement('div');
    honor.style.marginBottom = '1.5rem';
    const hId = 'bicker-honor';
    honor.innerHTML = `
      <input type="checkbox" id="${hId}" required style="accent-color:#c09030;vertical-align:middle;margin-right:0.5rem;">
      <label for="${hId}" style="font-size:0.75rem;color:#a08060;letter-spacing:0.1rem;">
        I pledge my honor that I have neither given nor received unauthorized aid on this assessment.
      </label>`;
    form.appendChild(honor);

    // ── Fields ────────────────────────────────────────────
    for (const field of FIELDS) {
      form.appendChild(this.buildField(field));
    }

    // ── Footer ────────────────────────────────────────────
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      marginTop: '2rem',
      paddingTop: '1.2rem',
      borderTop: '1px solid #604020',
    });

    const legalese = document.createElement('p');
    legalese.textContent = [
      'By submitting, you consent to biometric capture via webcam and ',
      'audio sampling during your evaluation session. Data is retained at ',
      'archival fidelity for an indefinite period. FitzRandolph Gate egress ',
      'rights reserved to the system.',
    ].join('');
    Object.assign(legalese.style, {
      fontSize: '0.6rem',
      color: '#604020',
      letterSpacing: '0.05rem',
      lineHeight: '1.5',
      marginBottom: '1.2rem',
    });
    footer.appendChild(legalese);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '› BEGIN EVALUATION';
    Object.assign(submit.style, {
      display: 'block',
      width: '100%',
      padding: '1rem',
      background: 'transparent',
      border: '1px solid #c09030',
      color: '#e0b060',
      fontFamily: "'Courier New', monospace",
      fontSize: '0.9rem',
      letterSpacing: '0.3rem',
      textTransform: 'uppercase',
      cursor: 'pointer',
      transition: 'all 180ms ease',
      userSelect: 'none',
    });
    submit.addEventListener('mouseenter', () => {
      submit.style.background = 'rgba(192,144,48,0.08)';
      submit.style.boxShadow = '0 0 20px rgba(192,144,48,0.25)';
    });
    submit.addEventListener('mouseleave', () => {
      submit.style.background = 'transparent';
      submit.style.boxShadow = 'none';
    });
    footer.appendChild(submit);

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'skip · use defaults';
    Object.assign(skip.style, {
      display: 'block',
      margin: '0.8rem auto 0',
      background: 'transparent',
      border: 'none',
      color: '#604020',
      fontFamily: "'Courier New', monospace",
      fontSize: '0.65rem',
      letterSpacing: '0.2rem',
      cursor: 'pointer',
      textDecoration: 'underline',
    });
    skip.addEventListener('click', () => {
      // Skip path: fire onSubmit with the defaults dossier *without* marking
      // the profile as submitted. Downstream code checks isSubmitted to
      // decide whether to call the player by name or fall back to "4722".
      this.hide();
      this.options.onSubmit(playerProfile.get());
    });
    footer.appendChild(skip);

    form.appendChild(footer);
    root.appendChild(form);
    return root;
  }

  private buildField(field: FormField): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '1.4rem';

    const label = document.createElement('label');
    label.textContent = field.label;
    Object.assign(label.style, {
      display: 'block',
      fontSize: '0.7rem',
      letterSpacing: '0.25rem',
      color: '#a07040',
      marginBottom: '0.4rem',
    });
    wrap.appendChild(label);

    let input: HTMLInputElement | HTMLSelectElement;
    if (field.options) {
      const select = document.createElement('select');
      Object.assign(select.style, {
        width: '100%',
        padding: '0.6rem 0.8rem',
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid #604020',
        color: '#e0b060',
        fontFamily: "'Courier New', monospace",
        fontSize: '0.9rem',
        letterSpacing: '0.1rem',
        outline: 'none',
      });
      // Placeholder option
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '— select —';
      ph.disabled = true;
      ph.selected = true;
      select.appendChild(ph);
      for (const opt of field.options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        select.appendChild(o);
      }
      input = select;
    } else {
      const txt = document.createElement('input');
      txt.type = 'text';
      txt.placeholder = field.placeholder;
      txt.autocomplete = 'off';
      if (field.maxLen) txt.maxLength = field.maxLen;
      Object.assign(txt.style, {
        width: '100%',
        padding: '0.6rem 0.8rem',
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid #604020',
        color: '#e0b060',
        fontFamily: "'Courier New', monospace",
        fontSize: '0.9rem',
        letterSpacing: '0.05rem',
        outline: 'none',
        caretColor: '#e0b060',
      });
      txt.addEventListener('focus', () => {
        txt.style.borderColor = '#c09030';
        txt.style.boxShadow = '0 0 12px rgba(192,144,48,0.2) inset';
      });
      txt.addEventListener('blur', () => {
        txt.style.borderColor = '#604020';
        txt.style.boxShadow = 'none';
      });
      input = txt;
    }
    this.inputs.set(field.id, input);
    wrap.appendChild(input);

    if (field.afterNote) {
      const note = document.createElement('div');
      note.textContent = '';
      Object.assign(note.style, {
        fontSize: '0.65rem',
        color: '#604020',
        letterSpacing: '0.1rem',
        marginTop: '0.3rem',
        minHeight: '0.9rem',
        fontStyle: 'italic',
        transition: 'color 400ms ease, opacity 400ms ease',
        opacity: '0',
      });
      wrap.appendChild(note);
      const reveal = (): void => {
        note.textContent = field.afterNote ?? '';
        note.style.opacity = '1';
        // Creeping escalation on the last few fields — notes bleed red.
        const lateFields = new Set(['fear', 'objectInRoom', 'missedPerson', 'watchedPlace']);
        if (lateFields.has(field.id)) {
          note.style.color = '#a04020';
        }
      };
      input.addEventListener('blur', reveal);
      input.addEventListener('change', reveal);
    }
    return wrap;
  }

  private submit(): void {
    const collected: Partial<PlayerProfile> = {};
    for (const field of FIELDS) {
      const el = this.inputs.get(field.id);
      if (!el) continue;
      collected[field.id] = el.value;
    }
    collected.submittedAt = Date.now();
    playerProfile.set(collected);
    this.hide();
    this.options.onSubmit(playerProfile.get());
  }
}
