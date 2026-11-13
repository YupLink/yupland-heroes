import track from "@/assets/purchase-music/purchase-02.mp3";
import { CastleMusicController, getExplorationMusicPreference, purchaseMusicFocus, HIDE_GRACE_MS } from "./castleMusicController";
import { createCastleMusicChannel, getExplorationAudioContext } from "./castleMusicChannel";

let initialized = false;
/** One player for all shopping surfaces; no payment or game-state actions. */
export function enterPurchaseMusic() {
  if (!initialized) {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Session preference remains available. */ }
    const player = new CastleMusicController(
      () => createCastleMusicChannel(getExplorationAudioContext(), track), storage,
      { storagePrefix: "yupland.purchase-music", trackCount: 1, purchase: true, preference: getExplorationMusicPreference(storage) },
    );
    let release: (() => void) | undefined;
    const visibility = () => player.setHidden(document.hidden, HIDE_GRACE_MS);
    const hide = () => player.setHidden(true);
    const unlock = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest(".scene-music-controls"))) player.resume(true);
    };
    purchaseMusicFocus.subscribe(() => {
      if (purchaseMusicFocus.getSnapshot()) {
        visibility();
        release = player.enter();
        document.addEventListener("pointerup", unlock);
        document.addEventListener("keydown", unlock);
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("pagehide", hide);
        window.addEventListener("pageshow", visibility);
      } else {
        release?.();
        release = undefined;
        document.removeEventListener("pointerup", unlock);
        document.removeEventListener("keydown", unlock);
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("pagehide", hide);
        window.removeEventListener("pageshow", visibility);
      }
    });
    initialized = true;
  }
  return purchaseMusicFocus.acquire();
}
