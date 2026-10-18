// Обёртка над персистером react-query: пишем в localStorage только то, что
// действительно изменилось.
//
// persistQueryClient дёргает сохранение на КАЖДОЕ событие кэша, а один шаг
// героя по карте рейда — это несколько setQueryData подряд (позиция, энергия,
// отметка «устарело»). Каждое такое пробуждение сериализовало ВЕСЬ кэш вместе
// с картой рейда на 274 КБ — синхронным JSON.stringify и синхронной записью в
// localStorage, по разу в секунду всё время, пока игрок идёт.
//
// Подпись «запрос → метка свежести» стоит доли миллисекунды и отсекает пустые
// записи: пока меняются только оптимистичные снимки (они держат прежний
// updatedAt, см. useBetaMovement), в локалке и так лежит то же самое.
//
// 14.10.2026: одной метки мало. Опрос (энергия, билеты — раз в 15 с) двигает
// dataUpdatedAt и при том же ответе, и весь кэш (до 1,2 МБ у 90-го
// процентиля) переписывался 15–20 раз в минуту. Теперь запрос «посвежел»,
// только если сдвинулась метка И сменились сами данные: одинаковый ответ
// react-query отдаёт тем же объектом (structural sharing).
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

/** Номер объекта данных: тот же ответ — тот же объект — тот же номер. */
const ids = new WeakMap<object, number>();
let nextId = 0;
function idOf(data: unknown): string {
  if (data === null || typeof data !== "object") return `v:${String(data)}`;
  let id = ids.get(data);
  if (id === undefined) {
    id = ++nextId;
    ids.set(data, id);
  }
  return `o:${id}`;
}

type Seen = { at: number; id: string };

/** Остальное в снимке: версия кэша и мутации (их немного). */
function restOf(client: PersistedClient): string {
  const parts = [String(client.buster)];
  for (const mutation of client.clientState.mutations) {
    parts.push(`m:${mutation.state.submittedAt}`);
  }
  return parts.join("|");
}

export function persistIfChanged(base: Persister): Persister {
  let seen = new Map<string, Seen>();
  let rest: string | null = null;
  return {
    ...base,
    persistClient: (client: PersistedClient) => {
      const nextRest = restOf(client);
      let fresh = nextRest !== rest;
      const next = new Map<string, Seen>();
      for (const query of client.clientState.queries) {
        const cur = { at: query.state.dataUpdatedAt, id: idOf(query.state.data) };
        const old = seen.get(query.queryHash);
        next.set(query.queryHash, cur);
        // Оптимистичный снимок держит метку, повтор опроса — объект: не свежее.
        if (!old || (old.at !== cur.at && old.id !== cur.id)) fresh = true;
      }
      if ([...seen.keys()].some((hash) => !next.has(hash))) fresh = true;
      seen = next;
      rest = nextRest;
      if (!fresh) return;
      return base.persistClient(client);
    },
    removeClient: () => {
      seen = new Map();
      rest = null;
      return base.removeClient();
    },
  };
}
