// Улов — в журнал сделок и в турнир рыбаков (владелец, 12.10.2026: «Кто больше
// словит рыбы», «Кто больше продаст рыбы»).
//
// Журнал (trade_journal, source 'fish'): пойманное — своё добытое рыбака. Что
// легло в рюкзак или ждёт в «Добыче» — строка «take» (пришло на счёт), что не
// влезло и упало мешочком у рыбака — «put» с клеткой мешочка (lib/tournament/
// flowAct: свежее в мешочке, хозяин — рыбак). По этим строкам «Продажа рыбы»
// (pieceFlow) знает, какая рыба своя пойманная, а купленная и чужая — нет.
// Ключ повтора — ключ выпадения + номер товара: повтор моста строку не задвоит.
// Время строки — первая поимка выдачи (выдача ленивая: досчёт заброса бывает
// позже поимки), чтобы «пойманное до записи» было до записи и в журнале.
//
// Турнир «Улов» (fish_catch): одно очко-строка на выдачу, qty — сколько рыбы
// поймано (и в рюкзак, и мешочком, и в «Добычу») ВНУТРИ турнира и после записи
// по времени каждой поимки (tour-sql.noteTimedSql); ref — ключ выпадения
// (рыбалка + первая поимка захвата, fishing-deliver.catchKey) — повтор не
// задваивает. Записан ли игрок — проверяет scoreSql (noteTournament).
//
// Best-effort, как весь журнал и хуки турниров: ничего не бросает, улов не ломает.
import { goodKey } from "@/server/api/beta-raid/admin-economy-keys";
import type { TradeNote } from "@/server/api/beta-raid/econ/trade-journal";

/** Пойманный товар и куда он лёг. */
export type CaughtItem = {
  itemId: string;
  /** Имя товара из справочника — по нему ключ журнала, как у стека рюкзака. */
  name: string;
  /** Поймано штук. */
  n: number;
  /** Из них упало мешочком у рыбака (не влезло в рюкзак). */
  dropped: number;
};

export type CatchNote = {
  account: string;
  mapId: string;
  q: number;
  r: number;
  /** Ключ выпадения `fish:<аккаунт>:<рыбалка>:<первая поимка>`. */
  key: string;
  items: readonly CaughtItem[];
  /** Время каждой поимки, мс; нет — «сейчас». */
  times?: readonly number[];
};

/** Строки журнала улова: на счёт (take) и мешочком у рыбака (put). */
export function catchTrades(o: CatchNote): TradeNote[] {
  const rows: TradeNote[] = [];
  const at = o.times?.length ? Math.min(...o.times) : null;
  o.items.forEach((it, i) => {
    const itemKey = goodKey("custom", null, it.name || it.itemId);
    if (!itemKey) return;
    const dropped = Math.min(Math.max(0, it.dropped), it.n);
    const base = {
      accountId: o.account,
      counterparty: null,
      mapId: o.mapId,
      q: o.q,
      r: o.r,
      source: "fish" as const,
      itemKey,
      itemName: it.name || null,
      at,
    };
    if (it.n - dropped > 0)
      rows.push({ ...base, side: "take", qty: it.n - dropped, ref: `${o.key}:${i}` });
    if (dropped > 0) rows.push({ ...base, side: "put", qty: dropped, ref: `${o.key}:${i}:bag` });
  });
  return rows;
}

const warn = (what: string, key: string) => (e: unknown) =>
  console.warn(`[fishing] ${what}:`, key, e instanceof Error ? e.message : e);

/** Записать улов в журнал и очко «Улова» — независимо друг от друга. Никогда не бросает. */
export async function noteCatch(o: CatchNote): Promise<void> {
  // Сначала журнал: продажа, пришедшая следом, должна видеть улов своим.
  await import("@/server/api/beta-raid/econ/trade-journal")
    .then((m) => m.noteTrades(catchTrades(o)))
    .catch(warn("улов не в журнале", o.key));
  const total = o.items.reduce((s, it) => s + Math.max(0, it.n), 0);
  // Время на каждую рыбу — очки по времени поимок; иначе (не сошлось) — «сейчас».
  const times = o.times?.length === total ? o.times : undefined;
  await import("@/server/api/tournament/tour-note")
    .then((m) => m.noteTournament(o.account, "fish_catch", total, o.key, times))
    .catch(warn("улов не в турнире", o.key));
}
