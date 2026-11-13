export const DIG_SOUND_URLS = {
  shovel: "/slot/music/dig-shovel-v1.wav",
  soil: "/slot/music/dig-soil-v1.wav",
};
// Владелец, 20.10.2026: «не слышно, как копает». Файлы тихие (пик 0,27 и 0,18,
// −30/−36 дБ против −19 дБ у стука барабана) — поднимаем до ~0,8 пика и на удар
// приглушаем музыку (onHit → duckMusic в musicPlayer).
const DIG_GAIN = { shovel: 3, soil: 4.4 };
type DigCue = keyof typeof DIG_SOUND_URLS | "stop";
const listeners = new Set<(cue: DigCue) => void>();
export const notifyDigCue = (cue: DigCue) => listeners.forEach(listener => listener(cue));

/** Cues arrive from actual sprite frames, never from prize/network timers. */
export class DigSounds {
  private active = false;
  private disposed = false;
  private buffers = new Map<string, AudioBuffer>();
  private shots = new Set<AudioBufferSourceNode>();
  private onCue = (cue: DigCue) => {
    if (cue === "stop") { this.clear(); return; }
    const buffer = this.buffers.get(DIG_SOUND_URLS[cue]);
    // A late download must never make the shovel sound after the find.
    if (!buffer || !this.active || this.disposed || this.context.state !== "running") return;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = DIG_GAIN[cue];
    source.connect(gain);
    gain.connect(this.output);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.shots.delete(source); };
    this.shots.add(source);
    this.onHit?.(buffer.duration);
    source.start();
  };
  constructor(
    private context: AudioContext,
    private output: GainNode,
    private load: (url: string) => Promise<AudioBuffer>,
    /** Удар лопаты прозвучал — музыку на это время приглушить. */
    private onHit?: (duration: number) => void,
  ) { listeners.add(this.onCue); }
  preload() {
    for (const url of Object.values(DIG_SOUND_URLS)) {
      void this.load(url).then(buffer => {
        if (!this.disposed) this.buffers.set(url, buffer);
      }).catch(() => {});
    }
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) this.clear();
  }
  private clear() {
    this.shots.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } });
    this.shots.clear();
  }
  dispose() {
    this.disposed = true;
    listeners.delete(this.onCue);
    this.clear();
    this.buffers.clear();
  }
}
