// Созревание гриба (защита на час, lib/mushroomRipe; владелец, 22.10.2026: «может
// отображаться время, если на него нажать — автоскрывается через 5 секунд»).
// Окно гриба открылось (нажали на гриб на карте) — подпись «Созреет через мм:сс»
// сразу; через RIPE_HINT_MS она прячется, остаются часики — нажатие на них
// показывает время снова. Видно всем, не только хозяину. Созрел — пусто.
import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { useT } from "@/lib/i18n";
import { dmineClock } from "@/lib/daraiMine";
import { isRipening, ripeHintShown } from "@/lib/mushroomRipe";

export function MushroomRipeHint({ ripeAt }: { ripeAt: number }) {
  const t = useT();
  const [shownAt, setShownAt] = useState<number | null>(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const ripening = isRipening(ripeAt, now);
  // Раз в секунду, пока созревает: отсчёт, скрытие подписи и конец созревания.
  useEffect(() => {
    if (!ripening) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ripening]);
  if (!ripening) return null;
  const text = t("dmine.ripe_in", { t: dmineClock(ripeAt - now) });
  return (
    <button
      type="button"
      onClick={() => {
        const at = Date.now();
        setShownAt(at);
        setNow(at);
      }}
      aria-label={text}
      className="mx-auto flex min-h-7 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums text-amber-200"
    >
      <Hourglass className="h-3.5 w-3.5" />
      {ripeHintShown(shownAt, now) && text}
    </button>
  );
}
