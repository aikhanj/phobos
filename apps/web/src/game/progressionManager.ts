import type { ClubId } from './scenes/clubs';

/**
 * Linear chain through Prospect Avenue. Each club's pickup hands the player
 * the next address in the chain. Side clubs (ivy/cottage/tigerinn/terrace/
 * cloister) stay boarded up for the whole run — they're set dressing.
 */
const KEY_MAP: Record<string, ClubId> = {
  tower: 'colonial',
  colonial: 'cannon',
  cannon: 'capgown',
  capgown: 'charter',
};

/** Ordered chain used by the objective HUD + idle nudges. */
const CHAIN: ClubId[] = ['tower', 'colonial', 'cannon', 'capgown', 'charter'];

/**
 * PUZZLE MODE: all 5 chain clubs are open from the start. The player
 * can visit them in any order. Escape items (KEY / CODE / BOLTS) drop
 * from Tower / Cannon / Colonial respectively and gate FitzRandolph
 * Gate, not club entry. Side clubs (ivy / cottage / tigerinn / terrace
 * / cloister) stay boarded — they're atmospheric set dressing.
 */
const INITIAL_UNLOCKED: ClubId[] = ['tower', 'colonial', 'cannon', 'capgown', 'charter'];

/**
 * Tracks the single linear chain. No Y-branching, no combination keys —
 * the storyline is one corridor and the side clubs stay boarded.
 */
export class ProgressionManager {
  private unlockedClubs = new Set<ClubId>(INITIAL_UNLOCKED);
  private _pickupsCollected = 0;
  private _flashbacksPlayed = new Set<number>();

  isUnlocked(id: ClubId): boolean {
    return this.unlockedClubs.has(id);
  }

  get pickupsCollected(): number {
    return this._pickupsCollected;
  }

  hasPlayedFlashback(index: number): boolean {
    return this._flashbacksPlayed.has(index);
  }

  markFlashback(index: number): void {
    this._flashbacksPlayed.add(index);
  }

  /** Player picked up the key in `sourceClubId`; unlock + return the next club. */
  collectKey(sourceClubId: ClubId): ClubId | null {
    this._pickupsCollected++;
    const target = KEY_MAP[sourceClubId];
    if (target) {
      this.unlockedClubs.add(target);
      return target;
    }
    return null;
  }

  /** The next un-visited club in the chain (for HUD / nudge), or null at end. */
  getNextObjective(): ClubId | null {
    for (const id of CHAIN) {
      if (this.unlockedClubs.has(id) && !this._flashbacksPlayed.has(indexOf(id))) {
        return id;
      }
    }
    return null;
  }

  /** Every non-chain club, plus chain clubs that are still locked. */
  getLockedClubs(): ClubId[] {
    const all: ClubId[] = [
      'tower', 'cannon', 'ivy', 'cottage', 'capgown',
      'colonial', 'tigerinn', 'terrace', 'cloister', 'charter',
    ];
    return all.filter((id) => !this.unlockedClubs.has(id));
  }
}

function indexOf(id: ClubId): number {
  return CHAIN.indexOf(id);
}
