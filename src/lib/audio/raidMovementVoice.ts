import footEarthUrl from "@/assets/raid-audio/foot-earth.mp3";
import footStoneUrl from "@/assets/raid-audio/foot-stone.mp3";
import stoneUrl from "@/assets/raid-audio/hoof-stone.mp3";
import waterUrl from "@/assets/raid-audio/oars-water.mp3";
import type { MovementSurface } from "./raidMovementController";
import hoofUrl from "@/assets/raid-audio/hoof-earth.mp3";
import { getExplorationAudioContext, getExplorationAudioOutput } from "./castleMusicChannel";
import type { MovementVoice } from "./raidMovementController";

const buffers: Partial<Record<MovementSurface, Promise<AudioBuffer>>> = {};
const urls = { earth: hoofUrl, stone: stoneUrl, water: waterUrl, "foot-earth": footEarthUrl, "foot-stone": footStoneUrl };
/** A short mono loop is decoded once; no network/decoding inside the frame loop. */
export async function createRaidMovementVoice(surface: MovementSurface = "earth"): Promise<MovementVoice> {
  const context = getExplorationAudioContext();
  buffers[surface] ??= fetch(urls[surface]).then(response => {
    if (!response.ok) throw new Error("Hoof sound unavailable");
    return response.arrayBuffer();
  }).then(bytes => context.decodeAudioData(bytes)).catch(error => { delete buffers[surface]; throw error; });
  const audio = await buffers[surface]!;
  const gain = context.createGain();
  const scene = context.createGain();
  gain.gain.value = 0;
  scene.gain.value = 0;
  gain.connect(scene).connect(getExplorationAudioOutput(context));
  let source: AudioBufferSourceNode | undefined;
  let attack: GainNode | undefined;
  let startedAt = 0;
  let offset = 0;
  let disposed = false;
  let sceneActive = false;
  const stop = () => {
    if (!source) return;
    offset = (offset + Math.max(0, context.currentTime - startedAt)) % audio.duration;
    const old = source, oldAttack = attack!;
    oldAttack.gain.cancelScheduledValues(context.currentTime);
    oldAttack.gain.setTargetAtTime(0, context.currentTime, .002);
    old.stop(context.currentTime + .008);
    old.onended = () => { old.disconnect(); oldAttack.disconnect(); };
    source = undefined;
    attack = undefined;
  };
  return {
    start() {
      if (disposed || source || context.state !== "running") return;
      source = context.createBufferSource();
      source.buffer = audio;
      source.loop = true;
      attack = context.createGain();
      source.connect(attack).connect(gain);
      startedAt = context.currentTime;
      attack.gain.setValueAtTime(0, startedAt);
      attack.gain.linearRampToValueAtTime(1, startedAt + .008);
      source.start(0, offset);
    },
    stop,
    setVolume(value) {
      // Soft earth transients need +4 dB to remain audible beside stone and water.
      gain.gain.setTargetAtTime(value * (surface === "earth" ? 1.6 : 1), context.currentTime, .02);
    },
    setSceneActive(active) {
      if (active === sceneActive) return;
      sceneActive = active;
      scene.gain.cancelScheduledValues(context.currentTime);
      scene.gain.setValueAtTime(0, context.currentTime);
      // Never jump over the music while its scene channel is fading in.
      if (active) scene.gain.linearRampToValueAtTime(1, context.currentTime + 1.6);
    },
    dispose() { stop(); disposed = true; gain.disconnect(); scene.disconnect(); },
  };
}


