import { casinoMusicFocus, getExplorationMusicPreference } from "./castleMusicController";
import type { MusicChannel } from "./castleMusicController";

let explorationContext: AudioContext | undefined;
/**
 * Castle and raid share the context unlocked by the same user gesture.
 * "playback": background music needs no low latency; larger buffers survive busy frames on phones
 * instead of stuttering (Android picks ~10 ms buffers for the default "interactive").
 */
export function getExplorationAudioContext() {
  if (explorationContext) return explorationContext;
  try { explorationContext = new AudioContext({ latencyHint: "playback" }); }
  catch { explorationContext = new AudioContext(); }
  return explorationContext;
}

/** Shared output for game effects; streaming media uses its own gain and the same transition. */
const outputs = new WeakMap<AudioContext, GainNode>();
const transitionOutputs = new WeakMap<AudioContext, GainNode>();
const mediaOutputs = new WeakMap<AudioContext, GainNode>();
/** Independent envelope: volume/mute changes cannot cancel the scene transition. */
export function fadeExplorationForCasino(value: number, seconds: number) {
  const context = getExplorationAudioContext();
  getExplorationAudioOutput(context);
  const gain = transitionOutputs.get(context)!.gain;
  const now = context.currentTime;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(value, now + seconds);
}
export function getExplorationAudioOutput(context: AudioContext) {
  const existing = outputs.get(context);
  if (existing) return existing;
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Session preference still works. */ }
  const preference = getExplorationMusicPreference(storage);
  const output = context.createGain();
  const value = () => casinoMusicFocus.getSnapshot() || preference.getSnapshot() ? 0 : preference.getVolume();
  output.gain.value = value();
  const updateOutput = () => {
    output.gain.cancelScheduledValues(context.currentTime);
    // Reach exact zero; do not leave an asymptotic audible tail after muting.
    output.gain.setTargetAtTime(value(), context.currentTime, .008);
    output.gain.setValueAtTime(value(), context.currentTime + .04);
  };
  preference.subscribe(updateOutput);
  casinoMusicFocus.subscribe(updateOutput);
  const transition = context.createGain();
  transition.gain.value = 1;
  output.connect(transition);
  transition.connect(context.destination);
  transitionOutputs.set(context, transition);
  outputs.set(context, output);
  return output;
}

/** Streaming media has two independent volume paths for mobile WebViews.
 * Each applies sqrt(level): together they equal the user's requested level.
 * Other game sounds continue through the existing master output. */
export function getExplorationMediaOutput(context: AudioContext) {
  const existing = mediaOutputs.get(context);
  if (existing) return existing;
  getExplorationAudioOutput(context);
  const preference = getExplorationMusicPreference();
  const output = context.createGain();
  const value = () => casinoMusicFocus.getSnapshot() || preference.getSnapshot() ? 0 : Math.sqrt(preference.getVolume());
  output.gain.value = value();
  const updateOutput = () => {
    const now = context.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setTargetAtTime(value(), now, .008);
    output.gain.setValueAtTime(value(), now + .04);
  };
  preference.subscribe(updateOutput);
  casinoMusicFocus.subscribe(updateOutput);
  output.connect(transitionOutputs.get(context)!);
  mediaOutputs.set(context, output);
  return output;
}

/** Stream long music instead of decoding two full tracks into memory. */
export function createCastleMusicChannel(context: AudioContext, url: string, relativeVolume = 1): MusicChannel {
  const audio = new Audio();
  audio.preload = "none";
  audio.loop = true;
  audio.src = url;
  const preference = getExplorationMusicPreference();
  const setMediaVolume = () => { audio.volume = Math.sqrt(preference.getVolume()); };
  setMediaVolume();
  const unsubscribeVolume = preference.subscribe(setMediaVolume);
  const source = context.createMediaElementSource(audio);
  const volume = context.createGain();
  volume.gain.value = 0;
  source.connect(volume).connect(getExplorationMediaOutput(context));
  let epoch = 0;
  let disposed = false;
  let wantsPlayback = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ramp = { from: 0, to: 0, start: 0, end: 0 };
  const fade = (to: number, seconds: number) => {
    const now = context.currentTime;
    const fraction = ramp.end <= now ? 1 : Math.max(0, (now - ramp.start) / (ramp.end - ramp.start));
    const from = ramp.from + (ramp.to - ramp.from) * fraction;
    volume.gain.cancelScheduledValues(now);
    volume.gain.setValueAtTime(from, now);
    volume.gain.linearRampToValueAtTime(to, now + seconds);
    ramp = { from, to, start: now, end: now + seconds };
  };
  const stop = (seconds: number, destroy: boolean) => {
    wantsPlayback = false;
    ++epoch;
    clearTimeout(timer);
    fade(0, seconds);
    const finish = () => {
      audio.pause();
      if (destroy) {
        unsubscribeVolume();
        audio.removeAttribute("src");
        audio.load();
        source.disconnect();
        volume.disconnect();
      }
    };
    if (seconds && !audio.paused && context.state === "running") timer = setTimeout(finish, seconds * 1000);
    else finish();
  };
  return {
    unlock() { if (!disposed && context.state !== "running") void context.resume().catch(() => {}); },
    async play(fadeSeconds = 1.6) {
      if (disposed) return;
      wantsPlayback = true;
      clearTimeout(timer);
      const attempt = ++epoch;
      // Both calls must occur inside the same user gesture on mobile Safari.
      const resume = context.resume();
      const playing = audio.play();
      await Promise.all([resume, playing]);
      if (disposed || !wantsPlayback) { audio.pause(); return; }
      if (epoch !== attempt) return;
      fade(.48 * relativeVolume, fadeSeconds);
    },
    pause(seconds) { if (!disposed) stop(seconds, false); },
    dispose(seconds) { if (!disposed) { disposed = true; stop(seconds, true); } },
  };
}



