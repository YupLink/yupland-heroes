/** Visual-only fishing loop. The source atlas contains poses, not in-between frames. */
export const FISHING_IDLE_ORDER = [
  "standing-hold", "standing-stretch", "standing-weight", "standing-boot",
  "standing-head", "standing-rear", "standing-swat", "standing-line",
  "seated-hold", "seated-foot", "seated-recline", "seated-head",
  "seated-rear", "seated-swat", "seated-weight", "seated-boot",
  "sit-careful", "sit-plop", "stand-slow", "stand-quick",
] as const;

export type FishingIdleFrame = { index: number; seated: boolean; transition: boolean };

export class FishingIdleLoop {
  private randomState: number;
  private seated = false;
  private lastTransition = false;
  private until: number;
  private gesture: number | null = null;
  private lastNow: number;

  constructor(seed: number, startedAt: number) {
    this.randomState = seed >>> 0 || 0x9e3779b9;
    this.lastNow = startedAt;
    this.until = startedAt + this.holdMs();
  }

  private random(): number {
    let x = this.randomState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 0x100000000;
  }

  private holdMs(): number { return 20_000 + Math.floor(this.random() * 20_001); }
  private gestureMs(): number { return 2_000 + Math.floor(this.random() * 2_001); }

  frame(now: number): FishingIdleFrame {
    // Wall clock may jump or the tab may sleep. Advance only a bounded amount;
    // after a long suspension, resume with a new full hold.
    if (now < this.lastNow || now - this.until > 120_000) {
      this.gesture = null;
      this.until = now + this.holdMs();
    }
    this.lastNow = now;
    for (let i = 0; now >= this.until && i < 32; i++) {
      if (this.gesture !== null) {
        if (this.gesture >= 16) this.seated = !this.seated;
        this.gesture = null;
        this.until += this.holdMs();
      } else {
        const transition = !this.lastTransition && this.random() < 0.15;
        this.gesture = transition
          ? (this.seated ? 18 + Math.floor(this.random() * 2) : 16 + Math.floor(this.random() * 2))
          : (this.seated ? 9 + Math.floor(this.random() * 7) : 1 + Math.floor(this.random() * 7));
        this.lastTransition = transition;
        this.until += this.gestureMs();
      }
    }
    return {
      index: this.gesture ?? (this.seated ? 8 : 0),
      seated: this.seated,
      transition: this.gesture !== null && this.gesture >= 16,
    };
  }

  delayUntilChange(now: number): number { return Math.max(1, this.until - now); }
}
