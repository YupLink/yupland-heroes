import firstTrack from "@/assets/castle-music/castle-01.mp3";
import secondTrack from "@/assets/castle-music/castle-02.mp3";
import { CastleMusicController, getExplorationMusicPreference } from "./castleMusicController";
import { createCastleMusicChannel, getExplorationAudioContext } from "./castleMusicChannel";

let player: CastleMusicController | undefined;
export function getCastleMusic() {
  if (!player) {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Storage may be blocked. */ }
    player = new CastleMusicController(track => {
      return createCastleMusicChannel(getExplorationAudioContext(), [firstTrack, secondTrack][track]);
    }, storage, { preference: getExplorationMusicPreference(storage) });
  }
  return player;
}
