import * as THREE from 'three';
import { Engine } from './game/engine';
import { Player } from './game/player';
import { Campus } from './game/scenes/campus';
import {
  type ClubId,
  CLUB_LABEL,
  TowerInterior,
  CannonInterior,
  IvyInterior,
  CottageInterior,
  CapGownInterior,
  ColonialInterior,
  TigerInnInterior,
  TerraceInterior,
  CloisterInterior,
  CharterInterior,
} from './game/scenes/clubs';
import { Timeline } from './game/timeline';
import { TitleScreen } from './ui/titleScreen';
import { CornerBox } from './ui/cornerBox';
import { Crosshair } from './ui/crosshair';
import { FadeOverlay } from './ui/fadeOverlay';
import { DevHud } from './ui/devHud';
import { AudioManager } from './audio/audioManager';
import {
  createVoiceEngine,
  LineBank,
  CreatureVoice,
  AmbientBus,
  type VoiceEngine,
  type FearBucket,
} from '@phobos/voice';
import { FearAudioController } from './audio/fearAudioController';
import { WebcamGhost, type GhostFlashOptions } from './horror/webcamGhost';
import { RevealSequence } from './horror/revealSequence';
import { EntityManager, PhobosEntity, ColonialStalker } from './game/entities';
import { PhobosDirector } from './agents/phobosDirector';
import { AudioDirector } from './agents/audioDirector';
import { NoteOverlay } from './ui/noteOverlay';
import { ProgressionManager } from './game/progressionManager';
import { playFlashback, FLASHBACKS } from './horror/flashback';
import { FaceEmotionDetector } from './biosignals/faceEmotion';
import { FearScoreCalculator } from './biosignals/fearScore';
import { BluetoothHrClient } from './biosignals/bluetoothHr';
import type { AgentLogEntry, BiosignalState, MicroMood, NoteId, PhobosTickContext, WebcamGlitchType } from '@phobos/types';

async function main() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  const engine = new Engine(canvas);
  const player = new Player(engine.camera, canvas);
  const cornerBox = new CornerBox();
  const crosshair = new Crosshair();
  const audio = new AudioManager();
  const fade = new FadeOverlay();
  const devHud = new DevHud();

  player.setColliderProvider(engine.getColliders);

  // ── Audio controllers ──
  const fearAudio = new FearAudioController(audio);
  const audioDirector = new AudioDirector();

  // ── Phobos LLM director ──
  const openaiKey = (import.meta.env.VITE_OPENAI_API_KEY as string) || '';
  const phobos = new PhobosDirector(openaiKey);
  const noteOverlay = new NoteOverlay();
  const progression = new ProgressionManager();
  let sessionStartTime = 0;
  let currentSceneName: 'basement' | 'bedroom' | 'attic' = 'basement';
  let sceneStartTime = 0;
  let lastFearScore = 0;
  let lastBpm = 0;

  // Pickup interaction — shows note overlay for the found item.
  // Exposed on window so club interiors can call it from their onInteract callbacks.
  const showPickup = (noteId: NoteId): void => {
    player.setInputEnabled(false);
    noteOverlay.show(noteId, () => {
      player.setInputEnabled(true);
    });
    phobos.onNoteRead(noteId);
  };
  (window as unknown as Record<string, unknown>).__showPickup = showPickup;

  // Voice engine wiring (lazy — audio context is created at audio.init()).
  let voice: VoiceEngine | null = null;
  let lineBank: LineBank | null = null;
  let webcamGhost: WebcamGhost | null = null;
  let entityManager: EntityManager | null = null;
  let creatureVoice: CreatureVoice | null = null;
  let colonialStalker: ColonialStalker | null = null;
  const voiceProxyUrl = (import.meta.env.VITE_VOICE_PROXY_URL as string) || 'http://localhost:3001';
  const defaultVoiceId = import.meta.env.VITE_ELEVEN_DEMO_VOICE_ID as string | undefined;

  // Biosignals: face-api for emotion, Web Bluetooth for heart rate.
  const faceEmotion = new FaceEmotionDetector();
  const fearScore = new FearScoreCalculator();
  const hrClient = new BluetoothHrClient();
  let baselineBpm = 0;
  let sceneTime = 0;

  // Per-frame: drive player, update voice listener to camera pose, tick entities.
  const _fwd = new THREE.Vector3();
  engine.onUpdate = (dt) => {
    player.update(dt);
    sceneTime += dt;
    if (voice) {
      const p = engine.camera.position;
      engine.camera.getWorldDirection(_fwd);
      voice.updateListener(
        { x: p.x, y: p.y, z: p.z },
        { x: _fwd.x, y: _fwd.y, z: _fwd.z },
        { x: 0, y: 1, z: 0 },
      );
    }
    entityManager?.update(dt);
    colonialStalker?.update(dt);
  };

  // Biosignal tick (every 500ms): run face-api inference, fuse with HR, push
  // fear state to the entity manager + corner box HUD.
  engine.onBiosignalTick = () => {
    faceEmotion.tick();

    // Establish baseline HR on first live sample, then slow EMA.
    // Use displayBpm so the HUD holds the last reading through BLE dropouts
    // instead of blanking; signalQuality communicates connection weakness.
    const bpm = hrClient.displayBpm;
    if (bpm > 0) {
      if (baselineBpm === 0) baselineBpm = bpm;
      else baselineBpm = baselineBpm * 0.985 + bpm * 0.015;
    }

    const state = fearScore.calculate({
      face: faceEmotion.snapshot,
      bpm,
      baselineBpm,
      timeInScene: sceneTime,
    });

    cornerBox.updateFearScore(state.fearScore);
    cornerBox.updateBPM(state.bpm, hrClient.signalQuality);

    // Dynamic CRT: grain + vignette intensify with fear. Baseline comes from
    // the scene's atmosphere, fear layers on top — picture disintegrates as
    // the player does.
    engine.setGrain(sceneGrainBase + state.fearScore * 0.10);
    engine.setVignette(Math.max(0.38, sceneVignetteBase - state.fearScore * 0.18));

    entityManager?.onBiosignal(state);
  };

  // Crosshair lights up when targeting an interactable; E triggers it.
  engine.onInteractableChange = (hint) => crosshair.setTarget(hint);
  player.onInteractKey = () => engine.tryInteract();

  // Convenience: speak a line in Phobos's voice at the camera position.
  const speakAs = (bucket: FearBucket, text?: string): void => {
    if (!voice || !lineBank || !defaultVoiceId) return;
    const line = text ?? lineBank.pick(bucket);
    const p = engine.camera.position;
    voice.speak({ text: line, voiceId: defaultVoiceId, position: { x: p.x, y: p.y, z: p.z } });
  };

  // Soft footstep on each foot-plant; volume scales with speed (sprint louder).
  player.onFootstep = (speed) => {
    const vol = Math.min(0.45, 0.2 + speed * 0.04);
    audio.playOneShot('footstep_near', vol);
  };

  const log = (source: AgentLogEntry['source'], message: string): void => {
    cornerBox.appendLog({ source, message, timestamp: Date.now() });
  };

  // ── map webcam glitch types to WebcamGhost flash options ──
  const mapGlitchToFlash = (effect: WebcamGlitchType, intensity: number, _durationS: number): GhostFlashOptions => {
    const scale = Math.max(0.3, Math.min(1, intensity));
    switch (effect) {
      case 'stutter': return { buildupMs: 100, snapMs: Math.round(300 * scale), fadeMs: 100 };
      case 'distort': return { buildupMs: Math.round(800 * scale), snapMs: Math.round(400 * scale), fadeMs: 200 };
      case 'face_warp': return { buildupMs: 200, snapMs: Math.round(600 * scale), fadeMs: 300 };
      case 'delay': return { buildupMs: Math.round(500 * scale), snapMs: 200, fadeMs: 400 };
    }
  };

  // ── route fired events to audio + log ──
  engine.onEventFired = (ev) => {
    // Track all events for Phobos's scare history
    phobos.onEventFired(ev);
    let summary: string;
    switch (ev.kind) {
      case 'flicker':
        summary = `flicker:${ev.pattern}`;
        // Blackout flicker = webcam ghost pass.
        if (ev.pattern === 'blackout') webcamGhost?.flash().catch(() => {});
        break;
      case 'figure':
        summary = `figure@${ev.anchor}`;
        // Seeing a figure pulls a high-bucket whisper — Phobos reacts.
        speakAs('high');
        break;
      case 'sound':
        audio.playOneShot(ev.asset, ev.volume);
        // Replace procedural whispers with an actual line once voice is ready.
        if (ev.asset === 'whisper_hold' || ev.asset === 'whisper_good' || ev.asset === 'whisper_see') {
          speakAs('medium');
        }
        summary = `sound:${ev.asset}`;
        break;
      case 'prop_move': summary = `move:${ev.propId}`; break;
      case 'prop_state': summary = `state:${ev.propId}=${ev.state}`; break;
      case 'silence':
        audio.duckForSilence(ev.duration);
        summary = `silence:${ev.duration}s`;
        break;
      case 'breath':
        audio.playBreath(ev.intensity);
        summary = `breath:${ev.intensity.toFixed(2)}`;
        break;
      case 'mirror_swap':
        summary = `mirror:${ev.variant}`;
        if (ev.variant === 'extra_figure') speakAs('high');
        break;
      case 'unlock':
        summary = `unlock:${ev.propId}`;
        if (ev.propId === 'bedroom_hatch') speakAs('peak', 'up');
        break;
      case 'lock': summary = `lock:${ev.propId}`; break;
      case 'fog_creep': summary = `fog→${ev.targetFar.toFixed(1)}`; break;
      case 'transition': summary = `transition:${ev.to}`; break;
      case 'note_reveal':
        summary = `note:${ev.noteId}`;
        break;
      case 'crt_message':
        summary = `crt:"${ev.text.slice(0, 20)}"`;
        break;
      case 'log_message':
        cornerBox.appendLog({
          source: (ev.source as AgentLogEntry['source']) || 'phobos',
          message: ev.text,
          timestamp: Date.now(),
        });
        summary = `log:${ev.text.slice(0, 30)}`;
        break;
      case 'webcam_glitch':
        if (webcamGhost) {
          webcamGhost.flash(mapGlitchToFlash(ev.effect, ev.intensity, ev.durationS)).catch(() => {});
        }
        summary = `glitch:${ev.effect}`;
        break;
      case 'jumpscare':
        if (ev.type === 'mirror_flash') {
          engine.eventBus.fire({ kind: 'sound', asset: 'creak_door', volume: 1.0 });
          engine.eventBus.fire({ kind: 'mirror_swap', variant: 'extra_figure' });
          fade.blink(100);
          setTimeout(() => {
            engine.eventBus.fire({ kind: 'mirror_swap', variant: 'empty' });
          }, 300);
        } else if (ev.type === 'static_burst') {
          engine.eventBus.fire({ kind: 'sound', asset: 'glitch', volume: 0.9 });
          engine.eventBus.fire({ kind: 'flicker', duration: 0.4, pattern: 'blackout' });
          fade.blink(150);
        }
        summary = `jumpscare:${ev.type}`;
        break;
      case 'anti_silence':
        audio.antiSilence(ev.duration);
        summary = `anti_silence:${ev.duration}s`;
        break;
      case 'reveal_sequence':
        summary = 'REVEAL';
        void endDemo();
        break;
      default: { const _exhaustive: never = ev; summary = String(_exhaustive); }
    }
    log('system', summary);
  };

  // Per-scene base values for CRT grain + vignette. The biosignal tick lerps
  // from these baselines upward as fear rises so the picture disintegrates
  // with the player's state instead of staying flat.
  let sceneGrainBase = 0.07;
  let sceneVignetteBase = 0.62;

  // Swap ambient profile + vignette whenever a scene loads.
  engine.onSceneLoaded = (scene) => {
    if (scene.name === 'basement' || scene.name === 'bedroom' || scene.name === 'attic') {
      audio.setScene(scene.name);
      devHud.setStatus(`SCENE · ${scene.name}`);
    }
    // Per-scene vignette + grain baselines (fear-driven modulation layered on top).
    switch (scene.name) {
      case 'campus':     sceneVignetteBase = 0.78; sceneGrainBase = 0.04; break;
      case 'basement':   sceneVignetteBase = 0.68; sceneGrainBase = 0.07; break;
      case 'bedroom':    sceneVignetteBase = 0.65; sceneGrainBase = 0.08; break;
      case 'attic':      sceneVignetteBase = 0.55; sceneGrainBase = 0.10; break;
      default:           sceneVignetteBase = 0.62; sceneGrainBase = 0.07; break;
    }
    engine.setVignette(sceneVignetteBase);
    engine.setGrain(sceneGrainBase);
  };

  // ── scene beat-sheet timelines ──
  let activeTimeline: Timeline | null = null;

  const swapTimeline = (t: Timeline): Timeline => {
    activeTimeline?.cancel();
    activeTimeline = t;
    return t;
  };

  // ── Prospect Avenue: campus + 10 club interiors ──────────────────────

  // Track which clubs the player has visited + escalation
  let clubsVisited = 0;

  // Remember where the player stood on the street before entering a club
  // so we can put them back in front of the same door when they exit.
  const savedCampusPos = new THREE.Vector3();
  const savedCampusQuat = new THREE.Quaternion();

  const loadCampus = (restorePosition = false): void => {
    const campus = new Campus({
      onEnterClub: (id) => { void enterClub(id); },
      lockedClubs: progression.getLockedClubs(),
    });
    engine.loadScene(campus);
    if (restorePosition) {
      engine.camera.position.copy(savedCampusPos);
      engine.camera.quaternion.copy(savedCampusQuat);
    } else {
      engine.camera.position.copy(campus.spawnPoint);
    }
    audio.setScene('campus');
    devHud.setStatus('SCENE · prospect ave · walk up to any club door');
    if (!restorePosition) devHud.flash('>> PROSPECT AVE — WALK TO A DOOR <<', 3000);
    log('system', 'prospect ave. the clubs are still standing.');
    entityManager?.resetGazeState();
    runCampusBeats();
  };

  const clubCtorByIdLocal = {
    tower:    (onExit: () => void, onPickup?: () => void) => new TowerInterior({ onExit, onPickup }),
    cannon:   (onExit: () => void, onPickup?: () => void) => new CannonInterior({ onExit, onPickup }),
    ivy:      (onExit: () => void, _onPickup?: () => void) => new IvyInterior({ onExit }),
    cottage:  (onExit: () => void, _onPickup?: () => void) => new CottageInterior({ onExit }),
    capgown:  (onExit: () => void, onPickup?: () => void) => new CapGownInterior({ onExit, onPickup }),
    colonial: (onExit: () => void, onPickup?: () => void) => new ColonialInterior({ onExit, onPickup }),
    tigerinn: (onExit: () => void, _onPickup?: () => void) => new TigerInnInterior({ onExit }),
    terrace:  (onExit: () => void, _onPickup?: () => void) => new TerraceInterior({ onExit }),
    cloister: (onExit: () => void, _onPickup?: () => void) => new CloisterInterior({ onExit }),
    charter:  (onExit: () => void, onPickup?: () => void) => new CharterInterior({ onExit, onPickup }),
  } satisfies Record<ClubId, (onExit: () => void, onPickup?: () => void) => { spawnPoint: THREE.Vector3 }>;

  // Pickup handler — called when player collects an item in a club.
  // Triggers flashback, collects key, shows note overlay.
  const handleClubPickup = (clubId: ClubId): void => {
    // Determine which flashback to play based on club
    const flashbackMap: Partial<Record<ClubId, number>> = {
      tower: 0, colonial: 1, cannon: 2, capgown: 3, charter: 4,
    };
    const fbIndex = flashbackMap[clubId];

    // Collect key (unlocks next club)
    const unlocked = progression.collectKey(clubId);
    if (unlocked) {
      log('system', `key found. ${CLUB_LABEL[unlocked]} unlocked.`);
      devHud.flash(`>> ${CLUB_LABEL[unlocked].toUpperCase()} UNLOCKED <<`, 3000);
    }

    // Show the pickup note content
    const noteMap: Partial<Record<ClubId, NoteId>> = {
      tower: 'note_grant_proposal',
      colonial: 'note_lab_journal',
      cannon: 'note_private_journal',
      capgown: 'note_wife_letter',
      charter: 'note_final_entry',
    };
    const noteId = noteMap[clubId];
    if (noteId) showPickup(noteId);

    // Play flashback after note is dismissed
    if (fbIndex !== undefined && !progression.hasPlayedFlashback(fbIndex)) {
      progression.markFlashback(fbIndex);
      const config = FLASHBACKS[fbIndex];
      if (config) {
        // Delay flashback until note overlay is closed
        const waitForClose = setInterval(() => {
          if (!noteOverlay.isVisible) {
            clearInterval(waitForClose);
            // Charter = endgame
            if (clubId === 'charter') {
              void endDemo();
            } else {
              void playFlashback(config, {
                scene: engine.scene,
                cornerBox,
                webcamGhost,
                voice,
                defaultVoiceId,
                onStart: () => player.setInputEnabled(false),
                onEnd: () => player.setInputEnabled(true),
              });
            }
          }
        }, 200);
      }
    }
  };

  const enterClub = async (id: ClubId): Promise<void> => {
    if (!progression.isUnlocked(id)) {
      log('system', `${CLUB_LABEL[id]} is locked.`);
      return;
    }
    player.setInputEnabled(false);
    // Save the player's street position + facing so we can restore on exit.
    // Offset 1.5m backward along facing so we don't land inside the door's
    // entry trigger (which would instantly re-enter the club on exit).
    const _exitFwd = new THREE.Vector3();
    engine.camera.getWorldDirection(_exitFwd);
    _exitFwd.y = 0;
    if (_exitFwd.lengthSq() < 1e-6) _exitFwd.set(0, 0, -1);
    _exitFwd.normalize();
    savedCampusPos.copy(engine.camera.position).addScaledVector(_exitFwd, -1.5);
    savedCampusQuat.copy(engine.camera.quaternion);
    clubsVisited++;
    log('system', `entering ${CLUB_LABEL[id]}.`);
    await fade.fadeToBlack(500);
    const room = clubCtorByIdLocal[id](() => { void exitToCampus(); }, () => handleClubPickup(id));
    engine.loadScene(room as unknown as Parameters<typeof engine.loadScene>[0]);
    engine.camera.position.copy(room.spawnPoint);
    audio.setScene('club');
    devHud.setStatus(`SCENE · ${CLUB_LABEL[id]} · find the exit`);
    await new Promise((r) => setTimeout(r, 180));
    await fade.fadeFromBlack(700);
    player.setInputEnabled(true);
    entityManager?.resetGazeState();

    // Colonial-specific scene stalker: follows the player through the
    // dining room, LLM-authored SFX on fear spikes, reanchors after vanish.
    if (id === 'colonial' && entityManager) {
      colonialStalker = new ColonialStalker({
        em: entityManager,
        scene: room as ColonialInterior,
        camera: engine.camera,
        apiKey: openaiKey,
        log,
      });
      colonialStalker.start();
    }

    runClubBeats(id);
  };

  const exitToCampus = async (): Promise<void> => {
    player.setInputEnabled(false);
    log('system', 'back to prospect ave.');
    await fade.fadeToBlack(500);
    colonialStalker?.stop();
    colonialStalker = null;
    loadCampus(true);
    await new Promise((r) => setTimeout(r, 150));
    await fade.fadeFromBlack(700);
    player.setInputEnabled(true);
  };

  // ── CAMPUS HORROR BEATS ──────────────────────────────────────────────
  // Outdoor atmosphere. Phobos is distant. Something is wrong with the
  // street. Escalates based on how many clubs the player has visited.

  function runCampusBeats(): void {
    const t = swapTimeline(new Timeline());
    const bus = engine.eventBus;

    // Silence first. Let them look around.
    t.schedule(2000, () => {
      bus.fire({ kind: 'silence', duration: 3 });
    });

    // 6s: a distant footstep. not theirs.
    t.schedule(6000, () => {
      if (creatureVoice) {
        const p = engine.camera.position;
        creatureVoice.setPosition({ x: p.x + 12, y: 0, z: p.z + 8 });
        void creatureVoice.footstepsToward(
          { x: p.x + 8, y: 0, z: p.z + 5 },
          2, 1500,
        );
      }
    });

    // 15s: Phobos entity appears far down the street (peripheral)
    t.schedule(15000, () => {
      if (entityManager) {
        const p = engine.camera.position;
        const fwd = new THREE.Vector3();
        engine.camera.getWorldDirection(fwd);
        entityManager.phobos.setPosition({ x: p.x + fwd.x * 8, y: 0, z: p.z + fwd.z * 8 });
        entityManager.phobos.setVisibility('revealed');
        setTimeout(() => entityManager?.phobos.setVisibility('hidden'), 4000);
      }
    });

    // After 3+ clubs: Phobos is persistent — always there, always following
    if (clubsVisited >= 3 && entityManager) {
      entityManager.persistent = true;
      t.schedule(10000, () => {
        if (creatureVoice) {
          const p = engine.camera.position;
          creatureVoice.setPosition({ x: p.x, y: 0, z: p.z });
          void creatureVoice.whisperSequence(1, 6, 0);
        }
      });
    }

    // After 4+ clubs: doppelgangers on the street
    if (clubsVisited >= 4 && entityManager) {
      t.schedule(12000, () => {
        entityManager?.spawnDoppelgangers(2);
      });
    }

    // After 6+ clubs: more doppelgangers + Phobos closer
    if (clubsVisited >= 6 && entityManager) {
      t.schedule(8000, () => {
        entityManager?.spawnDoppelgangers(3);
      });
    }
  }

  // ── CLUB INTERIOR HORROR BEATS ───────────────────────────────────────
  // Generic horror that works in ANY club room. Escalates with clubsVisited.
  // Uses spatial audio, entity spawning, and timed scares.

  function runClubBeats(clubId: ClubId): void {
    const t = swapTimeline(new Timeline());
    const bus = engine.eventBus;
    const escalation = Math.min(clubsVisited, 8); // 1-8 escalation curve

    // ── Interleaved agent log: roommate's old session + player's live session ──
    // These fire on independent timers, interleaving naturally.
    const roommateLogs = [
      { delay: 4000, msg: `4721: ${CLUB_LABEL[clubId].toLowerCase()}. bicker night.` },
      { delay: 12000, msg: '4721: fear_score: 0.34.' },
      { delay: 20000, msg: '4721: stimulus applied.' },
      { delay: 28000, msg: `4721: fear_score: ${(0.5 + escalation * 0.05).toFixed(2)}.` },
      { delay: 36000, msg: '4721: subject is adapting.' },
    ];
    for (const entry of roommateLogs) {
      t.schedule(entry.delay, () => log('phobos', entry.msg));
    }
    // Player's live data — fires from biosignal tick, labeled as 4722.
    // Inject a few scripted ones too for non-API-key mode.
    t.schedule(8000, () => log('phobos', `4722: ${CLUB_LABEL[clubId].toLowerCase()}. session active.`));
    t.schedule(18000, () => log('phobos', `4722: fear_score: ${lastFearScore.toFixed(2)}.`));
    t.schedule(32000, () => log('phobos', `4722: fear_score: ${lastFearScore.toFixed(2)}. tracking.`));

    // ── Phase 1: Settling (0-8s) — let them look around ──
    // Silence. The club feels normal. Maybe too quiet.

    // 5s: a single creak. this building is old.
    t.schedule(5000, () => {
      bus.fire({ kind: 'sound', asset: 'creak_floor', volume: 0.3 + escalation * 0.03 });
    });

    // ── Phase 2: First scare (10-20s) — something is here ──

    // 10s: spatial footsteps from behind — 2 steps approaching
    t.schedule(10000, () => {
      if (creatureVoice) {
        const p = engine.camera.position;
        const fwd = new THREE.Vector3();
        engine.camera.getWorldDirection(fwd);
        const behind = { x: p.x - fwd.x * 4, y: 0, z: p.z - fwd.z * 4 };
        const closer = { x: p.x - fwd.x * 2, y: 0, z: p.z - fwd.z * 2 };
        creatureVoice.setPosition(behind);
        void creatureVoice.footstepsToward(closer, 2, 1200);
      }
    });

    // 16s: silence drop. something is about to happen.
    t.schedule(16000, () => {
      bus.fire({ kind: 'silence', duration: 4 });
    });

    // ── Phase 3: Entity (20-35s) — Phobos shows itself ──

    // 22s: Phobos appears at the periphery. More visible with escalation.
    t.schedule(22000, () => {
      if (entityManager) {
        const p = engine.camera.position;
        const fwd = new THREE.Vector3();
        engine.camera.getWorldDirection(fwd);
        // Spawn to the side, not directly behind
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
        const spawnDist = 5 - escalation * 0.3; // closer with escalation
        entityManager.phobos.setPosition({
          x: p.x + right.x * spawnDist,
          y: 0,
          z: p.z + right.z * spawnDist,
        });
        const vis = escalation >= 5 ? 'revealed' : 'peripheral';
        entityManager.phobos.setVisibility(vis);
        // Stay visible longer with escalation
        const holdMs = 1500 + escalation * 400;
        setTimeout(() => entityManager?.phobos.setVisibility('hidden'), holdMs);
      }
    });

    // ── Phase 4: Climax (30-45s) — based on escalation ──

    if (escalation >= 2) {
      // 30s: a whisper from the fireplace direction (most clubs have one at north wall)
      t.schedule(30000, () => {
        if (creatureVoice) {
          creatureVoice.setPosition({ x: 0, y: 0, z: -3 }); // north wall area
          void creatureVoice.whisperSequence(1, 2, 0);
        }
      });
    }

    if (escalation >= 6) {
      // 35s: subtle flicker — only at high escalation, keep it rare
      t.schedule(35000, () => {
        bus.fire({ kind: 'flicker', duration: 0.2, pattern: 'subtle' });
      });
    }

    if (escalation >= 7) {
      // 40s: full haunt sequence — only at very high escalation
      t.schedule(40000, () => {
        if (creatureVoice) {
          const p = engine.camera.position;
          const fwd = new THREE.Vector3();
          engine.camera.getWorldDirection(fwd);
          void creatureVoice.haunt(
            { x: p.x, y: 0, z: p.z },
            { x: fwd.x, y: 0, z: fwd.z },
          );
          // Entity appears at haunt climax
          setTimeout(() => {
            if (entityManager) {
              const pp = engine.camera.position;
              const ff = new THREE.Vector3();
              engine.camera.getWorldDirection(ff);
              entityManager.phobos.setPosition({ x: pp.x + ff.x * 2, y: 0, z: pp.z + ff.z * 2 });
              entityManager.phobos.setVisibility('close');
              setTimeout(() => entityManager?.phobos.setVisibility('hidden'), 3000);
            }
          }, 8000);
        }
      });
    }

    // Log Phobos's in-character observation about this club
    t.schedule(3000, () => {
      const observations: Record<string, string> = {
        tower: 'old money. oak and silence.',
        cannon: 'cold stone. they kept records here.',
        ivy: 'the darkest one. it remembers.',
        cottage: 'bright. they thought light would protect them.',
        capgown: 'gargoyles outside. something worse inside.',
        colonial: 'columns. symmetry. control.',
        tigerinn: 'half-timbered. half-real.',
        terrace: 'flagstone. the floor is watching.',
        cloister: 'arches. nowhere to hide.',
        charter: 'the cupola. something up there.',
      };
      log('phobos', observations[clubId] ?? 'another room. another subject.');
    });
  }

  // (Old basement/bedroom/attic scene code was here — removed. Game is Prospect Ave now.)

  // This is a placeholder — loadBasement used to exist for the old horror arc.
  let revealRunning = false;
  const endDemo = async (): Promise<void> => {
    if (revealRunning) return;
    revealRunning = true;
    log('system', 'end.');
    player.setInputEnabled(false);

    const reveal = new RevealSequence({
      cornerBox,
      fade,
      audio,
      webcamGhost,
      voice,
      defaultVoiceId,
      sessionStartTime,
      lastFearScore,
      lastBpm,
    });
    await reveal.run();
  };

  // (Old basement/bedroom/attic beat sheets removed — game uses runCampusBeats/runClubBeats now.)
  const loadBasement = (): void => { log('system', 'old arc disabled. use clubs.'); };

  // ── boot sequence ──

  // 1) Title screen (requests webcam, waits for click).
  const titleScreen = new TitleScreen();
  await titleScreen.show();

  // HR pairing from the title screen — Web Bluetooth needs a user gesture.
  titleScreen.onHrConnect(async () => {
    hrClient.onBpm = (bpm) => cornerBox.updateBPM(bpm);
    hrClient.onStatus = (status, detail) => {
      cornerBox.appendLog({
        source: 'system',
        message: `hr ${status}${detail ? `: ${detail}` : ''}`,
        timestamp: Date.now(),
      });
      if (status === 'connected') titleScreen.setHrConnected(true, detail);
      else if (status === 'disconnected' || status === 'error') titleScreen.setHrConnected(false);
    };
    await hrClient.connect();
  });

  titleScreen.onStart(async () => {
    const stream = titleScreen.getStream();
    if (stream) {
      cornerBox.attachStream(stream);

      // Face-api runs on the visible corner-box video. Wait for first frame
      // before initializing models — face-api refuses zero-dimension inputs.
      const video = cornerBox.getVideoElement();
      faceEmotion.onDiagnostic = (msg) => {
        cornerBox.appendLog({ source: 'system', message: msg, timestamp: Date.now() });
      };
      const waitForFrames = new Promise<void>((resolve) => {
        if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
        const onReady = () => {
          video.removeEventListener('loadeddata', onReady);
          resolve();
        };
        video.addEventListener('loadeddata', onReady);
      });
      waitForFrames
        .then(() => faceEmotion.init(video))
        .then(
          () => cornerBox.appendLog({
            source: 'system',
            message: `face-api ready (${video.videoWidth}x${video.videoHeight})`,
            timestamp: Date.now(),
          }),
          (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            cornerBox.appendLog({
              source: 'system',
              message: `face-api failed: ${msg}`,
              timestamp: Date.now(),
            });
          },
        );
    }

    await audio.init();

    // Stand up the voice engine on the shared audio graph. If the ElevenLabs
    // voice id isn't configured, we silently skip — the game still runs.
    const audioCtx = audio.getContext();
    const audioMaster = audio.getMaster();
    if (audioCtx && audioMaster && defaultVoiceId) {
      voice = createVoiceEngine({
        context: audioCtx,
        destination: audioMaster,
        proxyUrl: voiceProxyUrl,
        defaultVoiceId,
      });
      lineBank = new LineBank(voice, defaultVoiceId);
      webcamGhost = new WebcamGhost({
        videoElement: cornerBox.getVideoElement(),
        overlayContainer: cornerBox.getVideoContainer(),
        audioContext: audioCtx,
        audioDestination: audioMaster,
      });
      // Warm the TTS cache in the background so first fires are near-instant.
      void lineBank.preWarm().catch((e) => console.warn('[voice] prewarm failed:', e));

      // Phobos entity — persistent across scenes, driven by biosignal spikes.
      const ambientBus = new AmbientBus(audioCtx, audioMaster, 0.0);
      creatureVoice = new CreatureVoice(voice, lineBank, ambientBus);
      const phobos = new PhobosEntity(voice, creatureVoice);
      entityManager = new EntityManager({
        scene: engine.scene,
        camera: engine.camera,
        phobos,
        log: (source, message) => log(source, message),
      });
      log('system', 'voice engine online.');
      log('system', 'phobos entity spawned.');
    } else if (!defaultVoiceId) {
      log('system', 'voice engine disabled (no VITE_ELEVEN_DEMO_VOICE_ID).');
    }

    player.lock();
    titleScreen.hide();
    cornerBox.show();
    crosshair.show();

    engine.start();
    sessionStartTime = performance.now();
    log('system', 'phobos initialized.');

    // ── Biosignal tick (every 500ms) — drives fear-reactive audio ──
    // Simulate rising fear since biosignals are stubbed (Phase 2).
    // Fear slowly climbs over ~90s from 0→0.8, creating an escalating
    // audio atmosphere even without real biosignal data.
    fearAudio.startHeartbeat();
    engine.onBiosignalTick = () => {
      const elapsed = (performance.now() - sessionStartTime) / 1000;
      const simulatedFear = Math.min(0.85, elapsed / 90);
      lastFearScore = simulatedFear;
      const bioState: BiosignalState = {
        fearScore: simulatedFear,
        bpm: lastBpm,
        gazeAversion: 0,
        flinchCount: 0,
        timeInScene: (performance.now() - sceneStartTime) / 1000,
        lookStillness: 0,
        retreatVelocity: 0,
        gazeDwellMs: {},
        timestamp: Date.now(),
      };
      fearAudio.update(bioState);
    };

    // ── Audio director tick — runs every 10s regardless of API key ──
    // Cycles through pacing moods on a fixed pattern and generates
    // horror sound events. Works standalone so audio is always reactive.
    const MOOD_CYCLE: MicroMood[] = ['descent', 'descent', 'hold', 'hold', 'crescendo', 'release'];
    let moodIndex = 0;

    const runAudioDirectorTick = (): void => {
      if (revealRunning) return;
      const mood = MOOD_CYCLE[moodIndex % MOOD_CYCLE.length];
      moodIndex++;
      const bioState: BiosignalState = {
        fearScore: lastFearScore,
        bpm: lastBpm,
        gazeAversion: 0,
        flinchCount: 0,
        timeInScene: (performance.now() - sceneStartTime) / 1000,
        lookStillness: 0,
        retreatVelocity: 0,
        gazeDwellMs: {},
        timestamp: Date.now(),
      };
      const audioPlan = audioDirector.query(mood, bioState, currentSceneName);
      fearAudio.setPhase(audioPlan.microMood);
      if (audioPlan.events.length > 0) {
        engine.eventBus.ingestPlan(audioPlan);
      }
      log(audioPlan.source, audioPlan.rationale);
    };

    // ── Phobos LLM agent tick (every 10s) ──
    if (phobos.hasApiKey) {
      log('system', 'phobos director online.');
      engine.onAgentTick = async () => {
        if (revealRunning) return;
        const p = engine.camera.position;
        engine.camera.getWorldDirection(_fwd);
        const bioState: BiosignalState = {
          fearScore: lastFearScore,
          bpm: lastBpm,
          gazeAversion: 0,
          flinchCount: 0,
          timeInScene: (performance.now() - sceneStartTime) / 1000,
          lookStillness: 0,
          retreatVelocity: 0,
          gazeDwellMs: {},
          timestamp: Date.now(),
        };
        const ctx: PhobosTickContext = {
          scene: currentSceneName,
          biosignals: bioState,
          playerPosition: [p.x, p.y, p.z],
          playerFacing: [_fwd.x, _fwd.y, _fwd.z],
          timeInScene: (performance.now() - sceneStartTime) / 1000,
          totalSessionTime: (performance.now() - sessionStartTime) / 1000,
        };
        const plan = await phobos.tick(ctx);
        if (plan) {
          engine.eventBus.ingestPlan(plan);
          log(plan.source, plan.rationale);
          // Use Phobos mood when API key is available
          runAudioDirectorTick();
        }
      };
    } else {
      // No API key — run audio director on its own 10s timer
      engine.onAgentTick = () => { runAudioDirectorTick(); };
    }

    // Load the campus — Prospect Ave — as the opening scene. Walk up to any
    // of the 10 eating-club doors to enter that club's interior.
    loadCampus();
    // Dev escape hatch into the existing horror arc.
    (window as unknown as { __loadBasement: () => void }).__loadBasement = loadBasement;
  });

  // Dev keys:
  //   V — authored whisper from current fear bucket
  //   B — simulate a fear spike (Phobos reveals + dynamic SFX). Scales with shift.
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') {
      if (!voice || !lineBank) return;
      speakAs('medium');
      return;
    }
    if (e.code === 'KeyB' && entityManager) {
      const score = e.shiftKey ? 0.9 : 0.65 + Math.random() * 0.2;
      entityManager.triggerSpike({
        score,
        delta: 0.35,
        bpm: hrClient.isLive ? hrClient.bpm : 0,
        timestamp: Date.now(),
      });
    }
  });

  // 2) Pointer unlock overlay ("click to resume")
  const resumeOverlay = document.createElement('div');
  Object.assign(resumeOverlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '50',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.7)',
    cursor: 'pointer',
  });
  const resumeText = document.createElement('p');
  resumeText.textContent = 'click to resume';
  Object.assign(resumeText.style, {
    fontFamily: "'Courier New', monospace",
    fontSize: '1.6rem',
    color: '#c09030',
    letterSpacing: '0.35rem',
    textTransform: 'uppercase',
    userSelect: 'none',
    textShadow: '0 0 12px rgba(192,144,48,0.4)',
  });
  resumeOverlay.appendChild(resumeText);
  resumeOverlay.addEventListener('click', () => {
    player.lock();
  });
  document.body.appendChild(resumeOverlay);

  // Remember the scene-level status so we can restore it after an Esc/resume cycle.
  let lastSceneStatus = '—';
  const origSetStatus = devHud.setStatus.bind(devHud);
  devHud.setStatus = (text: string): void => {
    lastSceneStatus = text;
    origSetStatus(text);
  };

  player.controls.addEventListener('unlock', () => {
    resumeOverlay.style.display = 'flex';
    engine.stop();
    origSetStatus('PAUSED · CLICK TO RESUME');
  });
  player.controls.addEventListener('lock', () => {
    resumeOverlay.style.display = 'none';
    engine.start();
    origSetStatus(lastSceneStatus);
  });
}

main().catch(console.error);
