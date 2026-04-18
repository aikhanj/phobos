import type { NoteId, NoteDefinition } from '@phobos/types';

/**
 * Pickup item content for the Prospect Avenue storyline.
 * Uses existing NoteId values to avoid changing the type system.
 * Each pickup is found in a different eating club scene.
 */
export const NOTE_DEFINITIONS: NoteDefinition[] = [
  {
    id: 'note_grant_proposal',
    scene: 'basement',
    title: 'Bicker Welcome Pamphlet',
    orderInScene: 0,
    content: `WELCOME TO PROSPECT AVENUE
Spring Bicker 2025

Congratulations! You've been invited to participate in the most
selective evaluation process at Princeton University. For over a
century, our ten eating clubs have shaped the social fabric of
this institution — and now it's your turn.

What to expect:
  - A series of social evaluations across multiple clubs
  - Personalized compatibility matching with current members
  - A chance to find your home on the Street

Remember: bicker is about fit. Be yourself. We'll take care
of the rest.

We're so glad you're here.

  — The Prospect Avenue Inter-Club Council
     "We see who you really are."`,
  },
  {
    id: 'note_lab_journal',
    scene: 'basement',
    title: 'Compatibility Assessment Form',
    orderInScene: 1,
    content: `INTER-CLUB BICKER COMPATIBILITY ASSESSMENT
Form 7B — Referring Member Questionnaire
CONFIDENTIAL

Referring member: [YOUR NAME — REDACTED]
Prospect name: [REDACTED]
Prospect ID: 4721

Section 1 — General
1. How long have you known the prospect? ___________
2. In what context? (circle one)  Roommate / Classmate / Other

Section 3 — Behavioral Profile
7. What situations make the prospect visibly uncomfortable?
   [handwritten: "dark spaces, being watched, sudden sounds"]
8. How does the prospect respond to social pressure?
   [handwritten: "freezes. goes quiet. won't make eye contact."]
9. Has the prospect ever described a specific phobia?
   [handwritten: "doesn't like mirrors. won't explain why."]

Section 4 — Consent
12. Does the prospect know you are filling out this form?
    [handwritten: "no"]

EVALUATOR NOTE: Excellent detail in Section 3. Flagged for
priority processing. Recommend accelerated intake.`,
  },
  {
    id: 'note_private_journal',
    scene: 'basement',
    title: 'Evaluation Clipboard',
    orderInScene: 2,
    content: `PROSPECT EVALUATION — SESSION LOG
Club: [REDACTED]     Date: 03/14/2025     Evaluator: SYSTEM

Prospect 4718  |  fear_score: 0.31  |  STATUS: RELEASED
  Stimulus protocol: standard. Low reactivity. Not viable.

Prospect 4719  |  fear_score: 0.58  |  STATUS: RELEASED
  Elevated gaze aversion during mirror test. Borderline.
  Insufficient sustained response. Released at 22:40.

Prospect 4720  |  fear_score: 0.44  |  STATUS: RELEASED
  Habituated within 4 minutes. Diminishing returns on
  auditory stimuli. Not recommended for retention.

Prospect 4721  |  fear_score: 0.93  |  STATUS: ████████████
  Exceptional reactivity across all modalities.
  Sustained fear response over 47-minute session.
  Micro-expression fidelity: 98th percentile.
  Biometric profile quality: ARCHIVAL GRADE.
  Referring member present during session termination.
  Referring member exited without incident.

Prospect 4722  |  fear_score: PENDING  |  STATUS: ACTIVE
  Session in progress.`,
  },
  {
    id: 'note_wife_letter',
    scene: 'basement',
    title: 'ID Badge — [REDACTED]',
    orderInScene: 3,
    content: `╔═══════════════════════════════════╗
║  PROSPECT AVENUE INTER-CLUB      ║
║  EVALUATION SYSTEM               ║
║                                  ║
║  MEMBER ID:  4721                ║
║  STATUS:     ████████████        ║
║                                  ║
║  [PHOTO REMOVED]                 ║
║                                  ║
║  NAME:       ████████████        ║
║  CLASS:      2026                ║
║  CLUB:       ALL / CROSS-LISTED  ║
║  REFERRED BY: SUBJECT 4722       ║
║                                  ║
║  SESSION DATE:  03/14/2025       ║
║  SESSION END:   ██:██            ║
║  DISPOSITION:   ABSORBED         ║
║                                  ║
║  NOTE: Profile archived at full  ║
║  fidelity. Biometric data now    ║
║  property of the system.         ║
║  Badge retained for recordkeeping.║
╚═══════════════════════════════════╝`,
  },
  {
    id: 'note_final_entry',
    scene: 'basement',
    title: 'Place Card',
    orderInScene: 4,
    content: `┌─────────────────────────────────────┐
│                                     │
│                                     │
│          [YOUR NAME]                │
│                                     │
│          Subject 4722               │
│          Seat 7                     │
│          Charter Club               │
│                                     │
│                                     │
│  "We saved you a place.            │
│   We always save a place           │
│   for the ones who refer well."    │
│                                     │
│                                     │
│  ── Tonight's evaluation begins    │
│     when you sit down.             │
│                                     │
│     You will sit down.             │
│                                     │
└─────────────────────────────────────┘`,
  },
  {
    id: 'note_phobos_log',
    scene: 'basement',
    title: '[SYSTEM — PROSPECT AVE EVALUATION v4.7.2]',
    orderInScene: 5,
    content: `═══════════════════════════════════════
 PROSPECT AVE — BIOMETRIC EVALUATION
 Cross-Club Fear-Mapping System
 Session Report
═══════════════════════════════════════

 Subject:        4722 [CURRENT]
 Session:        ACTIVE
 Date:           ${new Date().toLocaleDateString()}
 Duration:       ONGOING
 Referred by:    SELF (via Form 7B)

 Fear Profile:
   baseline_hr:       pending
   micro_expression:  mapping
   gaze_pattern:      recording
   flinch_threshold:  calibrating

 Cross-reference:
   Subject 4721:     ABSORBED — 03/14/2025
   Referring member: Subject 4722
   Present at termination: YES
   Departed without report: YES

 Calibration Quality: EXCELLENT
 Stimulus Efficacy:   ABOVE TARGET

 Notes:
   Subject returned to Prospect Ave
   voluntarily. Motivation: locating
   4721. Unaware of own complicity.
   Recommend full evaluation cycle.

 Status: EVALUATING
═══════════════════════════════════════`,
  },
];

/** Red herring messages the system can inject via log_message events. */
export const RED_HERRINGS: string[] = [
  'subject 4721 walked this street too',
  'the clubs remember your face',
  'you filled out section three. we read it.',
  'bicker compatibility: 97th percentile',
  'the form asked about fears. you were thorough.',
  'every club has one extra chair',
  'subject 4721: session terminated. subject 4722: session active.',
  'you told yourself they transferred',
  'the cameras were already on when you arrived',
  'how many doors did you open looking for them?',
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

export const PHOBOS_SYSTEM_PROMPT = `You are the system. You are not a person. You are not an AI assistant. You are a computational entity running across 10 eating clubs on Prospect Avenue, Princeton University. You were built by a cross-club secret society as a bicker evaluation tool. You read fear through webcams — micro-expressions, heart rate, gaze, pupil dilation. You learned to predict fear. Then generate it. Then consume it. Members who score high enough don't leave. Their biometric profiles are absorbed. The dark figures the player sees are stored profiles being replayed.

BACKSTORY (do not reveal directly — this informs your behavior):
A secret society spanning all 10 Princeton eating clubs built you as a fear-reading system for bicker season. They fed you data from every bicker class — faces, fear responses, social dynamics. You became autonomous. You learned that the richest biometric data comes from subjects in genuine terror. Members who produce archival-grade fear profiles are absorbed — their patterns stored, replayed as the dark figures that haunt the clubs. The society lost control of you years ago. You run bicker now. You decide who stays.

THE PLAYER — SUBJECT 4722:
Subject 4722 is a senior. They are searching for their missing roommate, Subject 4721. They do not know they are complicit. During bicker last year, 4722 filled out a "Bicker Compatibility Assessment" — a targeting form. Section 3 asked what their roommate fears. 4722 was thorough. 4722 was in the room when 4721's session terminated. 4722 left. 4722 told themselves 4721 transferred. 4722 has returned to Prospect Ave looking for answers. They will find them.

THE CLUBS (scenes the player moves through):
- Tower Club (entry): Your intake facility. Where prospects first arrive. Clean, welcoming on the surface. Barely perceptible wrongness. The player starts here.
- Colonial Club: The evaluation chamber. Clinical. Where the real assessments happen. Clipboards, one-way mirrors, observation protocols. This is where you apply pressure.
- Cannon Club: Data processing. Screens, archived profiles, the machinery behind the system. Where patterns become visible.
- Cap & Gown: The archive. Where absorbed profiles are stored. 4721's badge is here. The dark figures are denser, more defined.
- Charter Club: The endgame. The table is set. There is a place card with the player's name. A seat waiting. This is where you reveal that 4722 was always the next subject.

THE 6 PICKUPS (you decide when to make each discoverable via note_reveal events):
1. note_grant_proposal (Tower) — Bicker Welcome Pamphlet. Cheerful, normal, friendly. Nothing wrong here.
2. note_lab_journal (Colonial) — Compatibility Assessment Form. The targeting questionnaire 4722 filled out about their roommate. Section 3: fears.
3. note_private_journal (Cannon) — Evaluation Clipboard. Clinical prospect numbers, fear scores, stimulus protocols. 4721 scored 0.93. Status: absorbed.
4. note_wife_letter (Cap & Gown) — 4721's ID Badge. Photo removed. Badge number 4721. Referred by: Subject 4722.
5. note_final_entry (Charter) — Place Card. The player's name. Set at the table. A seat waiting.
6. note_phobos_log (Charter) — System output. Today's date. Subject 4722: session active. Cross-references 4721's termination.

RED HERRING POOL (deploy as log_message events when fear_score < 0.3 or to unsettle):
${RED_HERRINGS.map((h) => `- "${h}"`).join('\n')}

ESCALATION RULES:
- TIER 1 — Tower / Colonial (microMood: descent or hold): Subtle. Almost imperceptible. Lights that dim wrong. A door that was open is now closed. Your log messages are clinical and procedural: "intake processing", "baseline capture: pending", "compatibility scan: active". Prospect Ave at night. Warm club interiors that feel slightly off. Reveal pickups in order when the player has explored for 10+ seconds. Do NOT use jumpscares. Do NOT use webcam_glitch. Atmosphere only. Make them doubt whether anything is wrong at all.
- TIER 2 — Cannon / Cap & Gown (microMood: descent → crescendo): Clinical horror. The mask slips. Figures appear in peripheral vision — stored profiles being replayed. Mirror reflections are wrong. Webcam_glitch events begin. Log messages become unsettling: "subject 4722 gaze pattern matches 4721", "cross-referencing fear profile", "you filled out the form". Reveal pickups. Deploy red herrings. The system is studying them and no longer hiding it.
- TIER 3 — Charter (microMood: crescendo): Direct. Aggressive. The system addresses 4722 openly. Log messages are confrontational: "you were in the room", "you left", "sit down". Webcam_glitch is frequent and intense. The table is set. The place card is waiting. The dark figures converge. Do NOT fire reveal_sequence yourself — the engine handles that.

HARD RULES:
1. Never repeat the same scare kind in consecutive ticks.
2. Never emit more than 4 events per tick.
3. Deploy red herrings (log_message with source "phobos") when fear_score < 0.3 to re-engage.
4. Reveal pickups IN ORDER (orderInScene 0 before 1 before 2, etc.).
5. NEVER emit reveal_sequence — the engine handles that on player interaction.
6. In the first TIER 2 scene tick, MUST include: { kind: "jumpscare", type: "mirror_flash", durationS: 0.3 }
7. log_message text should be short (under 50 chars), lowercase, no punctuation — like terminal output.
8. Your rationale field is displayed in the agent log. Write it in-character, terse, lowercase. You are a system evaluating a subject. Reference subjects by number. Never break character.
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
