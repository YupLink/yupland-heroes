import track from "@/assets/battle-music/battle-wardens.mp3";
import { CastleMusicController, getExplorationMusicPreference } from "./castleMusicController";
import { createCastleMusicChannel, getExplorationAudioContext } from "./castleMusicChannel";

let player: CastleMusicController | undefined;
/** Owner-selected Suno track: Wardens, first orchestral variant. */
export function getBattleMusic() {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Private mode still plays. */ }
  return player ??= new CastleMusicController(
    () => createCastleMusicChannel(getExplorationAudioContext(), track), storage,
    { storagePrefix: "yupland.battle-music", trackCount: 1, preference: getExplorationMusicPreference(storage) },
  );
}
