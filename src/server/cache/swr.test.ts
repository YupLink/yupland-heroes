// Кэш «отдай сразу, обнови фоном»: что он обещает и где раньше врал.
//
// Обещание drop(): следующий читатель ЖДЁТ свежее. Оно нарушалось, когда
// фоновое обновление стартовало ДО записи и до drop(), а легло ПОСЛЕ
// перечитывания: дозаписное значение возвращалось со свежим штампом. Для
// причалов рейда это значило: судно после гребка «отъезжало» на прошлую
// клетку через треть секунды после того, как его уже показали верно.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { swrCache } from "./swr";

/**
 * Источник с ручным управлением. Как база: загрузка видит значение на момент
 * СТАРТА (снимок), а отдаёт его, когда мы её отпустим — так моделируется
 * долгий GROUP BY, начатый до чужой записи.
 */
function manualLoader() {
  let value = "A";
  const pending: Array<() => void> = [];
  return {
    set: (v: string) => {
      value = v;
    },
    load: () => {
      const seen = value;
      return new Promise<string>((resolve) => {
        pending.push(() => resolve(seen));
      });
    },
    /** Отпустить i-ю по счёту висящую загрузку (0 — самую старую). */
    release: (i = 0) => {
      const [r] = pending.splice(i, 1);
      if (r) r();
    },
    pendingCount: () => pending.length,
  };
}

/** Дать отработать then/catch внутри кэша после отпущенной загрузки. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("swrCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("свежее значение отдаётся как есть, даже если источник уже изменился", async () => {
    const src = manualLoader();
    const cache = swrCache<string>({ ttl: 2_000, load: src.load, maxStale: 10_000 });
    const first = cache.get("k");
    src.release();
    expect(await first).toBe("A");
    src.set("B");
    // Внутри ttl — старое, без похода в источник.
    expect(await cache.get("k")).toBe("A");
    expect(src.pendingCount()).toBe(0);
  });

  it("после drop() читатель ждёт и получает свежее", async () => {
    const src = manualLoader();
    const cache = swrCache<string>({ ttl: 2_000, load: src.load, maxStale: 10_000 });
    const first = cache.get("k");
    src.release();
    await first;
    src.set("B");
    cache.drop("k");
    const second = cache.get("k");
    expect(src.pendingCount()).toBe(1);
    src.release();
    expect(await second).toBe("B");
  });

  it("фоновое обновление, начатое до drop(), не воскрешает старое значение", async () => {
    const src = manualLoader();
    const cache = swrCache<string>({ ttl: 2_000, load: src.load, maxStale: 10_000 });
    const first = cache.get("k");
    src.release();
    await first;

    // Значение протухло (2 с прошли): читатель получает старое, фон стартует
    // и видит ещё «A».
    vi.advanceTimersByTime(2_500);
    expect(await cache.get("k")).toBe("A");
    expect(src.pendingCount()).toBe(1);

    // Пока фон висит, источник изменился и ключ выбросили: следующий читатель
    // ждёт свежую загрузку.
    src.set("B");
    cache.drop("k");
    const fresh = cache.get("k");
    expect(src.pendingCount()).toBe(2);

    // Свежая загрузка доезжает первой, фон — после неё (он и был долгим).
    src.release(1);
    expect(await fresh).toBe("B");
    src.release(0);
    await settle();

    // Раньше фон клал «A» поверх «B» со свежим штампом — и ещё 2 с все читали
    // дозаписное состояние.
    expect(await cache.get("k")).toBe("B");
    expect(cache.peek("k")).toBe("B");
  });

  it("первая загрузка, начатая до drop(), не ложится в кэш и не делится со следующим", async () => {
    const src = manualLoader();
    const cache = swrCache<string>({ ttl: 2_000, load: src.load, maxStale: 10_000 });
    // Кэш пуст: первая загрузка видит «A» и висит.
    const early = cache.get("k");
    // Пока висит, источник изменился и ключ выбросили.
    src.set("B");
    cache.drop("k");
    // Новый читатель не присоединяется к старой загрузке — ждёт свою.
    const late = cache.get("k");
    expect(src.pendingCount()).toBe(2);
    src.release(0);
    expect(await early).toBe("A");
    await settle();
    // Дозаписное «A» в кэш не легло.
    expect(cache.peek("k")).toBeUndefined();
    src.release(0);
    expect(await late).toBe("B");
    expect(cache.peek("k")).toBe("B");
  });
});
