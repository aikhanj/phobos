import * as THREE from 'three';
import { Engine } from './game/engine';
import { Player } from './game/player';
import { Basement } from './game/scenes/basement';
import { Bedroom } from './game/scenes/bedroom';
import { Attic } from './game/scenes/attic';
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
import { EntityManager, PhobosEntity } from './game/entities';
import { PhobosDirector } from './agents/phobosDirector';
import { AudioDirector } from './agents/audioDirector';
import { NoteOverlay } from './ui/noteOverlay';
import { CalibrationOverlay } from './ui/calibrationOverlay';
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
  let sessionStartTime = 0;
  let currentSceneName: 'basement' | 'bedroom' | 'attic' = 'basement';
  let sceneStartTime = 0;
  let lastFearScore = 0;
  let lastBpm = 0;

  // Note interaction handler — shows overlay, tracks reads
  const handleNoteInteract = (noteId: NoteId): void => {
    player.setInputEnabled(false);
    noteOverlay.show(noteId, () => {
      player.setInputEnabled(true);
    });
  };
  const handleNoteRead = (noteId: NoteId): void => {
    phobos.onNoteRead(noteId);
  };

  // Voice engine wiring (lazy — audio context is created at audio.init()).
  let voice: VoiceEngine | null = null;
  let lineBank: LineBank | null = null;
  let webcamGhost: WebcamGhost | null = null;
  let entityManager: EntityManager | null = null;
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

  // Swap ambient profile whenever a scene loads.
  engine.onSceneLoaded = (scene) => {
    if (scene.name === 'basement' || scene.name === 'bedroom' || scene.name === 'attic') {
      audio.setScene(scene.name);
      devHud.setStatus(`SCENE · ${scene.name}`);
    }
  };

  // ── scene beat-sheet timelines ──
  let activeTimeline: Timeline | null = null;

  const swapTimeline = (t: Timeline): Timeline => {
    activeTimeline?.cancel();
    activeTimeline = t;
    return t;
  };

  // ── Prospect Avenue: campus + 10 club interiors ──────────────────────

  const loadCampus = (): void => {
    const campus = new Campus({
      onEnterClub: (id) => { void enterClub(id); },
    });
    engine.loadScene(campus);
    engine.camera.position.copy(campus.spawnPoint);
    devHud.setStatus('SCENE · prospect ave · walk up to any club door');
    devHud.flash('>> PROSPECT AVE — 10 CLUBS <<', 3000);
    log('system', 'prospect ave. the clubs are still standing.');
  };

  const clubCtorByIdLocal = {
    tower:    (onExit: () => void) => new TowerInterior({ onExit }),
    cannon:   (onExit: () => void) => new CannonInterior({ onExit }),
    ivy:      (onExit: () => void) => new IvyInterior({ onExit }),
    cottage:  (onExit: () => void) => new CottageInterior({ onExit }),
    capgown:  (onExit: () => void) => new CapGownInterior({ onExit }),
    colonial: (onExit: () => void) => new ColonialInterior({ onExit }),
    tigerinn: (onExit: () => void) => new TigerInnInterior({ onExit }),
    terrace:  (onExit: () => void) => new TerraceInterior({ onExit }),
    cloister: (onExit: () => void) => new CloisterInterior({ onExit }),
    charter:  (onExit: () => void) => new CharterInterior({ onExit }),
  } satisfies Record<ClubId, (onExit: () => void) => { spawnPoint: THREE.Vector3 }>;

  const enterClub = async (id: ClubId): Promise<void> => {
    player.setInputEnabled(false);
    log('system', `entering ${CLUB_LABEL[id]}.`);
    await fade.fadeToBlack(500);
    const room = clubCtorByIdLocal[id](() => { void exitToCampus(); });
    engine.loadScene(room as unknown as Parameters<typeof engine.loadScene>[0]);
    engine.camera.position.copy(room.spawnPoint);
    devHud.setStatus(`SCENE · ${CLUB_LABEL[id]} · walk to the door to leave`);
    await new Promise((r) => setTimeout(r, 180));
    await fade.fadeFromBlack(700);
    player.setInputEnabled(true);
  };

  const exitToCampus = async (): Promise<void> => {
    player.setInputEnabled(false);
    log('system', 'back to prospect ave.');
    await fade.fadeToBlack(500);
    loadCampus();
    await new Promise((r) => setTimeout(r, 150));
    await fade.fadeFromBlack(700);
    player.setInputEnabled(true);
  };

  // ── scene factories (defined forward, swap in the transitions below) ──
  const loadBasement = (): void => {
    currentSceneName = 'basement';
    sceneStartTime = performance.now();
    phobos.onSceneChange('basement');
    const basement = new Basement({
      onTransitionToBedroom: () => transitionToBedroom(),
      onNoteRead: handleNoteRead,
      onNoteInteract: handleNoteInteract,
    });
    engine.loadScene(basement);
    engine.camera.position.copy(basement.spawnPoint);
    runBasementOpening(basement);
  };

  const loadBedroom = (): void => {
    currentSceneName = 'bedroom';
    sceneStartTime = performance.now();
    phobos.onSceneChange('bedroom');
    const bedroom = new Bedroom({
      onTransitionToAttic: () => transitionToAttic(),
      onNoteRead: handleNoteRead,
      onNoteInteract: handleNoteInteract,
    });
    engine.loadScene(bedroom);
    engine.camera.position.copy(bedroom.spawnPoint);
    runBedroomBeats();
  };

  const loadAttic = (): void => {
    currentSceneName = 'attic';
    sceneStartTime = performance.now();
    phobos.onSceneChange('attic');
    const attic = new Attic({
      onDemoEnd: () => endDemo(),
      onNoteRead: handleNoteRead,
      onNoteInteract: handleNoteInteract,
    });
    engine.loadScene(attic);
    engine.camera.position.copy(attic.spawnPoint);
    runAtticBeats();
  };

  // ── transitions ──
  const transitionToBedroom = async (): Promise<void> => {
    player.setInputEnabled(false);
    log('pacing_director', 'ascent. tier 2.');
    await fade.fadeToBlack(700);
    loadBedroom();
    await new Promise((r) => setTimeout(r, 250));
    await fade.fadeFromBlack(800);
    player.setInputEnabled(true);
  };

  const transitionToAttic = async (): Promise<void> => {
    player.setInputEnabled(false);
    log('pacing_director', 'ascent.');
    await fade.fadeToBlack(900);
    loadAttic();
    await new Promise((r) => setTimeout(r, 400));
    await fade.fadeFromBlack(1200);
    player.setInputEnabled(true);
  };

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

  // ── beat sheets ──

  /**
   * Basement opening = interactive calibration ritual. The player cannot
   * walk but CAN look around with the mouse. Calibration advances through
   * gaze-reactive phases — the room responds to where they look.
   *
   * Phase 0: Boot       (~3.5s fixed) — CRT boots, candles light one by one
   * Phase 1: Gaze       (1.5s on target or 8s timeout) — "look at the camera"
   * Phase 2: Stillness  (2s still or 6s timeout) — "hold still", fake BPM ramps
   * Phase 3: Scare test (5s fixed) — "don't look away", hard flicker + sound
   * Phase 4: Complete   (3s fixed) — flare, voice, unlock
   */
  function runBasementOpening(basement: Basement): void {
    const t = swapTimeline(new Timeline());
    player.setInputEnabled(false);

    const calibOverlay = new CalibrationOverlay();
    const tripodPos = new THREE.Vector3(0, 1.3, -1.5);
    const _gazeDir = new THREE.Vector3();
    const _toTarget = new THREE.Vector3();

    let phase = 0;
    let phaseStart = performance.now();
    let gazeOnTarget = 0;
    let stillAccum = 0;
    const prevLook = new THREE.Vector3();
    engine.camera.getWorldDirection(prevLook);
    let scareFired = false;
    let reactionLogged = false;
    let fakeBpm = 0;
    let pollId: number | null = null;

    const phaseElapsed = (): number => (performance.now() - phaseStart) / 1000;

    const isLookingAt = (target: THREE.Vector3, thresholdDeg = 15): boolean => {
      engine.camera.getWorldDirection(_gazeDir);
      _toTarget.subVectors(target, engine.camera.position).normalize();
      const dot = _gazeDir.dot(_toTarget);
      return Math.acos(Math.min(1, Math.max(-1, dot))) < thresholdDeg * Math.PI / 180;
    };

    const getLookAngularSpeed = (): number => {
      engine.camera.getWorldDirection(_gazeDir);
      const dot = Math.min(1, Math.max(-1, _gazeDir.dot(prevLook)));
      prevLook.copy(_gazeDir);
      return Math.acos(dot) / 0.1;
    };

    const stopPoll = (): void => {
      if (pollId !== null) { clearInterval(pollId); pollId = null; }
    };

    const enterPhase = (p: number): void => {
      phase = p;
      phaseStart = performance.now();
      gazeOnTarget = 0;
      stillAccum = 0;

      switch (p) {
        case 1:
          calibOverlay.show('look at the camera');
          log('creature_director', 'locate the subject.');
          devHud.setStatus('CALIBRATION · GAZE · WASD LOCKED');
          break;

        case 2:
          basement.lightCandle(2);
          calibOverlay.show('hold still');
          log('system', 'eye contact. locked.');
          engine.eventBus.fire({ kind: 'crt_message', text: 'FACE DETECTED', durationS: 5 });
          engine.eventBus.fire({ kind: 'sound', asset: 'heartbeat', volume: 0.3 });
          log('audio_director', 'reading pulse...');
          devHud.setStatus('CALIBRATION · PULSE · WASD LOCKED');
          break;

        case 3:
          basement.lightCandle(3);
          basement.setOverheadBase(0.35);
          calibOverlay.show("don't look away");
          log('system', `pulse: ${Math.round(fakeBpm)} bpm. stable.`);
          cornerBox.updateFearScore(0.05);
          log('pacing_director', 'testing.');
          devHud.setStatus('CALIBRATION · HOLD · WASD LOCKED');
          break;

        case 4:
          stopPoll();
          calibOverlay.setProgress(1);
          calibOverlay.show('calibration complete');
          basement.flareCandles();
          basement.setOverheadBase(0.5);
          engine.eventBus.fire({ kind: 'crt_message', text: 'SUBJECT PROFILED', durationS: 4 });
          log('system', 'good.');
          speakAs('low', 'good');
          cornerBox.updateFearScore(0.08);
          devHud.setStatus('CALIBRATION · DONE');

          setTimeout(() => {
            calibOverlay.hide();
            basement.setCalibrationComplete();
            player.setInputEnabled(true);
            devHud.setStatus('SCENE · basement · WASD + [E] ENABLED');
            devHud.flash('>> WASD · MOUSE · [E] <<', 2800);
            runBasementExploration();
            setTimeout(() => calibOverlay.dispose(), 1000);
          }, 3000);
          break;
      }
    };

    // ── Phase 0: Boot (fixed timeline, ~3.5s) ──
    devHud.setStatus('CALIBRATION · BOOT · WASD LOCKED');

    t.schedule(200, () => engine.eventBus.fire({ kind: 'crt_message', text: 'PHOBOS v2.1', durationS: 3 }));
    t.schedule(400, () => log('system', 'initializing...'));
    t.schedule(1000, () => {
      basement.lightCandle(0);
      basement.setOverheadBase(0.15);
    });
    t.schedule(1800, () => log('system', 'camera feed: active.'));
    t.schedule(2500, () => {
      basement.lightCandle(1);
      basement.setOverheadBase(0.22);
    });
    t.schedule(3000, () => engine.eventBus.fire({ kind: 'crt_message', text: 'CALIBRATING...', durationS: 6 }));
    t.schedule(3500, () => enterPhase(1));

    // ── Gaze poll (100ms) — drives phases 1-3 reactively ──
    pollId = window.setInterval(() => {
      const dt = 0.1;
      let progress = 0;

      switch (phase) {
        case 0:
          progress = Math.min(0.12, phaseElapsed() / 3.5 * 0.12);
          break;

        case 1: {
          const looking = isLookingAt(tripodPos, 18);
          if (looking) {
            gazeOnTarget += dt;
          } else {
            gazeOnTarget = Math.max(0, gazeOnTarget - dt * 0.3);
          }
          progress = 0.12 + (gazeOnTarget / 1.5) * 0.22;

          if (gazeOnTarget >= 1.5) {
            enterPhase(2);
          } else if (phaseElapsed() > 8) {
            log('system', 'manual override. proceeding.');
            enterPhase(2);
          }
          break;
        }

        case 2: {
          const angSpeed = getLookAngularSpeed();
          if (angSpeed < 0.3) {
            stillAccum += dt;
          } else {
            stillAccum = Math.max(0, stillAccum - dt * 0.5);
          }

          if (fakeBpm < 72) {
            fakeBpm = Math.min(72, fakeBpm + dt * 20);
            cornerBox.updateBPM(Math.round(fakeBpm));
          }

          progress = 0.34 + (stillAccum / 2) * 0.22;

          if (stillAccum >= 2) {
            enterPhase(3);
          } else if (phaseElapsed() > 6) {
            fakeBpm = 72;
            cornerBox.updateBPM(72);
            log('system', `pulse: ${Math.round(fakeBpm)} bpm. unstable.`);
            enterPhase(3);
          }
          break;
        }

        case 3: {
          progress = 0.56 + Math.min(0.22, phaseElapsed() / 5 * 0.22);

          if (phaseElapsed() > 2 && !scareFired) {
            scareFired = true;
            engine.eventBus.fire({ kind: 'flicker', duration: 0.5, pattern: 'hard' });
            engine.eventBus.fire({ kind: 'breath', intensity: 0.6 });
            engine.eventBus.fire({ kind: 'sound', asset: 'footstep_behind', volume: 0.9 });
          }

          if (phaseElapsed() > 2.8 && !reactionLogged) {
            reactionLogged = true;
            const looking = isLookingAt(tripodPos, 25);
            if (!looking) {
              log('creature_director', 'flinch. catalogued.');
            } else {
              log('creature_director', 'no reaction. interesting.');
            }
          }

          if (phaseElapsed() >= 5) {
            enterPhase(4);
          }
          break;
        }

        case 4:
          progress = 0.78 + Math.min(0.22, phaseElapsed() / 3 * 0.22);
          break;
      }

      calibOverlay.setProgress(Math.min(1, progress));
    }, 100);
  }

  /**
   * After calibration — the player can now move. Beats fire based on
   * wall-clock but most of the real scares are the authored gazetracked
   * prop relocation when the player turns toward the stairs.
   */
  function runBasementExploration(): void {
    const t = swapTimeline(new Timeline());
    const bus = engine.eventBus;

    // 8s in: a footstep behind them; creature asks, pacing says no.
    t.schedule(8000, () => {
      log('creature_director', 'behind them. now.');
      log('pacing_director', 'no. not yet.');
      bus.fire({ kind: 'sound', asset: 'footstep_behind', volume: 0.8 });
    });

    // 12s: tone_wrong — something feels off
    t.schedule(12000, () => {
      bus.fire({ kind: 'sound', asset: 'tone_wrong', volume: 0.25 });
    });

    // 14s: silence drop + prep crate move
    t.schedule(14000, () => {
      log('audio_director', 'silence.');
      bus.fire({ kind: 'silence', duration: 3 });
    });

    // 16s: schedule crate move — fires only when crate is unwatched
    t.schedule(16000, () => {
      log('creature_director', 'when they turn.');
      bus.schedule(
        {
          kind: 'prop_move',
          propId: 'basement_crate',
          to: [1.8, 0.3, 0.5],
          requires: 'unwatched',
        },
        0,
      );
    });

    // 19s: hard blackout flicker + stinger combo
    t.schedule(19000, () => {
      bus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.8 });
      bus.fire({ kind: 'sound', asset: 'impact', volume: 0.7 });
      bus.fire({ kind: 'flicker', duration: 0.35, pattern: 'blackout' });
      fade.blink(150);
    });

    // 23s: radio static interference
    t.schedule(23000, () => {
      bus.fire({ kind: 'sound', asset: 'radio_static', volume: 0.5 });
    });

    // 26s: a whisper pointing up the stairs
    t.schedule(26000, () => {
      log('pacing_director', 'upstairs.');
      bus.fire({ kind: 'sound', asset: 'whisper_see', volume: 0.6 });
    });

    // 30s: reverse creak — something wrong
    t.schedule(30000, () => {
      bus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.5 });
    });
  }

  /**
   * Bedroom — the star. Window figure, wardrobe creak, mirror mismatch,
   * forced release, then the hatch.
   */
  function runBedroomBeats(): void {
    const t = swapTimeline(new Timeline());
    const bus = engine.eventBus;

    t.schedule(1500, () => log('pacing_director', 'hold.'));

    // 6s: wardrobe creaks ajar
    t.schedule(6000, () => {
      log('creature_director', 'the wardrobe.');
      bus.fire({ kind: 'prop_state', propId: 'bedroom_wardrobe_door', state: 'ajar', param: 0.18 });
      bus.fire({ kind: 'sound', asset: 'creak_door', volume: 0.7 });
    });

    // 11s: figure in window
    t.schedule(11000, () => {
      log('creature_director', 'window. brief.');
      log('pacing_director', 'allowed.');
      bus.fire({ kind: 'figure', anchor: 'window', duration: 1.2, opacity: 0.85 });
    });

    // 15s: tone_wrong builds dread
    t.schedule(15000, () => {
      bus.fire({ kind: 'sound', asset: 'tone_wrong', volume: 0.3 });
    });

    // 18s: Pacing forces release — light warms, silence, breath.
    t.schedule(18000, () => {
      log('pacing_director', 'release. twelve seconds.');
      bus.fire({ kind: 'silence', duration: 4 });
      bus.fire({ kind: 'breath', intensity: 0.3 });
    });

    // 22s: the release isn't release — mirror swaps to "extra figure" + stinger.
    t.schedule(22000, () => {
      log('creature_director', 'look at the mirror.');
      bus.fire({ kind: 'sound', asset: 'stinger_high', volume: 0.7 });
      bus.fire({ kind: 'mirror_swap', variant: 'extra_figure' });
    });

    // 25s: anti-silence — disorienting volume surge
    t.schedule(25000, () => {
      bus.fire({ kind: 'anti_silence', duration: 2 });
    });

    // 28s: harder flicker, wardrobe opens wider + impact
    t.schedule(28000, () => {
      log('audio_director', 'lower.');
      bus.fire({ kind: 'sound', asset: 'impact', volume: 0.8 });
      bus.fire({ kind: 'flicker', duration: 0.8, pattern: 'hard' });
      bus.fire({ kind: 'prop_state', propId: 'bedroom_wardrobe_door', state: 'ajar', param: 0.55 });
    });

    // 32s: radio static before hatch unlock
    t.schedule(32000, () => {
      bus.fire({ kind: 'sound', asset: 'radio_static', volume: 0.6 });
    });

    // 35s: hatch unlocks
    t.schedule(35000, () => {
      log('pacing_director', 'ascent.');
      bus.fire({ kind: 'unlock', propId: 'bedroom_hatch' });
    });
  }

  /**
   * Attic — climax. The breathing center is ambient; approaching it ends
   * the demo via the trigger set up in `Attic.triggers()`.
   */
  function runAtticBeats(): void {
    const t = swapTimeline(new Timeline());
    const bus = engine.eventBus;

    t.schedule(500, () => log('creature_director', 'home.'));
    t.schedule(3000, () => {
      log('audio_director', 'no ambient. only breath.');
      bus.fire({ kind: 'silence', duration: 20 });
      bus.fire({ kind: 'breath', intensity: 0.4 });
    });
    // 6s: reverse creak in the void
    t.schedule(6000, () => {
      bus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.3 });
    });
    t.schedule(9000, () => log('pacing_director', 'let them approach.'));
    // 11s: stinger combo — something is here
    t.schedule(11000, () => {
      bus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.7 });
      bus.fire({ kind: 'sound', asset: 'stinger_high', volume: 0.5 });
      bus.fire({ kind: 'sound', asset: 'glitch', volume: 0.6 });
    });
    t.schedule(14000, () => {
      log('creature_director', 'closer.');
      bus.fire({ kind: 'sound', asset: 'radio_static', volume: 0.5 });
    });
  }

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
      const creatureVoice = new CreatureVoice(voice, lineBank, ambientBus);
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
