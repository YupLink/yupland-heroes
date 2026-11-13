// «Не хватает средств» — а каких? (владелец, 13.11.2026). Отказ оплаты покупки
// называет, ЧЕГО и СКОЛЬКО не хватает: «Не хватает: Бревна Дуба 1, Горная
// Руда 1». Языка игрока сервер не знает — текст едет сразу на двух, ключом с
// подстановками (market.short|{"ru":…,"en":…}, его разбирает serverErrorText).
//
// Считаем ПОСЛЕ отката (payAll уже вернул списанное): баланс — тот, что был до
// попытки. Строки с неизвестным балансом (артефакт, пак, токен…) не гадаем —
// кроме той, на которой оплата сорвалась: её называем полной ценой.
// Чтение базы — в market-buy-short-db (сюда приходит функциями: модуль чистый).
import type { MarketPriceResource } from "@/lib/marketItem";
import type { PriceLine } from "@/lib/marketPrices";
import { goldForTicketPrice } from "@/lib/ticketGold";
import { dict as marketDict } from "@/lib/translations/braid-market";
import { dict as pawnHeroDict } from "@/lib/translations/braid-pawn-hero";

export type ShortName = { ru: string; en: string };
/** Строка цены за всю сделку так, как её видит игрок: «в билетах» — золото ×500. */
export type ShortLine = { resource: MarketPriceResource; token: string | null; need: number };
export type ShortDeps = {
  /** Сколько этого у игрока; null — не знаем. */
  have: (l: ShortLine) => Promise<number | null>;
  /** Имя предметной цены (шаблон) по-русски; null — имени нет. */
  itemNames: (lines: readonly ShortLine[]) => Promise<Array<string | null>>;
};

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const keyOf = (l: { resource: string; token: string | null }): string =>
  `${l.resource}:${l.token ?? ""}`;
const ANY_RE = /^(art|hero)_any_(common|rare|epic|legendary)$/;

/** Строка цены за qty штук глазами игрока (билеты — золотом, §8.61). */
function shown(l: PriceLine, qty: number): ShortLine {
  return l.resource === "tickets"
    ? { resource: "gold", token: null, need: goldForTicketPrice(l.amount * qty) }
    : { resource: l.resource, token: l.token, need: r3(l.amount * qty) };
}

/** Строки за всю сделку, сведённые по валютам (две цены в одном золоте — суммой). */
export function shortLines(lines: readonly PriceLine[], qty: number): ShortLine[] {
  const map = new Map<string, ShortLine>();
  for (const l of lines) {
    const s = shown(l, qty);
    const old = map.get(keyOf(s));
    map.set(keyOf(s), old ? { ...old, need: r3(old.need + s.need) } : s);
  }
  return [...map.values()];
}

/** Чего не хватает: строка и сколько. failed — индекс строки, где оплата сорвалась. */
export function missingOf(
  lines: readonly ShortLine[],
  have: readonly (number | null)[],
  failed: number,
): Array<{ line: ShortLine; missing: number }> {
  const out: Array<{ line: ShortLine; missing: number }> = [];
  lines.forEach((line, i) => {
    const h = have[i];
    if (h != null && h + 1e-9 < line.need) out.push({ line, missing: r3(line.need - h) });
    else if (h == null && i === failed) out.push({ line, missing: line.need });
  });
  // Баланс говорит «хватает», а списание отказало (потратил в соседней
  // вкладке) — называем ту строку, на которой сорвалось.
  const f = lines[failed];
  if (!out.length && f) out.push({ line: f, missing: f.need });
  return out;
}

/** Подпись строки ru/en: имя шаблона, «любой … редкости», ресурс словаря, символ токена. */
export function nameOf(l: ShortLine, item: string | null): ShortName {
  if (l.resource === "token" && l.token) return { ru: l.token, en: l.token };
  const any = l.token ? ANY_RE.exec(l.token) : null;
  const key = any ? `market.${any[1]}_any.${any[2]}` : `market.res.${l.resource}`;
  // Имя шаблона — как на плитке (priceName): одно на оба языка, без полуперевода.
  if (item && !any) return { ru: item, en: item };
  const w = marketDict[key] ?? pawnHeroDict[key];
  return w ? { ru: w.ru, en: w.en } : { ru: l.resource, en: l.resource };
}

/** Текст отказа: ключ market.short с готовым списком на обоих языках. */
export function shortMessage(list: ReadonlyArray<{ name: ShortName; missing: number }>): string {
  const ru = list.map((x) => `${x.name.ru} ${String(x.missing).replace(".", ",")}`).join(", ");
  const en = list.map((x) => `${x.name.en} ${x.missing}`).join(", ");
  return `market.short|${JSON.stringify({ ru, en })}`;
}

/**
 * Безликий отказ оплаты («market.not_enough») → «Не хватает: …». Любой другой
 * отказ — как был. Сбой самого объяснения сделку не трогает: вернётся исходный.
 */
export async function explainShort(
  e: unknown,
  c: { lines: readonly PriceLine[]; qty: number; failed: number },
  deps: ShortDeps,
): Promise<unknown> {
  if (!(e instanceof Error) || e.message !== "market.not_enough") return e;
  try {
    const lines = shortLines(c.lines, c.qty);
    const fl = c.lines[c.failed];
    const failed = fl ? lines.findIndex((l) => keyOf(l) === keyOf(shown(fl, c.qty))) : -1;
    const have = await Promise.all(lines.map((l) => deps.have(l).catch(() => null)));
    const miss = missingOf(lines, have, failed);
    if (!miss.length) return e;
    const items = await deps.itemNames(miss.map((m) => m.line)).catch(() => []);
    return new Error(
      shortMessage(
        miss.map((m, i) => ({ name: nameOf(m.line, items[i] ?? null), missing: m.missing })),
      ),
    );
  } catch {
    return e;
  }
}
