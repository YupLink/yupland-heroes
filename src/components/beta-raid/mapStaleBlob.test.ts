// Снимок старой сборки (без lists.mines или lists.veins) при раскатке: старый
// рабочий отвечает новому клиенту 200 или 304 из кэша браузера. В кэш
// устройства (ключ g5) такой снимок класть нельзя — иначе герой ходит сквозь
// шахты, а жил не видно до ближайшего «full» журнала. Обычный вход — ровно
// один запрос.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./mapCache", () => ({ readCachedMap: vi.fn(), writeCachedMap: vi.fn() }));

import { writeCachedMap } from "./mapCache";
import { mapFromBlob } from "./mapBlob";
import { cacheFits, loadFull, STALE_BLOB_RETRY_MS } from "./useMapProgressive";
import {
  encodeMapBlob,
  MAP_BLOB_FORMAT,
  MAP_COLUMNS,
  type MapBlobHeader,
} from "@/lib/raid/mapCodec";
import { useAppStore } from "@/lib/store";

/**
 * Снимок на две клетки; mines: undefined — старая сборка (поля нет вовсе).
 * veins: по умолчанию пустой список при наличии шахт (сборка g4 и новее);
 * null — поля нет (сборка g3 или база без таблицы жил).
 */
function blob(
  mines: number[] | undefined,
  revision = 7,
  veins: number[] | null = mines ? [] : null,
): Uint8Array {
  const header: MapBlobHeader = {
    format: MAP_BLOB_FORMAT,
    n: 2,
    revision,
    variant: "player",
    map: { id: "rmap_t", name: "t", size: 8 },
    dicts: {
      terrainIds: ["grass"],
      roadIds: [],
      objectIds: [],
      decorationIds: [],
      buildingIds: [],
    },
    lists: {
      defeated: [],
      runners: [],
      voidFog: [],
      townHalls: [],
      ...(mines ? { mines } : {}),
      ...(veins ? { veins } : {}),
    },
    terrains: {},
    objects: {},
    decorations: {},
    roads: {},
    buildings: {},
    buildingTiers: {},
    doors: [],
  };
  const cols = Object.fromEntries(MAP_COLUMNS.map((c) => [c, [0, 1]])) as Record<
    (typeof MAP_COLUMNS)[number],
    number[]
  >;
  return encodeMapBlob(header, cols);
}

/** fetch, отвечающий по очереди заданными снимками (или кодом ошибки). */
function serve(...answers: Array<Uint8Array | number>) {
  const calls: Array<RequestInit | undefined> = [];
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    calls.push(init);
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (typeof a === "number") return new Response("err", { status: a });
    return new Response(a.slice().buffer, { status: 200 });
  }) as unknown as typeof fetch;
  return calls;
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(writeCachedMap).mockClear();
  useAppStore.setState({ walletAddress: "w1" });
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
  useAppStore.setState({ walletAddress: null });
});

/** loadFull с прокруткой паузы перед повтором. */
async function load() {
  const p = loadFull();
  await vi.advanceTimersByTimeAsync(STALE_BLOB_RETRY_MS + 10);
  return p;
}

describe("loadFull: снимок без списка шахт в кэш устройства не попадает", () => {
  it("обычный вход: один запрос через HTTP-кэш, снимок сохранён", async () => {
    const calls = serve(blob([1]));
    const data = await load();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cache).toBeUndefined();
    expect(data.packed?.mines).toEqual([1]);
    expect(writeCachedMap).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeCachedMap).mock.calls[0][0]).toMatchObject({
      mapId: "last",
      variant: "w1",
      revision: 7,
    });
  });

  it("пустой список шахт — тоже нынешняя сборка: без повтора", async () => {
    const calls = serve(blob([]));
    await load();
    expect(calls).toHaveLength(1);
    expect(writeCachedMap).toHaveBeenCalledTimes(1);
  });

  it("старый снимок → повтор мимо HTTP-кэша → новый сохранён", async () => {
    const calls = serve(blob(undefined, 7), blob([0], 8));
    const p = loadFull();
    await vi.advanceTimersByTimeAsync(STALE_BLOB_RETRY_MS - 100);
    expect(calls).toHaveLength(1); // повтор — после паузы, не сразу
    await vi.advanceTimersByTimeAsync(200);
    const data = await p;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.cache).toBe("no-store");
    expect(data.packed?.mines).toEqual([0]);
    expect(writeCachedMap).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(writeCachedMap).mock.calls[0][0];
    expect(saved.revision).toBe(8);
    expect(mapFromBlob(saved.bytes)?.packed?.mines).toEqual([0]);
  });

  it("шахты есть, жил нет (сборка g3 или база без таблицы жил) — тоже старый", async () => {
    const calls = serve(blob([1], 7, null), blob([1], 8, [0, 1, 3]));
    const data = await load();
    expect(calls).toHaveLength(2);
    expect(data.packed?.veins).toEqual([0, 1, 3]);
    expect(writeCachedMap).toHaveBeenCalledTimes(1);
    expect(mapFromBlob(vi.mocked(writeCachedMap).mock.calls[0][0].bytes)?.packed?.veins).toEqual([
      0, 1, 3,
    ]);
  });

  it("и повтор старый — живём им эту сессию, не сохраняя", async () => {
    const calls = serve(blob(undefined, 7), blob(undefined, 9));
    const data = await load();
    expect(calls).toHaveLength(2);
    expect(data.revision).toBe(9);
    expect(data.packed?.mines).toBeUndefined();
    expect(writeCachedMap).not.toHaveBeenCalled();
  });

  it("повтор упал — первый снимок на экран, в кэш ничего", async () => {
    const calls = serve(blob(undefined, 7), 502);
    const data = await load();
    expect(calls).toHaveLength(2);
    expect(data.revision).toBe(7);
    expect(writeCachedMap).not.toHaveBeenCalled();
  });

  it("без аккаунта не пишем и нормальный снимок", async () => {
    useAppStore.setState({ walletAddress: null });
    serve(blob([2]));
    await load();
    expect(writeCachedMap).not.toHaveBeenCalled();
  });
});

describe("cacheFits: снимок из IndexedDB без списка шахт не годится", () => {
  const fromBlob = (mines: number[] | undefined) => mapFromBlob(blob(mines).slice().buffer)!;

  it("со списком — годится, без поля — нет", () => {
    expect(cacheFits(fromBlob([3]), false)).toBe(true);
    expect(cacheFits(fromBlob([]), false)).toBe(true);
    expect(cacheFits(fromBlob(undefined), false)).toBe(false);
  });

  it("снимок g3 (шахты есть, жил нет) из кэша не берём", () => {
    const g3 = mapFromBlob(blob([3], 7, null).slice().buffer)!;
    expect(cacheFits(g3, false)).toBe(false);
  });

  it("админский снимок — только админу", () => {
    const admin = { ...fromBlob([]), variant: "admin" as const };
    expect(cacheFits(admin, false)).toBe(false);
    expect(cacheFits(admin, true)).toBe(true);
  });
});
