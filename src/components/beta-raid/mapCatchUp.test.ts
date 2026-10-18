// Гонка догона журналом: пока журнал ждал сеть, в кэш лёг побег (applyFled) —
// ответ обязан лечь ПОВЕРХ него, а не вернуть карту, снятую до ожидания.
// Так гриб «исчезал на несколько секунд»: каждый удар (invalidateRaidMap) и
// минутная сверка откатывали его на старую клетку до следующей дельты «map».
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("./mapCache", () => ({ readCachedMap: vi.fn(), writeCachedMap: vi.fn() }));

import { applyFled } from "./applyFled";
import { readCellDetails, type MapLike } from "./patchMapCache";
import { applyLiveDelta, catchUp, MAP_KEY } from "./useMapProgressive";
import { synthMap } from "@/test/mapFixture";
import type { MapDataV } from "./mapBlob";
import type { MapDelta } from "@/lib/raid/mapDelta";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** fetch журнала, который отвечает только по команде. */
function pendingJournal(answer: MapDelta & { mapId?: string }) {
  let release: () => void = () => {};
  const gate = new Promise<void>((res) => {
    release = res;
  });
  globalThis.fetch = vi.fn(async () => {
    await gate;
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return () => release();
}

const cellOf = (qc: QueryClient, q: number, r: number) =>
  readCellDetails(qc.getQueryData(MAP_KEY) as MapLike, q, r);

function setup() {
  const qc = new QueryClient();
  qc.setQueryData(
    MAP_KEY,
    synthMap([
      { q: 0, r: 0, objectId: "mush" },
      { q: 2, r: 0 },
      { q: 5, r: 5 },
    ]),
  );
  return qc;
}

const fled = (qc: QueryClient) =>
  applyFled(qc, [
    {
      from: "0,0",
      to: "2,0",
      objectId: "mush",
      layer: 0,
      patches: [
        { q: 0, r: 0, objectId: null, runner: false, alive: true },
        { q: 2, r: 0, objectId: "mush", runner: true, alive: true },
      ],
    },
  ]);

describe("догон журналом не затирает побег, пришедший во время запроса", () => {
  it("живая дельта с пропуском версии → журнал → слияние с текущим кэшем", async () => {
    const qc = setup();
    const release = pendingJournal({
      rev: 102,
      mapId: "rmap_t",
      patches: [{ q: 5, r: 5, objectId: "chest", runner: false, alive: true }],
    });
    const cur = qc.getQueryData<MapDataV>(MAP_KEY)!;
    const pending = applyLiveDelta(cur, { rev: 102, mapId: "rmap_t", patches: [] });
    fled(qc);
    release();
    const merge = await pending;
    qc.setQueryData(MAP_KEY, (latest?: MapDataV) => merge(latest ?? cur));
    expect(cellOf(qc, 0, 0).objectId).toBeNull();
    expect(cellOf(qc, 2, 0)).toMatchObject({ objectId: "mush", runner: true });
    expect(cellOf(qc, 5, 5).objectId).toBe("chest");
    expect(qc.getQueryData<MapDataV>(MAP_KEY)!.revision).toBe(102);
  });

  it("catchUp (queryFn/интервал) — то же слияние; кэш новее ответа не откатывается", async () => {
    const qc = setup();
    const release = pendingJournal({ rev: 101, mapId: "rmap_t", patches: [] });
    const cur = qc.getQueryData<MapDataV>(MAP_KEY)!;
    const pending = catchUp(cur);
    fled(qc);
    release();
    const merge = await pending;
    qc.setQueryData(MAP_KEY, (latest?: MapDataV) => merge(latest ?? cur));
    expect(cellOf(qc, 2, 0)).toMatchObject({ objectId: "mush", runner: true });
    expect(qc.getQueryData<MapDataV>(MAP_KEY)!.revision).toBe(101);
    // Кэш уже на 105 — ответ журнала с 101 ничего не трогает (undefined = как есть).
    const ahead = { ...qc.getQueryData<MapDataV>(MAP_KEY)!, revision: 105 };
    expect(merge(ahead)).toBeUndefined();
  });

  it("следующая по номеру дельта ложится синхронно, без сети", async () => {
    const qc = setup();
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("не должно звать сеть")));
    const cur = qc.getQueryData<MapDataV>(MAP_KEY)!;
    const merge = await applyLiveDelta(cur, {
      rev: 101,
      patches: [{ q: 5, r: 5, objectId: "chest", runner: false, alive: true }],
    });
    qc.setQueryData(MAP_KEY, (latest?: MapDataV) => merge(latest ?? cur));
    expect(cellOf(qc, 5, 5).objectId).toBe("chest");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("карта с версией 0 (новый остров) — тоже карта с версией", () => {
  // Владелец 15.10: забрал сундук на острове — сундук вернулся и не давался
  // («Объект не найден»). У новой карты версия 0, и «!revision» считал её
  // картой без версии: журнал не накладывался, перечитка брала снимок из кэша.
  const island = () =>
    synthMap(
      [
        { q: 5, r: 5, objectId: "chest" },
        { q: 1, r: 1 },
      ],
      0,
      "isle_t",
    );

  it("догон журналом с версии 0 накладывает правки", async () => {
    const qc = new QueryClient();
    qc.setQueryData(MAP_KEY, island());
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            rev: 3,
            mapId: "isle_t",
            patches: [{ q: 5, r: 5, objectId: null, runner: false, alive: true }],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const cur = qc.getQueryData<MapDataV>(MAP_KEY)!;
    const merge = await catchUp(cur);
    qc.setQueryData(MAP_KEY, (latest?: MapDataV) => merge(latest ?? cur));
    expect(cellOf(qc, 5, 5).objectId).toBeNull();
    expect(qc.getQueryData<MapDataV>(MAP_KEY)!.revision).toBe(3);
  });

  it("живая дельта 1 на карте версии 0 ложится сразу", async () => {
    const cur = island();
    const merge = await applyLiveDelta(cur, {
      rev: 1,
      mapId: "isle_t",
      patches: [{ q: 5, r: 5, objectId: "chest", runner: false, alive: false }],
    });
    const next = merge(cur)!;
    expect(next.revision).toBe(1);
    expect(readCellDetails(next as MapLike, 5, 5).defeated).toBe(true);
  });
});
