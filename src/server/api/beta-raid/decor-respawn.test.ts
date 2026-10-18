// Респавн декора (владелец, 28.09): срубленный декор с «Респавн, мин» встаёт
// на ту же клетку в срок; клетка занята (игрок, корабль, беглец, сундук) —
// позже, и ждущие не душат очередь; админ поменял клетку — возврат снимается и
// ничего не перетирает; два сборщика не ставят дважды; игроки видят декор
// дельтой — даже если ответ моста или сама рассылка потерялись.
//
// Базы нет: src/test/respawnFake.ts держит клетки и очередь и выполняет разбор
// целиком, одним оператором — как Postgres под локом. Текст SQL проверяет
// decor-respawn-sql.test.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { K, cell, fake, resetFake, respawnDb } from "@/test/respawnFake";

const s = vi.hoisted(() => ({
  bags: [] as string[],
  journal: [] as Array<{ mapId: string; patches: unknown[]; assets: unknown }>,
  journalFails: 0,
  /** Что успеет случиться с базой, пока рассылка идёт (соседняя рубка, кисть). */
  meanwhile: null as (() => void) | null,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    await Promise.resolve();
    return respawnDb(sql);
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: { type: string; cells: string[] }) => void s.bags.push(`${e.type}:${e.cells}`),
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (
    mapId: string,
    change: { patches: unknown[] },
    assetsFor?: (rev: number) => Promise<unknown>,
  ) => {
    if (s.journalFails > 0 && s.journalFails--) throw new Error("journal down");
    s.meanwhile?.();
    s.meanwhile = null;
    s.journal.push({ mapId, patches: change.patches, assets: await assetsFor?.(1) });
    return 1;
  },
}));

const { scheduleDecorRespawn, sweepDecorRespawns } = await import("./decor-respawn");

const min = (n: number) => n * 60_000;
/** Срубили ёлку на (1,0): клетка пуста, возврат через 30 минут. */
const chopped = (q = 1) =>
  scheduleDecorRespawn({ mapId: "m", q, r: 0, decorId: "decoration_pine", minutes: 30 });
const here = (q = 1) => fake.cells.get(K("m", q, 0))!;
const back = { q: 1, r: 0, decorationId: "decoration_pine" };

beforeEach(() => {
  resetFake();
  s.bags = [];
  s.journal = [];
  s.journalFails = 0;
  s.meanwhile = null;
});

describe("респавн поверх мешочка и бугорка (дополнение №5)", () => {
  it("мешочек или бугорок рост не держат: декор встал, игроки рядом перечитали слой", async () => {
    await chopped();
    fake.covered.add("m:1:0");
    fake.now += min(30);
    expect(await sweepDecorRespawns()).toBe(1);
    expect(here().decor).toBe("decoration_pine");
    // Рассылка повторяема (фоновый проход может дослать то же) — важно, что событие есть.
    expect(s.bags).toContain("bags:1,0");
  });

  it("пустая клетка — без лишнего события мешочков", async () => {
    await chopped();
    fake.now += min(30);
    await sweepDecorRespawns();
    expect(s.bags).toEqual([]);
  });
});

describe("респавн декора", () => {
  it("возвращается в срок, не раньше; клиенты получают клетку с декором и словарь", async () => {
    await chopped();
    fake.now += min(29);
    expect(await sweepDecorRespawns()).toBe(0);
    expect(here().decor).toBeNull();
    fake.now += min(1);
    expect(await sweepDecorRespawns()).toBe(1);
    expect(here().decor).toBe("decoration_pine");
    expect(fake.rows.size).toBe(0);
    const decorations = {
      decoration_pine: { id: "decoration_pine", name: "Ёлка", imageUrl: "/pine.png" },
    };
    expect(s.journal).toEqual([{ mapId: "m", patches: [back], assets: { decorations } }]);
  });

  it("клетка занята (игрок, корабль, беглец, сундук) — ждём, освободилась — вернулся", async () => {
    await chopped();
    fake.now += min(30);
    fake.busy.add("m:1:0");
    expect(await sweepDecorRespawns()).toBe(0);
    expect(fake.rows.get("m:1:0")?.due).toBe(fake.now + min(1));
    expect(here().decor).toBeNull();
    fake.busy.clear();
    fake.now += min(1);
    expect(await sweepDecorRespawns()).toBe(1);
    expect(here().decor).toBe("decoration_pine");
  });

  it("ждущие не душат очередь: 200 занятых впереди не держат свободную клетку", async () => {
    for (let q = 2; q < 202; q++) {
      fake.cells.set(K("m", q, 0), cell());
      await chopped(q);
      fake.busy.add(K("m", q, 0));
    }
    fake.now += 1;
    await chopped(); // свободная клетка — последней по сроку
    fake.now += min(30);
    await sweepDecorRespawns(); // первые 200 — ждут, их срок уехал на минуту
    expect(here().decor).toBeNull();
    await sweepDecorRespawns();
    expect(here().decor).toBe("decoration_pine");
  });

  it("админ поставил другое — возврат снят, чужое не перетёрто", async () => {
    for (const change of [
      { decor: "decoration_rock" },
      { building: "bld_house" },
      { terrain: "sand" },
      { object: "boss:rbt_1" },
      { group: "grp_1" },
    ]) {
      fake.cells.set("m:1:0", cell());
      await chopped();
      Object.assign(here(), change);
      fake.now += min(30);
      expect(await sweepDecorRespawns()).toBe(0);
      expect(fake.rows.size).toBe(0);
      expect(here()).toMatchObject(change);
    }
    expect(s.journal).toHaveLength(0);
  });

  it("клетку стёрли или шаблон удалили — снят; объект, что стоял при рубке, не мешает", async () => {
    await chopped();
    fake.cells.delete("m:1:0");
    fake.now += min(30);
    await sweepDecorRespawns();
    expect(fake.rows.size).toBe(0);
    fake.cells.set("m:1:0", cell({ object: "boss:rbt_1" }));
    await chopped();
    fake.now += min(30);
    expect(await sweepDecorRespawns()).toBe(1);
    fake.cells.set("m:1:0", cell());
    await chopped();
    fake.dead.add("decoration_pine");
    fake.now += min(30);
    expect(await sweepDecorRespawns()).toBe(0);
    expect(fake.rows.size).toBe(0);
  });

  it("два сборщика разом — декор встал один раз, клетка разослана", async () => {
    await chopped();
    fake.now += min(30);
    await Promise.all([sweepDecorRespawns(), sweepDecorRespawns()]);
    expect(here().decor).toBe("decoration_pine");
    expect(fake.rows.size).toBe(0);
    expect(s.journal.length).toBeGreaterThanOrEqual(1);
    for (const j of s.journal) expect(j.patches).toEqual([back]);
  });

  it("ответ разбора потерян (мост) — вставший декор всё равно разослан", async () => {
    await chopped();
    fake.now += min(30);
    fake.loseSweep = true;
    expect(await sweepDecorRespawns()).toBe(1);
    expect(s.journal.map((j) => j.patches)).toEqual([[back]]);
    expect(fake.rows.size).toBe(0);
  });

  it("рассылка упала — строка ждёт, следующий проход дошлёт; невидимой стены нет", async () => {
    await chopped();
    fake.now += min(30);
    s.journalFails = 1;
    expect(await sweepDecorRespawns()).toBe(0);
    expect(here().decor).toBe("decoration_pine");
    expect(fake.rows.get("m:1:0")?.placed).not.toBeNull();
    fake.now += min(1);
    expect(await sweepDecorRespawns()).toBe(1);
    expect(s.journal.map((j) => j.patches)).toEqual([[back]]);
    expect(fake.rows.size).toBe(0);
  });

  it("клетку срубили, пока рассылка шла, — досылаем правду поверх: призрака нет", async () => {
    await chopped();
    fake.now += min(30);
    s.meanwhile = () => void (here().decor = null); // рубка проскочила между чтением и журналом
    await sweepDecorRespawns();
    expect(s.journal.map((j) => j.patches)).toEqual([[back], [{ q: 1, r: 0, decorationId: null }]]);
  });

  it("срубили между «встал» и «разослан» — новая постановка не снята, старая не шлётся", async () => {
    await chopped();
    fake.now += min(30);
    fake.loseSweep = true;
    s.journalFails = 1; // встал, но рассылка упала
    await sweepDecorRespawns();
    here().decor = null; // игрок срубил вставший декор
    await chopped(); // рубка ставит возврат заново: placed_at сброшен
    await sweepDecorRespawns();
    expect(s.journal).toHaveLength(0);
    expect(fake.rows.get("m:1:0")).toMatchObject({ placed: null, due: fake.now + min(30) });
  });

  it("повторная рубка до срока — одна строка на клетку, срок новый", async () => {
    await chopped();
    fake.now += min(10);
    await chopped();
    expect(fake.rows.size).toBe(1);
    expect(fake.rows.get("m:1:0")!.due).toBe(fake.now + min(30));
  });
});
