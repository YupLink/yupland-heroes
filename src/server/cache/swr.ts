// Кэш, который НИКОГДА не заставляет игрока ждать обновления.
//
// Обычный кэш с TTL устроен так: пока значение свежее — отдаём, протухло —
// идём в базу и ЖДЁМ. Расплачивается за это тот игрок, чей ход выпал на
// границу срока: раз в пятнадцать секунд один шаг стоил цепочки запросов
// (герой), раз в тридцать — скана всей карты (снимок беглецов). Со стороны это
// выглядит как «ход иногда залипает» без всякой причины.
//
// Хуже того, любая правка карты такие кэши сбрасывала НАСУХО, и следующий шаг
// платил полную загрузку заново — отсюда жалоба «после каждой правки каждый ход
// долго грузится».
//
// Здесь протухшее значение отдаётся сразу, а обновление идёт ФОНОМ. Ждать
// приходится ровно один раз — когда значения нет вовсе.
//
// Что важно помнить про такой кэш: пару десятков миллисекунд после правки
// читатель ещё видит прежнее значение. Для подсказок (кто убегает, какой у
// игрока герой) это безобидно — настоящие проверки живут в SQL самих
// операций. Для денег и прав доступа так делать нельзя: там drop(), а не
// stale().
export type SwrCache<V> = {
  /** Значение: свежее — сразу, протухшее — сразу и обновится фоном. */
  get(key: string): Promise<V>;
  /** Что лежит в кэше прямо сейчас, без загрузки. */
  peek(key: string): V | undefined;
  /** Пометить протухшим: читатель получит старое, обновление пойдёт фоном. */
  stale(key?: string): void;
  /** Выбросить совсем: следующий читатель будет ЖДАТЬ свежее значение. */
  drop(key?: string): void;
  /** Загрузить заранее, между ходами. Ошибку глотает — это профилактика. */
  warm(key: string): void;
  /** Для отладки и хронометража. */
  stats(): { keys: number; hits: number; misses: number; background: number };
};

type Entry<V> = {
  value: V;
  /** Когда значение получено. */
  at: number;
  /** Идёт фоновое обновление — второе не запускаем. */
  busy: boolean;
};

export function swrCache<V>(opts: {
  /** Сколько значение считается свежим. */
  ttl: number;
  load: (key: string) => Promise<V>;
  /**
   * Насколько протухшее значение ещё годится отдавать. Дольше этого срока
   * читатель ЖДЁТ свежее: после долгого простоя лучше секунда ожидания, чем
   * ответ получасовой давности.
   */
  maxStale?: number;
  /** Пауза после неудачного фонового обновления, чтобы не долбить упавшую базу. */
  errorBackoff?: number;
}): SwrCache<V> {
  const { ttl, load, maxStale = Math.max(ttl * 20, 600_000), errorBackoff = 2_000 } = opts;
  const cells = new Map<string, Entry<V>>();
  /** Первая загрузка ключа — общая на всех, кто её ждёт. */
  const waiting = new Map<string, Promise<V>>();
  /**
   * Поколение ключа: drop() его сдвигает. Первая загрузка, начатая до drop(),
   * своё (дозаписное) значение в кэш уже не кладёт, а новые читатели к ней не
   * присоединяются — ждут свою, свежую (14.10.2026: призраки на карте —
   * сундук, который уже забрали, рисовался снова).
   */
  const gens = new Map<string, number>();
  let genAll = 0;
  const genOf = (key: string) => `${genAll}:${gens.get(key) ?? 0}`;
  let hits = 0;
  let misses = 0;
  let background = 0;

  function refresh(key: string, entry: Entry<V>): void {
    if (entry.busy) return;
    entry.busy = true;
    background++;
    load(key)
      .then((value) => {
        // Пока грузили, ключ могли выбросить (drop) или заменить свежей
        // загрузкой после него. Наш результат снят ДО той записи, ради
        // которой выбрасывали, и положенный поверх воскресил бы её отменённое
        // состояние ещё на ttl со свежим штампом — причалы после гребка
        // возвращались к прошлой клетке через треть секунды после починки.
        // Кладём, только если в кэше всё ещё та запись, что мы обновляли.
        if (cells.get(key) !== entry) return;
        cells.set(key, { value, at: Date.now(), busy: false });
      })
      .catch(() => {
        // Значение оставляем прежним: старое лучше ошибки. Сдвигаем срок, чтобы
        // следующий читатель попробовал не сразу, а после паузы.
        entry.busy = false;
        entry.at = Date.now() - ttl + errorBackoff;
      });
  }

  async function get(key: string): Promise<V> {
    const hit = cells.get(key);
    const age = hit ? Date.now() - hit.at : Infinity;
    if (hit && age < ttl) {
      hits++;
      return hit.value;
    }
    if (hit && age < maxStale) {
      hits++;
      refresh(key, hit);
      return hit.value;
    }
    misses++;
    const already = waiting.get(key);
    if (already) return already;
    const gen = genOf(key);
    const p: Promise<V> = load(key).finally(() => {
      if (waiting.get(key) === p) waiting.delete(key);
    });
    waiting.set(key, p);
    const value = await p;
    if (genOf(key) === gen) cells.set(key, { value, at: Date.now(), busy: false });
    return value;
  }

  return {
    get,
    peek: (key) => cells.get(key)?.value,
    stale(key) {
      // Сдвигаем возраст за границу свежести, но значение оставляем: читатель
      // получит его сразу, а обновление пойдёт фоном.
      const touch = (e: Entry<V>) => {
        e.at = Date.now() - ttl - 1;
      };
      if (key === undefined) cells.forEach(touch);
      else {
        const hit = cells.get(key);
        if (hit) touch(hit);
      }
    },
    drop(key) {
      if (key === undefined) {
        cells.clear();
        waiting.clear();
        genAll++;
      } else {
        cells.delete(key);
        waiting.delete(key);
        gens.set(key, (gens.get(key) ?? 0) + 1);
      }
    },
    warm(key) {
      void get(key).catch(() => {});
    },
    stats: () => ({ keys: cells.size, hits, misses, background }),
  };
}
