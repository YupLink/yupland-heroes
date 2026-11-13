export interface MovementVoice {
  start(): void;
  stop(): void;
  setVolume(volume: number): void;
  setSceneActive(active: boolean): void;
  dispose(): void;
}

/** Visual motion is the clock. Route/network activity cannot keep hooves running. */
export class RaidMovementController {
  private enabled = false;
  private moving = false;
  private muted = true;
  private volume = 0;
  private voice?: MovementVoice;
  private loading = false;
  private disposed = false;
  private lastFrame = 0;
  private watchdog?: ReturnType<typeof setTimeout>;
  constructor(private load: () => Promise<MovementVoice>) {}

  configure(enabled: boolean, muted: boolean, volume: number) {
    if (this.disposed) return;
    this.enabled = enabled;
    this.muted = muted;
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    this.sync();
    // Prepare while the raid music is audible; never fetch a sound for a muted scene.
    if (this.allowed && !this.voice && !this.loading) {
      this.loading = true;
      void this.load().then(voice => {
        if (this.disposed) { voice.dispose(); return; }
        this.voice = voice;
        this.sync(); // A late decode must not resurrect a completed step.
      }).catch(() => { /* Retry at the next scene/preference change. Movement stays usable. */ })
        .finally(() => { this.loading = false; });
    }
  }
  private get allowed() { return this.enabled && !this.muted && this.volume > 0; }
  setMoving = (moving: boolean) => {
    if (this.disposed) return;
    if (moving) {
      this.lastFrame = Date.now();
      this.watchdog ??= setTimeout(this.checkFrames, 100);
    } else {
      clearTimeout(this.watchdog);
      this.watchdog = undefined;
    }
    if (moving === this.moving) return;
    this.moving = moving;
    this.sync();
  };
  // Full-map overlays may suspend rAF before the renderer emits its final false.
  private checkFrames = () => {
    this.watchdog = undefined;
    const remaining = 100 - (Date.now() - this.lastFrame);
    if (remaining <= 0) this.setMoving(false);
    else this.watchdog = setTimeout(this.checkFrames, remaining);
  };
  private sync() {
    // User volume is applied once at the shared output, including active loops.
    this.voice?.setVolume(1);
    this.voice?.setSceneActive(this.allowed);
    if (this.allowed && this.moving) this.voice?.start();
    else this.voice?.stop();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.watchdog);
    this.watchdog = undefined;
    this.moving = false;
    this.voice?.dispose();
    this.voice = undefined;
  }
}

export type MovementSurface = "earth" | "stone" | "water" | "foot-earth" | "foot-stone";
/** Water takes priority during embark/disembark legs; road IDs are real map data. */
export function movementSurface(onShip: boolean, fromShip: boolean, onRoad: boolean, onFoot = false): MovementSurface {
  return onShip || fromShip ? "water" : onFoot ? (onRoad ? "foot-stone" : "foot-earth") : onRoad ? "stone" : "earth";
}


