// Значок занятия ачивки — из lucide, без эмодзи (чек-лист дизайна).
import { Axe, Compass, Factory, Fish, Pickaxe, Sailboat, Shovel, Swords } from "lucide-react";
import type { AchTrackId } from "@/lib/achievements/tracks";

const ICONS = {
  lumber: Axe,
  miner: Pickaxe,
  hunter: Swords,
  digger: Shovel,
  fisher: Fish,
  sailor: Sailboat,
  explorer: Compass,
  minelord: Factory,
} as const;

export function AchTrackIcon({ id, className }: { id: AchTrackId; className?: string }) {
  const Icon = ICONS[id];
  return <Icon aria-hidden="true" className={className} />;
}
