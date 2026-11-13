// Шкала прочности артефакта (владелец, 22.10.2026): «шкала с хп должна быть у
// каждого — рисуется в изображении снизу». Полоса поверх нижнего края картинки,
// без подписей; при 25 % и ниже красная — как процент у инструментов
// (BackpackCell). Сломанный (0 %) — пустая полоса на красной подложке.
//
// Родитель картинки обязан быть `relative` (полоса — absolute по его низу).
// Прочность не пришла (старый кэш, новый предмет из витрины) — 100 %.
//
// Сломанный (0 %) при запущенной механике поломки (§8.63 п.3) — ещё и накладка
// «сломан» на всю картинку (ArtBrokenMark): полоса есть везде, где видна
// картинка артефакта, поэтому накладка живёт здесь же, а не в каждом списке.
import { ART_LOW_PCT, shownArtPct } from "@/lib/hero/artWear";
import { ArtBrokenMark } from "@/components/ArtBrokenMark";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ArtWearBar({
  durability,
  className,
}: {
  durability?: number | null;
  className?: string;
}) {
  const lang = useLang();
  const pct = shownArtPct(durability);
  const low = pct <= ART_LOW_PCT;
  const bar = (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={lang === "en" ? "Durability" : "Прочность"}
      data-art-wear={Math.round(pct)}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 block h-1 overflow-hidden",
        pct <= 0 ? "bg-destructive/40" : "bg-black/60",
        className,
      )}
    >
      <span
        className={cn("block h-full", low ? "bg-destructive" : "bg-gold")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
  if (pct > 0) return bar;
  return (
    <>
      <ArtBrokenMark />
      {bar}
    </>
  );
}
