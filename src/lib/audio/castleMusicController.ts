export interface MusicChannel {
  unlock(): void;
  setVolume?(volume: number): void;
  play(fadeSeconds?: number): Promise<void>;
  pause(fadeSeconds: number): void;
  dispose(fadeSeconds: number): void;
}
/** Optional audio/UI observers must not prevent the master gain from updating. */
function notifyAudioListeners(listeners: Set<() => void>) {
  listeners.forEach(listener => {
    try { listener(); }
    catch (error) { console.error("Audio preference observer failed", error); }
  });
}
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type Snapshot = { muted: boolean; volume: number; blocked: boolean; playing: boolean; track: number };
type Visit = { track: number; channel?: MusicChannel; attempt: number; pending: boolean };
/**
 * How long the page may stay hidden before the music pauses. Telegram's webview reports brief
 * hide/show flips (header redraws, system bars); a real departure still pauses after this.
 */
export const HIDE_GRACE_MS = 2500;
export const SCENE_FADE_OUT_SECONDS = 1.4;

/** One sound preference for exploration scenes; playlists still belong to each scene. */
export class MusicPreference {
  private muted: boolean | undefined;
  private volume = 1;
  private listeners = new Set<() => void>();
  private key = "yupland.exploration-music.muted";
  constructor(private storage?: Storage) {
    const saved = this.read(this.key);
    this.muted = saved === "1" ? true : saved === "0" ? false : undefined;
    const volume = this.read("yupland.exploration-music.volume");
    if (volume != null && volume.trim() !== "" && Number.isFinite(Number(volume))) this.volume = Math.max(0, Math.min(1, Number(volume)));
  }
  private read(key: string) { try { return this.storage?.getItem(key); } catch { return null; } }
  getSnapshot = () => this.muted ?? false;
  getVolume = () => this.volume;
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  initialize(legacyKey: string) {
    // Migrate once from the first scene actually entered, not a hidden mounted scene.
    if (this.muted === undefined) this.setMuted(this.read(legacyKey) === "1");
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    try { this.storage?.setItem(this.key, muted ? "1" : "0"); } catch { /* Private mode keeps the session preference. */ }
    notifyAudioListeners(this.listeners);
  }
  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    try { this.storage?.setItem("yupland.exploration-music.volume", String(this.volume)); } catch { /* Session only. */ }
    if (this.volume > 0) this.setMuted(false);
    else notifyAudioListeners(this.listeners);
  }
}
let explorationPreference: MusicPreference | undefined;
export function getExplorationMusicPreference(storage?: Storage) {
  return explorationPreference ??= new MusicPreference(storage);
}

/** Shared lease: nested purchase windows keep a single musical visit alive. */
export class PurchaseMusicFocus {
  constructor(private releaseDelayMs = 120) {}
  private owners = 0;
  private active = false;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.active;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.listeners.forEach(listener => listener());
  }
  acquire() {
    clearTimeout(this.timer);
    this.owners++;
    this.update(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.owners === 0) this.timer = setTimeout(() => this.update(false), this.releaseDelayMs);
    };
  }
}
export const purchaseMusicFocus = new PurchaseMusicFocus();
/** Casino owns audio until its last screen unmounts; no preference is changed. */
export const casinoMusicFocus = new PurchaseMusicFocus(0);

/** One visit survives React effect replay; only a real unmount advances the playlist. */
export class CastleMusicController {
  private current?: Visit;
  private owners = 0;
  private departure?: ReturnType<typeof setTimeout>;
  private hidden = false;
  private suspended = false;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private next = 0;
  private listeners = new Set<() => void>();
  private state: Snapshot;
  constructor(private createChannel: (track: number) => MusicChannel, private storage?: Storage,
    private options: { storagePrefix?: string; trackCount?: 1 | 2; preference?: MusicPreference; purchase?: boolean } = {}) {
    this.next = this.options.trackCount !== 1 && this.read(`${this.prefix}.next`) === "1" ? 1 : 0;
    this.state = { muted: options.preference?.getSnapshot() ?? (this.read(`${this.prefix}.muted`) === "1"), volume: options.preference?.getVolume() ?? 1, blocked: false, playing: false, track: this.next };
    if (!options.purchase) purchaseMusicFocus.subscribe(() => {
      if (purchaseMusicFocus.getSnapshot()) this.pause(SCENE_FADE_OUT_SECONDS);
      else this.restartAfterPurchase();
    });
    casinoMusicFocus.subscribe(() => {
      if (casinoMusicFocus.getSnapshot()) this.pause(0);
      else this.resume();
    });
    options.preference?.subscribe(() => {
      this.update({ volume: options.preference!.getVolume() });
      this.current?.channel?.setVolume?.(this.state.volume);
      this.applyMuted(options.preference!.getSnapshot());
    });
  }
  private get prefix() { return this.options.storagePrefix ?? "yupland.castle-music"; }
  private read(key: string) { try { return this.storage?.getItem(key); } catch { return null; } }
  private write(key: string, value: string) { try { this.storage?.setItem(key, value); } catch { /* Private mode still plays. */ } }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(change: Partial<Snapshot>) {
    this.state = { ...this.state, ...change };
    notifyAudioListeners(this.listeners);
  }
  enter() {
    clearTimeout(this.departure);
    this.options.preference?.initialize(this.options.purchase ? "yupland.castle-music.muted" : `${this.prefix}.muted`);
    this.owners++;
    if (!this.current) {
      this.current = { track: this.next, attempt: 0, pending: false };
      this.next = this.options.trackCount === 1 ? 0 : 1 - this.next;
      this.write(`${this.prefix}.next`, String(this.next));
      this.update({ track: this.current.track, playing: false, blocked: false });
    }
    this.resume();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.owners !== 0) return;
      this.departure = setTimeout(() => {
        const old = this.current;
        this.current = undefined;
        if (old) { old.attempt++; old.channel?.dispose(SCENE_FADE_OUT_SECONDS); }
        this.update({ playing: false, blocked: false });
      }, 0);
    };
  }
  /** Switch the current scene's source without changing its shared mute or volume. */
  selectTrack = (track: number) => {
    if (!Number.isInteger(track) || track < 0) return;
    if (this.current?.track === track || (!this.current && this.next === track)) return;
    this.next = track;
    const previous = this.current;
    if (!previous) { this.update({ track, playing: false, blocked: false }); return; }
    previous.attempt++;
    previous.pending = false;
    this.current = { track, attempt: 0, pending: false };
    this.update({ track, playing: false, blocked: false });
    previous.channel?.dispose(SCENE_FADE_OUT_SECONDS);
    this.resume();
  };
  resume = (gesture = false) => {
    const visit = this.current;
    if (casinoMusicFocus.getSnapshot() || !visit || !this.owners || this.hidden || this.suspended || (this.options.purchase ? !purchaseMusicFocus.getSnapshot() : purchaseMusicFocus.getSnapshot()) || this.state.muted || this.state.volume === 0) return;
    visit.channel?.unlock();
    if (this.state.playing || (visit.pending && !gesture)) return;
    visit.pending = true;
    const attempt = ++visit.attempt;
    try {
      visit.channel ??= this.createChannel(visit.track);
      visit.channel.setVolume?.(this.state.volume);
      void visit.channel.play().then(() => {
        if (this.current === visit && visit.attempt === attempt) this.update({ playing: true, blocked: false });
      }).catch(() => {
        if (this.current === visit && visit.attempt === attempt) this.update({ playing: false, blocked: true });
      }).finally(() => { if (visit.attempt === attempt) visit.pending = false; });
    } catch {
      visit.pending = false;
      this.update({ playing: false, blocked: true });
    }
  };
  private restartAfterPurchase() {
    const visit = this.current;
    if (visit) {
      // Keep this visit's selected track, but return through its soft intro.
      // A fresh channel also prevents a late old play() promise restoring mid-track audio.
      visit.attempt++;
      visit.pending = false;
      visit.channel?.dispose(SCENE_FADE_OUT_SECONDS);
      visit.channel = undefined;
    }
    this.update({ playing: false, blocked: false });
    this.resume();
  }
  private pause(seconds: number) {
    if (this.current) {
      this.current.attempt++;
      this.current.pending = false;
      this.current.channel?.pause(seconds);
    }
    this.update({ playing: false });
  }
  /** graceMs > 0 delays the pause of playing music; becoming visible within the grace keeps it uninterrupted. */
  setHidden(hidden: boolean, graceMs = 0) {
    // Nothing is playing — nothing to protect: hide at once, so a hidden page never starts the music.
    if (hidden && graceMs > 0 && this.state.playing) {
      if (!this.hidden && this.hideTimer === undefined)
        this.hideTimer = setTimeout(() => { this.hideTimer = undefined; this.setHidden(true); }, graceMs);
      return;
    }
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    this.hidden = hidden;
    if (hidden) this.pause(0);
    else this.resume();
  }
  setSuspended(suspended: boolean) {
    this.suspended = suspended;
    if (suspended) this.pause(.8);
    else this.resume();
  }
  private applyMuted(muted: boolean) {
    this.update({ muted, blocked: false });
    if (muted || this.state.volume === 0) this.pause(.35);
    else this.resume(true);
  }
  toggle = () => {
    if (this.state.volume === 0) { this.setVolume(.6); return; }
    // This switch controls effects too, even while music is loading or paused.
    const muted = !this.state.muted;
    if (this.options.preference) this.options.preference.setMuted(muted);
    else {
      this.write(`${this.prefix}.muted`, muted ? "1" : "0");
      this.applyMuted(muted);
    }
  };
  setVolume = (volume: number) => {
    if (this.options.preference) this.options.preference.setVolume(volume);
    else if (Number.isFinite(volume)) {
      this.update({ volume: Math.max(0, Math.min(1, volume)) });
      this.current?.channel?.setVolume?.(this.state.volume);
      this.applyMuted(false);
    }
  };
}





