// Вычесть себя из общей раскладки игроков — по ТОМУ снимку, из которого взят счёт.
//
// Раскладка одна на карту и живёт в кэше пару секунд (players-cache). Пока
// снимок лежит, игрок успевает шагнуть: снимок видит его в A, а на самом деле он
// уже в B. Вычитать «по текущей клетке» (ownCell) здесь нельзя — в A остаётся
// +1 (свой же лагерь на шаг позади, «тень», 20.09), а в B уходит −1 у соседа,
// которого тогда с карты просто стирает. Поэтому снимок сам помнит, ГДЕ он видел
// каждого (`at`), и вычитание идёт по аккаунту из той же клетки: старая ли
// раскладка, свежая ли — себя в ней игрок не увидит никогда.
export type CountedCell = { q: number; r: number; count: number };

/**
 * `cells` — счёт по клеткам, `at` — где снимок видел каждый аккаунт («q,r»),
 * `account` — кого вычитаем. Клетка, где остался ноль, из ответа выпадает.
 */
export function subtractSelf(
  cells: readonly CountedCell[],
  at: ReadonlyMap<string, string>,
  account: string,
): CountedCell[] {
  const myKey = at.get(account);
  const out: CountedCell[] = [];
  for (const row of cells) {
    const count = `${row.q},${row.r}` === myKey ? row.count - 1 : row.count;
    if (count > 0) out.push({ q: row.q, r: row.r, count });
  }
  return out;
}
