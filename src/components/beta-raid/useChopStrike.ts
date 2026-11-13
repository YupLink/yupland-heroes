import { TOOL_ACTION_MS, toolStrikeTimes } from "./heroActionTiming";
// Удар по декору (рубка, добыча): анимация героя и звук топора, кирки или рук —
// пять ударов инструмента за 2.5 с; руки за 3 с и тишина. Новый удар, отмена анимации или уход с карты
// гасят прежний звук. Вынесено из useDecorInteract (лимит строк).
import { useCallback, useEffect, useRef } from "react";
import { useRaidCueAudio } from "@/hooks/useRaidActionAudio";
import { actionSoundForTool } from "@/lib/audio/raidActionPlayer";
import { startHeroAction } from "./heroActionVisual";

type At = { q: number; r: number; decorId: string };

/** strike(…) — true, если удар показан: декор убирать после срока действия, после анимации. */
export function useChopStrike(): (toolName: string | null, hand: boolean, at: At) => boolean {
  const playCue = useRaidCueAudio();
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const stop = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    playCue(null);
  }, [playCue]);
  useEffect(() => stop, [stop]);
  return useCallback(
    (toolName, hand, at) => {
      const sound = actionSoundForTool(toolName, hand);
      stop();
      if (!sound) return false;
      const onVisible = () => {
        if (sound === "fist") {
          playCue(sound);
          timers.current.push(setTimeout(() => playCue(sound), 1400));
        } else {
          for (const at of toolStrikeTimes()) timers.current.push(setTimeout(() => playCue(sound), at));
        }
        timers.current.push(setTimeout(() => playCue(null), sound === "fist" ? 3000 : TOOL_ACTION_MS));
      };
      startHeroAction(hand ? "hand" : sound === "axe" ? "wood" : "stone", at, onVisible, stop);
      return true;
    },
    [playCue, stop],
  );
}

