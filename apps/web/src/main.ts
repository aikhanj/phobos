import { Engine } from './game/engine';
import { Player } from './game/player';
import { Basement } from './game/scenes/basement';
import { TitleScreen } from './ui/titleScreen';
import { CornerBox } from './ui/cornerBox';
import { AudioManager } from './audio/audioManager';

async function main() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  const engine = new Engine(canvas);
  const player = new Player(engine.camera, canvas);
  const cornerBox = new CornerBox();
  const audio = new AudioManager();

  // Load first scene (basement) — geometry ready before game starts
  const basement = new Basement();
  engine.loadScene(basement);

  // Position player at spawn
  engine.camera.position.copy(basement.spawnPoint);

  // Wire engine update to player
  engine.onUpdate = (dt) => player.update(dt);

  // Show title screen
  const titleScreen = new TitleScreen();
  await titleScreen.show();

  // Click-to-start flow
  titleScreen.onStart(async () => {
    // Pass webcam stream to corner box
    const stream = titleScreen.getStream();
    if (stream) {
      cornerBox.attachStream(stream);
    }

    // Init audio context (requires user gesture)
    await audio.init();

    // Lock pointer, swap screens
    player.lock();
    titleScreen.hide();
    cornerBox.show();

    // Start render loop
    engine.start();

    // Initial log
    cornerBox.appendLog({
      source: 'system',
      message: 'phobos initialized',
      timestamp: Date.now(),
    });
  });

  // Handle pointer unlock (Escape key)
  player.controls.addEventListener('unlock', () => {
    // Show a minimal resume prompt
    if (!resumeOverlay.parentElement) return;
    resumeOverlay.style.display = 'flex';
    engine.stop();
  });

  player.controls.addEventListener('lock', () => {
    resumeOverlay.style.display = 'none';
    engine.start();
  });

  // Resume overlay — shown when pointer unlocks
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
    fontSize: '1.2rem',
    color: '#555',
    letterSpacing: '0.3rem',
    textTransform: 'uppercase',
    userSelect: 'none',
  });
  resumeOverlay.appendChild(resumeText);
  resumeOverlay.addEventListener('click', () => {
    player.lock();
  });
  document.body.appendChild(resumeOverlay);
}

main().catch(console.error);
