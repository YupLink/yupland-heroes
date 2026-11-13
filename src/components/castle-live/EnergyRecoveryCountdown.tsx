import { useEffect, useState } from "react";
import { ENERGY_REGEN_PER_TICK } from "@/lib/energySettle";

type Props = { ru: boolean; energy: number; maxEnergy: number; nextRegenSec: number; updatedAt: number };
/** Display only: the server remains responsible for energy and its next tick. */
export function EnergyRecoveryCountdown({ ru, energy, maxEnergy, nextRegenSec, updatedAt }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const direction = energy < maxEnergy ? 1 : energy > maxEnergy && nextRegenSec > 0 ? -1 : 0;
  useEffect(() => {
    setNow(Date.now());
    if (!direction || !Number.isFinite(nextRegenSec) || nextRegenSec <= 0) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [direction, nextRegenSec, updatedAt]);
  if (!Number.isFinite(energy) || !Number.isFinite(maxEnergy)) return null;
  let label: string;
  if (direction === 0) label = ru ? "Запас полон" : "Full";
  else if (!Number.isFinite(nextRegenSec) || nextRegenSec <= 0) return null;
  else {
    const seconds = Math.max(0, Math.ceil(nextRegenSec - Math.max(0, now - updatedAt) / 1000));
    const time = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
    label = seconds === 0 ? (ru ? "Обновляется…" : "Updating…") : `${direction > 0 ? `+${ENERGY_REGEN_PER_TICK}` : "−1"} ${ru ? "через" : "in"} ${time}`;
  }
  return <span className="castle-main-hud__recovery" title={label}>{label}</span>;
}

