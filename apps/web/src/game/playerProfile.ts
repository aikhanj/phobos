import type { PlayerProfile } from '@phobos/types';

const STORAGE_KEY = 'phobos.playerProfile.v1';

/** Defaults used when the player skips the form or leaves a field blank. */
const DEFAULTS: PlayerProfile = {
  name: 'subject',
  hometown: 'home',
  college: 'mathey',
  concentration: 'undeclared',
  fear: 'the dark',
  objectInRoom: 'the wall',
  missedPerson: 'someone',
  watchedPlace: 'the hallway',
  submittedAt: 0,
};

/** Trim + collapse whitespace + cap length. Strings come from an input box. */
function sanitize(value: string, maxLen = 40): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

/**
 * Singleton dossier. The Bicker Form writes into it, the director reads from
 * it every tick, and the line bank / whispers interpolate its tokens. Values
 * outlive page reloads via localStorage so the player's dossier persists
 * across sessions (horror escalates the second time you boot).
 */
class PlayerProfileStore {
  private profile: PlayerProfile = { ...DEFAULTS };

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
        this.profile = { ...DEFAULTS, ...parsed };
      }
    } catch {
      // localStorage disabled or corrupt — fall back to defaults
    }
  }

  get(): PlayerProfile {
    return this.profile;
  }

  /** Has the player actually submitted the form this session (or a prior one)? */
  get isSubmitted(): boolean {
    return this.profile.submittedAt > 0;
  }

  set(partial: Partial<PlayerProfile>): void {
    const next: PlayerProfile = { ...this.profile };
    (Object.keys(partial) as Array<keyof PlayerProfile>).forEach((k) => {
      const v = partial[k];
      if (v === undefined) return;
      if (typeof v === 'string') {
        const cleaned = sanitize(v);
        (next[k] as string) = cleaned.length > 0 ? cleaned : DEFAULTS[k] as string;
      } else if (typeof v === 'number') {
        (next[k] as number) = v;
      }
    });
    this.profile = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      // swallow — persistence is best-effort
    }
  }

  clear(): void {
    this.profile = { ...DEFAULTS };
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

export const playerProfile = new PlayerProfileStore();

/**
 * Interpolate `{name}`, `{hometown}`, `{fear}`, etc. into a template string.
 * Unknown tokens are left literal so authored text stays readable if the
 * profile is missing. All substitutions are lowercased to match the game's
 * terminal aesthetic.
 *
 * Example: personalize("i see you, {name}") → "i see you, maya"
 */
export function personalize(template: string, profile: PlayerProfile = playerProfile.get()): string {
  return template.replace(/\{(name|hometown|college|concentration|fear|objectInRoom|missedPerson|watchedPlace)\}/g, (_m, key: keyof PlayerProfile) => {
    const v = profile[key];
    return typeof v === 'string' ? v.toLowerCase() : String(v);
  });
}

/** Cheap check: does this string contain any interpolation tokens? */
export function hasTokens(s: string): boolean {
  return /\{(name|hometown|college|concentration|fear|objectInRoom|missedPerson|watchedPlace)\}/.test(s);
}
