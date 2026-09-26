import { SONG_EIGHTH, SONG_LENGTH, SONG_LINES, SONG_ROOTS, type SongLine, type SongNote, type Vowel } from './song'

/**
 * Every sound in the game, and the music, synthesised at run time with the
 * browser's Web Audio API. There are no audio files, for the same reasons there
 * are no image files: nothing to load, nothing to license, and the whole
 * soundtrack is one file that can be read top to bottom. The theme is an
 * original tune written for this game, so there is no royalty question to ask.
 *
 * Browsers will not start audio before the page has had a click or a key
 * press, so nothing here makes a sound until `unlock` has been called from one.
 */

export type Sfx =
  | 'throw'
  | 'heavyThrow'
  | 'splat'
  | 'superSplat'
  | 'explosion'
  | 'bigExplosion'
  | 'laser'
  | 'zap'
  | 'burp'
  | 'moo'
  | 'longMoo'
  | 'hurt'
  | 'powerUp'
  | 'extraLife'
  | 'bossHit'
  | 'bonk'
  | 'wave'
  | 'freeze'
  | 'heart'
  | 'gramophone'
  | 'fox'
  | 'blackHole'
  | 'wipe'
  | 'bossDemand'
  | 'henNever'
  | 'shieldHit'
  | 'sadTrombone'

/** The background tunes: the theme, the mothership's march on boss rounds, the
 *  campfire song at the end, and nothing at all. */
export type Track = 'theme' | 'boss' | 'song' | 'silence'

export interface Sound {
  /** Starts the audio context. Must be called from a user gesture. */
  unlock(): void
  /** Plays a sound effect, `delay` seconds from now. */
  play(name: Sfx, delay?: number): void
  readonly muted: boolean
  setMuted(muted: boolean): void
  /** Switches the background tune. The new one starts from its top. */
  setTrack(track: Track): void
}

const MASTER_VOLUME = 0.7
const MUSIC_VOLUME = 0.16
const SFX_VOLUME = 0.55

/** The shortest gap allowed between two plays of the same effect. A gramophone
 *  finale pops thirty saucers in one frame; thirty explosions summed at once
 *  is a click and then clipping, not a bigger bang. */
const MIN_GAP: Partial<Record<Sfx, number>> = {
  throw: 0.05,
  splat: 0.04,
  explosion: 0.06,
  laser: 0.06,
  zap: 0.04,
  bossHit: 0.05,
  bonk: 0.05,
}

export function createSound(startMuted: boolean): Sound {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let sfxBus: GainNode | null = null
  let musicBus: GainNode | null = null
  let noise: AudioBuffer | null = null
  let muted = startMuted
  const lastPlayed = new Map<Sfx, number>()
  // Shared with the music scheduler, which reads it on every tick.
  const music = { track: 'theme' as Track, changed: false }

  function unlock(): void {
    if (ctx === null) {
      const Context = window.AudioContext
      if (Context === undefined) return
      ctx = new Context()
      master = ctx.createGain()
      master.gain.value = MASTER_VOLUME
      master.connect(ctx.destination)
      sfxBus = ctx.createGain()
      sfxBus.gain.value = SFX_VOLUME
      sfxBus.connect(master)
      musicBus = ctx.createGain()
      musicBus.gain.value = MUSIC_VOLUME
      musicBus.connect(master)
      noise = whiteNoise(ctx)
      startMusic(ctx, musicBus, noise, music)
    }
    // Muted means suspended: the music scheduler runs off the context's clock,
    // so a stopped clock pauses the tune in place rather than piling notes up.
    if (muted) void ctx.suspend()
    else void ctx.resume()
  }

  function play(name: Sfx, delay = 0): void {
    if (muted || ctx === null || sfxBus === null || noise === null) return
    if (ctx.state !== 'running') return
    const now = ctx.currentTime
    const gap = MIN_GAP[name]
    if (gap !== undefined && now - (lastPlayed.get(name) ?? -1) < gap) return
    lastPlayed.set(name, now)
    EFFECTS[name]({ ctx, out: sfxBus, noise, t: now + delay })
  }

  function setMuted(next: boolean): void {
    muted = next
    if (ctx === null) return
    if (muted) void ctx.suspend()
    else void ctx.resume()
  }

  function setTrack(track: Track): void {
    if (music.track === track) return
    music.track = track
    music.changed = true
  }

  return {
    unlock,
    play,
    get muted() {
      return muted
    },
    setMuted,
    setTrack,
  }
}

// --- building blocks -------------------------------------------------------

export interface Voice {
  ctx: AudioContext
  out: AudioNode
  noise: AudioBuffer
  /** Start time, in the context's clock. */
  t: number
}

export function whiteNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** A gain node that rises to `peak` almost at once and decays to silence over
 *  `length` seconds. Nearly every effect is shaped by one of these. */
function envelope(v: Voice, peak: number, length: number, attack = 0.005): GainNode {
  const gain = v.ctx.createGain()
  gain.gain.setValueAtTime(0.0001, v.t)
  gain.gain.exponentialRampToValueAtTime(peak, v.t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, v.t + length)
  gain.connect(v.out)
  return gain
}

/** One oscillator gliding from `from` to `to` Hz, into `into`. */
function tone(
  v: Voice,
  type: OscillatorType,
  from: number,
  to: number,
  length: number,
  into: AudioNode,
  start = 0,
): OscillatorNode {
  const osc = v.ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(from, v.t + start)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), v.t + start + length)
  osc.connect(into)
  osc.start(v.t + start)
  osc.stop(v.t + start + length + 0.05)
  return osc
}

/** A burst of filtered noise, with the filter swept from `from` to `to`. */
function hiss(
  v: Voice,
  filter: BiquadFilterType,
  from: number,
  to: number,
  length: number,
  into: AudioNode,
  q = 1,
): void {
  const source = v.ctx.createBufferSource()
  source.buffer = v.noise
  source.loop = true
  const shape = v.ctx.createBiquadFilter()
  shape.type = filter
  shape.Q.value = q
  shape.frequency.setValueAtTime(from, v.t)
  shape.frequency.exponentialRampToValueAtTime(Math.max(1, to), v.t + length)
  source.connect(shape)
  shape.connect(into)
  source.start(v.t, Math.random() * 0.5)
  source.stop(v.t + length + 0.05)
}

/** Wobbles an oscillator's pitch by `depth` Hz at `rate` Hz. */
function vibrato(v: Voice, osc: OscillatorNode, rate: number, depth: number, length: number): void {
  const lfo = v.ctx.createOscillator()
  lfo.frequency.value = rate
  const amount = v.ctx.createGain()
  amount.gain.value = depth
  lfo.connect(amount)
  amount.connect(osc.frequency)
  lfo.start(v.t)
  lfo.stop(v.t + length + 0.05)
}

/** A moo: a sawtooth sliding down through a vowel-ish formant, so it reads as a
 *  throat rather than a synthesiser. */
function moo(v: Voice, length: number, peak: number): void {
  const formant = v.ctx.createBiquadFilter()
  formant.type = 'bandpass'
  formant.frequency.setValueAtTime(420, v.t)
  formant.frequency.linearRampToValueAtTime(700, v.t + length * 0.3)
  formant.frequency.linearRampToValueAtTime(380, v.t + length)
  formant.Q.value = 2.2
  const gain = v.ctx.createGain()
  gain.gain.setValueAtTime(0.0001, v.t)
  gain.gain.exponentialRampToValueAtTime(peak, v.t + 0.12)
  gain.gain.setValueAtTime(peak, v.t + length * 0.75)
  gain.gain.exponentialRampToValueAtTime(0.0001, v.t + length)
  formant.connect(gain)
  gain.connect(v.out)

  const osc = v.ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(128, v.t)
  osc.frequency.linearRampToValueAtTime(152, v.t + length * 0.25)
  osc.frequency.exponentialRampToValueAtTime(96, v.t + length)
  osc.connect(formant)
  vibrato(v, osc, 5.5, 3, length)
  osc.start(v.t)
  osc.stop(v.t + length + 0.05)
}

/**
 * One cluck: a buzzy sawtooth pushed through a nasal formant that closes as it
 * goes, with a breath of noise on the attack. The pitch jumps up at the start
 * and falls away, which is most of what makes it a hen rather than a duck.
 */
function cluck(v: Voice, start: number, length: number, from: number, to: number, peak: number): void {
  const at = { ...v, t: v.t + start }
  const formant = at.ctx.createBiquadFilter()
  formant.type = 'bandpass'
  formant.Q.value = 3
  formant.frequency.setValueAtTime(1700, at.t)
  formant.frequency.exponentialRampToValueAtTime(900, at.t + length)
  formant.connect(envelope(at, peak, length, 0.008))

  const osc = at.ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(from * 0.8, at.t)
  osc.frequency.exponentialRampToValueAtTime(from * 1.25, at.t + Math.min(0.03, length * 0.3))
  osc.frequency.exponentialRampToValueAtTime(to, at.t + length)
  osc.connect(formant)
  if (length > 0.2) vibrato(at, osc, 24, 30, length)
  osc.start(at.t)
  osc.stop(at.t + length + 0.05)

  hiss(at, 'bandpass', 3000, 1500, Math.min(0.05, length), envelope(at, peak * 0.4, Math.min(0.06, length)), 1.5)
}

/**
 * A voice saying something: a buzzing source pushed through two formant
 * filters that glide from vowel to vowel, one syllable at a time, with a burst
 * of noise for each consonant. It says nothing a listener could transcribe, but
 * the rhythm and the vowels carry the line well enough next to its bubble.
 */
interface Syllable {
  /** Seconds from the start of the line, and how long the vowel is held. */
  at: number
  length: number
  /** Pitch at the start and end of the syllable, in Hz. */
  from: number
  to: number
  /** First and second formants of the vowel, at its start and its end. */
  f1: [number, number]
  f2: [number, number]
  /** A consonant ahead of the vowel: a noise burst through this filter, or none. */
  consonant?: { type: BiquadFilterType; freq: number; length: number }
}

function speak(v: Voice, syllables: Syllable[], source: OscillatorType, peak: number, into: AudioNode = v.out): void {
  for (const s of syllables) {
    const at = { ...v, t: v.t + s.at, out: into }
    if (s.consonant !== undefined) {
      hiss(at, s.consonant.type, s.consonant.freq, s.consonant.freq * 0.8, s.consonant.length, envelope(at, peak * 0.5, s.consonant.length + 0.01, 0.003), 2)
    }
    const vowel = { ...at, t: at.t + (s.consonant?.length ?? 0) }
    const out = envelope(vowel, peak, s.length, 0.02)
    for (const [start, end] of [s.f1, s.f2]) {
      const formant = vowel.ctx.createBiquadFilter()
      formant.type = 'bandpass'
      formant.Q.value = 6
      formant.frequency.setValueAtTime(start, vowel.t)
      formant.frequency.linearRampToValueAtTime(end, vowel.t + s.length)
      formant.connect(out)
      const osc = tone(vowel, source, s.from, s.to, s.length, formant)
      vibrato(vowel, osc, 5, s.from * 0.02, s.length)
    }
  }
}

/** Notes as MIDI numbers, so a tune can be written as a list of small integers. */
function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// --- the effects -----------------------------------------------------------

/** Exported, with `playStep` and `whiteNoise`, so they can be rendered offline
 *  and measured; nothing in the game calls them directly. */
export const EFFECTS: Record<Sfx, (v: Voice) => void> = {
  // A small "pip" as an egg leaves the hand.
  throw: (v) => {
    tone(v, 'sine', 520, 980, 0.07, envelope(v, 0.12, 0.08))
  },

  // Anything bigger than an egg: a rising whoosh.
  heavyThrow: (v) => {
    hiss(v, 'bandpass', 300, 2400, 0.35, envelope(v, 0.3, 0.38, 0.03), 2)
    tone(v, 'triangle', 160, 420, 0.3, envelope(v, 0.2, 0.32, 0.02))
  },

  // An egg on a windscreen: a wet slap with a soft thump under it.
  splat: (v) => {
    hiss(v, 'lowpass', 2600, 240, 0.2, envelope(v, 0.6, 0.22))
    tone(v, 'sine', 210, 70, 0.12, envelope(v, 0.45, 0.14))
  },

  // The super egg: the same slap, huge, twice, with a boom under it.
  superSplat: (v) => {
    hiss(v, 'lowpass', 4000, 160, 0.8, envelope(v, 0.9, 0.85))
    hiss(v, 'lowpass', 2200, 140, 0.6, envelope({ ...v, t: v.t + 0.09 }, 0.7, 0.65))
    tone(v, 'sine', 140, 32, 0.7, envelope(v, 0.9, 0.75))
  },

  explosion: (v) => {
    hiss(v, 'lowpass', 1500, 90, 0.5, envelope(v, 0.55, 0.52))
    tone(v, 'sine', 110, 34, 0.4, envelope(v, 0.55, 0.42))
  },

  bigExplosion: (v) => {
    hiss(v, 'lowpass', 2600, 60, 1.5, envelope(v, 0.95, 1.55, 0.01))
    tone(v, 'sine', 90, 24, 1.2, envelope(v, 0.95, 1.25, 0.01))
    tone(v, 'square', 60, 28, 0.6, envelope(v, 0.18, 0.62))
  },

  // Bzzz: a sawtooth chopped by a fast square wave, falling slightly.
  laser: (v) => {
    const out = envelope(v, 0.2, 0.26, 0.01)
    const chop = v.ctx.createGain()
    chop.gain.value = 0.5
    const lfo = v.ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = 48
    const depth = v.ctx.createGain()
    depth.gain.value = 0.5
    lfo.connect(depth)
    depth.connect(chop.gain)
    lfo.start(v.t)
    lfo.stop(v.t + 0.3)
    const band = v.ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1400
    band.Q.value = 0.8
    chop.connect(band)
    band.connect(out)
    tone(v, 'sawtooth', 190, 120, 0.24, chop)
  },

  // An egg meeting a laser: a short electric crack.
  zap: (v) => {
    tone(v, 'square', 1500, 260, 0.1, envelope(v, 0.16, 0.11))
    hiss(v, 'highpass', 3000, 1200, 0.08, envelope(v, 0.2, 0.09))
  },

  // The cow's burp: a low, fluttering sawtooth that sags as it goes.
  burp: (v) => {
    const length = 0.85
    const lowpass = v.ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.setValueAtTime(900, v.t)
    lowpass.frequency.linearRampToValueAtTime(420, v.t + length)
    lowpass.Q.value = 6
    const out = envelope(v, 0.9, length, 0.03)
    const flutter = v.ctx.createGain()
    flutter.gain.value = 0.6
    const lfo = v.ctx.createOscillator()
    lfo.frequency.value = 19
    const depth = v.ctx.createGain()
    depth.gain.value = 0.4
    lfo.connect(depth)
    depth.connect(flutter.gain)
    lfo.start(v.t)
    lfo.stop(v.t + length + 0.05)
    lowpass.connect(flutter)
    flutter.connect(out)
    const osc = tone(v, 'sawtooth', 98, 58, length, lowpass)
    vibrato(v, osc, 11, 9, length)
  },

  moo: (v) => moo(v, 0.85, 0.5),

  // The abduction: "Moooooooooo", fading as the cow goes up.
  longMoo: (v) => moo(v, 2.1, 0.55),

  // The hen losing a life: "buk-buk-BAWK!", two short clucks and a squawk.
  hurt: (v) => {
    cluck(v, 0, 0.07, 560, 470, 0.35)
    cluck(v, 0.11, 0.07, 580, 480, 0.35)
    cluck(v, 0.24, 0.34, 760, 520, 0.5)
  },

  powerUp: (v) => {
    const notes = [72, 76, 79, 84]
    notes.forEach((note, i) => {
      const start = { ...v, t: v.t + i * 0.07 }
      tone(start, 'square', hz(note), hz(note), 0.09, envelope(start, 0.12, 0.12))
    })
  },

  extraLife: (v) => {
    const notes = [79, 84, 88, 91, 96]
    notes.forEach((note, i) => {
      const start = { ...v, t: v.t + i * 0.08 }
      tone(start, 'triangle', hz(note), hz(note), 0.12, envelope(start, 0.28, 0.16))
    })
  },

  // An egg on the mothership's hull: a dull metal clank.
  bossHit: (v) => {
    const out = envelope(v, 0.3, 0.3)
    tone(v, 'square', 310, 260, 0.28, out)
    tone(v, 'triangle', 467, 400, 0.28, out)
    hiss(v, 'lowpass', 1800, 300, 0.12, envelope(v, 0.4, 0.14))
  },

  // An egg punting a toy.
  bonk: (v) => {
    tone(v, 'triangle', 240, 110, 0.09, envelope(v, 0.35, 0.11))
  },

  // A gravity wave leaving the hen: a deep wub.
  wave: (v) => {
    const osc = tone(v, 'sine', 150, 40, 0.55, envelope(v, 0.6, 0.6, 0.02))
    vibrato(v, osc, 9, 14, 0.55)
  },

  // Time stopping: a glassy fall with a shimmer on top.
  freeze: (v) => {
    tone(v, 'sine', 1800, 300, 0.9, envelope(v, 0.2, 0.95, 0.01))
    tone(v, 'triangle', 2400, 900, 0.7, envelope(v, 0.1, 0.75, 0.01))
    hiss(v, 'highpass', 6000, 2500, 0.8, envelope(v, 0.08, 0.85, 0.05))
  },

  // The heart bursting: a soft major chord swelling in.
  heart: (v) => {
    for (const note of [72, 76, 79]) {
      tone(v, 'triangle', hz(note), hz(note), 0.9, envelope(v, 0.14, 0.95, 0.12))
    }
  },

  // A radioactive fox dropped: a burst of Geiger clicks and a short yip.
  fox: (v) => {
    for (let i = 0; i < 14; i++) {
      const click = { ...v, t: v.t + Math.random() * 0.45 }
      hiss(click, 'highpass', 4000, 3500, 0.006, envelope(click, 0.5, 0.008, 0.001), 0.8)
    }
    const yip = tone(v, 'sawtooth', 900, 600, 0.13, envelope(v, 0.16, 0.15, 0.01))
    vibrato(v, yip, 30, 80, 0.13)
  },

  // The black hole opening: a deep swirling fall that takes a couple of
  // seconds to bottom out, for as long as the fleet takes to go in.
  blackHole: (v) => {
    const length = 2.2
    const low = tone(v, 'sine', 110, 26, length, envelope(v, 0.8, length, 0.08))
    vibrato(v, low, 3, 12, length)
    hiss(v, 'lowpass', 1400, 70, length, envelope(v, 0.45, length, 0.1), 3)
    const whirl = tone(v, 'triangle', 420, 90, length * 0.8, envelope(v, 0.12, length * 0.8, 0.05))
    vibrato(v, whirl, 7, 60, length * 0.8)
  },

  // The mothership's wiper: a rubber squeak across the glass and back.
  wipe: (v) => {
    const one = tone(v, 'sine', 1500, 2300, 0.2, envelope(v, 0.12, 0.22, 0.02))
    vibrato(v, one, 40, 70, 0.2)
    const back = { ...v, t: v.t + 0.3 }
    const two = tone(back, 'sine', 2200, 1500, 0.2, envelope(back, 0.1, 0.22, 0.02))
    vibrato(back, two, 40, 70, 0.2)
  },

  // The mothership's opening demand, "Give us the cow now!": a deep, slow voice
  // run through a ring modulator, which is what makes it an alien one.
  bossDemand: (v) => {
    const ring = v.ctx.createGain()
    ring.gain.value = 0
    const carrier = v.ctx.createOscillator()
    carrier.frequency.value = 38
    carrier.connect(ring.gain)
    carrier.start(v.t)
    carrier.stop(v.t + 2.2)
    ring.connect(v.out)
    const dry = v.ctx.createGain()
    dry.gain.value = 0.6
    dry.connect(v.out)
    const both = v.ctx.createGain()
    both.connect(ring)
    both.connect(dry)
    speak(
      v,
      [
        { at: 0, length: 0.2, from: 96, to: 92, f1: [300, 320], f2: [2200, 2000], consonant: { type: 'lowpass', freq: 500, length: 0.04 } },
        { at: 0.28, length: 0.18, from: 92, to: 88, f1: [640, 600], f2: [1200, 1300], consonant: undefined },
        { at: 0.5, length: 0.12, from: 90, to: 88, f1: [500, 500], f2: [1500, 1500], consonant: { type: 'highpass', freq: 3500, length: 0.07 } },
        { at: 0.74, length: 0.42, from: 100, to: 84, f1: [800, 380], f2: [1400, 900], consonant: { type: 'bandpass', freq: 1800, length: 0.05 } },
        { at: 1.28, length: 0.62, from: 94, to: 66, f1: [800, 380], f2: [1500, 900], consonant: { type: 'lowpass', freq: 300, length: 0.06 } },
      ],
      'sawtooth',
      0.5,
      both,
    )
  },

  // The hen's answer, "Never!": two clucky syllables, the second a squawk that
  // rises before it breaks.
  henNever: (v) => {
    speak(
      v,
      [
        { at: 0, length: 0.14, from: 560, to: 620, f1: [450, 480], f2: [1900, 1800], consonant: { type: 'lowpass', freq: 600, length: 0.04 } },
        { at: 0.22, length: 0.36, from: 700, to: 520, f1: [520, 460], f2: [1500, 1300], consonant: { type: 'bandpass', freq: 2500, length: 0.04 } },
      ],
      'sawtooth',
      // Loud next to the other effects' peaks, because the narrow formants throw
      // most of the sawtooth away: this comes out at about a quarter.
      0.9,
    )
  },

  // The shield taking a hit: a glassy ping.
  shieldHit: (v) => {
    tone(v, 'sine', 1500, 900, 0.25, envelope(v, 0.3, 0.28, 0.003))
    tone(v, 'triangle', 2250, 1500, 0.18, envelope(v, 0.12, 0.2, 0.003))
  },

  // The beaten fleet leaving: "wah, wah, wah, waaah" on a muted trombone.
  sadTrombone: (v) => {
    const notes = [
      [58, 0, 0.42],
      [57, 0.48, 0.42],
      [56, 0.96, 0.42],
      [55, 1.44, 1.3],
    ] as const
    for (const [note, start, length] of notes) {
      const at = { ...v, t: v.t + start }
      const wah = at.ctx.createBiquadFilter()
      wah.type = 'lowpass'
      wah.Q.value = 5
      wah.frequency.setValueAtTime(350, at.t)
      wah.frequency.linearRampToValueAtTime(1300, at.t + Math.min(0.2, length / 2))
      wah.frequency.linearRampToValueAtTime(500, at.t + length)
      wah.connect(envelope(at, 0.5, length, 0.04))
      const osc = tone(at, 'sawtooth', hz(note), hz(note) * (length > 1 ? 0.97 : 1), length, wah)
      if (length > 1) vibrato(at, osc, 6, 4, length)
    }
  },

  // The gramophone plays its three seconds: a scratchy little waltz.
  gramophone: (v) => {
    const tune = [67, 72, 76, 74, 72, 71, 72, 76, 79, 77, 76, 74]
    const beat = 0.24
    tune.forEach((note, i) => {
      const start = { ...v, t: v.t + i * beat }
      tone(start, 'triangle', hz(note), hz(note), beat * 0.9, envelope(start, 0.18, beat * 0.95, 0.01))
    })
    hiss(v, 'bandpass', 3200, 3000, tune.length * beat, envelope(v, 0.03, tune.length * beat, 0.05), 0.7)
  },
}

// --- the theme -------------------------------------------------------------

/**
 * "Hoedown in Orbit", an original eight-bar loop written for this game: a
 * bouncing root-and-fifth bass, a square-wave fiddle line over C, Am, F, G, and
 * a kick, snare and hat underneath. One entry per eighth note; 0 is a rest.
 */
const TEMPO = 132
const LEAD: number[] = [
  76, 79, 84, 79, 76, 79, 81, 79,
  76, 0, 72, 74, 76, 0, 74, 72,
  77, 81, 84, 81, 77, 81, 79, 77,
  74, 0, 79, 0, 71, 72, 74, 0,
  76, 79, 84, 79, 76, 79, 81, 79,
  76, 0, 72, 74, 76, 0, 74, 72,
  77, 81, 84, 81, 77, 81, 79, 77,
  74, 76, 74, 71, 72, 0, 0, 0,
]
/** One entry per quarter note. */
const BASS: number[] = [
  48, 43, 48, 43,
  45, 40, 45, 40,
  41, 48, 41, 48,
  43, 50, 43, 50,
  48, 43, 48, 43,
  45, 40, 45, 40,
  41, 48, 41, 48,
  43, 50, 48, 36,
]

/**
 * "Mothership March", for boss rounds: an original eight-bar loop in D minor,
 * slower than the theme. A villain's three-note motif, a chromatic slide down
 * in bar four that is doing its best to be menacing, an oom-pah tuba bass, a
 * timpani on the one, and a woodblock that gives the game away.
 */
const BOSS_TEMPO = 108
const BOSS_LEAD: number[] = [
  62, 0, 62, 65, 64, 0, 61, 0,
  62, 0, 0, 0, 57, 0, 58, 57,
  62, 0, 62, 65, 64, 0, 61, 0,
  69, 0, 68, 0, 67, 0, 66, 0,
  65, 0, 65, 69, 67, 0, 64, 0,
  65, 0, 0, 0, 60, 0, 61, 62,
  70, 0, 69, 0, 67, 65, 64, 61,
  62, 0, 57, 0, 50, 0, 0, 0,
]
const BOSS_BASS: number[] = [
  38, 45, 38, 45,
  34, 41, 33, 40,
  38, 45, 38, 45,
  33, 40, 33, 40,
  41, 48, 41, 48,
  36, 43, 37, 44,
  43, 38, 45, 40,
  38, 33, 38, 0,
]

/** Formants for the singing voice: where each vowel starts and ends. */
const VOWELS: Record<Vowel, { f1: [number, number]; f2: [number, number] }> = {
  ay: { f1: [500, 350], f2: [1800, 2300] },
  or: { f1: [550, 450], f2: [900, 800] },
  uh: { f1: [550, 550], f2: [1300, 1300] },
  ow: { f1: [750, 380], f2: [1300, 850] },
  a: { f1: [750, 700], f2: [1700, 1600] },
  ee: { f1: [300, 300], f2: [2300, 2300] },
  eh: { f1: [550, 500], f2: [1800, 1850] },
  oo: { f1: [340, 320], f2: [850, 800] },
}

/** Who sings in what register and on what source: the hen high and buzzy, the
 *  cow low and reedy, the fox in between. "All" is the three at once. */
const VOICES: Record<'hen' | 'cow' | 'fox', { shift: number; source: OscillatorType; peak: number }> = {
  hen: { shift: 12, source: 'square', peak: 0.35 },
  cow: { shift: -12, source: 'sawtooth', peak: 0.6 },
  fox: { shift: 0, source: 'sawtooth', peak: 0.45 },
}

/** Which note, if any, starts on each eighth of the song, and who sings it. */
const SONG_NOTES = new Map<number, { note: SongNote; line: SongLine }>()
for (const line of SONG_LINES) {
  let at = line.start
  for (const note of line.notes) {
    SONG_NOTES.set(at, { note, line })
    at += note.eighths
  }
}

/** One eighth of "Moo Moo Moo". Exported to be rendered offline and measured. */
export function playSongStep(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, step: number, t: number, eighth: number): void {
  const v: Voice = { ctx, out, noise, t }

  const sung = SONG_NOTES.get(step)
  if (sung !== undefined) {
    const { note, line } = sung
    const length = note.eighths * eighth * 0.92
    const vowel = VOWELS[note.vowel]
    const singers = line.singer === 'all' ? (['hen', 'cow', 'fox'] as const) : [line.singer]
    for (const singer of singers) {
      const voice = VOICES[singer]
      const pitch = hz(note.midi + voice.shift)
      speak(v, [{ at: 0, length, from: pitch, to: pitch, f1: vowel.f1, f2: vowel.f2 }], voice.source, voice.peak / singers.length)
    }
    // A plucked doubling, so the tune is clear under the vowels.
    tone(v, 'triangle', hz(note.midi), hz(note.midi), 0.18, envelope(v, 0.16, 0.22, 0.003))
  }

  // Oom-pah: the root on one and three, a stab of the chord on two and four,
  // and a shaker on every eighth.
  const root = SONG_ROOTS[Math.floor(step / 8)] ?? 48
  const beat = step % 8
  if (beat === 0 || beat === 4) tone(v, 'triangle', hz(root - 12), hz(root - 12), eighth * 1.6, envelope(v, 0.55, eighth * 1.8, 0.01))
  if (beat === 2 || beat === 6) {
    for (const interval of [12, 16, 19]) {
      tone(v, 'triangle', hz(root + interval), hz(root + interval), eighth * 0.8, envelope(v, 0.07, eighth * 0.9, 0.005))
    }
  }
  hiss(v, 'highpass', 7000, 6000, 0.03, envelope(v, beat % 2 === 0 ? 0.06 : 0.1, 0.04), 0.7)
}

/**
 * Schedules the music a little ahead of the audio clock, the standard way to
 * keep Web Audio in time: a timer wakes up often and books every note that
 * falls inside the next slice. If the tab was throttled and the clock has run
 * past the next note, it skips ahead instead of firing the backlog at once. A
 * change of tune starts the new one from its top on the next slice.
 */
function startMusic(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, music: { track: Track; changed: boolean }): void {
  const lookahead = 0.15
  let step = 0
  let next = ctx.currentTime + 0.1

  const tick = (): void => {
    if (ctx.state !== 'running') return
    if (music.changed) {
      music.changed = false
      step = 0
      next = ctx.currentTime + 0.05
    }
    if (next < ctx.currentTime - 0.05) next = ctx.currentTime + 0.05
    if (music.track === 'silence') {
      next = ctx.currentTime + 0.05
      return
    }
    const eighth = music.track === 'boss' ? 60 / BOSS_TEMPO / 2 : music.track === 'song' ? SONG_EIGHTH : 60 / TEMPO / 2
    const length = music.track === 'boss' ? BOSS_LEAD.length : music.track === 'song' ? SONG_LENGTH : LEAD.length
    while (next < ctx.currentTime + lookahead) {
      if (music.track === 'boss') playBossStep(ctx, out, noise, step, next, eighth)
      else if (music.track === 'song') playSongStep(ctx, out, noise, step, next, eighth)
      else playStep(ctx, out, noise, step, next, eighth)
      step = (step + 1) % length
      next += eighth
    }
  }
  window.setInterval(tick, 25)
}

export function playStep(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, step: number, t: number, eighth: number): void {
  const v: Voice = { ctx, out, noise, t }

  const lead = LEAD[step] ?? 0
  if (lead !== 0) {
    const gain = envelope(v, 0.16, eighth * 0.95, 0.008)
    const osc = tone(v, 'square', hz(lead), hz(lead), eighth * 0.9, gain)
    vibrato(v, osc, 6, 2.5, eighth)
  }

  if (step % 2 === 0) {
    const bass = BASS[step / 2] ?? 0
    if (bass !== 0) tone(v, 'triangle', hz(bass), hz(bass), eighth * 1.8, envelope(v, 0.5, eighth * 1.9, 0.01))
  }

  // Kick on one and three, snare on two and four, a hat on every off-beat.
  const beat = step % 8
  if (beat === 0 || beat === 4) tone(v, 'sine', 140, 45, 0.12, envelope(v, 0.7, 0.14))
  if (beat === 2 || beat === 6) hiss(v, 'bandpass', 1800, 1200, 0.1, envelope(v, 0.25, 0.11), 0.8)
  if (step % 2 === 1) hiss(v, 'highpass', 8000, 7000, 0.03, envelope(v, 0.09, 0.035), 0.7)
}

/** One eighth of "Mothership March". Exported, like `playStep`, to be rendered
 *  offline and measured. */
export function playBossStep(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, step: number, t: number, eighth: number): void {
  const v: Voice = { ctx, out, noise, t }

  // The lead doubled an octave down on a sawtooth, which is the ominous half.
  const lead = BOSS_LEAD[step] ?? 0
  if (lead !== 0) {
    const osc = tone(v, 'square', hz(lead), hz(lead), eighth * 0.85, envelope(v, 0.13, eighth * 0.95, 0.01))
    vibrato(v, osc, 4.5, 3, eighth)
    const low = v.ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 900
    low.connect(envelope(v, 0.14, eighth * 0.95, 0.02))
    tone(v, 'sawtooth', hz(lead - 12), hz(lead - 12), eighth * 0.9, low)
  }

  // Tuba: a stubby, muffled sawtooth, oom on the beat and pah on the next.
  if (step % 2 === 0) {
    const bass = BOSS_BASS[step / 2] ?? 0
    if (bass !== 0) {
      const muffle = v.ctx.createBiquadFilter()
      muffle.type = 'lowpass'
      muffle.frequency.value = 420
      muffle.Q.value = 3
      muffle.connect(envelope(v, 0.55, eighth * 1.1, 0.015))
      tone(v, 'sawtooth', hz(bass) * 0.98, hz(bass), eighth, muffle)
    }
  }

  // Timpani on the one, a thud on the three, and the woodblock on the offbeats.
  const beat = step % 8
  if (beat === 0) tone(v, 'sine', 110, 48, 0.4, envelope(v, 0.75, 0.45, 0.005))
  if (beat === 4) tone(v, 'sine', 90, 45, 0.18, envelope(v, 0.45, 0.2))
  if (beat === 3 || beat === 7) tone(v, 'triangle', 1250, 1150, 0.04, envelope(v, 0.18, 0.05, 0.002))
}
