import * as THREE from 'three';
import type { CornerBox } from '../ui/cornerBox';
import type { WebcamGhost } from './webcamGhost';
import type { VoiceEngine } from '@phobos/voice';

export interface FlashbackConfig {
  /** Index (0-4) for tracking which flashbacks have played. */
  index: number;
  /** Text for ElevenLabs TTS — the voice the player hears. */
  voiceLine: string;
  /** Temporary ambient light color during the flashback. */
  lightColor: number;
  /** Temporary ambient light intensity. */
  lightIntensity: number;
  /** Lines to inject into the agent log during the flashback. */
  agentLogLines: string[];
  /** Minimum hold time in ms (TTS may extend this). */
  durationMs: number;
}

export interface FlashbackDeps {
  scene: THREE.Scene;
  cornerBox: CornerBox;
  webcamGhost: WebcamGhost | null;
  voice: VoiceEngine | null;
  defaultVoiceId: string | undefined;
  onStart: () => void;    // disable player input
  onEnd: () => void;      // re-enable player input
}

/**
 * The 5 flashback configurations — triggered by pickups in clubs.
 * Each one reveals more of the player's guilt.
 */
export const FLASHBACKS: FlashbackConfig[] = [
  {
    // Tower — cheerful bicker welcome
    index: 0,
    voiceLine: 'Welcome to Prospect Avenue! We are so excited to have you here tonight. Come on in, grab a drink, meet the members.',
    lightColor: 0xffe8c0,
    lightIntensity: 1.8,
    agentLogLines: [
      'bicker season 2025. prospect ave.',
      'system: calibration environment initialized.',
      'status: normal social event. subjects relaxed.',
      '→ colonial has your form on file.',
    ],
    durationMs: 6000,
  },
  {
    // Colonial — the targeting form
    index: 1,
    voiceLine: 'Question seven. Describe a specific situation where your roommate was genuinely afraid. Be as detailed as possible. Your honesty helps us find the right fit.',
    lightColor: 0xc0d0ff,
    lightIntensity: 1.2,
    agentLogLines: [
      'compatibility assessment form. section 3.',
      'target profile: subject 4721.',
      'referral source: subject 4722.',
      'form completion: 94%. high detail responses.',
      '→ cannon kept the records.',
    ],
    durationMs: 8000,
  },
  {
    // Cannon — bicker night evaluation
    index: 2,
    voiceLine: 'Prospect number forty-seven twenty-one. Fear score baseline: point three four. Introducing stimulus package C. Begin.',
    lightColor: 0x80ff80,
    lightIntensity: 0.6,
    agentLogLines: [
      '4721: cannon club. 11:42pm.',
      '4721: fear_score: 0.34 → 0.51 → 0.67.',
      '4721: stimulus response: elevated.',
      'evaluator notes: promising candidate.',
      '→ the last room 4721 saw. cap and gown.',
    ],
    durationMs: 7000,
  },
  {
    // Cap & Gown — the roommate's session
    index: 3,
    voiceLine: 'Subject forty-seven twenty-one. Fear score: point nine three. Subject is adapting. Increase stimulus. Subject forty-seven twenty-one. Session... terminated.',
    lightColor: 0xff4040,
    lightIntensity: 0.4,
    agentLogLines: [
      '4721: capgown. 1:17am.',
      '4721: fear_score: 0.78 → 0.89 → 0.93.',
      '4721: subject is adapting. increase stimulus.',
      '4721: calibration quality: excellent.',
      '4721: session terminated.',
      'you were in this room.',
      '→ one door left. charter. the one we prepared for you.',
    ],
    durationMs: 9000,
  },
  {
    // Charter — the player (triggers reveal sequence separately)
    index: 4,
    voiceLine: 'Subject forty-seven twenty-two. That is you. You filled out the form. You walked this street. You opened every door. Calibration complete.',
    lightColor: 0xff0000,
    lightIntensity: 0.2,
    agentLogLines: [
      '4722: charter club. session active.',
      '4722: fear_score: [LIVE].',
      '4722: you came looking for 4721.',
      '4722: you are 4722.',
      'calibration complete.',
    ],
    durationMs: 10000,
  },
];

/**
 * Play a flashback. The room transforms around the player:
 * lights shift, screen glitches, a voice speaks, agent log
 * shows data. Then it snaps back.
 */
export async function playFlashback(
  config: FlashbackConfig,
  deps: FlashbackDeps,
): Promise<void> {
  deps.onStart();

  // Find all lights in the scene and save their state
  const savedLights: Array<{ light: THREE.Light; color: THREE.Color; intensity: number }> = [];
  deps.scene.traverse((obj) => {
    if (obj instanceof THREE.PointLight || obj instanceof THREE.AmbientLight || obj instanceof THREE.DirectionalLight) {
      savedLights.push({
        light: obj,
        color: obj.color.clone(),
        intensity: obj.intensity,
      });
    }
  });

  // Screen glitch — entering the flashback
  if (deps.webcamGhost) {
    deps.webcamGhost.flash({ buildupMs: 300, snapMs: 200, fadeMs: 100 }).catch(() => {});
  }
  await sleep(400);

  // Shift all lights to flashback color/intensity
  const flashColor = new THREE.Color(config.lightColor);
  for (const { light } of savedLights) {
    light.color.copy(flashColor);
    light.intensity = config.lightIntensity;
  }

  // Inject agent log lines with pacing
  const logInterval = Math.floor(config.durationMs / (config.agentLogLines.length + 1));
  for (let i = 0; i < config.agentLogLines.length; i++) {
    setTimeout(() => {
      deps.cornerBox.appendLog({
        source: 'phobos',
        message: config.agentLogLines[i],
        timestamp: Date.now(),
      });
    }, logInterval * (i + 1));
  }

  // Play TTS voice line
  let ttsDone: Promise<void> = Promise.resolve();
  if (deps.voice && deps.defaultVoiceId) {
    try {
      const handle = deps.voice.speak({
        text: config.voiceLine,
        voiceId: deps.defaultVoiceId,
        gain: 0.9,
      });
      ttsDone = handle.done;
    } catch {
      // TTS failure is non-fatal
    }
  }

  // Wait for either TTS to finish or minimum duration
  await Promise.race([
    ttsDone,
    sleep(config.durationMs),
  ]);
  // Extra hold after TTS
  await sleep(2000);

  // Screen glitch — exiting the flashback
  if (deps.webcamGhost) {
    deps.webcamGhost.flash({ buildupMs: 150, snapMs: 300, fadeMs: 200 }).catch(() => {});
  }
  await sleep(350);

  // Snap lights back to original
  for (const { light, color, intensity } of savedLights) {
    light.color.copy(color);
    light.intensity = intensity;
  }

  deps.onEnd();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
