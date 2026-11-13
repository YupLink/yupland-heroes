import type { SlotState } from "@/lib/slot/state";

export const SOUND_URLS = {
  bonus: "/slot/music/bonus-v1.mp3",
  gold: "/slot/music/gold-v3.mp3",
  find: "/slot/music/find-v1.mp3",
  loss: "/slot/music/loss-v1.mp3",
  trap: "/slot/music/trap-v1.mp3",
  bear: "/slot/music/bear-v1.mp3",
} as const;
export type SoundEffect = keyof typeof SOUND_URLS;
export type SoundState = Pick<SlotState, "phase" | "lastWin" | "bonus" | "superGame" | "risk">;

// Observe already presented server results. Never request or predict an outcome.
export function soundForChange(before: SoundState | null, after: SoundState): SoundEffect | null {
  if (!before) return null; // Restoring a saved session must not replay rewards.
  if (after.phase === "bonus-won" && before.phase !== "bonus-won") return "bonus";
  if (after.phase === "won" && before.phase !== "won" && after.lastWin > 0) return "gold";
  const bonus = after.bonus;
  if (after.phase === "bonus" && bonus && bonus.picks.length > (before.bonus?.picks.length ?? 0)) {
    const row = bonus.picks.length - 1;
    return bonus.board[row]?.[bonus.picks[row]] === 0 ? "trap" : "find";
  }
  const cave = after.superGame;
  if (after.phase === "super" && cave?.lastPick &&
      (cave.lastPick !== before.superGame?.lastPick || cave.step !== before.superGame?.step)) {
    return cave.lastPick === "hit" ? "find" : "bear";
  }
  const risk = after.risk;
  if (after.phase === "risk" && risk && risk.picked !== null &&
      (risk.picked !== before.risk?.picked || risk.rounds !== before.risk?.rounds)) {
    if (risk.outcome === "lose") return "loss";
    if (risk.outcome === "win") return "gold";
  }
  return null;
}
