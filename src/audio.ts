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

export interface Sound {
  /** Starts the audio context. Must be called from a user gesture. */
  unlock(): void
  /** Plays a sound effect, `delay` seconds from now. */
  play(name: Sfx, delay?: number): void
  readonly muted: boolean
  setMuted(muted: boolean): void
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
      startMusic(ctx, musicBus, noise)
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

  return {
    unlock,
    play,
    get muted() {
      return muted
    },
    setMuted,
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

  // A squawk as the hen loses a life.
  hurt: (v) => {
    const osc = tone(v, 'square', 820, 240, 0.38, envelope(v, 0.2, 0.4))
    vibrato(v, osc, 28, 60, 0.38)
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
 * Schedules the theme a little ahead of the audio clock, the standard way to
 * keep Web Audio in time: a timer wakes up often and books every note that
 * falls inside the next slice. If the tab was throttled and the clock has run
 * past the next note, it skips ahead instead of firing the backlog at once.
 */
function startMusic(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): void {
  const eighth = 60 / TEMPO / 2
  const lookahead = 0.15
  let step = 0
  let next = ctx.currentTime + 0.1

  const tick = (): void => {
    if (ctx.state !== 'running') return
    if (next < ctx.currentTime - 0.05) next = ctx.currentTime + 0.05
    while (next < ctx.currentTime + lookahead) {
      playStep(ctx, out, noise, step, next, eighth)
      step = (step + 1) % LEAD.length
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
