/**
 * SURVIVAL MODULE — Granny-style lives, inventory, and safe respawn.
 *
 * Owns three pieces of global game state shared across the campus and
 * all 5 clubs:
 *
 *   1. LIVES — starts at 3. Each catch (ClubDeanHunt, RushEntity, or
 *      the avenue close-hit) decrements. At 0, fire onGameOver and
 *      the game is unrecoverable until the player reloads.
 *
 *   2. INVENTORY — the three escape items needed to unlock FitzRandolph
 *      Gate at the east end of Prospect Ave:
 *        - KEY_OF_PROSPECT  (Tower cabinet puzzle reward)
 *        - COMBINATION_CODE (Cannon registry ledger)
 *        - BOLT_CUTTERS     (Colonial, under the dining table)
 *      Each item is a boolean flag. When all three are true, the gate
 *      opens and the reveal sequence fires.
 *
 *   3. SAFE RESPAWN — the "wake up on the sidewalk" beat. Always
 *      teleports the player back to the campus west spawn facing east.
 *      Resets velocity/crouch/eye-height via Player.respawnAt so they
 *      don't clip into geometry. Caller is responsible for fading.
 */

import * as THREE from 'three';
import type { Player } from '../game/player';

/** The three escape items. Each true when collected. */
export interface EscapeInventory {
  key: boolean;          // Tower cabinet
  code: boolean;         // Cannon registry
  bolts: boolean;        // Colonial under-table
}

/** Snapshot returned to the HUD each frame for rendering. */
export interface SurvivalHudState {
  lives: number;
  maxLives: number;
  inventory: EscapeInventory;
  hidden: boolean;
}

export interface SurvivalDeps {
  player: Player;
  /** World-space point the player respawns at on catch. Always in-bounds. */
  campusSpawn: THREE.Vector3;
  /** Fires when the last life is lost. Main.ts shows game over screen. */
  onGameOver: () => void;
  /** Fires each time lives/inventory changes so HUD updates. */
  onHudChange: (state: SurvivalHudState) => void;
  /** Optional logger for in-game agent log. */
  log?: (msg: string) => void;
}

export class Survival {
  private deps: SurvivalDeps;
  private lives = 3;
  private readonly maxLives = 3;
  private inventory: EscapeInventory = { key: false, code: false, bolts: false };
  private hidden = false;
  /** Prevents stacked catches during the fade-respawn animation. */
  private respawning = false;

  constructor(deps: SurvivalDeps) {
    this.deps = deps;
    this.emit();
  }

  get livesLeft(): number { return this.lives; }
  get isGameOver(): boolean { return this.lives <= 0; }
  get isRespawning(): boolean { return this.respawning; }

  getInventory(): EscapeInventory { return { ...this.inventory }; }
  hasAllItems(): boolean {
    return this.inventory.key && this.inventory.code && this.inventory.bolts;
  }

  /** Called by any pickup handler. Debounces repeat pickups for safety. */
  collect(item: keyof EscapeInventory): void {
    if (this.inventory[item]) return;
    this.inventory[item] = true;
    const names: Record<keyof EscapeInventory, string> = {
      key: 'KEY OF PROSPECT', code: 'COMBINATION CODE', bolts: 'BOLT CUTTERS',
    };
    this.deps.log?.(`${names[item]} collected · ${this.countCollected()}/3 escape items`);
    this.emit();
  }

  /**
   * Called by the ClubDeanHunt, RushEntity, or DeanStalker close-hit.
   * Debounces: if a catch is already in progress (respawning = true),
   * this is a no-op. That prevents the second Dean catch firing a
   * second respawn mid-fade — which is what causes the stuck-in-wall
   * + lost-input bug players reported.
   */
  async catch(fade: {
    toBlack: (ms: number) => Promise<void>;
    fromBlack: (ms: number) => Promise<void>;
  }): Promise<boolean> {
    if (this.respawning) return false;
    if (this.lives <= 0) return false;
    this.respawning = true;
    this.lives--;
    this.emit();
    this.deps.log?.(`caught. ${this.lives}/${this.maxLives} lives remain`);

    this.deps.player.setInputEnabled(false);
    await fade.toBlack(700);

    if (this.lives <= 0) {
      // No more lives — don't respawn; leave screen black and hand
      // control to the game-over handler.
      this.deps.onGameOver();
      return true;
    }

    // Safe respawn. Always to campusSpawn (known in-bounds).
    this.deps.player.respawnAt(this.deps.campusSpawn, -Math.PI / 2);
    await new Promise((r) => setTimeout(r, 800));
    await fade.fromBlack(900);
    this.deps.player.setInputEnabled(true);
    this.respawning = false;
    return true;
  }

  /** Hide badge — main.ts wires this from the ClubDeanHunt onHideEnter/Exit. */
  setHidden(h: boolean): void {
    if (this.hidden === h) return;
    this.hidden = h;
    this.emit();
  }

  private countCollected(): number {
    return (this.inventory.key ? 1 : 0)
      + (this.inventory.code ? 1 : 0)
      + (this.inventory.bolts ? 1 : 0);
  }

  private emit(): void {
    this.deps.onHudChange({
      lives: this.lives,
      maxLives: this.maxLives,
      inventory: { ...this.inventory },
      hidden: this.hidden,
    });
  }
}
