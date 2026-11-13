import { BONUS } from "@/lib/slot/symbols";
import type { Grid } from "@/lib/slot/types";

export const REEL_SOUND_URLS = {
  loop: "/slot/music/reel-spin-v1.wav",
  stop: "/slot/music/reel-stop-v1.wav",
  bonus: "/slot/music/reel-bonus-stop-v1.wav",
} as const;
export type ReelLanding = { spinId: number; reel: number; bonus: boolean };
const listeners = new Set<(event: ReelLanding) => void>();

// Runs in the same presentation callback that stops the visible reel.
export function notifyReelLanding(spinId: number, grid: Grid, reel: number) {
  listeners.forEach(listener => listener({ spinId, reel, bonus: grid[reel]?.includes(BONUS) ?? false }));
}
export function subscribeReelLandings(listener: (event: ReelLanding) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

type Voice = { source: AudioBufferSourceNode; gain: GainNode; pan?: StereoPannerNode };
type Load = (url: string) => Promise<AudioBuffer>;

/** Presentation only. Stores no results and never changes reel timing. */
export class ReelSounds {
  private spin: number | null = null;
  private stopped = new Set<number>();
  private loops = new Map<number, Voice>();
  private shots = new Set<Voice>();
  private active = false;
  private disposed = false;
  private revision = 0;
  private buffers = new Map<string, AudioBuffer>();

  constructor(private context: AudioContext, private output: GainNode, private load: Load) {}

  preload() {
    for (const url of Object.values(REEL_SOUND_URLS)) {
      void this.load(url).then(buffer => { if (!this.disposed) this.buffers.set(url, buffer); }).catch(() => {});
    }
  }

  setSpin(spin: number | null) {
    if (spin === this.spin) return;
    this.clear();
    this.spin = spin;
    this.stopped.clear();
    void this.start();
  }

  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    this.clear();
    if (active) { this.preload(); void this.start(); }
  }

  private voice(buffer: AudioBuffer, reel: number, volume: number): Voice {
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    const pan = this.context.createStereoPanner?.();
    if (pan) {
      pan.pan.value = (reel - 2) * 0.1;
      gain.connect(pan);
      pan.connect(this.output);
    } else gain.connect(this.output);
    const voice = { source, gain, pan };
    source.onended = () => {
      source.disconnect(); gain.disconnect(); pan?.disconnect();
      this.shots.delete(voice);
    };
    return voice;
  }

  private async start() {
    if (!this.active || this.spin === null) return;
    const revision = this.revision, spin = this.spin;
    try {
      const buffer = await this.load(REEL_SOUND_URLS.loop);
      if (!this.active || revision !== this.revision || spin !== this.spin ||
        this.context.state !== "running") return;
      for (let reel = 0; reel < 5; reel++) {
        if (this.stopped.has(reel) || this.loops.has(reel)) continue;
        const voice = this.voice(buffer, reel, 0);
        voice.source.loop = true;
        voice.gain.gain.setValueAtTime(0, this.context.currentTime);
        voice.gain.gain.linearRampToValueAtTime(.47, this.context.currentTime + .025);
        this.loops.set(reel, voice);
        voice.source.start(0, (reel * .067) % buffer.duration);
      }
    } catch { /* Missing optional sound never blocks the reels. */ }
  }

  land({ spinId, reel, bonus }: ReelLanding) {
    if (spinId !== this.spin || this.stopped.has(reel)) return;
    this.stopped.add(reel); // Remember stops even while muted or hidden.
    const loop = this.loops.get(reel);
    if (loop) {
      this.stop(loop, .012);
      this.loops.delete(reel);
    }
    if (!this.active || this.context.state !== "running") return;
    // Never play a late landing after an asset download finishes.
    const buffer = this.buffers.get(bonus ? REEL_SOUND_URLS.bonus : REEL_SOUND_URLS.stop);
    if (!buffer) return;
    const voice = this.voice(buffer, reel, 1);
    this.shots.add(voice);
    voice.source.start();
  }

  private stop(voice: Voice, fade = 0) {
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(fade ? voice.gain.gain.value : 0, now);
    if (fade) voice.gain.gain.linearRampToValueAtTime(0, now + fade);
    try { voice.source.stop(now + fade); } catch { /* Already ended. */ }
  }

  private clear() {
    ++this.revision;
    this.loops.forEach(voice => this.stop(voice));
    this.shots.forEach(voice => this.stop(voice));
    this.loops.clear(); this.shots.clear();
  }

  dispose() {
    this.disposed = true;
    this.active = false; this.spin = null;
    this.clear(); this.buffers.clear();
  }
}
