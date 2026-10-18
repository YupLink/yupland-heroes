// Счётчики живого канала (SSE): сколько событий каких типов и скольким
// слушателям они разлетаются.
//
// Зачем. Одно событие «built» заставляет КАЖДОГО подписчика перекачать карту,
// «moved» — раскладку игроков. То есть нагрузка на сервер и на телефоны
// рождается здесь, а не в самих вызовах, и без счётчика её видно только по
// косвенным следам (число вызовов карты в pg_stat_statements). Здесь считаем
// прямо: событий за окно, отправок (событие × слушатели), сколько сейчас
// подключено. Память процесса, никаких походов наружу.
const counts = new Map<string, number>();
let fanoutTotal = 0;
let since = Date.now();
let listenersNow = 0;
let listenersPeak = 0;

/** Одно опубликованное событие (только у воркера-издателя). */
export function noteEvent(type: string): void {
  counts.set(type, (counts.get(type) ?? 0) + 1);
}

/** Раздача события `listeners` местным подписчикам — на каждом воркере. */
export function noteFanout(listeners: number): void {
  fanoutTotal += listeners;
  noteListeners(listeners);
}

/** Сколько подписчиков прямо сейчас — зовётся при подписке/отписке. */
export function noteListeners(n: number): void {
  listenersNow = n;
  if (n > listenersPeak) listenersPeak = n;
}

export type HubSnapshot = {
  since: number;
  /** Подписчиков сейчас и максимум за окно (этот воркер). */
  listeners: number;
  listenersPeak: number;
  /** Событий по типам за окно. */
  events: Record<string, number>;
  /** Отправок клиентам всего (событие × слушатели) и в минуту. */
  fanout: number;
  fanoutPerMin: number;
  eventsPerMin: number;
};

export function hubSnapshot(): HubSnapshot {
  const events: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of counts) {
    events[k] = v;
    total += v;
  }
  const minutes = Math.max(1 / 60, (Date.now() - since) / 60_000);
  return {
    since,
    listeners: listenersNow,
    listenersPeak,
    events,
    fanout: fanoutTotal,
    fanoutPerMin: Math.round(fanoutTotal / minutes),
    eventsPerMin: Math.round((total / minutes) * 10) / 10,
  };
}

export function hubReset(): void {
  counts.clear();
  fanoutTotal = 0;
  listenersPeak = listenersNow;
  since = Date.now();
}

/** Слить снимки нескольких воркеров: события складываем, слушателей тоже. */
export function mergeHub(parts: HubSnapshot[]): HubSnapshot {
  const out: HubSnapshot = {
    since: Date.now(),
    listeners: 0,
    listenersPeak: 0,
    events: {},
    fanout: 0,
    fanoutPerMin: 0,
    eventsPerMin: 0,
  };
  for (const p of parts) {
    out.since = Math.min(out.since, p.since);
    out.listeners += p.listeners;
    out.listenersPeak += p.listenersPeak;
    out.fanout += p.fanout;
    out.fanoutPerMin += p.fanoutPerMin;
    out.eventsPerMin += p.eventsPerMin;
    for (const k of Object.keys(p.events)) out.events[k] = (out.events[k] ?? 0) + p.events[k];
  }
  out.eventsPerMin = Math.round(out.eventsPerMin * 10) / 10;
  return out;
}
