// Вычесть себя из общей раскладки игроков — по ТОМУ снимку, из которого взят счёт.
//
// Раскладка одна на карту и живёт в кэше пару секунд (players-cache). Пока
// снимок лежит, игрок успевает шагнуть: снимок видит его в A, а на самом деле он
// уже в B. Вычитать «по текущей клетке» (ownCell) здесь нельзя — в A остаётся
// +1 (свой же лагерь на шаг позади, «тень», 20.09), а в B уходит −1 у соседа,
// которого тогда с карты просто стирает. Поэтому снимок сам помнит, ГДЕ он видел
// каждого (`at`), и вычитание идёт по аккаунту из той же клетки: старая ли
// раскладка, свежая ли — себя в ней игрок не увидит никогда.
//
// online (09.11) — сколько из count сейчас в игре: себя вычитаем и оттуда, если
// снимок считал нас онлайн.
export type CountedCell = { q: number; r: number; count: number; online: number };

/**
 * `cells` — счёт по клеткам, `at` — где снимок видел каждый аккаунт («q,r»),
 * `account` — кого вычитаем, `online` — кто из снимка в игре.
 * Клетка, где остался ноль, из ответа выпадает.
 */
export function subtractSelf(
  cells: readonly CountedCell[],
  at: ReadonlyMap<string, string>,
  account: string,
  online: ReadonlySet<string> = new Set(),
): CountedCell[] {
  const myKey = at.get(account);
  const meOnline = online.has(account);
  const out: CountedCell[] = [];
  for (const row of cells) {
    const mine = `${row.q},${row.r}` === myKey;
    const count = mine ? row.count - 1 : row.count;
    const on = mine && meOnline ? row.online - 1 : row.online;
    if (count > 0) out.push({ q: row.q, r: row.r, count, online: Math.max(0, Math.min(count, on)) });
  }
  return out;
}
