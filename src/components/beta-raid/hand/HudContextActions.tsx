// Ряд над героем (контекст): вещь в руке (HandBar), «i» и «Атаковать» после тапа по
// цели, рыбалка. Вынесено из BetaRaidHud — он на пределе строк.
import { FightInfoButton } from "@/components/beta-raid/fight/FightInfoButton";
import { FishingButton } from "@/components/beta-raid/fishing/FishingButton";
import { HandBar } from "./HandBar";

export function HudContextActions({ q, r }: { q: number | null; r: number | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <HandBar />
      <FightInfoButton />
      <FishingButton q={q} r={r} />
    </div>
  );
}
