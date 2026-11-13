export type ActionSound = "axe" | "pick" | "cast" | "fist";
export const actionSoundForTool = (name: string | null | undefined, hand = false): ActionSound | null =>
  hand ? "fist" : /топор|axe/i.test(name ?? "") ? "axe" : /кирк|pick/i.test(name ?? "") ? "pick" : null;

/** One short cue per action; late downloads must not resurrect a cancelled cue. */
export class RaidActionPlayer {
  private static active: RaidActionPlayer | undefined;
  private epoch = 0;
  private disposed = false;
  private stopVoice?: () => void;
  constructor(private load: (kind: ActionSound) => Promise<AudioBuffer>,
    private start: (buffer: AudioBuffer) => () => void,
    private allowed: () => boolean) {}
  play(kind: ActionSound) {
    this.stop();
    if (this.disposed || !this.allowed()) return;
    RaidActionPlayer.active?.stop();
    RaidActionPlayer.active = this;
    const token = this.epoch;
    const requestedAt = Date.now();
    void this.load(kind).then(buffer => {
      if (this.disposed || token !== this.epoch || !this.allowed() || Date.now() - requestedAt > 250) return;
      this.stopVoice = this.start(buffer);
    }).catch(() => {});
  }
  stop() { if (RaidActionPlayer.active === this) RaidActionPlayer.active = undefined; this.epoch++; this.stopVoice?.(); this.stopVoice = undefined; }
  dispose() { this.stop(); this.disposed = true; }
}
