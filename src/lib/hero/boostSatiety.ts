// Поле «Сытость» в редакторе товара (владелец, 09.10.2026): число за одну штуку.
// Хранится тем же эффектом «Сытость» в списке бустов товара (lib/hero/boost) —
// отдельной колонки нет, игра читает одно место.
import type { BoostEffect } from "./boost";

/** Сколько сытости даёт товар: строка поля, пусто — не еда. */
export const satietyValueOf = (boost: BoostEffect[] | null | undefined): string =>
  boost?.find((e) => e.stat === "satiety")?.value ?? "";

/** Прочие эффекты товара — их правит обычный список бустов. */
export const otherBoosts = (boost: BoostEffect[] | null | undefined): BoostEffect[] =>
  (boost ?? []).filter((e) => e.stat !== "satiety");

/**
 * Собрать список бустов: прочие эффекты + сытость. Пусто, «0» или мусор —
 * сытости нет; ничего не осталось — null («обычный товар»).
 */
export function withSatiety(others: BoostEffect[] | null, value: string): BoostEffect[] | null {
  const v = value.trim();
  const n = Number(v.split("-").pop());
  const list = [...(others ?? [])];
  if (v && Number.isFinite(n) && n > 0) list.push({ stat: "satiety", value: v, minutes: "" });
  return list.length ? list : null;
}
