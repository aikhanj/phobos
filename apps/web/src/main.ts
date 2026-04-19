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
import { SCENE_CONFIGS } from './game/sceneConfig';
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
import { IntroSequence } from './horror/introSequence';
import { ObjectiveHud } from './ui/objectiveHud';
import { EntityManager, PhobosEntity, ColonialStalker } from './game/entities';
import { PhobosDirector } from './agents/phobosDirector';
import { AudioDirector } from './agents/audioDirector';
import { NoteOverlay } from './ui/noteOverlay';
import { ProgressionManager } from './game/progressionManager';
import { playFlashback, FLASHBACKS } from './horror/flashback';
import { FaceEmotionDetector } from './biosignals/faceEmotion';
import { FearScoreCalculator } from './biosignals/fearScore';
import { BluetoothHrClient } from './biosignals/bluetoothHr';
import { AudioEnergyDetector } from './biosignals/audioEnergy';
import { ScareProfiler, type ScareCategory } from './horror/scareProfiler';
import { ScareOverlay } from './ui/scareOverlay';
import { BickerForm } from './ui/bickerForm';
import { playerProfile, personalize, hasTokens } from './game/playerProfile';
import { sessionHistory } from './game/sessionHistory';
import { pickPersonalized, personalizedChance } from './horror/personalizedLines';
import { CLUB_ARRIVAL_BEATS, getCampusBeatFor, ROOMMATE, amplifiedClubLog } from './horror/storyline';
import { ChapterCard } from './ui/chapterCard';
import { DeanStalker } from './horror/deanStalker';
import { ChapterSystem } from './horror/chapterSystem';
import { ClubDeanHunt } from './horror/clubDeanHunt';
import { RushEntity } from './horror/rushEntity';
import { Survival } from './horror/survival';
import { SurvivalHud } from './ui/survivalHud';
import type { AgentLogEntry, BiosignalState, MicroMood, NoteId, PhobosTickContext, WebcamGlitchType } from '@phobos/types';

/**
 * DEAN CHASE FLAG — when true, the full horror stack runs: DeanStalker
 * (campus), ClubDeanHunt (interior), RushEntity (DOORS dash), street
 * scare loop, subliminal faces, proximity dread bed, chapter cards.
 * When false, it's pure puzzle mode with no chaser. Flipped true now
 * that all chain clubs have real puzzles + hide zones + safe respawn.
 */
const DEAN_CHASE_ENABLED = true;

async function main() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  const engine = new Engine(canvas);
  const player = new Player(engine.camera, canvas);
  const cornerBox = new CornerBox();
  const crosshair = new Crosshair();
  const audio = new AudioManager();
  const fade = new FadeOverlay();
  const devHud = new DevHud();
  const objective = new ObjectiveHud();
  // Granny-style survival state — lives + 3-item inventory + hidden
  // badge. Wired to every catch point (ClubDeanHunt, RushEntity,
  // DeanStalker close-hit) so the game has a single source of truth
  // for "how many chances does the player have left." Initialized
  // with a placeholder spawn; main.ts updates campusSpawn on first
  // loadCampus call.
  const survivalHud = new SurvivalHud();
  const survival = new Survival({
    player,
    campusSpawn: new THREE.Vector3(-44, 1.6, 0),
    onGameOver: () => {
      // Hold black fade indefinitely, flash GAME OVER text.
      fade.holdBlack();
      log('system', 'GAME OVER · dean eisgruber wins · refresh to try again');
      devHud.flash('>> GAME OVER · refresh to retry <<', 60_000);
    },
    onHudChange: (s) => survivalHud.update(s),
    log: (m) => log('system', m),
  });
  // Full-screen scare overlay — red flash / static / giant PHOBOS / ghost
  // face / blood drips. The "undeniable" visual horror layer; players
  // reported the subtle flicker + webcam glitch weren't enough.
  const scareOverlay = new ScareOverlay();
  // The six-chapter narrative: ChapterCard UI + ChapterSystem orchestrator.
  // Each chapter fires once on its gameplay trigger (first campus load,
  // first club entry, final pickup). See horror/chapters.ts for plot.
  const chapterCard = new ChapterCard();
  // deanStalker + chapterSystem are instantiated later in onStart once
  // entityManager + voice are wired; see below.
  let deanStalker: DeanStalker | null = null;
  let chapterSystem: ChapterSystem | null = null;
  // In-club Dean hunt — spawned on enterClub for chain clubs, cancelled
  // on pickup or exit. Converts clubs from "find note, leave" into
  // "race to find note before the Dean closes in."
  let clubDeanHunt: ClubDeanHunt | null = null;
  // RUSH entity — the DOORS-style dash scare. Lives only on campus.
  // Started on campus load, stopped on club entry + end. Ticks every
  // frame via engine.onUpdate.
  let rushEntity: RushEntity | null = null;

  player.setColliderProvider(engine.getColliders);
  player.setFloorHeightProvider(engine.getFloorHeight);

  // ── Audio controllers ──
  const fearAudio = new FearAudioController(audio);
  const audioDirector = new AudioDirector();

  // ── Phobos LLM director ──
  const openaiKey = (import.meta.env.VITE_OPENAI_API_KEY as string) || '';
  const phobos = new PhobosDirector(openaiKey);
  const noteOverlay = new NoteOverlay();
  const progression = new ProgressionManager();
  let sessionStartTime = 0;
  // Must be updated by onSceneLoaded — the LLM's tier escalation
  // (tower=tier1, colonial/cannon/capgown=tier2, charter=tier3) keys off this.
  let currentSceneName = 'boot';
  let sceneStartTime = performance.now();
  let lastFearScore = 0;
  let lastBpm = 0;
  // Track when the LLM director last completed a tick — drives the "LLM:on 4s"
  // readout on the analysis HUD. 0 means "never ticked" (offline or still booting).
  let lastLlmTick = 0;
  // Flips true on first real face-api inference or HR sample. Until then,
  // the biosignal tick substitutes a simulated fear ramp so demo mode still has an arc.
  let hasRealBiosignal = false;

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
  // Mic is the 3rd biosignal channel — gasps + screams + held-breath-breaking.
  // Init is deferred until game start (needs user gesture for getUserMedia).
  const audioEnergy = new AudioEnergyDetector();
  // Scare profiler: every fire goes through this; it measures the player's
  // reaction window and builds an effectiveness profile per technique.
  const scareProfiler = new ScareProfiler();
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
    // The Dean stalker ticks every frame when active. Handles smoothing
    // toward the chapter's target distance, orbit-drift around player,
    // visibility ladder by distance, and the within-6-units close-hit.
    deanStalker?.update();
    // In-club hunt — continuous per-frame chase when inside a chain club.
    clubDeanHunt?.update();
    // RUSH — DOORS-style dash entity, campus only.
    rushEntity?.update(dt);

    // DREAD PROXIMITY BED + SUBLIMINAL FLASHES — disabled in puzzle
    // mode. Dread bed forced silent so the avenue stays quiet.
    if (DEAN_CHASE_ENABLED) {
      let nearestDeanDist = Infinity;
      if (clubDeanHunt) {
        const d = clubDeanHunt.distanceToPlayer();
        if (isFinite(d) && d < nearestDeanDist) nearestDeanDist = d;
      }
      if (deanStalker && entityManager) {
        const pp = entityManager.phobos.getPosition();
        const cp = engine.camera.position;
        const dx = pp.x - cp.x, dz = pp.z - cp.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < nearestDeanDist) nearestDeanDist = d;
      }
      if (isFinite(nearestDeanDist)) {
        const dreadLevel = Math.max(0, Math.min(1, 1 - nearestDeanDist / 30));
        audio.setDreadProximity(dreadLevel);
        subliminalTimer += dt;
        if (dreadLevel > 0.65 && subliminalTimer > (8 + Math.random() * 7)) {
          subliminalTimer = 0;
          const variants: Array<'eisgruber' | 'eyes' | 'shriek'> = ['eisgruber', 'eyes', 'shriek'];
          scareOverlay.subliminalFace(70 + Math.random() * 50, variants[Math.floor(Math.random() * 3)]);
        }
      } else {
        audio.setDreadProximity(0);
      }
    } else {
      audio.setDreadProximity(0);
    }
  };
  // Drift timer for subliminal-face dispatcher above.
  let subliminalTimer = 0;

  // Biosignal tick (500ms) — the single source of truth for fear_score.
  // Face-api + HR baseline EMA produce the real reading; when neither is
  // active yet we substitute a 0→0.85 ramp over 90s so demo mode still
  // escalates audio + entities. Everything downstream reads lastFearScore.
  engine.onBiosignalTick = () => {
    faceEmotion.tick();

    const bpm = hrClient.displayBpm;
    if (bpm > 0) {
      if (baselineBpm === 0) baselineBpm = bpm;
      else baselineBpm = baselineBpm * 0.985 + bpm * 0.015;
    }

    const faceActive = faceEmotion.snapshot.detected;
    const hrActive = hrClient.isLive;
    const audioActive = audioEnergy.snapshot.active;
    if (faceActive || hrActive || audioActive) hasRealBiosignal = true;

    // Mic onset is a one-shot "the player just reacted" signal. Consume
    // it here so the same onset doesn't double-credit across ticks, but
    // feed it to fearScore AND the profiler so both see the reaction.
    const micOnset = audioEnergy.consumeOnset();

    let state = fearScore.calculate({
      face: faceEmotion.snapshot,
      bpm,
      baselineBpm,
      timeInScene: sceneTime,
      audio: audioEnergy.snapshot,
      audioOnset: micOnset,
    });

    if (!hasRealBiosignal) {
      const elapsed = sessionStartTime === 0
        ? 0
        : (performance.now() - sessionStartTime) / 1000;
      // Ramp 0 → 0.85 over the first 60s so the ambient dread escalates
      // even without biosignals. Faster than before (was 90s).
      state = { ...state, fearScore: Math.min(0.85, elapsed / 60) };
    }
    // HORROR FLOOR — never let fear fall below 0.45 once the session
    // is underway. The drone/rumble/heartbeat/LFO are all tied to fear,
    // and a low floor makes the ambient feel calm. The player should
    // NEVER feel calm. This is a horror game.
    if (sessionStartTime > 0 && (performance.now() - sessionStartTime) > 3000) {
      state = { ...state, fearScore: Math.max(0.45, state.fearScore) };
    }

    // Close the observation window for any scares fired 3s ago — this is
    // how the profiler learns what worked on THIS player. Always called
    // regardless of hasRealBiosignal: if we're in simulated-fear mode the
    // ramp still trains the profiler, which is fine for demo purposes.
    scareProfiler.observe(state.fearScore, state.bpm, micOnset);

    // Track fear spikes into sessionHistory so the director can reference
    // them in later ticks ("your heart rate jumped 22 bpm at tower").
    const spikeDelta = state.fearScore - lastFearScore;
    if (spikeDelta >= 0.15 && state.fearScore >= 0.4) {
      sessionHistory.push('fear_spike', currentSceneName, {
        fearScore: state.fearScore,
        delta: spikeDelta,
        bpm: state.bpm,
      });
    }

    lastFearScore = state.fearScore;
    lastBpm = state.bpm;

    cornerBox.updateFearScore(state.fearScore);
    cornerBox.updateBPM(state.bpm, hrClient.signalQuality);

    // ── LIVE ANALYSIS HUD ───────────────────────────────────────────────
    // Push the current face/mic/LLM/profiler readings to the corner box
    // so the player can SEE the AI reading them. Prior to this the fear
    // bar moved but there was no indication WHY — now they see "FACE:
    // fearful 0.42 · MIC: 0.18! · LLM: on 4s · VEC: auditory*".
    const faceSnap = faceEmotion.snapshot;
    let faceTop = 'neutral';
    let faceConf = 0;
    if (faceSnap.detected) {
      const entries: Array<[string, number]> = [
        ['fearful', faceSnap.fearful], ['surprised', faceSnap.surprised],
        ['angry', faceSnap.angry], ['disgusted', faceSnap.disgusted],
        ['sad', faceSnap.sad], ['happy', faceSnap.happy],
        ['neutral', faceSnap.neutral],
      ];
      entries.sort((a, b) => b[1] - a[1]);
      faceTop = entries[0][0];
      faceConf = entries[0][1];
    }
    const profSummary = scareProfiler.summary();
    cornerBox.setAnalysisLine({
      faceTop,
      faceConf,
      faceDetected: faceSnap.detected,
      micLoud: audioEnergy.snapshot.loudness,
      micOnset,
      micActive: audioEnergy.snapshot.active,
      llmOnline: !!openaiKey,
      llmLastTick: openaiKey ? (performance.now() - lastLlmTick) / 1000 : undefined,
      vector: profSummary.dominantVector,
      phase: profSummary.isExperimenting ? 'EXPERIMENTING' : 'AMPLIFYING',
    });

    // Fear-reactive CRT: grain rises, vignette tightens as fear climbs.
    engine.setGrain(sceneGrainBase + state.fearScore * 0.08);
    // Brighter floor: vignette can't go below 0.55 (was 0.38) even at
    // max fear. Players reported the edges went pitch-black — now the
    // world stays navigable under every fear state.
    engine.setVignette(Math.max(0.55, sceneVignetteBase - state.fearScore * 0.12));

    fearAudio.update(state);
    entityManager?.onBiosignal(state);
  };

  // Crosshair lights up when targeting an interactable; E triggers it.
  engine.onInteractableChange = (hint) => crosshair.setTarget(hint);
  player.onInteractKey = () => engine.tryInteract();

  // Convenience: speak a line in Phobos's voice at the camera position.
  // When a text is explicitly passed, interpolate profile tokens. When no
  // text is passed, roll for a personalized line (chance scales with bucket)
  // before falling back to the generic granny line bank.
  const speakAs = (bucket: FearBucket, text?: string): void => {
    if (!voice || !lineBank || !defaultVoiceId) return;
    let line: string;
    if (text !== undefined) {
      line = hasTokens(text) ? personalize(text) : text;
    } else if (playerProfile.isSubmitted && Math.random() < personalizedChance(bucket)) {
      line = pickPersonalized(bucket);
    } else {
      line = lineBank.pick(bucket);
    }
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

  // ── SCARE PROFILER: probe + heavy-stack fire helpers ────────────────
  // Every scare technique goes through register() so the profiler can
  // observe the reaction window (fear delta + bpm delta + mic onset
  // over 3 seconds) and build an effectiveness profile per category.
  // Probes are single-event low-intensity fires — they let the profiler
  // isolate reactions per category. Heavy stacks are used at peak beats
  // and combine multiple events keyed to the winning category.
  const PROBE_CATEGORIES: ScareCategory[] = [
    'audio_stinger', 'audio_ambient', 'visual_flicker',
    'entity_reveal', 'webcam_glitch', 'spatial_audio',
    'jumpscare', 'personalized',
  ];

  /** Fire a single low-intensity probe and register with the profiler. */
  const fireProbe = (category: ScareCategory): void => {
    scareProfiler.register(category, lastFearScore, lastBpm);
    const bus = engine.eventBus;
    const p = engine.camera.position;
    switch (category) {
      case 'audio_stinger':
        bus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.7 });
        break;
      case 'audio_ambient':
        bus.fire({ kind: 'sound', asset: 'creak_floor', volume: 0.55 });
        break;
      case 'visual_flicker':
        bus.fire({ kind: 'flicker', duration: 0.25, pattern: 'subtle' });
        break;
      case 'entity_reveal':
        if (entityManager) {
          const fwd = new THREE.Vector3();
          engine.camera.getWorldDirection(fwd);
          const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
          entityManager.phobos.setPosition({
            x: p.x + right.x * 4, y: 0, z: p.z + right.z * 4,
          });
          entityManager.phobos.setVisibility('peripheral');
          setTimeout(() => entityManager?.phobos.setVisibility('hidden'), 1400);
        }
        break;
      case 'webcam_glitch':
        bus.fire({ kind: 'webcam_glitch', effect: 'stutter', durationS: 0.4, intensity: 0.7 });
        break;
      case 'spatial_audio':
        if (creatureVoice) {
          const fwd = new THREE.Vector3();
          engine.camera.getWorldDirection(fwd);
          creatureVoice.setPosition({ x: p.x - fwd.x * 3, y: 0, z: p.z - fwd.z * 3 });
          void creatureVoice.whisperSequence(1, 2, 0);
        }
        break;
      case 'jumpscare':
        bus.fire({ kind: 'jumpscare', type: 'static_burst', durationS: 0.4 });
        break;
      case 'personalized':
        if (playerProfile.isSubmitted) speakAs('medium');
        break;
    }
    log('phobos', `probe: ${category}`);
  };

  // NOTE: firePeakStack was removed alongside the scripted 55s/38s club
  // beats. The ClubDeanHunt owns in-club horror now; adaptive peak stacks
  // stacked on top were noise that desensitized players.

  /** Map each club's scripted 14s opening to the scare category it tests. */
  const CLUB_OPENING_CATEGORY: Record<ClubId, ScareCategory> = {
    tower: 'audio_stinger',
    cannon: 'webcam_glitch',
    ivy: 'webcam_glitch',
    cottage: 'jumpscare',
    capgown: 'visual_flicker',
    colonial: 'jumpscare',
    tigerinn: 'audio_ambient',
    terrace: 'audio_ambient',
    cloister: 'audio_stinger',
    charter: 'webcam_glitch',
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
        // Blackout flicker = webcam ghost pass + hard screen blink so the
        // effect is unambiguously visible (players reported 'nothing was
        // happening' with only a webcam-corner effect).
        if (ev.pattern === 'blackout') {
          webcamGhost?.flash().catch(() => {});
          void fade.blink(120);
        } else if (ev.pattern === 'hard') {
          // Hard flicker: white screen blink. Subtle stays internal.
          scareOverlay.whiteFlash(120);
        }
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
      case 'crt_message': {
        const resolved = hasTokens(ev.text) ? personalize(ev.text) : ev.text;
        // Mirror CRT messages into the corner log so they're always visible
        // (we don't have a separate CRT overlay renderer yet).
        cornerBox.appendLog({ source: 'phobos', message: resolved, timestamp: Date.now() });
        summary = `crt:"${resolved.slice(0, 20)}"`;
        break;
      }
      case 'log_message': {
        const resolved = hasTokens(ev.text) ? personalize(ev.text) : ev.text;
        cornerBox.appendLog({
          source: (ev.source as AgentLogEntry['source']) || 'phobos',
          message: resolved,
          timestamp: Date.now(),
        });
        summary = `log:${resolved.slice(0, 30)}`;
        break;
      }
      case 'webcam_glitch':
        if (webcamGhost) {
          webcamGhost.flash(mapGlitchToFlash(ev.effect, ev.intensity, ev.durationS)).catch(() => {});
        }
        summary = `glitch:${ev.effect}`;
        break;
      case 'jumpscare':
        // Every jumpscare now gets a VISIBLE fullscreen overlay in
        // addition to the existing audio/mirror events. This is the
        // biggest missing piece players reported — scares were "there
        // but invisible." Three variants, all unambiguous:
        if (ev.type === 'mirror_flash') {
          engine.eventBus.fire({ kind: 'sound', asset: 'creak_door', volume: 1.0 });
          engine.eventBus.fire({ kind: 'mirror_swap', variant: 'extra_figure' });
          scareOverlay.whiteFlash(180);
          scareOverlay.ghostFace(700);
          setTimeout(() => {
            engine.eventBus.fire({ kind: 'mirror_swap', variant: 'empty' });
          }, 300);
        } else if (ev.type === 'static_burst') {
          engine.eventBus.fire({ kind: 'sound', asset: 'glitch', volume: 0.9 });
          engine.eventBus.fire({ kind: 'flicker', duration: 0.4, pattern: 'blackout' });
          scareOverlay.staticBurst(420);
          scareOverlay.redFlash(320, 0.55);
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
  let sceneGrainBase = 0.05;
  let sceneVignetteBase = 0.78;

  // Swap ambient profile + vignette whenever a scene loads.
  engine.onSceneLoaded = (scene) => {
    // Keep LLM director + scene-time telemetry aligned with the real scene.
    if (scene.name !== currentSceneName) {
      currentSceneName = scene.name;
      sceneStartTime = performance.now();
      sceneTime = 0;
      phobos.onSceneChange(scene.name);
      sessionHistory.push('scene_enter', scene.name, { fearScore: lastFearScore, bpm: lastBpm });
    }

    if (scene.name === 'basement' || scene.name === 'bedroom' || scene.name === 'attic') {
      audio.setScene(scene.name);
      devHud.setStatus(`SCENE · ${scene.name}`);
    }
    // Per-scene vignette + grain baselines (fear-driven modulation layered on top).
    switch (scene.name) {
      // Brighter baselines across the board. Clubs in particular
      // need to be navigable — Tower has a puzzle with small props
      // the player must find. Campus stays widest; clubs are 0.82.
      case 'campus':     sceneVignetteBase = 0.92; sceneGrainBase = 0.03; break;
      case 'basement':   sceneVignetteBase = 0.82; sceneGrainBase = 0.05; break;
      case 'bedroom':    sceneVignetteBase = 0.80; sceneGrainBase = 0.06; break;
      case 'attic':      sceneVignetteBase = 0.72; sceneGrainBase = 0.08; break;
      default:           sceneVignetteBase = 0.82; sceneGrainBase = 0.05; break;
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
  // Campus return count → environmental decay level in Campus scene.
  // 0 = first arrival (pristine), 1-5 = progressive Princeton corruption.
  let campusReturnCount = 0;

  // Which clubs have fired their one-shot arrival beat. Arrival beats only
  // play on the FIRST entry; on re-entry the player just gets the
  // atmospheric loop. Campus beats gate off `clubsVisited` directly.
  const clubArrivalFired = new Set<ClubId>();
  const campusBeatFired = new Set<number>();

  // Remember where the player stood on the street before entering a club
  // so we can put them back in front of the same door when they exit.
  const savedCampusPos = new THREE.Vector3();
  const savedCampusQuat = new THREE.Quaternion();

  // Current Campus reference — kept so exitToCampus can query the next
  // objective's door position for spatialized nudge audio.
  let currentCampus: Campus | null = null;

  // Idle nudge timer: if the player stands on the street without entering
  // the next chain club, Phobos speaks the target's name from its door's
  // direction. Reset on every club entry / campus load.
  let idleNudgeTimer: number | null = null;
  // Objective copy: prior version was just the club name ("tower club").
  // Players reported it was unclear they needed to walk into the door.
  // Lead with an imperative verb + the beacon cue for the current target.
  const OBJECTIVE_LABEL: Record<ClubId, string> = {
    tower:    'tower club — find KEY OF PROSPECT',
    colonial: 'colonial club — find BOLT CUTTERS',
    cannon:   'cannon club — find COMBINATION CODE',
    capgown:  'cap & gown — optional note',
    charter:  'charter club — optional note',
    ivy: '', cottage: '', tigerinn: '', terrace: '', cloister: '',
  };

  const clearIdleNudge = (): void => {
    if (idleNudgeTimer !== null) {
      clearTimeout(idleNudgeTimer);
      idleNudgeTimer = null;
    }
  };

  // Princeton-themed idle chirps — fired when the player lingers on Prospect Ave.
  // Rotating pool keeps nudges fresh and seeds lore deep-cuts for judges.
  const princetonIdlePool = [
    'reading period never ended',
    'the dinky stopped running at midnight',
    'holder howl registered at 82 decibels tonight',
    'old nassau is playing backwards on a speaker somewhere',
    'nassau hall has one bullet hole. now two.',
    'dean\'s date is tonight. dean eisgruber is on the street.',
    'USG emergency alert: prospect ave sealed',
    'firestone b-floor does not exist on the map',
    'honor code does not apply to the system',
    'reunions beer jacket order: one extra',
    'p-rade marcher count: +1 · orange robe · no face',
    'precept begins at 23:14 · attendance: mandatory · subject: you',
    'daily princetonian retraction: 4721 is not missing',
    'cannon green: the cannon is warm again',
    'fitzrandolph gate: you walked IN. you will not walk out.',
    'tiger on blair arch · watching the door',
    'dean eisgruber · office of the president · nassau hall · door locked from inside',
    'orange and black · the orange is blood · the black is dean eisgruber\'s robe',
    'bell tower at cleveland tower · tuning itself to 4722 hz',
    'late meal is closed. the dining hall is not.',
  ];
  let idleChirpIndex = 0;

  const scheduleIdleNudge = (delayMs: number): void => {
    clearIdleNudge();
    idleNudgeTimer = window.setTimeout(() => {
      const next = progression.getNextObjective();
      if (!next || !currentCampus) return;
      const label = OBJECTIVE_LABEL[next];
      if (!label) return;
      const doorPos = currentCampus.getClubDoorPosition(next);
      if (voice && defaultVoiceId) {
        const pos = doorPos ? { x: doorPos.x, y: doorPos.y, z: doorPos.z } : undefined;
        // Alternate between the club-name nudge and a Princeton-lore chirp
        // so the street stays atmospheric and the easter eggs land.
        const useLore = idleChirpIndex % 2 === 1;
        const line = useLore
          ? princetonIdlePool[Math.floor(Math.random() * princetonIdlePool.length)]
          : label;
        try {
          voice.speak({ text: line, voiceId: defaultVoiceId, gain: 0.55, position: pos });
        } catch { /* non-fatal */ }
        if (useLore) log('phobos', line);
        else log('phobos', `4722: ${label}. waiting.`);
      } else {
        log('phobos', `4722: ${label}. waiting.`);
      }
      idleChirpIndex++;
      // Reschedule with a slightly longer interval — don't nag.
      scheduleIdleNudge(delayMs + 15000);
    }, delayMs);
  };

  const updateObjective = (): void => {
    // Puzzle mode: the objective is always "collect 3 items, escape
    // through FitzRandolph Gate". Show what's left. When all 3 are
    // collected, direct the player east to the gate.
    if (DEAN_CHASE_ENABLED) {
      const next = progression.getNextObjective();
      if (!next) { objective.clear(); clearIdleNudge(); return; }
      const label = OBJECTIVE_LABEL[next];
      if (label) objective.set(label);
      return;
    }
    const inv = survival.getInventory();
    if (inv.key && inv.code && inv.bolts) {
      objective.set('walk to FITZRANDOLPH GATE at the east end · press [E]');
      clearIdleNudge();
      return;
    }
    const missing: string[] = [];
    if (!inv.key)   missing.push('KEY (tower)');
    if (!inv.code)  missing.push('CODE (cannon)');
    if (!inv.bolts) missing.push('BOLTS (colonial)');
    objective.set(`find: ${missing.join(' · ')}`);
  };

  const loadCampus = (restorePosition = false): void => {
    // Decay escalates by the number of chain clubs visited (not raw
    // returns) — so the player sees the avenue deform in lockstep with
    // their progress through the plot. Level 0 on first spawn, +1 each
    // time they exit a chain club.
    const decayLevel = Math.min(5, Math.max(0, clubsVisited));
    const profile = playerProfile.get();
    const playerName = playerProfile.isSubmitted ? profile.name : '4722';
    const campus = new Campus({
      onEnterClub: (id) => { void enterClub(id); },
      decayLevel,
      playerName,
      // Locked-club feedback: when the player walks up to a boarded-up
      // door, play a sting + voice line explaining why they can't enter
      // and nudging them toward the chain objective. Prevents the
      // "nothing happens at every door" frustration.
      onBumpLocked: (id) => {
        const bus = engine.eventBus;
        const next = progression.getNextObjective();
        const nextLabel = next ? CLUB_LABEL[next] : 'the chain';
        bus.fire({ kind: 'sound', asset: 'impact', volume: 0.6 });
        bus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.7 });
        bus.fire({ kind: 'flicker', duration: 0.2, pattern: 'subtle' });
        log('phobos', `${CLUB_LABEL[id].toLowerCase()} is boarded. try ${nextLabel.toLowerCase()}.`);
        if (voice && defaultVoiceId) {
          try {
            voice.speak({
              text: `${CLUB_LABEL[id].toLowerCase()} is sealed. sign-in is closed here. go to ${nextLabel.toLowerCase()}.`,
              voiceId: defaultVoiceId,
              gain: 0.78,
            });
          } catch { /* non-fatal */ }
        }
      },
      lockedClubs: progression.getLockedClubs(),
      nextObjective: progression.getNextObjective(),
      // FitzRandolph Gate: unlocks on campus load when all 3 escape
      // items are collected. Player walks to the east-end gate and
      // presses E to trigger the win.
      escapeReady: survival.hasAllItems(),
      onEscape: () => { void triggerEscapeEnd(); },
    });
    engine.loadScene(campus);
    currentCampus = campus;
    if (restorePosition) {
      engine.camera.position.copy(savedCampusPos);
      engine.camera.quaternion.copy(savedCampusQuat);
    } else {
      engine.camera.position.copy(campus.spawnPoint);
      // Face east down the avenue (+X). Spawn sits at the west end — without
      // this the player looks at the arena wall and can't see the clubs.
      engine.camera.rotation.set(0, -Math.PI / 2, 0);
    }
    audio.setScene('campus');
    devHud.setStatus('SCENE · prospect ave · WALK INTO the lit doorway');
    if (!restorePosition) devHud.flash('>> WALK INTO THE LIT DOORWAY <<', 4000);
    log('system', 'prospect ave. the clubs are still standing.');
    // Tell the player what to do — the door trigger is proximity-based
    // (just step into the pulsing porch light). Prior wording wasn't
    // imperative enough, players were walking up and stopping.
    log('phobos', 'walk into the pulsing door. no key required.');
    entityManager?.resetGazeState();
    updateObjective();
    scheduleIdleNudge(30000);
    runCampusBeats();

    // RUSH — DOORS-style dash scare. Gated on DEAN_CHASE_ENABLED so
    // puzzle-mode playtests aren't interrupted by random catches.
    if (DEAN_CHASE_ENABLED) {
      if (!rushEntity) {
        rushEntity = new RushEntity({
          scene: engine.scene,
          camera: engine.camera,
          bus: engine.eventBus,
          overlay: scareOverlay,
          player,
          log: (source, text) => log(source, text),
          onCatch: () => {
            void survival.catch({
              toBlack: (ms) => fade.fadeToBlack(ms),
              fromBlack: (ms) => fade.fadeFromBlack(ms),
            }).then((respawned) => {
              if (respawned && !survival.isGameOver) {
                log('phobos', 'you woke up on the sidewalk. same street. same hour.');
              }
            });
          },
        });
      }
      rushEntity.start();
    }
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
    // Mark the pickup as collected so the exit door trigger will fire.
    // The club interior's local `pickupCollected` flag already tracks the
    // mesh; this one tracks the gameplay gate at the main-loop level.
    currentClubPickupCollected = true;

    // ── GRANNY ESCAPE-ITEM COLLECTION ──
    // Tower = KEY OF PROSPECT, Cannon = COMBINATION CODE,
    // Colonial = BOLT CUTTERS. Capgown/Charter are narrative beats,
    // not escape items — they just advance chapters.
    if (clubId === 'tower')    survival.collect('key');
    if (clubId === 'cannon')   survival.collect('code');
    if (clubId === 'colonial') survival.collect('bolts');
    if (survival.hasAllItems()) {
      devHud.flash('>> ALL 3 ESCAPE ITEMS · go to FitzRandolph Gate <<', 6000);
      log('phobos', 'all three seals collected. the gate will open.');
    }
    // Keep the top-of-screen objective current every pickup.
    updateObjective();

    // Cancel the in-club Dean hunt — he vanishes with a final stinger.
    if (clubDeanHunt) {
      engine.eventBus.fire({ kind: 'sound', asset: 'scream', volume: 0.75 });
      engine.eventBus.fire({ kind: 'flicker', duration: 0.4, pattern: 'blackout' });
      engine.eventBus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 0.5, intensity: 0.9 });
      clubDeanHunt.cancel();
      clubDeanHunt = null;
      log('creature_director', 'the dean vanished. he will be waiting on the street.');
    }

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
    // Change the objective to "leave" now that the document is read.
    objective.set('leave through the DOOR · return to prospect ave');
    devHud.flash('>> LEAVE THROUGH THE DOOR <<', 3500);

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
    sessionHistory.push('pickup', clubId, { fearScore: lastFearScore, bpm: lastBpm, label: noteId });

    // Play flashback after note is dismissed
    if (fbIndex !== undefined && !progression.hasPlayedFlashback(fbIndex)) {
      progression.markFlashback(fbIndex);
      const config = FLASHBACKS[fbIndex];
      if (config) {
        // Delay flashback until note overlay is closed
        const waitForClose = setInterval(() => {
          if (!noteOverlay.isVisible) {
            clearInterval(waitForClose);
            // Charter = endgame. Play the Charter flashback first (the
            // "subject 4722, that is you" line), then return to the
            // street for the FINAL CONFRONTATION — Eisgruber at arm's
            // reach, 12 chapel bell tolls, fullscreen "sign-in is
            // closed" — then the FINALE chapter card, then the reveal.
            // Charter triggers the chase-mode final confrontation +
            // reveal sequence, but ONLY when the Dean is active.
            // Puzzle mode: it's just another note.
            if (clubId === 'charter' && DEAN_CHASE_ENABLED) {
              void (async () => {
                await playFlashback(config, {
                  scene: engine.scene,
                  cornerBox,
                  webcamGhost,
                  voice,
                  defaultVoiceId,
                  onStart: () => player.setInputEnabled(false),
                  onEnd: () => { /* keep input locked for climax */ },
                });
                await playFinalConfrontation();
                if (chapterSystem) await chapterSystem.advance('finale');
                await endDemo();
              })();
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

  // Chain clubs require the player to find + read a document before the
  // exit door will let them leave. Side clubs (ivy/cottage/tigerinn/
  // terrace/cloister) don't block the exit — they're set dressing.
  const CHAIN_CLUB_SET = new Set<ClubId>(['tower', 'colonial', 'cannon', 'capgown', 'charter']);
  const CLUB_PICKUP_LABEL: Partial<Record<ClubId, string>> = {
    tower:    'find KEY + PEN + SEAL · open the cabinet · read the pamphlet',
    colonial: 'read FORM 7B in the evaluation room · [E]',
    cannon:   'read the SESSION LOG on the desk · [E]',
    capgown:  "read ELLIOT'S BADGE in the archive · [E]",
    charter:  'read the PLACE CARD at seat seven · [E]',
  };
  /** The one-shot pickup flag, shared between enter/exit so the exit trigger can gate. */
  let currentClubHasPickup = false;
  let currentClubPickupCollected = false;

  const enterClub = async (id: ClubId): Promise<void> => {
    if (!progression.isUnlocked(id)) {
      log('system', `${CLUB_LABEL[id]} is locked.`);
      return;
    }
    clearIdleNudge();
    currentClubHasPickup = CHAIN_CLUB_SET.has(id);
    currentClubPickupCollected = false;
    // Objective explicitly names the pickup item so the player knows what
    // they're looking for. For side clubs, no pickup gate — just "leave."
    const pickupLabel = CLUB_PICKUP_LABEL[id];
    objective.set(pickupLabel ?? 'leave through the door');
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
    // Pause the Dean while inside — club interiors have their own
    // entity choreography, the stalker is only for the street.
    deanStalker?.stop();
    // RUSH lives only on campus — stop it on club entry.
    rushEntity?.stop();
    await fade.fadeToBlack(500);

    // Fire the club's chapter cinematic during the black fade. The
    // ChapterSystem handles input lock, card display, voice line, log
    // telemetry, and the post-card SCREAM + face jumpscare. Only the
    // five chain clubs have a chapter; side clubs skip this.
    const CLUB_CHAPTER_SLUG: Partial<Record<ClubId, string>> = {
      tower: 'tower', colonial: 'colonial', cannon: 'cannon',
      capgown: 'capgown', charter: 'charter',
    };
    const slug = CLUB_CHAPTER_SLUG[id];
    // Skip chapter cinematics in puzzle mode — they reference the Dean.
    if (DEAN_CHASE_ENABLED && slug && chapterSystem) {
      await chapterSystem.advance(slug);
    }
    // Wrap the exit callback to gate on pickup for chain clubs. If the
    // player walks into the exit trigger without having read the document,
    // bounce them back with a clear prompt + don't actually exit. The
    // once:true on the trigger box means we have to re-arm it ourselves.
    const guardedExit = (): void => {
      if (currentClubHasPickup && !currentClubPickupCollected) {
        const label = CLUB_PICKUP_LABEL[id] ?? 'read the document';
        log('phobos', `the door is sealed. ${label.toLowerCase()}`);
        devHud.flash(`>> DOOR SEALED — ${label.toUpperCase()} <<`, 3500);
        engine.eventBus.fire({ kind: 'sound', asset: 'impact', volume: 0.55 });
        engine.eventBus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.7 });
        // Re-arm the exit trigger so the player can try again after
        // reading the document. rearmTrigger is engine-level; see engine.ts.
        engine.rearmTrigger('exit_to_campus');
        return;
      }
      void exitToCampus();
    };
    const room = clubCtorByIdLocal[id](guardedExit, () => handleClubPickup(id));
    // Wire per-puzzle HUD messages (Tower's multi-item lock, etc.).
    // Scenes that implement `onPuzzleMessage` can surface progress
    // ("BRASS KEY acquired 1/3", "CABINET SEALED · need PEN + SEAL")
    // to the HUD + agent log.
    const puzzleScene = room as unknown as { onPuzzleMessage?: (msg: string) => void };
    if ('onPuzzleMessage' in room) {
      puzzleScene.onPuzzleMessage = (msg: string): void => {
        devHud.flash(`>> ${msg} <<`, 3000);
        log('system', msg.toLowerCase());
      };
    }
    engine.loadScene(room as unknown as Parameters<typeof engine.loadScene>[0]);
    engine.camera.position.copy(room.spawnPoint);
    audio.setScene('club');
    const statusHint = currentClubHasPickup
      ? `SCENE · ${CLUB_LABEL[id]} · FIND + READ THE DOCUMENT`
      : `SCENE · ${CLUB_LABEL[id]} · leave through the door`;
    devHud.setStatus(statusHint);
    if (currentClubHasPickup) {
      devHud.flash('>> READ THE SEAL on the pedestal · [E] · [C] crouch · [SHIFT] sprint <<', 4500);
    }
    // Threshold sting — Inception subsonic slam + door slam + breath.
    // The BWAAM registers viscerally; reference: Dead Space / horror
    // film trailers. The slam plays while the screen is still black.
    scareProfiler.register('audio_stinger', lastFearScore, lastBpm);
    audio.playSubsonicSlam(2.0, 0.95);
    engine.eventBus.fire({ kind: 'sound', asset: 'impact', volume: 1.0 });
    engine.eventBus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.95 });
    engine.eventBus.fire({ kind: 'breath', intensity: 0.85 });
    if (voice && defaultVoiceId) {
      try {
        voice.speak({
          text: `welcome to ${CLUB_LABEL[id].toLowerCase()}. the door is closed now.`,
          voiceId: defaultVoiceId,
          gain: 0.85,
        });
      } catch { /* non-fatal */ }
    }
    await new Promise((r) => setTimeout(r, 180));
    await fade.fadeFromBlack(700);
    player.setInputEnabled(true);
    // On fade-in, punch a webcam glitch + flicker so the first frame of
    // the interior is visibly compromised. This is the "something just
    // grabbed me" moment that the player was missing on entry.
    engine.eventBus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 0.7, intensity: 0.9 });
    engine.eventBus.fire({ kind: 'flicker', duration: 0.35, pattern: 'hard' });
    entityManager?.resetGazeState();

    // ── In-club Dean Hunt ─────────────────────────────────────────────
    // Gated on DEAN_CHASE_ENABLED so puzzle-mode doesn't have him.
    if (DEAN_CHASE_ENABLED && currentClubHasPickup && entityManager) {
      const cfg = SCENE_CONFIGS[id];
      const hw = cfg.dimensions.width / 2;
      const hd = cfg.dimensions.depth / 2;
      clubDeanHunt?.cancel();
      const hideZones = (room as { hideZones?: () => import('@phobos/types').HideZone[] }).hideZones?.() ?? [];
      clubDeanHunt = new ClubDeanHunt({
        entity: entityManager.phobos,
        camera: engine.camera,
        player,
        hideZones,
        roomHalfWidth: hw,
        roomHalfDepth: hd,
        startDelayMs: 4000,
        chaseSpeed: 1.9,
        floorY: 0,
        onHideEnter: () => {
          survival.setHidden(true);
          log('phobos', 'you are under the table. he is looking the other way.');
          devHud.flash('>> HIDDEN · stay still · he will walk past <<', 3500);
        },
        onHideExit: () => {
          survival.setHidden(false);
          log('phobos', 'he heard you move.');
        },
        onCatch: () => {
          // Bail if a respawn's already running — avoids stacked catches.
          if (survival.isRespawning || survival.isGameOver) return;

          // Scare payload.
          engine.eventBus.fire({ kind: 'sound', asset: 'scream', volume: 1.0 });
          engine.eventBus.fire({ kind: 'sound', asset: 'stinger_high', volume: 0.95 });
          engine.eventBus.fire({ kind: 'flicker', duration: 0.6, pattern: 'hard' });
          engine.eventBus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 1.1, intensity: 1.0 });
          audio.playSubsonicSlam(1.8, 1.0);
          scareOverlay.screamFace(1200);
          scareOverlay.redFlash(400, 0.7);
          scareOverlay.mirrorCrack(1400);
          scareOverlay.chromaticShake(2400, 1.0);
          const profile = playerProfile.get();
          const nameStr = playerProfile.isSubmitted ? profile.name.toUpperCase() : '4722';
          setTimeout(() => {
            scareOverlay.bloodWriting(Math.random() < 0.5 ? nameStr : 'SEAT 7', 2200);
          }, 380);
          log('creature_director', `DEAN EISGRUBER CAUGHT YOU`);

          // Now bail out of the club, respawn on campus. The hunt is
          // cancelled via exitToCampus() which loadCampus()es fresh.
          clubDeanHunt?.cancel();
          clubDeanHunt = null;
          void (async () => {
            await survival.catch({
              toBlack: (ms) => fade.fadeToBlack(ms),
              fromBlack: async () => { /* loadCampus handles fade-from-black */ },
            });
            if (survival.isGameOver) return;
            // Drop the player back on the avenue, reset flags so the
            // next club entry works cleanly.
            currentClubHasPickup = false;
            currentClubPickupCollected = false;
            loadCampus(false);
            await fade.fadeFromBlack(900);
            player.setInputEnabled(true);
            log('phobos', 'you woke up on prospect ave. the door is locked now.');
          })();
        },
        onVocalize: (dist) => {
          // PACED proximity cue — the dread bed carries the intensity,
          // this just adds texture. Eisgruber quotes the player's bicker
          // form: their fear, their hometown, their missed person. The
          // horror is targeted, not generic.
          const profile = playerProfile.get();
          const hasProfile = playerProfile.isSubmitted;
          const nm = hasProfile ? profile.name.toLowerCase() : '4722';
          const fear = hasProfile ? profile.fear.toLowerCase() : 'the dark';
          const ht = hasProfile ? profile.hometown.toLowerCase() : 'somewhere else';
          const miss = hasProfile ? profile.missedPerson.toLowerCase() : 'elliot';

          // CLOSE: a single cue per beat — no stacking. The dread bed
          // (proximity-driven choir wail in AudioManager) already holds
          // constant tension; this just adds flavor.
          if (dist < 6) {
            engine.eventBus.fire({ kind: 'breath', intensity: 0.8 });
            // Pick ONE of: reversed whisper, subliminal face, spoken
            // personalized line. Never all three together.
            const roll = Math.random();
            if (roll < 0.5) {
              audio.playReversedWhisper(1200, 0.75);
            } else if (roll < 0.75) {
              const variants: Array<'eisgruber' | 'eyes' | 'shriek'> = ['eisgruber', 'eyes', 'shriek'];
              scareOverlay.subliminalFace(85, variants[Math.floor(Math.random() * 3)]);
            } else {
              // Spoken personalized line.
              const closeLines = [
                `${nm}. seat seven.`,
                `i am behind you, ${nm}.`,
                `${fear}. that was the answer.`,
                `${miss} said the same thing.`,
                `${ht} will not remember you.`,
              ];
              const line = closeLines[Math.floor(Math.random() * closeLines.length)];
              log('creature_director', `"${line}"`);
              if (voice && defaultVoiceId) {
                const p = engine.camera.position;
                try {
                  voice.speak({
                    text: line, voiceId: defaultVoiceId, gain: 0.88,
                    position: { x: p.x, y: p.y, z: p.z },
                  });
                } catch { /* non-fatal */ }
              }
            }
          } else if (dist < 14) {
            // MID WARNING (6-14m): evil laugh OR creak. The laugh is
            // the "he knows where you are" signal — players treat it
            // as a run/hide cue after the first couple of times.
            if (Math.random() < 0.55) {
              audio.playEvilLaugh(0.7);
              log('creature_director', `eisgruber laughs · he knows where you are`);
            } else {
              engine.eventBus.fire({ kind: 'sound', asset: 'creak_floor', volume: 0.5 });
            }
          } else {
            // FAR WARNING (14m+): low growl or music box. Growl tells
            // the player "he's coming" before they see him. Silence is
            // the rarest outcome so they never feel safe.
            const roll = Math.random();
            if (roll < 0.55) {
              audio.playGrowl(2.0, 0.6);
              log('creature_director', `a growl · far · getting closer`);
            } else if (roll < 0.75) {
              audio.playMusicBox(0.3);
            }
          }
        },
      });
      clubDeanHunt.start();
      // Hunt-begin cue — a SINGLE creak + dimmed flicker so the player
      // feels presence, not a jumpscare. The real "he's here" moment
      // arrives the first time the player SEES him walking from a corner.
      // Restraint: Silent Hill 2 / Alien Isolation teach that presence
      // telegraphed quietly is more frightening than a scream chord.
      setTimeout(() => {
        if (!currentClubPickupCollected) {
          engine.eventBus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.7 });
          engine.eventBus.fire({ kind: 'flicker', duration: 0.3, pattern: 'subtle' });
          devHud.flash('>> find the beacon · [E] to read · [SHIFT] to run <<', 4000);
          log('creature_director', `something is standing at the far wall.`);
        }
      }, 6500);
    }

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
    // Bump the decay counter BEFORE the fade so the next loadCampus()
    // picks it up. Also emit a single ambient log so the player feels
    // the avenue has gotten worse before seeing it.
    campusReturnCount++;
    const decayFacts = [
      null,
      'a light is on in nassau hall. the office of the president.',
      'something is buried at the east end of prospect ave.',
      'there is writing on the pavement. it is your name.',
      'a tiger statue is blocking the street. its head is backwards.',
      'fitzrandolph gate is sealed. red bars. red sign. you already didn\'t leave.',
    ];
    const fact = decayFacts[Math.min(5, clubsVisited)];
    if (fact) log('phobos', fact);
    log('system', 'back to prospect ave.');
    await fade.fadeToBlack(500);
    colonialStalker?.stop();
    colonialStalker = null;
    // Cancel any lingering in-club hunt (e.g. player fled through the
    // door before picking up — shouldn't be possible with the gate but
    // defensive).
    clubDeanHunt?.cancel();
    clubDeanHunt = null;
    loadCampus(true);
    await new Promise((r) => setTimeout(r, 150));
    await fade.fadeFromBlack(700);
    player.setInputEnabled(true);

    // Resume the Dean on the street. His target distance was set by
    // the most recent chapter, so he returns to wherever that chapter
    // pushed him — each club exit finds him closer than the last.
    if (deanStalker && chapterSystem?.currentSlug) {
      deanStalker.start();
    }

    // Phobos calls the next chain target from the direction of that club's
    // door — a diegetic nudge that forces the chain without a compass arrow.
    const next = progression.getNextObjective();
    if (next && voice && defaultVoiceId && currentCampus) {
      const label = OBJECTIVE_LABEL[next];
      const doorPos = currentCampus.getClubDoorPosition(next);
      if (label) {
        setTimeout(() => {
          try {
            voice!.speak({
              text: label,
              voiceId: defaultVoiceId,
              gain: 0.7,
              position: doorPos ? { x: doorPos.x, y: doorPos.y, z: doorPos.z } : undefined,
            });
          } catch { /* non-fatal */ }
        }, 1200);
      }
    }
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

    // ── STORYLINE PULSE ──────────────────────────────────────────────────
    // One scripted narrative beat per `clubsVisited` threshold. Fires once
    // per threshold even if the player re-enters + exits the same club.
    // Delivers Dean-of-College email, DPS closed-case notice, Reunions
    // phantom marcher, FRG lock — the Princeton-coded cover-story layer
    // that reframes the horror as institutional complicity.
    const beat = getCampusBeatFor(clubsVisited);
    if (beat && !campusBeatFired.has(beat.gate)) {
      campusBeatFired.add(beat.gate);
      t.schedule(beat.delayMs, () => {
        for (const entry of beat.logs) log(entry.source, entry.text);
        if (beat.voiceLine && voice && defaultVoiceId) {
          try {
            const p = engine.camera.position;
            voice.speak({
              text: beat.voiceLine,
              voiceId: defaultVoiceId,
              gain: 0.75,
              position: { x: p.x, y: p.y, z: p.z },
            });
          } catch { /* non-fatal */ }
        }
      });
    }

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

    // ── STREET JUMPSCARE LOOP ─────────────────────────────────────────────
    // Previously campus beats were atmospheric only (footsteps, distant
    // entity). Players reported the street felt empty between clubs.
    // This loop fires a genuine jumpscare every 14-22s from the moment
    // the player spawns on Prospect Ave: flicker + stinger + close entity
    // + webcam glitch. Variants rotate so it doesn't feel mechanical.
    // Registered with the profiler so the scare learning system picks up
    // street reactions too.
    // ── QUIET HORROR PALETTE — whispers + textures, not spam ──
    // Two tiers. Most of the time we draw from QUIET (whispers, creaks,
    // subliminal flashes); rarely from LOUD (scream + face). Players
    // habituate to LOUD quickly — silence is the horror tool that
    // keeps working. Reference: Silent Hill 2, Amnesia, Alien Isolation.
    const quietVariants: Array<() => void> = [
      // Q1: reversed whisper from a specific direction + subtle creak.
      () => {
        scareProfiler.register('audio_ambient', lastFearScore, lastBpm);
        audio.playReversedWhisper(2200, 0.65);
        bus.fire({ kind: 'sound', asset: 'creak_floor', volume: 0.55 });
        if (creatureVoice) {
          const p = engine.camera.position;
          const side = Math.random() < 0.5 ? -1 : 1;
          creatureVoice.setPosition({ x: p.x + side * 6, y: 0, z: p.z - 4 });
          void creatureVoice.whisperSequence(1, 2, 0);
        }
      },
      // Q2: single subliminal face + one heartbeat + dread bed swells.
      () => {
        const variants: Array<'eisgruber' | 'eyes' | 'shriek'> = ['eisgruber', 'eyes', 'shriek'];
        scareOverlay.subliminalFace(95, variants[Math.floor(Math.random() * 3)]);
        bus.fire({ kind: 'sound', asset: 'heartbeat', volume: 0.55 });
      },
      // Q3: corrupted Old Nassau drifts in — no visual cue, pure music.
      () => {
        audio.playMusicBox(0.4);
      },
      // Q4: radio static wash + tiny flicker.
      () => {
        audio.playRadioStatic(1.4, 0.55);
        bus.fire({ kind: 'flicker', duration: 0.18, pattern: 'subtle' });
      },
      // Q5: child laugh from the west end of the avenue.
      () => {
        audio.playChildLaugh(0.6);
        if (creatureVoice) {
          const p = engine.camera.position;
          creatureVoice.setPosition({ x: p.x - 10, y: 0, z: p.z });
        }
      },
      // Q6: low reverse creak + a whispered name line.
      () => {
        bus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.55 });
        const profile = playerProfile.get();
        const nm = playerProfile.isSubmitted ? profile.name.toLowerCase() : 'four seven two two';
        log('phobos', `someone whispered your name. ${nm}.`);
      },
    ];

    const loudVariants: Array<() => void> = [
      // L1: SCREAM + FACE. Earned. Rare.
      () => {
        scareProfiler.register('jumpscare', lastFearScore, lastBpm);
        bus.fire({ kind: 'sound', asset: 'scream', volume: 0.85 });
        scareOverlay.screamFace(1100);
        bus.fire({ kind: 'flicker', duration: 0.35, pattern: 'hard' });
        bus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 0.7, intensity: 0.9 });
        log('creature_director', 'SCREAM.');
      },
      // L2: static burst + breath behind.
      () => {
        scareProfiler.register('jumpscare', lastFearScore, lastBpm);
        bus.fire({ kind: 'jumpscare', type: 'static_burst', durationS: 0.6 });
        bus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.85 });
        bus.fire({ kind: 'breath', intensity: 0.9 });
        log('creature_director', 'behind you.');
      },
      // L3: Eisgruber flashes at the side, one second, vanishes.
      () => {
        scareProfiler.register('entity_reveal', lastFearScore, lastBpm);
        bus.fire({ kind: 'flicker', duration: 0.4, pattern: 'hard' });
        if (entityManager) {
          const p = engine.camera.position;
          const fwd = new THREE.Vector3();
          engine.camera.getWorldDirection(fwd);
          const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
          entityManager.phobos.setPosition({
            x: p.x + right.x * 3.5, y: 0, z: p.z + right.z * 3.5,
          });
          entityManager.phobos.setVisibility('close');
          setTimeout(() => entityManager?.phobos.setVisibility('hidden'), 900);
        }
        audio.playReversedWhisper(900, 0.7);
      },
    ];

    // STREET CADENCE — quiet at first, loud beats only occasionally.
    // Typical flow: whisper … 30s silence … flicker … 40s silence …
    // child laugh … 55s silence … SCREAM. The scream works because
    // silence preceded it.
    const scheduleStreetScare = (atMs: number): void => {
      t.schedule(atMs, () => {
        // 78% quiet, 22% loud. Raises the loud odds slightly with
        // clubsVisited (Phobos is hunting harder as you progress).
        const loudOdds = 0.22 + Math.min(clubsVisited, 4) * 0.04;
        const isLoud = Math.random() < loudOdds;
        const pool = isLoud ? loudVariants : quietVariants;
        pool[Math.floor(Math.random() * pool.length)]();
        // 32-58s between beats (longer than before). Accelerates ~2s
        // per club visited but never below 22s.
        const base = Math.max(22000, 58000 - Math.min(clubsVisited, 4) * 4000);
        const jitter = Math.floor(Math.random() * 10000);
        scheduleStreetScare(atMs + base + jitter);
      });
    };
    // First beat at 25s — a full half-minute of near-silence to set
    // the avenue before anything happens.
    if (DEAN_CHASE_ENABLED) scheduleStreetScare(25000);

    // ── AMBIENT WHISPER SCHEDULER ──
    // Independent of the scare loop. Positional whispers drift in from
    // random directions every 8-18s. No visual, no screen effect —
    // just voice. Players look around wondering what they heard. This
    // is the FNaF / Dead Silence "constant audio unease" layer.
    const scheduleWhisper = (atMs: number): void => {
      t.schedule(atMs, () => {
        if (creatureVoice) {
          const p = engine.camera.position;
          const angle = Math.random() * Math.PI * 2;
          const dist = 7 + Math.random() * 8;
          creatureVoice.setPosition({
            x: p.x + Math.cos(angle) * dist,
            y: 0,
            z: p.z + Math.sin(angle) * dist,
          });
          void creatureVoice.whisperSequence(1, 1 + Math.floor(Math.random() * 2), 0);
        }
        // Or use the reversed-whisper synth when creatureVoice isn't wired.
        else {
          audio.playReversedWhisper(1400, 0.55);
        }
        const next = 8000 + Math.random() * 10000;
        scheduleWhisper(atMs + next);
      });
    };
    if (DEAN_CHASE_ENABLED) scheduleWhisper(12000);

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

    // ── FIRST-VISIT ARRIVAL BEAT ─────────────────────────────────────────
    // Before the generic atmospheric loop, play a scripted "echo" of
    // Elliot's session in this exact room a year ago. Each club has its
    // own dated log line + voice line tied to a message from the phone
    // thread the player read during intro. Fires once per club lifetime.
    if (!clubArrivalFired.has(clubId)) {
      const beat = CLUB_ARRIVAL_BEATS[clubId];
      if (beat) {
        clubArrivalFired.add(clubId);
        t.schedule(beat.delayMs, () => {
          log('phobos', beat.agentLog);
          if (beat.voiceLine && voice && defaultVoiceId) {
            try {
              const p = engine.camera.position;
              voice.speak({
                text: beat.voiceLine,
                voiceId: defaultVoiceId,
                gain: 0.82,
                position: { x: p.x, y: p.y, z: p.z },
              });
            } catch { /* non-fatal */ }
          }
        });
        if (beat.agentLogFollowup) {
          t.schedule(beat.delayMs + beat.agentLogFollowup.delayMs, () => {
            log('phobos', beat.agentLogFollowup!.text);
            // Amplified callout: if the profiler has locked onto a
            // dominant stimulus vector by the time the player enters
            // this chain club, announce it. Makes the learning visible.
            const s = scareProfiler.summary();
            const amp = amplifiedClubLog(s.dominantVector, s.isExperimenting ? 'probing' : 'targeting');
            if (amp) log('phobos', amp);
          });
        }
      }
    }

    // ── Interleaved agent log: roommate's old session + player's live session ──
    // These fire on independent timers, interleaving naturally.
    const roommateLogs = [
      { delay: 4000, msg: `${ROOMMATE.firstName.toLowerCase()} · 4721 · ${CLUB_LABEL[clubId].toLowerCase()} · bicker night.` },
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

    // Log Phobos's in-character observation about this club. Chain-clubs
    // are tier-calibrated and reference 4721; side clubs are atmospheric
    // only. Used as the fallback when the LLM director has no API key —
    // keeps the narrative beat intact in demo mode.
    t.schedule(3000, () => {
      // First-visit observations reference real club history + the player's
      // dossier when available. Fallback is used when the form was skipped.
      const profile = playerProfile.get();
      const nm = playerProfile.isSubmitted ? profile.name.toLowerCase() : '4722';
      const observations: Record<string, string> = {
        tower:    `tower club. bicker 1902. ${nm}, 4721 arrived here. dean eisgruber countersigned the ledger.`,
        colonial: `colonial. evaluation chamber. ${nm}, 4721 sat here. dean eisgruber watched through the one-way mirror.`,
        cannon:   `cannon. named for the buried 1812 cannon on cannon green. ${nm}, your face matches 87% to 4721. the dean agrees.`,
        capgown:  `cap and gown. the archive since 1879. ${nm}, the badge is here. dean eisgruber scratched out the photo.`,
        charter:  `charter club. seat seven. set since 1901. ${nm}, dean eisgruber reserved it the day you referred him.`,
        ivy:      'ivy club. 1879. oldest. it does not take referrals. dean eisgruber still has a key.',
        cottage:  'cottage club. 1887. second oldest. iron tigers on the gate. blair arch tiger is watching them.',
        tigerinn: 'tiger inn. half-timbered. the tigertones sang here last night. old nassau. backwards.',
        terrace:  'terrace. sign-in club. flagstone. the floor is full of prior subjects. dean eisgruber catalogued each.',
        cloister: 'cloister. crew club. arched windows. the chapel bell is two hundred meters east. it knows your name.',
      };
      log('phobos', observations[clubId] ?? 'another room. another subject.');
    });

    // Princeton-lore idle chirp on the 25s mark — only personalized in
    // submitted-form mode. Ignored by the LLM path (it'll override).
    t.schedule(25000, () => {
      if (!playerProfile.isSubmitted) return;
      const profile = playerProfile.get();
      const pool = [
        `${profile.college} college has a record of you, ${profile.name.toLowerCase()}`,
        `dean eisgruber signed your bicker bid. you never saw it.`,
        `dean's date is tonight. you will not make it.`,
        `old nassau playing backwards in nassau hall basement`,
        `${profile.hometown.toLowerCase()} is a long way from prospect ave`,
        `you said you feared ${profile.fear.toLowerCase()}. dean eisgruber saved a copy.`,
        `${profile.missedPerson.toLowerCase()} completed their evaluation. the dean signed off.`,
        `fitzrandolph gate is sealed. the tiger above it is watching you.`,
        `cannon green · the cannon rotated 7 degrees · toward prospect ave`,
      ];
      const line = pool[Math.floor(Math.random() * pool.length)];
      log('phobos', line);
    });

    // ── JUMP SCARE LAYER ────────────────────────────────────────────────
    // The atmospheric loop above paces the player. These are the hits —
    // authored stimuli the LLM can see land (via biosignal spikes) and
    // either amplify or pull back from on its next 10s tick.
    //
    // Three beats per club:
    //   14s — OPENING: flavored to the club's signature architecture.
    //   38s — MID:     unambiguous commit; fires once player is settled.
    //   55s — PEAK:    only at escalation ≥ 4; harder than mid, different type.

    // ── PROBE CYCLE ──────────────────────────────────────────────────
    // Between the scripted heavy beats, fire 3 lightweight probes.
    // Each probe is a single event in ONE scare category so the
    // profiler can observe an isolated reaction. During experimentation
    // (first ~12 fires globally) the profiler cycles through categories
    // evenly; once it enters amplification, weighting shifts toward
    // whatever's landed hardest on this player so far.
    for (const delay of [18000, 30000, 48000]) {
      t.schedule(delay, () => {
        const pick = scareProfiler.pickWeighted(PROBE_CATEGORIES);
        if (pick) fireProbe(pick);
      });
    }

    // 14s — OPENING SCARE, club-specific. Each club tests ONE category
    // on first exposure; the profiler records the reaction.
    t.schedule(14000, () => {
      scareProfiler.register(
        CLUB_OPENING_CATEGORY[clubId] ?? 'audio_stinger',
        lastFearScore,
        lastBpm,
      );
      switch (clubId) {
        case 'tower':
          // Tudor hall: flicker + low stinger + breath toward the shield.
          bus.fire({ kind: 'flicker', duration: 0.25, pattern: 'hard' });
          bus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.9 });
          bus.fire({ kind: 'breath', intensity: 0.7 });
          log('creature_director', 'the shield. it moved.');
          break;
        case 'cannon':
          // Three shields: brief blackout + high stinger + stutter.
          bus.fire({ kind: 'flicker', duration: 0.25, pattern: 'blackout' });
          bus.fire({ kind: 'sound', asset: 'stinger_high', volume: 1.0 });
          bus.fire({ kind: 'webcam_glitch', effect: 'stutter', durationS: 0.4, intensity: 0.8 });
          log('audio_director', 'records opened.');
          break;
        case 'ivy':
          // Darkest room: heartbeat slam + face-warp through the webcam.
          bus.fire({ kind: 'sound', asset: 'heartbeat', volume: 1.0 });
          bus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 0.8, intensity: 0.95 });
          bus.fire({ kind: 'flicker', duration: 0.4, pattern: 'hard' });
          log('creature_director', 'a portrait blinked.');
          break;
        case 'cottage':
          // Gilt mirror swap — grand hall suddenly isn't empty.
          bus.fire({ kind: 'mirror_swap', variant: 'extra_figure' });
          bus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.95 });
          bus.fire({ kind: 'flicker', duration: 0.3, pattern: 'subtle' });
          log('creature_director', 'check the mirror.');
          break;
        case 'capgown':
          // Stained-glass shields pulse red; hammer-beam creak.
          bus.fire({ kind: 'flicker', duration: 0.45, pattern: 'hard' });
          bus.fire({ kind: 'sound', asset: 'stinger_high', volume: 1.0 });
          bus.fire({ kind: 'sound', asset: 'impact', volume: 0.7 });
          log('audio_director', 'the trusses shifted.');
          break;
        case 'colonial':
          // Bright white room reads wrongness — dissonant tone + static burst.
          bus.fire({ kind: 'sound', asset: 'tone_wrong', volume: 0.9 });
          bus.fire({ kind: 'jumpscare', type: 'static_burst', durationS: 0.5 });
          bus.fire({ kind: 'flicker', duration: 0.2, pattern: 'subtle' });
          log('creature_director', 'the symmetry breaks.');
          break;
        case 'tigerinn':
          // Pub taproom: heavy impact (something falls) + hearth flicker.
          bus.fire({ kind: 'sound', asset: 'impact', volume: 1.0 });
          bus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.85 });
          bus.fire({ kind: 'flicker', duration: 0.35, pattern: 'hard' });
          log('creature_director', 'the tiger moved.');
          break;
        case 'terrace':
          // Massive stone hearth breathes. Fire "inhales" then slam.
          bus.fire({ kind: 'breath', intensity: 0.85 });
          bus.fire({ kind: 'sound', asset: 'stinger_low', volume: 0.9 });
          bus.fire({ kind: 'flicker', duration: 0.4, pattern: 'hard' });
          log('audio_director', 'the fire is breathing.');
          break;
        case 'cloister':
          // Monastic stained glass: hard flicker + high stinger + wrong tone.
          bus.fire({ kind: 'flicker', duration: 0.35, pattern: 'hard' });
          bus.fire({ kind: 'sound', asset: 'stinger_high', volume: 1.0 });
          bus.fire({ kind: 'sound', asset: 'tone_wrong', volume: 0.7 });
          log('creature_director', 'the shields sang.');
          break;
        case 'charter':
          // Cupola creak running backward + webcam delay — something up there.
          bus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.95 });
          bus.fire({ kind: 'webcam_glitch', effect: 'delay', durationS: 0.7, intensity: 0.85 });
          bus.fire({ kind: 'flicker', duration: 0.3, pattern: 'subtle' });
          log('creature_director', 'above you.');
          break;
      }
    });

    // NOTE: the scripted 38s/55s scream + peak stack beats were REMOVED.
    // The ClubDeanHunt now owns in-club horror — he patrols, vocalizes,
    // and catches. Scripted timer-screams on top were collision noise
    // that desensitized players to all of it. One persistent threat >
    // a conveyor of staged bangs. See horror/clubDeanHunt.ts.
  }

  // ── PUZZLE-MODE WIN ─────────────────────────────────────────────────
  // Fires when the player reaches FitzRandolph Gate with all 3 escape
  // items collected. Clean fade → log → hold on a win card. No scares.
  // This is the happy ending for puzzle mode; when DEAN_CHASE_ENABLED
  // flips back on, the real endgame (RevealSequence) replaces this.
  let escapeRan = false;
  const triggerEscapeEnd = async (): Promise<void> => {
    if (escapeRan) return;
    escapeRan = true;
    player.setInputEnabled(false);
    objective.clear();
    clearIdleNudge();
    log('system', 'fitzrandolph gate · all 3 seals verified · egress granted');
    devHud.flash('>> THE GATE OPENS <<', 4000);
    await fade.fadeToBlack(1600);
    log('phobos', 'you walked out through fitzrandolph. you are the first.');
    devHud.flash('>> YOU ESCAPED PROSPECT AVENUE <<', 60_000);
    fade.holdBlack();
  };

  // (Old basement/bedroom/attic scene code was here — removed. Game is Prospect Ave now.)

  // This is a placeholder — loadBasement used to exist for the old horror arc.
  let revealRunning = false;
  const endDemo = async (): Promise<void> => {
    if (revealRunning) return;
    revealRunning = true;
    log('system', 'end.');
    player.setInputEnabled(false);
    objective.clear();
    clearIdleNudge();

    // Hand the profiler's verdict to the reveal so the endgame text
    // is targeted to what ACTUALLY scared this player over the session.
    const profileSummary = scareProfiler.summary();
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
      dominantVector: profileSummary.dominantVector,
    });
    await reveal.run();
  };

  // (Old basement/bedroom/attic beat sheets removed — game uses runCampusBeats/runClubBeats now.)
  const loadBasement = (): void => { log('system', 'old arc disabled. use clubs.'); };

  // ── FINAL CONFRONTATION ──────────────────────────────────────────────
  // After Charter pickup + flashback, throw the player back onto Prospect
  // Ave with Dean Eisgruber directly in front of them. Twelve chapel bell
  // tolls interleave with screams + light flickers. The player is input-
  // locked for the entire sequence — this is a guided cinematic,
  // positioned between the Charter flashback and the FINALE chapter card.
  const playFinalConfrontation = async (): Promise<void> => {
    log('creature_director', 'FitzRandolph Gate · sealed · you are the sealed one');
    await fade.fadeToBlack(1000);
    // Return to campus for the confrontation — the avenue is where he
    // has been waiting the whole run.
    loadCampus(true);
    // Dean directly in front of player at 2m, fully visible.
    if (entityManager) {
      const p = engine.camera.position;
      const fwd = new THREE.Vector3();
      engine.camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      entityManager.phobos.setPosition({
        x: p.x + fwd.x * 2.5, y: 0, z: p.z + fwd.z * 2.5,
      });
      entityManager.phobos.setVisibility('close');
    }
    // Stop the street stalker timer — the entity is manually placed now.
    deanStalker?.stop();
    clubDeanHunt?.cancel();
    clubDeanHunt = null;
    await fade.fadeFromBlack(600);

    // HAUNTED CHORAL CHORD — The Shining / Hereditary swell, sustained
    // under the entire 12-toll sequence. Silent Hill radio static
    // punches in on toll 3. Music box fragment drifts in on toll 8.
    audio.playChoralChord(9.5, 0.9);
    audio.playSubsonicSlam(3.0, 1.0);

    // TWELVE CHAPEL BELL TOLLS — each toll fires a flicker, a stinger,
    // and a log line. Scripted horror beats per toll for narrative
    // weight. References: The Shining (REDRUM), The Ring (crawling
    // figure), Coraline (many eyes), Princeton (tiger).
    for (let i = 1; i <= 12; i++) {
      engine.eventBus.fire({ kind: 'sound', asset: 'impact', volume: 0.85 });
      engine.eventBus.fire({ kind: 'flicker', duration: 0.25, pattern: 'hard' });
      log('system', `university chapel bell · toll ${i} of 12`);
      if (i === 3) {
        audio.playRadioStatic(1.6, 0.85);
        scareOverlay.manyEyes(2200, 14);
      }
      if (i === 6) {
        // Midnight: Eisgruber screams + blood writing of the player's name.
        engine.eventBus.fire({ kind: 'sound', asset: 'scream', volume: 1.0 });
        engine.eventBus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 1.2, intensity: 1.0 });
        scareOverlay.screamFace(1600);
        scareOverlay.bloodWriting('SEAT 7', 2000);
        log('creature_director', 'DEAN EISGRUBER · "seat seven has been waiting, {name}."');
      }
      if (i === 8) {
        // Music box fragment — Old Nassau, corrupted.
        audio.playMusicBox(0.7);
        scareOverlay.tigerFace(1400);
      }
      if (i === 10) {
        // Crawling figure from the bottom of the screen.
        scareOverlay.crawlingFigure(2400);
        engine.eventBus.fire({ kind: 'sound', asset: 'stinger_high', volume: 0.95 });
        scareOverlay.redFlash(300, 0.7);
      }
      if (i === 12) {
        // Final toll: mirror crack + wrong reflection.
        scareOverlay.mirrorCrack(1800);
        scareOverlay.wrongReflection(1600);
      }
      await new Promise((r) => setTimeout(r, 700));
    }

    // FRG_LOCK cue — the FitzRandolph Gate sealing overlay.
    engine.eventBus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 1.0 });
    engine.eventBus.fire({ kind: 'sound', asset: 'impact', volume: 1.0 });
    engine.eventBus.fire({ kind: 'flicker', duration: 0.8, pattern: 'blackout' });
    log('system', 'FRG_LOCK · FitzRandolph Gate · sealed · egress denied');
    log('phobos', 'you are not graduating. you are calibrating.');
    await new Promise((r) => setTimeout(r, 1800));

    // Voice: the final accusation.
    if (voice && defaultVoiceId) {
      try {
        voice.speak({
          text: 'the gate is closed. the bell has rung twelve. dean eisgruber is in front of you. he has always been in front of you.',
          voiceId: defaultVoiceId,
          gain: 0.95,
        });
      } catch { /* non-fatal */ }
    }
    await new Promise((r) => setTimeout(r, 2200));
  };

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
    // Bicker Compatibility Form — the "consent" step that's actually a
    // targeting dossier. Answers populate playerProfile, which the director
    // reads every tick and the whisper bank interpolates at TTS time.
    titleScreen.hide();
    await new Promise<void>((resolve) => {
      const form = new BickerForm({
        onSubmit: (profile) => {
          log('system', `bicker form 7b submitted. subject: ${profile.name}.`);
          log('phobos', `hello ${profile.name.toLowerCase()}. section three was useful.`);
          sessionHistory.reset();
          resolve();
        },
      });
      void form.show();
    });

    // Show the corner box IMMEDIATELY after the form submits — prior
    // code called show() ~70 lines later after audio.init() + voice
    // engine setup, during which the player thought the webcam was
    // broken. Show first, attach stream, only then do the async init.
    cornerBox.show();

    let stream = titleScreen.getStream();
    if (!stream) {
      // Title screen's getUserMedia failed — try once more here. A second
      // user gesture (the form submit) sometimes succeeds where the
      // title click didn't. face-api init below needs the stream too.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
        });
      } catch {
        cornerBox.showNoWebcam();
        log('system', 'webcam access denied. refresh + allow to enable face-api analysis.');
      }
    }
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

    // Mic input — init in parallel with the audio graph. Permission prompt
    // surfaces here (we already had the webcam gesture, mic is a second
    // request). Failure is non-fatal: the biosignal tick just sees no
    // audio signal and the pipeline falls through to face/HR.
    audioEnergy.init().then(
      () => cornerBox.appendLog({ source: 'system', message: 'mic input live', timestamp: Date.now() }),
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        cornerBox.appendLog({ source: 'system', message: `mic unavailable: ${msg}`, timestamp: Date.now() });
      },
    );

    // Stand up the voice engine on the shared audio graph. If the ElevenLabs
    // voice id isn't configured, we silently skip — the game still runs.
    // The PhobosEntity + EntityManager + DeanStalker + ChapterSystem are
    // built UNCONDITIONALLY below so the visual stalker, chapter cards, and
    // scripted narrative fire even without TTS. Voice is purely additive.
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
      // Warm the TTS cache in the background so first fires are near-instant.
      void lineBank.preWarm().catch((e) => console.warn('[voice] prewarm failed:', e));

      const ambientBus = new AmbientBus(audioCtx, audioMaster, 0.0);
      creatureVoice = new CreatureVoice(voice, lineBank, ambientBus);
      log('system', 'voice engine online.');
    } else if (!defaultVoiceId) {
      log('system', 'voice engine disabled (no VITE_ELEVEN_DEMO_VOICE_ID). narrative still runs.');
    }

    // Webcam ghost renders a face-warp overlay on the corner-box video feed.
    // Purely visual — does not need voice. Only needs audioCtx for the
    // distortion sting; when no audioCtx, skip (rare, happens only if the
    // title-screen audio gesture never landed).
    if (audioCtx && audioMaster) {
      webcamGhost = new WebcamGhost({
        videoElement: cornerBox.getVideoElement(),
        overlayContainer: cornerBox.getVideoContainer(),
        audioContext: audioCtx,
        audioDestination: audioMaster,
      });
    }

    // ── Phobos entity + manager — ALWAYS created ─────────────────────────
    // Visual stalker mesh (the figure with the orange stole). Voice is
    // optional; when null, the mesh still renders, positions, fades, and
    // stalks the player — it just skips the TTS SFX calls.
    // Note: local name `phobosEntity` avoids shadowing the outer `phobos`
    // (which is the PhobosDirector LLM agent).
    const phobosEntity = new PhobosEntity(voice, creatureVoice);
    entityManager = new EntityManager({
      scene: engine.scene,
      camera: engine.camera,
      phobos: phobosEntity,
      log: (source, message) => log(source, message),
    });
    log('system', 'phobos entity spawned.');

    // ── Chapter system + the Dean stalker ───────────────────────────────
    // Gated on DEAN_CHASE_ENABLED so puzzle-mode has no chaser at all.
    if (DEAN_CHASE_ENABLED && entityManager) {
      deanStalker = new DeanStalker({
        entity: entityManager.phobos,
        camera: engine.camera,
        log: (source, text) => log(source, text),
        // Close-range trigger: when the Dean gets within 6 units he
        // SCREAMS in the player's face. The post-Chapter V threshold
        // of 4 units guarantees this fires during the endgame approach.
        onCloseHit: () => {
          if (survival.isRespawning || survival.isGameOver) return;
          engine.eventBus.fire({ kind: 'sound', asset: 'scream', volume: 1.0 });
          engine.eventBus.fire({ kind: 'sound', asset: 'stinger_high', volume: 0.85 });
          engine.eventBus.fire({ kind: 'flicker', duration: 0.6, pattern: 'hard' });
          engine.eventBus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 1.1, intensity: 1.0 });
          scareOverlay.screamFace(1200);
          log('creature_director', 'DEAN EISGRUBER · within arm\'s reach.');
          // Route through survival so lives decrement + clean respawn.
          void survival.catch({
            toBlack: (ms) => fade.fadeToBlack(ms),
            fromBlack: (ms) => fade.fadeFromBlack(ms),
          });
        },
        // Distant vocalization: rare and earned. Eisgruber references
        // what the player wrote on their bicker form. The dread bed
        // carries the constant tension; these lines are the spikes.
        onVocalize: (dist) => {
          const profile = playerProfile.get();
          const hasProfile = playerProfile.isSubmitted;
          const nm = hasProfile ? profile.name.toLowerCase() : '4722';
          const fear = hasProfile ? profile.fear.toLowerCase() : 'the dark';
          const miss = hasProfile ? profile.missedPerson.toLowerCase() : 'elliot';

          if (dist < 15) {
            // Close — a single whispered line, no scream stack.
            engine.eventBus.fire({ kind: 'breath', intensity: 0.85 });
            const lines = [
              `turn around, ${nm}.`,
              `${miss} turned around, too.`,
              `${fear}. we wrote it down.`,
              `seat seven is still yours.`,
            ];
            const line = lines[Math.floor(Math.random() * lines.length)];
            log('creature_director', `"${line}"`);
            if (voice && defaultVoiceId) {
              const p = engine.camera.position;
              try {
                voice.speak({
                  text: line, voiceId: defaultVoiceId, gain: 0.9,
                  position: { x: p.x, y: p.y, z: p.z },
                });
              } catch { /* non-fatal */ }
            }
          } else if (dist < 35) {
            // MID (15-35m) — laugh or growl. These are the player's
            // cue that he's closing in. Pick one randomly per vocalize.
            const midRoll = Math.random();
            if (midRoll < 0.45) {
              audio.playEvilLaugh(0.6);
              log('creature_director', `dean eisgruber laughs. he sees you.`);
            } else if (midRoll < 0.80) {
              audio.playGrowl(2.2, 0.6);
              log('creature_director', `a growl · from the avenue · getting closer`);
            } else {
              engine.eventBus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.7 });
              if (creatureVoice) {
                const p = engine.camera.position;
                creatureVoice.setPosition({ x: p.x - 8, y: 0, z: p.z - 8 });
                void creatureVoice.whisperSequence(1, 2, 0);
              }
              log('creature_director', `footsteps. behind you. slow.`);
            }
          } else {
            // FAR (35m+) — distant growl. Plays less often.
            if (Math.random() < 0.6) {
              audio.playGrowl(2.8, 0.45);
            } else {
              engine.eventBus.fire({ kind: 'sound', asset: 'creak_floor', volume: 0.4 });
            }
          }
        },
      });
      chapterSystem = new ChapterSystem({
        card: chapterCard,
        dean: deanStalker,
        scareOverlay,
        voice,
        voiceId: defaultVoiceId,
        bus: engine.eventBus,
        player,
        log: (source, text) => log(source, text),
      });
    }

    player.lock();
    titleScreen.hide();
    cornerBox.show();
    crosshair.show();
    survivalHud.show();

    engine.start();
    sessionStartTime = performance.now();
    sceneStartTime = performance.now();
    log('system', 'phobos initialized.');

    // OPENING AMBIENT CUE — no scream at the start. Instead, a single
    // reverse creak drifts across the corner-box panel to telegraph
    // that the environment is wrong. The first LOUD beat should be
    // earned, not thrown away in the first two seconds.
    setTimeout(() => {
      engine.eventBus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.45 });
    }, 2200);

    // PROLOGUE fires from inside the onStart callback AFTER the intro
    // sequence finishes — see below where intro.run() is awaited and
    // then chapterSystem.advance('prologue') is called. Firing here
    // in parallel with the intro caused the two cinematics to collide.

    // ── LLM STATUS BANNER ────────────────────────────────────────────────
    // Players reported "there is no LLM writing the script." The key
    // driver is: without VITE_OPENAI_API_KEY, the director never runs
    // and all scares are scripted. Make the state unmistakably visible
    // at boot so the player knows what mode they're in and how to fix it.
    if (openaiKey) {
      devHud.flash('LLM: ONLINE · adaptive director writing scares live', 5000);
      log('system', 'llm director online · adaptive scripting enabled');
    } else {
      devHud.flash('LLM: OFFLINE — set VITE_OPENAI_API_KEY in apps/web/.env', 8000);
      log('system', 'llm director OFFLINE · scripted beats only · add api key for adaptive mode');
    }

    // The biosignal tick registered earlier in main() is the single source
    // of truth for fear_score — do NOT re-register onBiosignalTick here.
    fearAudio.startHeartbeat();

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
          profile: playerProfile.isSubmitted ? playerProfile.get() : undefined,
          recentHistory: sessionHistory.tail(),
          scareProfileDigest: scareProfiler.promptDigest(),
        };
        const plan = await phobos.tick(ctx);
        // Mark the tick regardless of whether it returned a plan — a
        // null plan still means the LLM is reachable and ran. The HUD
        // displays "LLM:on Xs" computed from this timestamp.
        lastLlmTick = performance.now();
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

    // Hold black, load the campus under the overlay, then run the opening
    // cinematic. IntroSequence itself fades from black when it finishes, so
    // the world is revealed at the intended beat — player already facing east
    // down the avenue with Tower lit up and the objective HUD populated.
    fade.holdBlack();
    loadCampus();
    // Dev escape hatch into the existing horror arc.
    (window as unknown as { __loadBasement: () => void }).__loadBasement = loadBasement;

    if (DEAN_CHASE_ENABLED) {
      const intro = new IntroSequence({ cornerBox, fade, voice, defaultVoiceId });
      await intro.run();
      if (chapterSystem) {
        await chapterSystem.advance('prologue');
      }
    } else {
      // Puzzle mode: skip the phone-thread intro + prologue card. Just
      // fade from black into the avenue and prime the objective HUD.
      await fade.fadeFromBlack(900);
      updateObjective();
      devHud.flash('>> ESCAPE PROSPECT AVE · 3 ITEMS · 3 CLUBS <<', 5000);
      log('system', 'prospect avenue. three chain clubs are open. find the key, the code, the bolts.');
    }
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
