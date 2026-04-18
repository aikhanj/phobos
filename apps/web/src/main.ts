import * as THREE from 'three';
import { Engine } from './game/engine';
import { Player } from './game/player';
import { Basement } from './game/scenes/basement';
import { Bedroom } from './game/scenes/bedroom';
import { Attic } from './game/scenes/attic';
import { Timeline } from './game/timeline';
import { TitleScreen } from './ui/titleScreen';
import { CornerBox } from './ui/cornerBox';
import { Crosshair } from './ui/crosshair';
import { FadeOverlay } from './ui/fadeOverlay';
import { DevHud } from './ui/devHud';
import { AudioManager } from './audio/audioManager';
import { createVoiceEngine, LineBank, type VoiceEngine, type FearBucket } from '@phobos/voice';
import { WebcamGhost } from './horror/webcamGhost';
import type { AgentLogEntry } from '@phobos/types';

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

  // Voice engine wiring (lazy — audio context is created at audio.init()).
  let voice: VoiceEngine | null = null;
  let lineBank: LineBank | null = null;
  let webcamGhost: WebcamGhost | null = null;
  const voiceProxyUrl = (import.meta.env.VITE_VOICE_PROXY_URL as string) || 'http://localhost:3001';
  const defaultVoiceId = import.meta.env.VITE_ELEVEN_DEMO_VOICE_ID as string | undefined;

  // Per-frame: drive player, update voice listener to camera pose.
  const _fwd = new THREE.Vector3();
  engine.onUpdate = (dt) => {
    player.update(dt);
    if (voice) {
      const p = engine.camera.position;
      engine.camera.getWorldDirection(_fwd);
      voice.updateListener(
        { x: p.x, y: p.y, z: p.z },
        { x: _fwd.x, y: _fwd.y, z: _fwd.z },
        { x: 0, y: 1, z: 0 },
      );
    }
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

  // ── route fired events to audio + log ──
  engine.onEventFired = (ev) => {
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

  // ── scene factories (defined forward, swap in the transitions below) ──
  const loadBasement = (): void => {
    const basement = new Basement({
      onTransitionToBedroom: () => transitionToBedroom(),
    });
    engine.loadScene(basement);
    engine.camera.position.copy(basement.spawnPoint);
    // clear queued agent lines
    runBasementOpening();
  };

  const loadBedroom = (): void => {
    const bedroom = new Bedroom({
      onTransitionToAttic: () => transitionToAttic(),
    });
    engine.loadScene(bedroom);
    engine.camera.position.copy(bedroom.spawnPoint);
    runBedroomBeats();
  };

  const loadAttic = (): void => {
    const attic = new Attic({
      onDemoEnd: () => endDemo(),
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

  const endDemo = async (): Promise<void> => {
    log('system', 'end.');
    player.setInputEnabled(false);
    await fade.fadeToBlack(600);
    // Intentionally hold black — the demo ends on the inhale.
    fade.holdBlack();
  };

  // ── beat sheets ──

  /**
   * Basement opening = calibration ritual + first-scare cue. The player
   * cannot move for the first ~30s. Authored lines speak as Phobos.
   */
  function runBasementOpening(): void {
    const t = swapTimeline(new Timeline());
    player.setInputEnabled(false);
    devHud.startCountdown(30);

    t.schedule(400, () => log('system', 'baseline capture. hold.'));
    t.schedule(3500, () => log('audio_director', 'they are here.'));
    t.schedule(7000, () => {
      log('creature_director', 'faces. eyes. catalogued.');
      engine.eventBus.fire({ kind: 'flicker', duration: 0.3, pattern: 'subtle' });
    });
    t.schedule(14000, () => log('pacing_director', 'halfway. do not release yet.'));
    t.schedule(18000, () => {
      log('audio_director', 'a pulse.');
      engine.eventBus.fire({ kind: 'breath', intensity: 0.5 });
    });
    t.schedule(24000, () => {
      log('creature_director', 'almost.');
      engine.eventBus.fire({ kind: 'flicker', duration: 0.6, pattern: 'hard' });
    });

    // Calibration complete.
    t.schedule(30000, () => {
      log('system', 'good.');
      speakAs('low', 'good');
      player.setInputEnabled(true);
      devHud.stopCountdown();
      devHud.setStatus('SCENE · basement · WASD + [E] ENABLED');
      devHud.flash('>> WASD · MOUSE · [E] <<', 2800);
      runBasementExploration();
    });
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

    // 19s: hard blackout flicker for punctuation
    t.schedule(19000, () => {
      bus.fire({ kind: 'flicker', duration: 0.35, pattern: 'blackout' });
      fade.blink(150);
    });

    // 26s: a whisper pointing up the stairs
    t.schedule(26000, () => {
      log('pacing_director', 'upstairs.');
      bus.fire({ kind: 'sound', asset: 'whisper_see', volume: 0.6 });
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

    // 18s: Pacing forces release — light warms, silence, breath.
    t.schedule(18000, () => {
      log('pacing_director', 'release. twelve seconds.');
      bus.fire({ kind: 'silence', duration: 4 });
      bus.fire({ kind: 'breath', intensity: 0.3 });
    });

    // 22s: the release isn't release — mirror swaps to "extra figure".
    t.schedule(22000, () => {
      log('creature_director', 'look at the mirror.');
      bus.fire({ kind: 'mirror_swap', variant: 'extra_figure' });
    });

    // 28s: harder flicker, wardrobe opens wider
    t.schedule(28000, () => {
      log('audio_director', 'lower.');
      bus.fire({ kind: 'flicker', duration: 0.8, pattern: 'hard' });
      bus.fire({ kind: 'prop_state', propId: 'bedroom_wardrobe_door', state: 'ajar', param: 0.55 });
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
    t.schedule(9000, () => log('pacing_director', 'let them approach.'));
    t.schedule(14000, () => log('creature_director', 'closer.'));
  }

  // ── boot sequence ──

  // 1) Title screen (requests webcam, waits for click).
  const titleScreen = new TitleScreen();
  await titleScreen.show();

  titleScreen.onStart(async () => {
    const stream = titleScreen.getStream();
    if (stream) cornerBox.attachStream(stream);

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
      log('system', 'voice engine online.');
    } else if (!defaultVoiceId) {
      log('system', 'voice engine disabled (no VITE_ELEVEN_DEMO_VOICE_ID).');
    }

    player.lock();
    titleScreen.hide();
    cornerBox.show();
    crosshair.show();

    engine.start();
    log('system', 'phobos initialized.');

    // Load first scene & start the ritual.
    loadBasement();
  });

  // Dev: press V to fire a test line from wherever the player is looking.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyV') return;
    if (!voice || !lineBank) return;
    speakAs('medium');
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
