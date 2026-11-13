// Presentation only: never calls game actions or changes outcomes.
import { SOUND_URLS, type SoundEffect } from "./slotSounds";
import { ReelSounds, type ReelLanding } from "./reelSounds";
import { DigSounds } from "./digSounds";
export type MusicTrack = "main" | "bonus";
export type MusicStatus = "ready" | "loading" | "playing" | "effects" | "off" | "error";
export const MUSIC_URLS: Record<MusicTrack, string> = {
  main: "/slot/music/excavation-main-140-v1.mp3",
  bonus: "/slot/music/excavation-bonus-decisive-136-v1.mp3",
};
export const musicForPhase = (phase: string): MusicTrack =>
  ["bonus-won", "bonus", "super", "bonus-end"].includes(phase) ? "bonus" : "main";

type Voice = { track: MusicTrack; source: AudioBufferSourceNode; gain: GainNode };
type LegacyWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class SlotMusicPlayer {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private transitionBus?: GainNode;
  private transitionVisible = true;
  private effect?: AudioBufferSourceNode;
  private effectRevision = 0;
  private reels?: ReelSounds;
  private digging?: DigSounds;
  private reelSpin: number | null = null;
  private reelLandings = new Map<number, ReelLanding>();
  private voice?: Voice;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private abort = new AbortController();
  private revision = 0;
  private disposed = false;
  private track: MusicTrack = "main";
  private visible = true;
  private enabled = true;
  private status: MusicStatus = "ready";

  constructor(private notify: (status: MusicStatus) => void, private sharedContext?: AudioContext) {}

  setTransitionVisible(visible: boolean, seconds = .75) {
    const starting = visible && !this.transitionVisible;
    this.transitionVisible = visible;
    if (starting && this.voice) {
      this.voice.source.stop();
      this.voice = undefined;
      void this.sync();
    }
    const context = this.context, gain = this.transitionBus?.gain;
    if (!context || !gain) return;
    gain.cancelScheduledValues(context.currentTime);
    gain.setValueAtTime(gain.value, context.currentTime);
    gain.linearRampToValueAtTime(visible ? 1 : 0, context.currentTime + seconds);
  }

  private report(status: MusicStatus) {
    if (this.disposed || this.status === status) return;
    this.status = status;
    this.notify(status);
  }

  setTrack(track: MusicTrack) {
    if (track === this.track) return;
    this.track = track;
    void this.sync();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    void this.sync();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    void this.sync();
  }

  setReelSpin(spin: number | null) {
    if (spin === this.reelSpin) return;
    this.reelSpin = spin;
    this.reelLandings.clear();
    this.reels?.setSpin(spin);
  }

  landReel(event: ReelLanding) {
    if (event.spinId !== this.reelSpin) return;
    this.reelLandings.set(event.reel, event);
    this.reels?.land(event);
  }

  // Called synchronously from an actual click/key gesture (including Safari).
  activate() {
    if (this.disposed || !this.enabled || !this.visible) return;
    try {
      if (!this.context) {
        const Context = window.AudioContext || (window as LegacyWindow).webkitAudioContext;
        if (!Context) throw new Error("Web Audio unavailable");
        this.context = this.sharedContext ?? new Context();
        this.master = this.context.createGain();
        this.master.gain.value = 0.7;
        this.transitionBus = this.context.createGain();
        this.transitionBus.gain.value = this.transitionVisible ? 1 : 0;
        this.master.connect(this.transitionBus);
        this.transitionBus.connect(this.context.destination);
        this.musicBus = this.context.createGain();
        this.musicBus.connect(this.master);
        this.reels = new ReelSounds(this.context, this.master, url => this.buffer(url));
        this.digging = new DigSounds(this.context, this.master, url => this.buffer(url), duration => this.duckMusic(duration, 0.45, 0.02, 0.2));
        this.reels.setSpin(this.reelSpin);
        this.reelLandings.forEach(event => this.reels!.land(event));
        this.reels.preload();
        // Optional effects preload only after a gesture.
        for (const url of Object.values(SOUND_URLS)) void this.buffer(url).catch(() => {});
      }
      this.reels?.preload();
      this.digging?.preload();
      if (this.status !== "playing" || this.context.state !== "running") void this.sync();
    } catch {
      this.report("error");
    }
  }

  private buffer(url: string) {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const pending = fetch(url, { signal: this.abort.signal })
      .then(response => {
        if (!response.ok) throw new Error("Music unavailable");
        return response.arrayBuffer();
      })
      .then(data => this.context!.decodeAudioData(data))
      .catch(error => {
        this.buffers.delete(url); // A later deliberate gesture may retry.
        throw error;
      });
    this.buffers.set(url, pending);
    return pending;
  }

  async playEffect(effect: SoundEffect) {
    const context = this.context;
    if (!context || this.disposed || !this.enabled || !this.visible) return;
    const revision = ++this.effectRevision;
    try {
      const buffer = await this.buffer(SOUND_URLS[effect]);
      if (this.disposed || revision !== this.effectRevision || context.state !== "running") return;
      this.effect?.stop();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.master!);
      this.effect = source;
      source.onended = () => { source.disconnect(); if (this.effect === source) this.effect = undefined; };
      this.duckMusic(buffer.duration);
      source.start();
    } catch { /* Missing optional audio must never interrupt a game action. */ }
  }

  private duckMusic(duration: number, volume = 0.25, attack = 0.04, release = 0.25) {
    const now = this.context!.currentTime, duck = this.musicBus!.gain;
    duck.cancelScheduledValues(now);
    duck.setValueAtTime(duck.value, now);
    duck.linearRampToValueAtTime(volume, now + attack);
    duck.setValueAtTime(volume, now + duration);
    duck.linearRampToValueAtTime(1, now + duration + release);
  }

  private async sync() {
    const revision = ++this.revision;
    const context = this.context;
    if (this.disposed) return;
    if (!this.enabled || !this.visible) {
      ++this.effectRevision;
      this.effect?.stop();
      this.effect = undefined;
      this.reels?.setActive(false);
      this.digging?.setActive(false);
      if (context && this.master) {
        this.master.gain.cancelScheduledValues(context.currentTime);
        this.master.gain.setValueAtTime(0, context.currentTime);
        this.musicBus?.gain.cancelScheduledValues(context.currentTime);
        this.musicBus?.gain.setValueAtTime(1, context.currentTime);
        if (!this.sharedContext) void context.suspend().catch(() => {});
      }
      this.report("off");
      return;
    }
    if (!context || !this.master) return; // No network/audio before a gesture.
    const track = this.track;
    this.report("loading");
    try {
      // Resume is requested before the first await, inside the gesture stack.
      await context.resume();
      if (this.disposed || revision !== this.revision) return;
      this.reels?.setActive(true);
      this.digging?.setActive(true);
      const buffer = await this.buffer(MUSIC_URLS[track]);
      if (this.disposed || revision !== this.revision) return;
      const now = context.currentTime;
      if (this.voice?.track !== track) {
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        gain.connect(this.musicBus!);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + 0.35);
        source.onended = () => { source.disconnect(); gain.disconnect(); };
        source.start(now);
        const old = this.voice;
        this.voice = { track, source, gain };
        if (old) {
          old.gain.gain.cancelScheduledValues(now);
          old.gain.gain.setValueAtTime(old.gain.gain.value, now);
          old.gain.gain.linearRampToValueAtTime(0, now + 0.35);
          old.source.stop(now + 0.36);
        }
      }
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.7, now + 0.15);
      this.report("playing");
    } catch {
      if (!this.disposed && revision === this.revision) {
        // A missing music file must not cut off a successful result effect.
        this.voice?.source.stop();
        this.voice = undefined;
        this.master.gain.cancelScheduledValues(context.currentTime);
        const running = context.state === "running";
        this.master.gain.setValueAtTime(running ? 0.7 : 0, context.currentTime);
        this.report(running ? "effects" : "error");
      }
    }
  }

  dispose() {
    this.disposed = true;
    ++this.revision;
    this.abort.abort();
    this.buffers.clear();
    this.voice?.source.stop();
    this.effect?.stop();
    this.effect = undefined;
    this.reels?.dispose();
    this.digging?.dispose();
    this.reelLandings.clear();
    if (this.context) {
      this.master?.gain.cancelScheduledValues(this.context.currentTime);
      this.master?.gain.setValueAtTime(0, this.context.currentTime);
      this.master?.disconnect();
      this.transitionBus?.disconnect();
      if (!this.sharedContext) void this.context.close().catch(() => {});
    }
    this.voice = undefined;
  }
}


