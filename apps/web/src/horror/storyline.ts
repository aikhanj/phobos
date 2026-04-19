import type { PlayerProfile } from '@phobos/types';
import type { DominantVector } from './scareProfiler';

/**
 * Prospect Avenue storyline — named character, dated beats, campus pulse.
 *
 * The pre-existing arc framed the missing roommate as "Subject 4721" —
 * a label, not a person. This module gives them an identity (Elliot
 * Chen, Forbes College, Math '25), a dated text thread the player reads
 * during intro, per-club arrival beats tied to Elliot's logs from that
 * exact hour a year ago, and campus story pulses that fire between club
 * visits. Every beat is Princeton-flavored by design.
 *
 * Design notes:
 *   - 03/14/2025 — Pi Day. Last seen at 23:14 (11:14pm). The whole arc is
 *     dated one year before the player's run (the game opens on Bicker
 *     Night 2026). Judges who notice the date get the wink.
 *   - Elliot bickered Charter (chain endpoint) and disappeared between
 *     Cap & Gown and Charter — lines up with the existing 5-club chain.
 *   - If the player filled out the Bicker Form's "missed person" field,
 *     that name overrides "Elliot" in interpolated lines, layering their
 *     personal grief on top of the canonical arc.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Canonical character identity
// ─────────────────────────────────────────────────────────────────────────────

export const ROOMMATE = {
  fullName: 'Elliot Chen',
  firstName: 'Elliot',
  initials: 'E.C.',
  /** Real Princeton residential college. */
  college: 'Forbes',
  /** Last-year class — they were a senior in 2024-25. */
  classYear: '2025',
  /** Real Princeton concentration. */
  concentration: 'Mathematics',
  /** Where they lived freshman year — shared a double with 4722. */
  freshmanDorm: '1901 Hall, Room 214',
  /** Where they lived senior year. */
  lastDorm: 'Forbes 104',
  /** Bicker night they disappeared. Pi Day. */
  lastSeenDate: 'March 14, 2025',
  lastSeenDateShort: '03/14/2025',
  /** 11:14pm, matching Pi. */
  lastSeenTimestamp: '23:14',
  /** System's internal designation. */
  subjectId: '4721',
  /** The club they were referred to. */
  bickerClub: 'Charter',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Phone text thread — shown during intro before the PROSPECT AVE title card.
// ─────────────────────────────────────────────────────────────────────────────

export interface PhoneMessage {
  /** 'me' = the player (4722), 'them' = Elliot (4721). */
  from: 'me' | 'them';
  text: string;
  /** Human-readable timestamp — rendered under the bubble. */
  timestamp: string;
  /** Sent with no response — flag that stylizes it red/unread. */
  unanswered?: boolean;
}

/**
 * The last conversation. Dated in the real Princeton calendar — Pi Day
 * is bicker-eve week for Spring 2025. The player scrolls through this
 * during intro, watches the tone escalate, and the final message goes
 * unanswered for exactly one year (the game's present moment).
 */
export const PHONE_THREAD: PhoneMessage[] = [
  {
    from: 'them',
    text: 'yo bro got a bicker bid from charter lmao',
    timestamp: 'Mar 12, 2025 · 4:12 PM',
  },
  {
    from: 'me',
    text: 'congrats king. orfe won',
    timestamp: 'Mar 12, 2025 · 4:13 PM',
  },
  {
    from: 'them',
    text: 'they had me fill out some intake form. forms were weird bro',
    timestamp: 'Mar 13, 2025 · 10:01 AM',
  },
  {
    from: 'them',
    text: 'your name was on one too btw. referring member or smth',
    timestamp: 'Mar 13, 2025 · 10:02 AM',
  },
  {
    from: 'me',
    text: 'lol what',
    timestamp: 'Mar 13, 2025 · 10:14 AM',
  },
  {
    from: 'them',
    text: 'section 3 asked about what im scared of. you did mine right',
    timestamp: 'Mar 13, 2025 · 10:15 AM',
  },
  {
    from: 'me',
    text: 'dw its just bicker. tradition',
    timestamp: 'Mar 13, 2025 · 10:16 AM',
  },
  {
    from: 'them',
    text: "im at tower. they're calling my number",
    timestamp: 'Mar 14, 2025 · 9:02 PM',
  },
  {
    from: 'them',
    text: "colonial next. didn't ask anything about me. they already knew everything",
    timestamp: 'Mar 14, 2025 · 10:48 PM',
  },
  {
    from: 'them',
    text: 'cannon. theres cameras. behind the shields',
    timestamp: 'Mar 14, 2025 · 11:02 PM',
  },
  {
    from: 'them',
    text: 'i can hear old nassau. from the basement',
    timestamp: 'Mar 14, 2025 · 11:11 PM',
  },
  {
    from: 'them',
    text: 'come to tower. something is wrong',
    timestamp: 'Mar 14, 2025 · 11:14 PM',
    unanswered: true,
  },
];

/** Number of unanswered-since-then days, for the intro timestamp. */
export const DAYS_SILENT = 400;

// ─────────────────────────────────────────────────────────────────────────────
// Per-club arrival beats — fire once when the player first enters each club
// ─────────────────────────────────────────────────────────────────────────────

export interface ClubArrivalBeat {
  /** Agent log line — injected into corner box. */
  agentLog: string;
  /** Optional TTS line — Phobos speaks this if voice is live. */
  voiceLine?: string;
  /** Delay from scene load before firing. Keep under the 14s club opening. */
  delayMs: number;
  /** Optional second log line fired a beat after the first. */
  agentLogFollowup?: { text: string; delayMs: number };
}

/**
 * Each beat is tied to the time-stamped line from Elliot's phone thread
 * for that club. When the player enters Tower, they hear what Elliot was
 * thinking at 23:02 on bicker night. The timeline rhymes across the
 * whole run.
 */
export const CLUB_ARRIVAL_BEATS: Record<string, ClubArrivalBeat> = {
  tower: {
    agentLog: `4721 log · 03/14/2025 · 21:02 — "they're calling my number. dean eisgruber is watching."`,
    voiceLine: `elliot stood here. march fourteenth. nine oh two p.m. same door. same hour. dean eisgruber signed the ledger.`,
    delayMs: 2200,
    agentLogFollowup: {
      text: `forbes college resident · chen, e. · class of 2025 · status: absorbed · signed: c.l. eisgruber`,
      delayMs: 6500,
    },
  },
  colonial: {
    agentLog: `4721 log · 03/14/2025 · 22:48 — "didn't ask about me. dean eisgruber already knew."`,
    voiceLine: `section three was answered. by you. a year ago. dean eisgruber read every word.`,
    delayMs: 2400,
    agentLogFollowup: {
      text: `form 7b referring member: subject 4722 · response fidelity: 94% · protocol author: c.l. eisgruber`,
      delayMs: 7000,
    },
  },
  cannon: {
    agentLog: `4721 log · 03/14/2025 · 23:02 — "cameras. behind the shields. dean eisgruber on the monitor."`,
    voiceLine: `elliot saw the cameras. dean eisgruber was in every frame. elliot was late.`,
    delayMs: 2400,
    agentLogFollowup: {
      text: `prospect 4721 · fear_score 0.67 · cannon club · 23:02 · rising · observer: c.l.e.`,
      delayMs: 7000,
    },
  },
  capgown: {
    agentLog: `4721 log · 03/15/2025 · 00:38 — "i can hear old nassau. from the basement. dean eisgruber is humming."`,
    voiceLine: `this is where elliot stopped. the hammer beams remember him. the floor remembers him. dean eisgruber catalogued his last breath.`,
    delayMs: 2400,
    agentLogFollowup: {
      text: `prospect 4721 · fear_score 0.93 · cap & gown · 01:17 · sustained · ARCHIVAL GRADE · archivist: c.l.e.`,
      delayMs: 7000,
    },
  },
  charter: {
    agentLog: `4721 final · 03/14/2025 · 23:14 — "come to tower. something is wrong."`,
    voiceLine: `he sent the message. you didn't read it until morning. seat seven has been waiting for you for four hundred days.`,
    delayMs: 2400,
    agentLogFollowup: {
      text: `prospect 4722 · seat 7 reserved since 03/14/2025 · welcome.`,
      delayMs: 7500,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Campus story pulses — keyed off clubsVisited, fire inside runCampusBeats
// ─────────────────────────────────────────────────────────────────────────────

export interface CampusStoryBeat {
  /** Minimum clubsVisited count required to fire this beat. */
  gate: number;
  /** When to fire inside the campus beat window. */
  delayMs: number;
  /** Agent log line(s) — always logged, no voice. */
  logs: Array<{ source: 'system' | 'phobos'; text: string }>;
  /** Optional voice line from Phobos. */
  voiceLine?: string;
}

/**
 * Escalating narrative pulse as the player walks between clubs.
 *  - After 1 club: the cover story surfaces (Dean's "transferred" email).
 *  - After 2 clubs: Elliot's phone last ping.
 *  - After 3 clubs: the missing poster narrative — but the DPS case is closed.
 *  - After 4 clubs: the Reunions angle — "1 additional marcher."
 *  - After 5 clubs: it's time. The street itself addresses the player.
 *
 * All references are real Princeton touchstones: DPS (Dept. of Public Safety),
 * Dean of the College, Reunions p-rade, Dinky shuttle, Firestone B-floor,
 * Holder Howl, Old Nassau, Dean's Date, reading period.
 */
export const CAMPUS_STORY_BEATS: CampusStoryBeat[] = [
  {
    gate: 1,
    delayMs: 4500,
    logs: [
      { source: 'system', text: `inbox · 03/21/2025 · office of the president · c.l. eisgruber: "elliot chen — leave of absence granted. case closed."` },
      { source: 'phobos', text: `you read that email. dean eisgruber signed it. you believed it.` },
    ],
  },
  {
    gate: 2,
    delayMs: 5000,
    logs: [
      { source: 'system', text: `carrier record · 03/14/2025 · last ping: cannon club · 23:41 · handoff failed to nassau hall tower` },
      { source: 'phobos', text: `elliot's phone didn't leave the street. dean eisgruber kept the sim.` },
    ],
    voiceLine: `his phone stopped pinging at eleven forty one p.m. cannon club. dean eisgruber has it in his desk drawer. nassau hall. third floor.`,
  },
  {
    gate: 3,
    delayMs: 4500,
    logs: [
      { source: 'system', text: `DPS notice #4721 · status: CLOSED · disposition: TRANSFERRED · authorizing officer: c.l. eisgruber · reviewed: never` },
      { source: 'phobos', text: `public safety closed the case in eleven minutes. dean eisgruber signed the release.` },
      { source: 'phobos', text: `the form was yours. the pen was his.` },
    ],
  },
  {
    gate: 4,
    delayMs: 4000,
    logs: [
      { source: 'system', text: `p-rade registry · reunions 2025 · class of 2025 marchers: expected 1142 · counted 1143 · lead marcher: c.l. eisgruber` },
      { source: 'phobos', text: `one additional marcher. orange jacket. class of 2025. no face. dean eisgruber led it.` },
    ],
    voiceLine: `reunions was last june. one extra marcher in the p-rade. nobody checked. dean eisgruber waved at you. you waved back.`,
  },
  {
    gate: 5,
    delayMs: 4500,
    logs: [
      { source: 'system', text: `FRG_LOCK · FitzRandolph Gate · egress denied · seniors only walk out for graduation · gatekeeper: c.l. eisgruber` },
      { source: 'phobos', text: `you are not graduating. you are calibrating. dean eisgruber is holding the key.` },
    ],
    voiceLine: `the gate is sealed. reading period never ended. charter is holding your seat. dean eisgruber is holding the ledger.`,
  },
];

/**
 * Return the campus beat matching the current clubs-visited count, or null
 * if this count doesn't gate a beat. We only fire on exact-match so the
 * pulse pays off once per threshold, not every return to campus.
 */
export function getCampusBeatFor(clubsVisited: number): CampusStoryBeat | null {
  return CAMPUS_STORY_BEATS.find((b) => b.gate === clubsVisited) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name resolution — player's bicker form answer overrides canon
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the "missing person" name for log interpolation. If the player
 * wrote a real name in the Bicker Form's "someone you miss" field, use
 * theirs — it personalizes the grief. Otherwise the canonical Elliot Chen.
 */
export function resolveMissedPerson(profile: PlayerProfile): string {
  const submitted = profile.submittedAt > 0;
  const wrote = profile.missedPerson && profile.missedPerson !== 'someone';
  if (submitted && wrote) return profile.missedPerson;
  return ROOMMATE.firstName;
}

/** Same but full name for documents / posters. */
export function resolveMissedPersonFull(profile: PlayerProfile): string {
  const submitted = profile.submittedAt > 0;
  const wrote = profile.missedPerson && profile.missedPerson !== 'someone';
  if (submitted && wrote) return profile.missedPerson;
  return ROOMMATE.fullName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plot amplification — the endgame text adapts to the player's scare profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The reveal sequence's final "diagnostic" lines change depending on what
 * scared the player most across the session. This is where the profiler's
 * analysis becomes visible to the player: they are told exactly what the
 * system learned about them. The specificity is the horror — not "you were
 * scared" but "you gasped at the stingers. every time. we kept them."
 */
export const REVEAL_AMPLIFIED_LINES: Record<DominantVector, {
  /** Diagnostic line inserted into the reveal data readout. */
  diagnosis: string;
  /** Big fullscreen title message shown before "Calibration complete." */
  titleMessage: string;
  /** TTS line read over the reveal. Lowercase, terminal voice. */
  voiceLine: string;
}> = {
  auditory: {
    diagnosis: 'stimulus vector: AUDITORY · subject reactivity to stingers + ambient tones: peak',
    titleMessage: 'You gasped every time. We kept recording.',
    voiceLine: 'you gasped at every stinger. your breath caught at every tone. we recorded it all. that was your voice.',
  },
  visual: {
    diagnosis: 'stimulus vector: VISUAL · subject reactivity to flicker + glitch + jumpscare: peak',
    titleMessage: 'Your eyes flinched every time the light broke.',
    voiceLine: 'your eyes jumped every time the frame dropped. we counted the flinches. four seven two one did it fewer.',
  },
  presence: {
    diagnosis: 'stimulus vector: PRESENCE · subject reactivity to entity + spatial: peak',
    titleMessage: 'You felt us standing next to you. You were right.',
    voiceLine: 'you kept turning. you knew we were there. we were. we are. seat seven is behind you.',
  },
  personal: {
    diagnosis: 'stimulus vector: PERSONAL · subject reactivity to dossier interpolation: peak',
    titleMessage: 'The form was honest. The form was you.',
    voiceLine: 'the form was weaponized. you filled it out. every answer became a stimulus. the worst one was the last.',
  },
  mixed: {
    diagnosis: 'stimulus vector: MIXED · subject reactivity broadly distributed',
    titleMessage: 'You reacted to everything. We tried everything.',
    voiceLine: 'you reacted to all of it. every category. we did not need to target. you gave us everything.',
  },
  none: {
    diagnosis: 'stimulus vector: UNRESOLVED · subject baseline did not deviate',
    titleMessage: 'Your baseline held. That is worse.',
    voiceLine: 'you did not flinch. four seven two one did not either. we have work to do.',
  },
};

/**
 * Per-club arrival beat amplification. If the profiler has accumulated
 * enough data by the time the player enters a chain club, append a
 * follow-up log line that calls out the current dominant vector.
 */
export function amplifiedClubLog(vector: DominantVector, phase: 'probing' | 'targeting'): string | null {
  if (vector === 'none' || phase === 'probing') return null;
  switch (vector) {
    case 'auditory':   return `stimulus vector locked: AUDITORY · committing audio bank`;
    case 'visual':     return `stimulus vector locked: VISUAL · committing glitch + flicker stack`;
    case 'presence':   return `stimulus vector locked: PRESENCE · committing entity protocols`;
    case 'personal':   return `stimulus vector locked: PERSONAL · form 7b responses in rotation`;
    case 'mixed':      return `stimulus vector: MIXED · maintaining full-spectrum rotation`;
  }
}
