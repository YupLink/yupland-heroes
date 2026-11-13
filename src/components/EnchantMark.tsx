// Отметка зачарованного экземпляра артефакта (лавка зачарования, ПРАВИЛА §8.87):
// золотая ✦, а где есть место — «+12%» / «−12%» или «Зачарован +12%».
//
// Владелец (28.10.2026): «зачарованные арты должны быть везде обозначены». Один
// компонент на все места, где игроку виден конкретный экземпляр (user_game_item):
// окно героя, таверна и оружейная, кузница, маркет и ломбард, аукцион, рынок
// героев, мешочки. Подпись title/aria — тот же enchantSealText, что у инвентаря.
//
// Нет зачарования (null / undefined / не число) — не рисует ничего: вызывающему
// не нужно своё условие. corner — круглый значок в левом верхнем углу картинки
// (родитель картинки обязан быть `relative`, как для ArtWearBar).
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { enchantPctText, enchantSealText } from "@/lib/enchant/enchant";

/** Сколько зачарованных в стопке, где экземпляры не различить (группы маркета). */
export type EnchantOf = { n: number; total: number };

/** Подпись отметки: «Зачарован +12%»; у стопки — «… · 1 из 5». */
export function enchantMarkLabel(pct: number, ru: boolean, of?: EnchantOf): string {
  const base = enchantSealText(pct, ru);
  return of && of.total > 1 ? `${base} · ${of.n} ${ru ? "из" : "of"} ${of.total}` : base;
}

/** Процент зачарования, если он есть: null / undefined / NaN — не зачарован. */
export const enchantPctOf = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

const CORNER =
  "pointer-events-none absolute left-0.5 top-0.5 z-[2] grid h-4 w-4 place-items-center rounded-full border border-gold/80 bg-black/85 text-[10px]";

export function EnchantMark({
  pct,
  show = "icon",
  corner = false,
  of,
  className,
}: {
  pct: number | null | undefined;
  /** Что рядом со ✦: ничего, «+12%» или «Зачарован +12%». У corner — только ✦. */
  show?: "icon" | "pct" | "text";
  corner?: boolean;
  of?: EnchantOf;
  className?: string;
}) {
  const ru = useLang() === "ru";
  const p = enchantPctOf(pct);
  if (p == null) return null;
  const label = enchantMarkLabel(p, ru, of);
  return (
    <span
      data-enchant-mark={p}
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 font-semibold leading-none text-gold",
        corner && CORNER,
        className,
      )}
    >
      <span aria-hidden="true">✦</span>
      {!corner && show === "pct" && <span aria-hidden="true">{enchantPctText(p)}</span>}
      {!corner && show === "text" && <span aria-hidden="true">{label}</span>}
    </span>
  );
}
