import type { ClubId } from './scenes/clubs';

/** Which club a key unlocks — found in the source club. */
const KEY_MAP: Record<string, ClubId> = {
  tower: 'ivy',
  colonial: 'cannon',
  terrace: 'capgown',
  ivy: 'cottage',
  cannon: 'tigerinn',
  capgown: 'cloister',
  // Cottage and Cloister each give one of the two Charter keys
};

/** Tier 1 clubs are always open. */
const TIER_1: ClubId[] = ['tower', 'colonial', 'terrace'];

/** Charter requires keys from BOTH of these clubs. */
const CHARTER_REQUIRES: ClubId[] = ['cottage', 'cloister'];

/**
 * Tracks club unlock state and key inventory. Hub-and-spoke progression:
 *
 *   Tier 1 (open):  Tower, Colonial, Terrace
 *   Tier 2 (locked): Ivy, Cannon, Cap & Gown
 *   Tier 3 (locked): Cottage, Tiger Inn, Cloister
 *   Final (locked):  Charter (needs 2 keys)
 */
export class ProgressionManager {
  private unlockedClubs = new Set<ClubId>(TIER_1);
  private charterKeys = new Set<ClubId>();
  private _pickupsCollected = 0;
  private _flashbacksPlayed = new Set<number>();

  /** Is this club currently accessible? */
  isUnlocked(id: ClubId): boolean {
    return this.unlockedClubs.has(id);
  }

  /** How many pickups the player has collected (0-5). */
  get pickupsCollected(): number {
    return this._pickupsCollected;
  }

  /** Has a specific flashback index already played? */
  hasPlayedFlashback(index: number): boolean {
    return this._flashbacksPlayed.has(index);
  }

  /** Mark a flashback as played. */
  markFlashback(index: number): void {
    this._flashbacksPlayed.add(index);
  }

  /**
   * Player found a key in the given source club. Unlocks the target club.
   * Returns the club that was unlocked (for UI feedback), or null if
   * source club has no key mapping (e.g., Charter).
   */
  collectKey(sourceClubId: ClubId): ClubId | null {
    this._pickupsCollected++;

    // Cottage and Cloister contribute Charter keys
    if (sourceClubId === 'cottage' || sourceClubId === 'cloister') {
      this.charterKeys.add(sourceClubId);
      if (this.charterKeys.size >= CHARTER_REQUIRES.length) {
        this.unlockedClubs.add('charter');
        return 'charter';
      }
      return null; // need the other key still
    }

    const target = KEY_MAP[sourceClubId];
    if (target) {
      this.unlockedClubs.add(target);
      return target;
    }
    return null;
  }

  /** Get all currently locked clubs (for campus door visuals). */
  getLockedClubs(): ClubId[] {
    const all: ClubId[] = [
      'tower', 'cannon', 'ivy', 'cottage', 'capgown',
      'colonial', 'tigerinn', 'terrace', 'cloister', 'charter',
    ];
    return all.filter((id) => !this.unlockedClubs.has(id));
  }
}
