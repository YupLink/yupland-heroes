import { memo, useEffect, useState } from "react";
import { getBattleMusic } from "@/lib/audio/battleMusic";
import { getRaidMusic } from "@/lib/audio/raidMusic";
import { HIDE_GRACE_MS } from "@/lib/audio/castleMusicController";

/** Follows the boss window lifetime; no combat requests or game state changes. */
function BattleMusicView({ active }: { active: boolean }) {
  const [player] = useState(getBattleMusic);
  useEffect(() => {
    if (!active) return;
    const raid = getRaidMusic();
    raid.setSuspended(true);
    const visibility = () => player.setHidden(document.hidden, HIDE_GRACE_MS);
    const hide = () => player.setHidden(true);
    const unlock = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest(".scene-music-controls"))) player.resume(true);
    };
    visibility();
    const release = player.enter();
    document.addEventListener("pointerup", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", visibility);
    return () => {
      release();
      raid.setSuspended(false);
      document.removeEventListener("pointerup", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", visibility);
    };
  }, [active, player]);
  return null;
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const BattleMusic = memo(BattleMusicView);
