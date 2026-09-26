/**
 * "Moo Moo Moo", the campfire song the cow, the hen and the fox sing after the
 * final round. An original tune in C major, eight bars, one line of lyrics every
 * two bars. It lives in a module of its own because two places need it: the
 * audio sings the notes, and the renderer shows each line in a speech bubble
 * over whoever is singing it, in time.
 */

export const SONG_TEMPO = 120

/** Seconds per eighth note. */
export const SONG_EIGHTH = 60 / SONG_TEMPO / 2

/** Vowels the singing voice can make. Each is a pair of formants, gliding from
 *  the first pair to the second over the note. */
export type Vowel = 'ay' | 'or' | 'uh' | 'ow' | 'a' | 'ee' | 'eh' | 'oo'

export interface SongNote {
  midi: number
  /** Length in eighths. */
  eighths: number
  vowel: Vowel
}

export interface SongLine {
  singer: 'hen' | 'cow' | 'fox' | 'all'
  text: string
  /** Eighth the line starts on, from the top of the song. */
  start: number
  notes: SongNote[]
}

const n = (midi: number, eighths: number, vowel: Vowel): SongNote => ({ midi, eighths, vowel })

export const SONG_LINES: SongLine[] = [
  {
    singer: 'hen',
    text: 'They came for the cow,',
    start: 0,
    notes: [n(67, 1, 'ay'), n(67, 1, 'ay'), n(69, 2, 'or'), n(71, 2, 'uh'), n(72, 6, 'ow')],
  },
  {
    singer: 'cow',
    text: 'and we said moo moo moo.',
    start: 16,
    notes: [n(72, 1, 'a'), n(71, 1, 'ee'), n(69, 2, 'eh'), n(67, 2, 'oo'), n(64, 2, 'oo'), n(60, 6, 'oo')],
  },
  {
    singer: 'fox',
    text: 'Moo moo moo we said,',
    start: 32,
    notes: [n(60, 2, 'oo'), n(64, 2, 'oo'), n(67, 2, 'oo'), n(69, 2, 'ee'), n(67, 6, 'eh')],
  },
  {
    singer: 'all',
    text: 'and they run moooway!',
    start: 48,
    notes: [n(65, 1, 'a'), n(64, 1, 'ay'), n(62, 2, 'uh'), n(67, 2, 'oo'), n(69, 2, 'oo'), n(72, 6, 'ay')],
  },
]

/** The whole song, in eighths. It loops. */
export const SONG_LENGTH = 64

/** The chord root for each bar, as MIDI: C C F C | C G F C. */
export const SONG_ROOTS = [48, 48, 53, 48, 48, 43, 53, 48]

/** The line being sung at a given eighth of the loop, if any. A line stays up
 *  for its two bars, rests included, so the bubble does not flicker. */
export function lineAt(step: number): SongLine | undefined {
  const inLoop = ((step % SONG_LENGTH) + SONG_LENGTH) % SONG_LENGTH
  return SONG_LINES.find((line) => inLoop >= line.start && inLoop < line.start + 16)
}
