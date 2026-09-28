import type { SongNote, Vowel } from './song'

/**
 * Bedtime: what the hen, the cow and a saucer's pilot say when the screen-time
 * limit is up, and the lullaby they sing after it. It loops for as long as the
 * page stays open. Like the campfire song, it lives in a module of its own
 * because the audio sings the notes and the renderer shows each line in a
 * bubble over whoever is singing it, in time.
 *
 * An original tune in C major, in 3/4: six eighths to the bar, two bars to a
 * line. The three spoken lines use the same notes-and-vowels machinery, said
 * rather than sung: quicker notes, each falling in pitch like speech, and no
 * music box underneath.
 */

export const LULLABY_TEMPO = 76

/** Seconds per eighth note. */
export const LULLABY_EIGHTH = 60 / LULLABY_TEMPO / 2

export const LULLABY_BAR = 6

export interface LullabyLine {
  singer: 'hen' | 'cow' | 'alien' | 'all'
  text: string
  /** Said, not sung. */
  spoken: boolean
  /** Eighth the line starts on, from the top of the loop. */
  start: number
  notes: SongNote[]
}

const n = (midi: number, eighths: number, vowel: Vowel): SongNote => ({ midi, eighths, vowel })

/** Each line owns two bars: its notes, then a rest to the end of the second. */
export const LINE_LENGTH = LULLABY_BAR * 2

export const LULLABY_LINES: LullabyLine[] = [
  {
    singer: 'hen',
    text: "You've played enough for today!",
    spoken: true,
    start: 0,
    notes: [n(69, 1, 'oo'), n(69, 1, 'ay'), n(67, 1, 'ee'), n(69, 1, 'uh'), n(67, 1, 'or'), n(65, 1, 'oo'), n(64, 3, 'ay')],
  },
  {
    singer: 'cow',
    text: "It's time to go to sleep now.",
    spoken: true,
    start: 12,
    notes: [n(67, 1, 'ee'), n(67, 1, 'ay'), n(65, 1, 'oo'), n(69, 2, 'ow'), n(67, 1, 'oo'), n(65, 2, 'ee'), n(64, 2, 'ow')],
  },
  {
    singer: 'alien',
    text: 'Even we aliens go to bed. Goodnight!',
    spoken: true,
    start: 24,
    notes: [n(69, 1, 'ee'), n(67, 1, 'eh'), n(67, 1, 'ee'), n(69, 1, 'ay'), n(67, 1, 'ow'), n(65, 1, 'oo'), n(67, 1, 'eh'), n(72, 1, 'oo'), n(67, 3, 'ay')],
  },
  // A bar's rest, eighths 36–41, while the music box comes in.
  {
    singer: 'hen',
    text: 'Hush now, close your eyes,',
    spoken: false,
    start: 42,
    notes: [n(67, 2, 'uh'), n(64, 2, 'ow'), n(69, 2, 'or'), n(67, 2, 'or'), n(64, 4, 'ay')],
  },
  {
    singer: 'cow',
    text: 'the moon is in the sky,',
    spoken: false,
    start: 54,
    notes: [n(65, 1, 'uh'), n(69, 3, 'oo'), n(67, 2, 'ee'), n(65, 1, 'ee'), n(64, 1, 'uh'), n(62, 4, 'ay')],
  },
  {
    singer: 'alien',
    text: 'the saucers all fly home,',
    spoken: false,
    start: 66,
    notes: [n(67, 1, 'uh'), n(72, 2, 'or'), n(71, 1, 'uh'), n(69, 2, 'or'), n(67, 2, 'ay'), n(64, 4, 'ow')],
  },
  {
    singer: 'all',
    text: 'goodnight, sleep tight.',
    spoken: false,
    start: 78,
    notes: [n(67, 2, 'oo'), n(64, 4, 'ay'), n(62, 2, 'ee'), n(60, 4, 'ay')],
  },
  // A bar's rest, eighths 90–95, then round again.
]

/** The whole loop, in eighths. */
export const LULLABY_LENGTH = 96

/** The music box's chord root for each bar, as MIDI, or null for the spoken
 *  part, which goes unaccompanied. */
export const LULLABY_ROOTS: (number | null)[] = [
  null, null, null, null, null, null,
  48,
  48, 48,
  53, 43,
  48, 48,
  45, 48,
  48,
]

/** The line being said or sung at a given eighth of the loop, if any. A line
 *  stays up for its two bars, rests included, so the bubble does not flicker. */
export function lullabyLineAt(step: number): LullabyLine | undefined {
  const inLoop = ((step % LULLABY_LENGTH) + LULLABY_LENGTH) % LULLABY_LENGTH
  return LULLABY_LINES.find((line) => inLoop >= line.start && inLoop < line.start + LINE_LENGTH)
}
