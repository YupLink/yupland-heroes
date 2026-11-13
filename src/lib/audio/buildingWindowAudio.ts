import openUrl from '@/assets/building-audio/open.mp3';
import closeUrl from '@/assets/building-audio/close.mp3';
import { getExplorationAudioContext, getExplorationAudioOutput } from './castleMusicChannel';
import { getCastleMusic } from './castleMusic';

let buffers: Promise<AudioBuffer[]> | undefined;
let epoch = 0;
let current: AudioBufferSourceNode | undefined;
let gain: GainNode | undefined;
let subscribed = false;
// Approved clips peak at -22.4 / -30.9 dBFS: compensate their different levels.
let cueGain = 3.2;
function stop() {
  ++epoch;
  current?.stop();
  current = undefined;
}
function updateVolume() {
  const state = getCastleMusic().getSnapshot();
  if (state.muted || document.hidden || state.volume === 0) stop();
  if (gain) gain.gain.value = state.muted ? 0 : cueGain;
}
export function warmBuildingAudio() {
  if (!subscribed) {
    subscribed = true;
    getCastleMusic().subscribe(updateVolume);
    document.addEventListener('visibilitychange', updateVolume);
    window.addEventListener('pagehide', stop);
  }
  if (!buffers) {
    const context = getExplorationAudioContext();
    buffers = Promise.all([openUrl, closeUrl].map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Building audio unavailable');
      return context.decodeAudioData(await response.arrayBuffer());
    })).catch(error => { buffers = undefined; throw error; });
  }
  return buffers;
}
export function playBuildingAudio(open: boolean) {
  stop();
  const state = getCastleMusic().getSnapshot();
  if (state.muted || state.volume === 0 || document.hidden) return;
  const attempt = epoch;
  const started = performance.now();
  const context = getExplorationAudioContext();
  void Promise.all([warmBuildingAudio(), context.resume()]).then(([decoded]) => {
    // Never play a stale event after slow loading, another window action, or mute.
    if (attempt !== epoch || performance.now() - started > 250 || document.hidden) return;
    const latest = getCastleMusic().getSnapshot();
    if (latest.muted || latest.volume === 0) return;
    cueGain = open ? 3.2 : 8;
    gain ??= context.createGain();
    gain.disconnect();
    gain.connect(getExplorationAudioOutput(context));
    gain.gain.value = cueGain;
    const source = context.createBufferSource();
    source.buffer = decoded[open ? 0 : 1];
    source.connect(gain);
    current = source;
    source.onended = () => { source.disconnect(); if (current === source) current = undefined; };
    source.start();
  }).catch(() => { /* Optional sound must never prevent opening a building. */ });
}

