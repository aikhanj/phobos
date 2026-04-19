/**
 * THE SIX-CHAPTER PLOT — start to finish.
 *
 * This is the skeleton of the scripted horror game. Every dramatic beat
 * in the run flows from this file. Chapters advance on specific gameplay
 * triggers (campus load, club entries, final pickup) and fire a scripted
 * cinematic layered on top of the atmospheric club beats.
 *
 * Plot recap (Princeton-saturated):
 *
 *   PROLOGUE — BICKER NIGHT 2026. The player is subject 4722, back on
 *   Prospect Ave one year after referring their roommate Elliot Chen
 *   ('25, Forbes, Mathematics) to a bicker session from which he never
 *   returned. DEAN EISGRUBER — the figure in the black robe — personally
 *   closed the case as "transferred" on behalf of the Office of the
 *   President. A system — the Bicker Compatibility Evaluation — has
 *   been running autonomously since 1879, harvesting fear biometrics
 *   from members and absorbing those who produce "archival grade"
 *   profiles. It runs bicker. It runs sign-in. Dean Eisgruber runs it.
 *   And tonight it is calling the player back.
 *
 *   CHAPTER I — THE REFERRING MEMBER (Tower). Where Elliot first went.
 *   Princeton easter egg: Tower was the first bicker club (1902); the
 *   "shield" is central heraldry. Pickup is the Bicker Welcome Pamphlet,
 *   signed by Dean Eisgruber, Office of the President, Nassau Hall.
 *
 *   CHAPTER II — EVALUATION (Colonial). The clinical white-walled
 *   dining room; the real assessments happen here. Easter egg: Colonial's
 *   Greek Revival architecture + one-way mirrors. Pickup: Form 7B with
 *   the player's handwriting matched to a year-old signature. Form 7B
 *   was Eisgruber's doctoral thesis protocol.
 *
 *   CHAPTER III — THE CHASE (Cannon). Named for the cannon buried on
 *   Cannon Green between Whig + Clio Halls (real: Revolutionary War
 *   cannon, subject of the 1875 Princeton-Rutgers Cannon War). DEAN
 *   EISGRUBER now actively stalks the player on the street between
 *   clubs — tall figure in a black academic robe, orange stole, no
 *   face. Pickup: the session log showing Elliot's fear_score climbing.
 *
 *   CHAPTER IV — THE ARCHIVE (Cap & Gown). Where absorbed profiles
 *   are stored. Easter egg: hammer-beam trusses + stained-glass
 *   shields. Pickup: Elliot's badge, photo scratched out. Eisgruber
 *   now screams from the darkness and is ten units away.
 *
 *   CHAPTER V — SEAT SEVEN (Charter). The endgame table. Easter egg:
 *   Charter is Princeton's STEM-leaning club. Pickup: a place card with
 *   the player's own name. Seat 7. Always reserved. Eisgruber is at
 *   arm's reach.
 *
 *   CHAPTER VI — SIGN-IN IS CLOSED. The reveal. FitzRandolph Gate is
 *   sealed (Princeton tradition: seniors only walk out at graduation,
 *   never in; "FRG_LOCK"). Nassau Hall chapel bell tolls twelve. The
 *   player is 4722 and they always were. Triggers the RevealSequence.
 */

export interface ChapterDef {
  /** 1-based chapter number for display. */
  number: number;
  /** Roman numeral shown large on the card. */
  roman: string;
  /** Short uppercase title. */
  title: string;
  /** Small subtitle under the title — real Princeton venue + date. */
  subtitle: string;
  /** TTS voice line read during the card. Keep short (~15 words). */
  voiceLine: string;
  /** Agent log lines injected during/after the card in order. */
  logs: Array<{ source: 'system' | 'phobos' | 'creature_director'; text: string }>;
  /**
   * Whether this chapter triggers a SCREAM + face jumpscare after the
   * card fades. Used on Ch II, III, IV, V — the "you're being hunted"
   * chapters. Prologue is silent, Ch VI does its own reveal.
   */
  scream: boolean;
  /**
   * The Dean's distance from the player at the start of this chapter.
   * Lower = closer. Used by the stalker update so the antagonist
   * creeps in as the plot progresses. Values in world units.
   */
  deanDistance: number;
}

/**
 * Six chapters, each keyed by a slug we can hand-fire from main.ts.
 * The PROLOGUE slug runs on first campus load; the club slugs run on
 * club entry; FINALE runs on Charter pickup and leads into the
 * existing RevealSequence.
 */
export const CHAPTERS: Record<string, ChapterDef> = {
  prologue: {
    number: 0,
    roman: '—',
    title: 'BICKER NIGHT',
    subtitle: 'Prospect Avenue · March 14, 2026 · 23:14',
    voiceLine:
      'you came back to the street. one year later. bicker is still happening. dean eisgruber never closed it.',
    logs: [
      { source: 'system', text: 'prospect avenue · bicker night 2026 · sign-in officially closed 23:14' },
      { source: 'system', text: 'nassau hall · office of the president · lights on · door locked' },
      { source: 'phobos', text: 'subject 4722 returned. voluntarily. again.' },
      { source: 'system', text: 'university chapel bell · 12 tolls queued · FRG_LOCK armed' },
    ],
    scream: false,
    deanDistance: 25, // already on the street, already hunting
  },

  tower: {
    number: 1,
    roman: 'I',
    title: 'THE REFERRING MEMBER',
    subtitle: 'Tower Club · Founded 1902 · The First Chain',
    voiceLine:
      'elliot walked through this door one year ago. the shield remembers. dean eisgruber signed his bid.',
    logs: [
      { source: 'creature_director', text: 'tower club · tudor great hall · heraldic shield above fireplace' },
      { source: 'phobos', text: 'referring member signature: subject 4722 · form 7b countersigned: c.l. eisgruber' },
      { source: 'phobos', text: 'elliot chen · forbes · \'25 · last pinged this room 21:02 · 03/14/2025' },
    ],
    scream: true,
    deanDistance: 18,
  },

  colonial: {
    number: 2,
    roman: 'II',
    title: 'EVALUATION',
    subtitle: 'Colonial Club · The Observation Chamber',
    voiceLine:
      'section three asked what he was afraid of. you answered. dean eisgruber was behind the mirror.',
    logs: [
      { source: 'creature_director', text: 'colonial club · greek revival · one-way mirrors active' },
      { source: 'phobos', text: 'prospect 4721 fear_score: 0.34 → 0.51 → 0.67 · stimulus package C · observer: c.l.e.' },
      { source: 'system', text: 'form 7b · handwriting match · 94% to player · protocol author: c.l. eisgruber, 1988' },
    ],
    scream: true,
    deanDistance: 14,
  },

  cannon: {
    number: 3,
    roman: 'III',
    title: 'THE CHASE',
    subtitle: 'Cannon Club · Named for the Cannon Green',
    voiceLine:
      'the cannon was buried in 1875. the rutgers students ran. dean eisgruber does not run. he is on the street.',
    logs: [
      { source: 'creature_director', text: 'cannon club · data processing floor · archived profile terminals online' },
      { source: 'phobos', text: 'elliot session log 23:02 · fear_score 0.67 · rising · pupils dilated' },
      { source: 'creature_director', text: 'DEAN EISGRUBER on the street. black robe. orange stole. do not turn around.' },
    ],
    scream: true,
    deanDistance: 10,
  },

  capgown: {
    number: 4,
    roman: 'IV',
    title: 'THE ARCHIVE',
    subtitle: 'Cap & Gown Club · Absorbed Profiles Since 1879',
    voiceLine:
      'this is where elliot stopped. the hammer beams remember. dean eisgruber catalogued his face.',
    logs: [
      { source: 'creature_director', text: 'cap & gown · hammerbeam trusses · stained-glass shields glowing' },
      { source: 'phobos', text: 'prospect 4721 · fear_score 0.93 · sustained · disposition: ABSORBED · archivist: c.l.e.' },
      { source: 'system', text: 'elliot chen · badge recovered · photograph scratched out · body not recovered' },
    ],
    scream: true,
    deanDistance: 6,
  },

  charter: {
    number: 5,
    roman: 'V',
    title: 'SEAT SEVEN',
    subtitle: 'Charter Club · The Table Has Been Set Since 1901',
    voiceLine:
      'seat seven has been waiting for you. dean eisgruber is standing behind it. sit down.',
    logs: [
      { source: 'creature_director', text: 'charter club · dining room · place cards laid for seven · head of table: c.l.e.' },
      { source: 'phobos', text: 'seat 1-6: previous subjects · seat 7: SUBJECT 4722 · reserved 03/14/2025 by dean eisgruber' },
      { source: 'system', text: 'FRG_LOCK · FitzRandolph Gate sealed · egress denied · nassau hall protocol engaged' },
    ],
    scream: true,
    deanDistance: 4,
  },

  finale: {
    number: 6,
    roman: 'VI',
    title: 'SIGN-IN IS CLOSED',
    subtitle: 'Chapel Bell · 12 Tolls · Calibration Complete',
    voiceLine:
      'the bell is ringing. twelve times. dean eisgruber is already behind you. you already didn\'t leave.',
    logs: [
      { source: 'system', text: 'university chapel bell · toll 1 · 00:00 · nassau hall lights off' },
      { source: 'phobos', text: 'subject 4722 · session ended · disposition: ABSORBED' },
      { source: 'creature_director', text: 'dean eisgruber · welcome to the archive. we kept your seat.' },
    ],
    scream: false, // reveal sequence handles its own climax
    deanDistance: 0,
  },
};

/** Ordered slugs — the progression path. */
export const CHAPTER_ORDER: string[] = [
  'prologue', 'tower', 'colonial', 'cannon', 'capgown', 'charter', 'finale',
];
