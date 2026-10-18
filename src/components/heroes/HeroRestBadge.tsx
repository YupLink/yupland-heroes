// Значок отдыха героя (луна) поверх портрета — в том же углу, где росток у
// батрачащего. Серый вид и подпись времени — heroRestView.ts.
import { Moon } from "lucide-react";

export function HeroRestBadge() {
  return (
    <span className="absolute left-0 top-0 grid h-5 w-5 place-items-center rounded-br-lg bg-slate-400 text-black">
      <Moon className="h-3 w-3" />
    </span>
  );
}
