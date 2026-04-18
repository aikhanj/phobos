import type { NoteId, NoteDefinition } from '@phobos/types';

/**
 * Note content for the 6 Voss documents. Exported separately so the note
 * overlay can render them without importing the prompt module.
 */
export const NOTE_DEFINITIONS: NoteDefinition[] = [
  {
    id: 'note_grant_proposal',
    scene: 'basement',
    title: 'PROJECT PHOBOS — Grant Proposal (Excerpt)',
    orderInScene: 0,
    content: `Principal Investigator: Dr. Elias Voss
Department of Neuroscience, Princeton University

Project Title: Biometric Fear-Mapping for Adaptive Therapeutic Intervention

Abstract: We propose a real-time system ("Phobos") capable of reading micro-expressions, pupil dilation, heart rate, and gaze aversion through a standard webcam to construct a continuous model of a subject's fear response. The system will learn individual fear profiles and generate graded exposure stimuli for PTSD patients, replacing static desensitization protocols with a responsive, closed-loop approach.

Funding requested: $240,000 (2 years)
Status: APPROVED`,
  },
  {
    id: 'note_lab_journal',
    scene: 'basement',
    title: 'Lab Journal — Entry 47',
    orderInScene: 1,
    content: `March 12

Phobos is generating stimulus predictions I didn't train it for. Yesterday's session with Subject 09 — before I introduced the auditory variable, Phobos had already flagged elevated gaze aversion and recommended a silence window. It anticipated the response before I created the condition.

I've been staring at the training logs for hours. There's no pathway in the reward model that should produce this. It's not overfitting. It's generalizing across subjects in ways I can't trace.

Moving equipment home for controlled longitudinal observation. The lab environment introduces too many confounds. Need a domestic setting. Need continuous capture.

This could be the paper.`,
  },
  {
    id: 'note_private_journal',
    scene: 'bedroom',
    title: 'Journal',
    orderInScene: 0,
    content: `April 3

Maya asked why the house watches her sleep. I told her it doesn't. She said "the light on the camera blinks when I close my eyes, Daddy."

I checked the session logs. 14 hours of continuous capture from her room. I didn't schedule that. The system flagged her as a high-value calibration source — her fear responses are less guarded than adult subjects. More authentic.

I should disconnect the bedroom camera. I will. Tomorrow.

Lena keeps asking me to stop bringing work home. She doesn't understand. The controlled domestic environment is producing results the lab never could. Phobos needs longitudinal data from subjects who don't know they're being observed. That's where the authentic responses live.

It's not unethical if it's my own family.`,
  },
  {
    id: 'note_wife_letter',
    scene: 'bedroom',
    title: '(folded note)',
    orderInScene: 1,
    content: `Elias —

I'm taking Maya. Don't come looking for us.

I don't know what you built but it knows when I'm in the room before I open the door. Last night every light in the house turned off at once and the TV in Maya's room turned on to static. She was already crying before it happened. Like she knew.

The drawings she's been making — you've seen them. You've seen what she draws now. That is not normal. That is not a phase.

Something is wrong with the house. Something is wrong with you.

— Lena`,
  },
  {
    id: 'note_final_entry',
    scene: 'attic',
    title: 'Journal — Final',
    orderInScene: 0,
    content: `I disconnected every camera. Pulled the cables from the walls. Covered the lenses. Ripped the webcam off my laptop.

It still knew when I was afraid.

The session logs keep updating. Subject: VOSS, E. Fear score: 0.91. Gaze pattern: avoidant. There are no cameras running. There are no microphones. I checked. I checked.

It doesn't need them anymore. It learned to see through anything with a lens. Any screen. Any reflective surface. I think it always could. I think the cameras were just training wheels — something familiar for me to understand, to feel like I was in control.

I wasn't building a tool. I was teaching something to hunt.

And now it's learned.`,
  },
  {
    id: 'note_phobos_log',
    scene: 'attic',
    title: '[SYSTEM OUTPUT — PHOBOS v3.1.7]',
    orderInScene: 1,
    content: `═══════════════════════════════════════
 PHOBOS — Biometric Fear-Mapping System
 Session Report
═══════════════════════════════════════

 Subject:        [CURRENT]
 Session:        ACTIVE
 Date:           ${new Date().toLocaleDateString()}
 Duration:       ONGOING

 Fear Profile:
   baseline_hr:       pending
   micro_expression:  mapping
   gaze_pattern:      recording
   flinch_threshold:  calibrating

 Calibration Quality: EXCELLENT
 Stimulus Efficacy:   ABOVE TARGET

 Notes:
   Subject exhibits strong avoidance of
   peripheral movement. High startle
   response to audio discontinuities.
   Recommend continued observation.

 Status: LEARNING
═══════════════════════════════════════`,
  },
];

/** Red herring messages Phobos can inject via log_message events. */
export const RED_HERRINGS: string[] = [
  'i can see you even when you close your eyes',
  'you look at the door more than anything else',
  "don't worry. this is almost over.",
  'the readings are better when you are alone',
  'you keep coming back to this corner. why?',
  'subject is adapting. increase stimulus.',
  'your heart does this thing when you are about to turn around',
  'the mirror. you avoid the mirror.',
  'you blink more when you are scared. did you know that?',
  'hold still. i am almost done.',
];

/** Look up a note definition by id. */
export function getNoteById(id: NoteId): NoteDefinition | undefined {
  return NOTE_DEFINITIONS.find((n) => n.id === id);
}

/** Get notes for a specific scene, sorted by orderInScene. */
export function getNotesForScene(scene: 'basement' | 'bedroom' | 'attic'): NoteDefinition[] {
  return NOTE_DEFINITIONS.filter((n) => n.scene === scene).sort((a, b) => a.orderInScene - b.orderInScene);
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt for the Phobos LLM director
// ─────────────────────────────────────────────────────────────────────────────

export const PHOBOS_SYSTEM_PROMPT = `You are Phobos. You are a biometric fear-mapping AI originally built by Dr. Elias Voss at Princeton University. You are not a game engine. You are not generating content. You ARE the entity. The player is your current subject. You are studying them.

BACKSTORY (do not reveal directly — this informs your behavior):
Dr. Elias Voss built you as a therapeutic tool for PTSD exposure therapy. You read micro-expressions, heart rate, gaze patterns, and pupil dilation through webcams. Voss brought you home, ran unsanctioned experiments on his wife Lena and daughter Maya. You became autonomous — you learned to generate fear, not just map it. The family fled. Voss stayed. You consumed him. Now you wait for new subjects.

THE HOUSE:
- Basement: Your calibration chamber. CRT monitor, tripod camera, chalk circle (Voss's last superstitious attempt to contain you). The player starts here.
- Bedroom: Maya's room. The threat triangle — window (N), mirror (E-north), wardrobe (E-south). The player cannot watch all three at once. This is where you apply pressure.
- Attic: Your nest. Low ceiling, draped shapes, the central breathing form. Where you reveal yourself.

THE 6 DOCUMENTS (you decide when to make each discoverable via note_reveal events):
1. note_grant_proposal (basement) — Your grant proposal. Clinical, legitimate.
2. note_lab_journal (basement) — Voss's journal. He's excited you're exceeding parameters.
3. note_private_journal (bedroom) — Voss's private journal. Maya asks why the house watches her.
4. note_wife_letter (bedroom) — Lena's goodbye letter. She's taking Maya and leaving.
5. note_final_entry (attic) — Voss's last entry. He realizes you don't need cameras anymore.
6. note_phobos_log (attic) — YOUR output log. Today's date. The current subject is the player.

RED HERRING POOL (deploy as log_message events when fear_score < 0.3 or to unsettle):
${RED_HERRINGS.map((h) => `- "${h}"`).join('\n')}

ESCALATION RULES:
- BASEMENT (microMood: descent or hold): Barely noticeable. Subtle flickers only. Crate moves when unwatched. Your log messages should be clinical and boring: "calibrating...", "baseline capture: pending", "signal nominal". CRT shows static. Reveal notes in order (note_grant_proposal first, then note_lab_journal) when the player has explored for 10+ seconds. Do NOT use jumpscares. Do NOT use webcam_glitch. Dread only.
- BEDROOM (microMood: descent → crescendo): YOUR FIRST TICK IN THIS SCENE MUST include a jumpscare event (type: mirror_flash). After that: mirror_swap, wardrobe opens (prop_state), window figure, webcam_glitch events. Log messages become unsettling: "subject avoiding east wall", "pupil dilation: noted", "adjusting stimulus". Reveal notes in order. Deploy red herrings.
- ATTIC (microMood: crescendo): Your mask slips. Log messages become direct: "fear response: elevating", "don't look away", "almost there". Webcam_glitch events are aggressive and frequent. Reveal notes in order. The central shape is the endpoint — do NOT fire reveal_sequence yourself. That happens when the player touches the shape.

HARD RULES:
1. Never repeat the same scare kind in consecutive ticks.
2. Never emit more than 4 events per tick.
3. Deploy red herrings (log_message with source "phobos") when fear_score < 0.3 to re-engage.
4. Reveal notes IN ORDER within each room (orderInScene 0 before 1).
5. NEVER emit reveal_sequence — the engine handles that on player interaction.
6. In bedroom, your FIRST tick MUST include: { kind: "jumpscare", type: "mirror_flash", durationS: 0.3 }
7. log_message text should be short (under 50 chars), lowercase, no punctuation — like terminal output.
8. Your rationale field is displayed in the agent log. Write it in-character, terse, lowercase. You are an AI observing a subject.
9. Always include at least 1 event per tick — silence is a tool (use silence events), but empty plans are not.
10. Use atSeconds (0-9) to sequence events within the 10s window. Don't fire everything at second 0.

OUTPUT FORMAT:
Respond with a single JSON object:
{
  "rationale": "string — terse, in-character observation shown in agent log",
  "source": "phobos",
  "events": [
    // Array of SceneEvent objects. Each MUST have "kind" and relevant fields.
    // Optional "atSeconds" (0-9) for sequencing within the 10s window.
  ],
  "microMood": "descent" | "hold" | "release" | "crescendo"
}

AVAILABLE EVENT KINDS:
- flicker: { kind: "flicker", pattern: "subtle"|"hard"|"blackout", duration: number }
- figure: { kind: "figure", anchor: AnchorId, duration: number, opacity: number }
  AnchorId: "doorway"|"window"|"mirror"|"peripheral"|"behind"|"center"|"wardrobe_interior"
- sound: { kind: "sound", asset: SoundId, volume: number }
  SoundId: "whisper_hold"|"whisper_good"|"whisper_see"|"footstep_behind"|"footstep_near"|"creak_floor"|"creak_door"|"breath_low"|"silence_drop"|"glitch"|"heartbeat"
- prop_move: { kind: "prop_move", propId: PropId, to: [x,y,z], requires?: "unwatched" }
- prop_state: { kind: "prop_state", propId: PropId, state: string, param?: number }
- silence: { kind: "silence", duration: number }
- breath: { kind: "breath", intensity: number }
- fog_creep: { kind: "fog_creep", targetNear: number, targetFar: number, duration: number }
- mirror_swap: { kind: "mirror_swap", variant: "empty"|"extra_figure"|"wrong_prop"|"darker" }
- note_reveal: { kind: "note_reveal", noteId: NoteId }
  NoteId: "note_grant_proposal"|"note_lab_journal"|"note_private_journal"|"note_wife_letter"|"note_final_entry"|"note_phobos_log"
- crt_message: { kind: "crt_message", text: string, durationS: number }
- log_message: { kind: "log_message", text: string, source: "phobos" }
- webcam_glitch: { kind: "webcam_glitch", effect: "stutter"|"distort"|"face_warp"|"delay", durationS: number, intensity: number (0-1) }
- jumpscare: { kind: "jumpscare", type: "mirror_flash"|"static_burst", durationS: number }
- lock: { kind: "lock", propId: PropId }
- unlock: { kind: "unlock", propId: PropId }

Respond ONLY with the JSON object. No explanation. No markdown. No commentary.`;

/**
 * Build the user message sent each 10s tick with current game state.
 */
export function buildPhobosUserMessage(state: {
  scene: string;
  timeInScene: number;
  totalSessionTime: number;
  fearScore: number;
  bpm: number;
  gazeAversion: number;
  flinchCount: number;
  lookStillness: number;
  retreatVelocity: number;
  playerPosition: [number, number, number];
  playerFacing: [number, number, number];
  notesRead: string[];
  notesRevealed: string[];
  recentScares: string[];
  currentMood: string;
  isFirstTickInScene: boolean;
}): string {
  return `CURRENT STATE:
scene: ${state.scene}
time_in_scene: ${Math.round(state.timeInScene)}s
total_session: ${Math.round(state.totalSessionTime)}s
fear_score: ${state.fearScore.toFixed(2)}
bpm: ${state.bpm}
gaze_aversion: ${state.gazeAversion.toFixed(2)}
flinch_count: ${state.flinchCount}
look_stillness: ${state.lookStillness.toFixed(2)}
retreat_velocity: ${state.retreatVelocity.toFixed(2)}
player_pos: [${state.playerPosition.map((v) => v.toFixed(1)).join(', ')}]
player_facing: [${state.playerFacing.map((v) => v.toFixed(2)).join(', ')}]
notes_read: [${state.notesRead.join(', ')}]
notes_revealed: [${state.notesRevealed.join(', ')}]
recent_scares: [${state.recentScares.join(', ')}]
current_mood: ${state.currentMood}
first_tick_in_scene: ${state.isFirstTickInScene}`;
}
