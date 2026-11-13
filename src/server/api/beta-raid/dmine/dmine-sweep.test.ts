// Обход грибов DARAI: сначала конец жизни (dmine-expire), потом просроченные
// (час в рюкзаке) — мешочка нет, гриб встаёт у героя (dmine-autoplace); ставить
// некуда — гриб ждёт и очередь не держит; сбой — откладывается; неразосланные
// клетки досылаются. И рассылка клетки: только если на ней всё ещё наше;
// забрали гриб-блок — снимок карты целиком.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  due: [] as Array<Record<string, unknown>>,
  unsent: [] as Array<Record<string, unknown>>,
  /** Ответ автопостановки по id строки рюкзака (нет — «встала»). */
  auto: new Map<string, string>(),
  autoCalls: [] as string[],
  published: [] as Array<Record<string, unknown>>,
  recorded: [] as Array<{ mapId: string; patches?: unknown[]; full?: boolean; assets: unknown }>,
  recordFail: false,
  order: [] as string[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink\.raid_dmine d\s+JOIN yuplink\.beta_raid_positions/.test(sql)) {
      s.order.push("due");
      return s.due;
    }
    if (/o\.sent_at IS NULL AND o\.at </.test(sql)) return s.unsent;
    if (/FROM yuplink\.mystic_item_template\s+WHERE id =/.test(sql))
      return [{ id: "building_x", name: "Бедный Юпик", meta: { effect: "mine" } }];
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-spawn", () => ({
  spawnMushrooms: async () => {
    s.order.push("spawn");
    return 0;
  },
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-expire", () => ({
  expireMushrooms: async () => {
    s.order.push("expire");
    return 0;
  },
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-autoplace", () => ({
  autoPlaceDmine: async (d: { id: string }) => {
    s.autoCalls.push(d.id);
    const res = s.auto.get(d.id) ?? "placed";
    if (res === "throw") throw new Error("bridge down");
    return res;
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: Record<string, unknown>) => s.published.push(e),
}));
vi.mock("@/server/api/beta-raid/voidCells", () => ({
  withoutVoid: async (_m: string, cells: string[]) => cells,
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (
    mapId: string,
    change: { patches?: unknown[]; full?: boolean },
    assetsFor?: () => Promise<unknown>,
  ) => {
    if (s.recordFail) throw new Error("revision locked");
    s.recorded.push({ mapId, ...change, assets: await assetsFor?.() });
    return 1;
  },
}));

const { sweepDaraiMines, dueDminesSql, resetDmineSkips } = await import("./dmine-sweep");
const { announceDmine, stillOurs, dminePatch } = await import("./dmine-announce");

const due = {
  id: "dm_1",
  hero_id: "h1",
  account_id: "acc_1",
  wallet: "w1.tg",
  map_id: "rmap_1",
  q: 3,
  r: -4,
};
const takeOp = {
  op: "dmtake:a:o",
  kind: "take",
  map_id: "rmap_1",
  q: 7,
  r: 8,
  dmine_id: "dm_1",
  paid: 5,
  sent: false,
  building_id: null,
  building_skin_id: null,
  dmine_building: "building_x",
};

beforeEach(() => {
  s.sql.length = 0;
  s.published.length = 0;
  s.recorded.length = 0;
  s.due = [];
  s.unsent = [];
  s.auto = new Map();
  s.autoCalls.length = 0;
  s.order.length = 0;
  s.recordFail = false;
  resetDmineSkips();
});

describe("час вышел — гриб встаёт сам", () => {
  it("ищем живые грибы в рюкзаках старше часа — с позицией аккаунта, кошелёк поднявшего", () => {
    const sql = dueDminesSql().replace(/\s+/g, " ");
    expect(sql).toContain(
      "FROM yuplink.raid_dmine d JOIN yuplink.beta_raid_positions p ON p.account_id = d.taken_by",
    );
    expect(sql).toContain("d.taken_by AS account_id, d.mushroom,");
    expect(sql).toContain("d.state = 'item' AND d.hero_id IS NOT NULL");
    expect(sql).toContain("d.taken_at <= now() - interval '3600 seconds'");
    expect(sql).toContain("(d.dies_at IS NULL OR d.dies_at > now())");
    expect(sql).toContain("COALESCE(d.taken_wallet, p.wallet) AS wallet");
    expect(sql).not.toContain("NOT IN");
    expect(dueDminesSql(["dm_1", "dm_'2"])).toContain("AND d.id NOT IN ('dm_1', 'dm_''2')");
  });

  it("сначала конец жизни и бросок часа, потом посадка; мешочка нет; считаем вставшие", async () => {
    s.due = [due, { ...due, id: "dm_2" }];
    await expect(sweepDaraiMines()).resolves.toBe(2);
    // Конец жизни, потом бросок часа на жилах, потом посадка просроченных.
    expect(s.order.slice(0, 3)).toEqual(["expire", "spawn", "due"]);
    expect(s.autoCalls).toEqual(["dm_1", "dm_2"]);
    expect(s.sql.some((x) => /raid_loot_bag/.test(x))).toBe(false);
    expect(s.published.some((e) => e.type === "bags")).toBe(false);
  });

  it("ставить некуда или сбой — гриб откладывается и не держит очередь", async () => {
    s.due = [due, { ...due, id: "dm_2" }, { ...due, id: "dm_3" }];
    s.auto.set("dm_1", "none");
    s.auto.set("dm_2", "throw");
    await expect(sweepDaraiMines()).resolves.toBe(1);
    s.sql.length = 0;
    s.due = [];
    await sweepDaraiMines();
    expect(s.sql[0]).toContain("AND d.id NOT IN ('dm_1', 'dm_2')");
  });

  it("неразосланное «Забрать» досылается", async () => {
    s.unsent = [takeOp];
    await sweepDaraiMines();
    expect(s.recorded).toHaveLength(1);
    expect(s.recorded[0].patches).toEqual([
      { q: 7, r: 8, buildingId: null, buildingSkinId: null, buildingConfig: null },
    ]);
    expect(s.sql.some((x) => x.includes("SET sent_at = now()") && x.includes("'dmtake:a:o'"))).toBe(
      true,
    );
  });
});

describe("рассылка клетки", () => {
  it("«Забрать»: только если клетка пуста; «Разместить»: только если стоит та постройка", () => {
    expect(stillOurs({ ...takeOp, building_id: null })).toBe(true);
    expect(stillOurs({ ...takeOp, building_id: "other" })).toBe(false);
    const placeOp = { ...takeOp, kind: "place", building_id: "building_x" };
    expect(stillOurs(placeOp)).toBe(true);
    expect(stillOurs({ ...placeOp, building_id: "other" })).toBe(false);
    expect(dminePatch({ ...placeOp, building_skin_id: "bskin_1" })).toEqual({
      q: 7,
      r: 8,
      buildingId: "building_x",
      buildingSkinId: "bskin_1",
      buildingConfig: { effect: "mine" },
    });
  });

  it("встала: дельта со словарём шаблона, 'built' всем, ключ отмечен", async () => {
    const ok = await announceDmine({ ...takeOp, kind: "place", building_id: "building_x" });
    expect(ok).toBe(true);
    expect(s.recorded[0].assets).toEqual({
      buildings: {
        building_x: {
          id: "building_x",
          name: "Бедный Юпик",
          tiers: expect.any(Array),
          effect: "mine",
        },
      },
    });
    expect(s.published).toContainEqual({
      mapId: "rmap_1",
      type: "built",
      mine: true,
      owner: true,
      cells: ["7,8"],
    });
  });

  it("забрали шахту-блок — «карта перестроена» целиком: стена второй клетки — из снимка", async () => {
    await expect(announceDmine({ ...takeOp, block: true })).resolves.toBe(true);
    expect(s.recorded).toEqual([{ mapId: "rmap_1", full: true, assets: undefined }]);
    await announceDmine({ ...takeOp, kind: "place", building_id: "building_x", block: true });
    expect(s.recorded[1].patches).toHaveLength(1);
  });

  it("запись журнала не прошла — ключ не отмечен, дошлём позже", async () => {
    s.recordFail = true;
    await expect(announceDmine(takeOp)).resolves.toBe(false);
    expect(s.sql.some((x) => x.includes("SET sent_at = now()"))).toBe(false);
  });

  it("на клетке уже чужое — без дельты, только отметка", async () => {
    await expect(announceDmine({ ...takeOp, building_id: "other" })).resolves.toBe(true);
    expect(s.recorded).toHaveLength(0);
    expect(s.sql.some((x) => x.includes("SET sent_at = now()"))).toBe(true);
  });
});
