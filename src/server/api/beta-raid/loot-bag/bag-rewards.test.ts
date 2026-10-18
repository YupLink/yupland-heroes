// Откуда выпадают мешочки (§8.21): предметы из объектов карты и из наград
// боссов — сразу в рюкзак, не влезшее — мешочком на клетке; валюты и ресурсы
// счёта — в «Добычу», как раньше. Награда босса далёкому игроку — мешочек у
// босса, а не рядом с игроком. Мешочек не упал или выдача сорвалась целиком —
// предметы ждут в «Добыче», а не пропадают.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";
import { countOf, db, md5, packOf, resetDb } from "./bag.fake";

const s = vi.hoisted(() => ({
  queued: [] as Array<{
    account: string;
    kind: string;
    amount: number;
    packId?: string | null;
    origin?: string | null;
    key?: string;
  }>,
  /** Сколько следующих вставок в «Добычу» лягут, но ответ потеряется. */
  loseQueue: 0,
}));

vi.mock("@/server/db/mcpClient", async () => {
  const { mcp } = await import("./bag.fake-mocks");
  return {
    mcpExec: async (sql: string, opts?: { wrapJson?: boolean }) => {
      if (sql.includes("FROM yuplink.beta_raid_object_run r")) {
        return [
          { account: "acc1", total: "900", first_at: "2026-09-29T10:00:00Z" },
          { account: "acc2", total: "500", first_at: "2026-09-29T10:01:00Z" },
        ];
      }
      if (sql.includes("raid_reward_distributed")) return [{ scope_key: "beta:hp1" }];
      return mcp.mcpExec(sql, opts);
    },
  };
});
// «Добыча» как в базе: строка с ключом — одна (ON CONFLICT DO NOTHING).
vi.mock("../reward-queue", () => ({
  queueEncounterReward: async (r: (typeof s.queued)[number]) => {
    if (!r.key || !s.queued.some((x) => x.key === r.key)) s.queued.push(r);
    if (s.loseQueue > 0 && s.loseQueue--) throw new Error("MCP timeout");
  },
}));
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-back-sql", async () => (await import("./bag.fake-mocks")).backSqlMod);
vi.mock("./bag-sweep", () => ({ startLootBagSweeper: () => {} }));
vi.mock("../market-backpack", async () => (await import("./bag.fake-mocks")).backpack);
vi.mock("../chest/chest-net-read", async () => (await import("./bag.fake-mocks")).netRead);
vi.mock("../item-alias", async () => (await import("./bag.fake-mocks")).alias);
vi.mock("../potion-bag", () => ({ potionKeysOf: async () => new Set<string>() }));
vi.mock("../owner", async () => (await import("./bag.fake-mocks")).session.owner);

const { grantEncounterRewards } = await import("../encounter-rewards");
const { payoutByTop } = await import("../encounter-payout");

const BANANA = "custom:cst_banana";
const target = (kind: EncounterTarget["kind"], fillers: object[]): EncounterTarget => ({
  kind,
  templateId: `tpl_${kind}`,
  name: kind === "boss" ? "Йети" : "Сундук",
  imageUrl: null,
  backgroundUrl: null,
  badgeLabel: kind,
  maxHp: 10,
  interactionCost: 0,
  rewardConfig: { fillers, packs: [], split: [60, 40] },
  abilities: [],
  damage: null,
});
const bags = () => [...db.bags.values()];

beforeEach(() => {
  resetDb();
  s.queued = [];
  s.loseQueue = 0;
  db.catalog.set("cst_banana", { name: "Банан" });
  db.accounts.set("w1", "acc1");
  db.heroes.set("w1", { heroId: "h1", capacity: 1, potionCapacity: 0 });
  db.heroes.set("acc1", { heroId: "h1", capacity: 1, potionCapacity: 0 });
});

describe("объект карты (сундук, монетка, кучка)", () => {
  it("валюты и ресурс счёта — в «Добычу», предмет — в рюкзак, остаток — мешочком у объекта", async () => {
    const got = await grantEncounterRewards(
      "w1",
      target("chest", [
        { kind: "likes", amount: 10 },
        { kind: "resource", resource: "gold", amount: 5 },
        { kind: "custom", itemId: "cst_banana", amount: 25 },
      ]),
      { mapId: "map1", cycleNo: 0, q: 4, r: 9 },
    );
    expect(s.queued.map((x) => x.kind).sort()).toEqual(["likes", "resource"]);
    expect(packOf("h1").get(BANANA)).toMatchObject({ count: 20, marks: { loot: 20 } });
    expect(bags()).toEqual([expect.objectContaining({ q: 4, r: 9, droppedBy: "acc1" })]);
    expect(bags()[0].items[0]).toMatchObject({ count: 5, marks: { loot: 5 } });
    expect(got).toContainEqual({ kind: "custom", amount: 25, packId: "cst_banana", dropped: 5 });
  });

  it("всё влезло — «Добыча» предметов не получает, мешочка нет", async () => {
    await grantEncounterRewards(
      "w1",
      target("chest", [{ kind: "custom", itemId: "cst_banana", amount: 3 }]),
      { mapId: "map1", cycleNo: 0, q: 4, r: 9 },
    );
    expect(s.queued).toEqual([]);
    expect(db.bags.size).toBe(0);
  });

  it("мешочек не упал (сбой базы) — остаток ждёт в «Добыче», строкой «в Добычу»", async () => {
    db.failOn = ["drop"];
    const got = await grantEncounterRewards(
      "w1",
      target("chest", [{ kind: "custom", itemId: "cst_banana", amount: 25 }]),
      { mapId: "map1", cycleNo: 0, q: 4, r: 9 },
    );
    expect(packOf("h1").get(BANANA)?.count).toBe(20);
    expect(s.queued).toEqual([
      expect.objectContaining({ kind: "custom", amount: 5, packId: "cst_banana", origin: "loot" }),
    ]);
    expect(got).toEqual([
      { kind: "custom", amount: 20, packId: "cst_banana", dropped: 0 },
      { kind: "custom", amount: 5, packId: "cst_banana", queued: true },
    ]);
  });

  it("строка «Добычи» легла, ответ потерян — запасной путь той же выдачи второй не кладёт", async () => {
    db.heroes.clear();
    db.failOn = ["drop"];
    s.loseQueue = 1;
    const got = await grantEncounterRewards(
      "w1",
      target("chest", [{ kind: "custom", itemId: "cst_banana", amount: 4 }]),
      { mapId: "map1", cycleNo: 0, q: 4, r: 9 },
    );
    expect(s.queued.filter((x) => x.kind === "custom")).toHaveLength(1);
    expect(s.queued[0].key).toMatch(/^obj:map1:4:9:.+:q0$/);
    expect(got).toEqual([{ kind: "custom", amount: 4, packId: "cst_banana", queued: true }]);
  });

  it("выдача сорвалась целиком (база не ответила и на «забор») — всё в «Добычу»", async () => {
    db.heroes.clear();
    db.failOn = ["drop", "dropFence"];
    const got = await grantEncounterRewards(
      "w1",
      target("chest", [{ kind: "custom", itemId: "cst_banana", amount: 4 }]),
      { mapId: "map1", cycleNo: 0, q: 4, r: 9 },
    );
    expect(s.queued.map((x) => [x.kind, x.amount])).toEqual([["custom", 4]]);
    expect(got).toEqual([{ kind: "custom", amount: 4, packId: "cst_banana", queued: true }]);
  });
});

describe("награда босса по топу вклада", () => {
  it("далёкому игроку с полным рюкзаком — мешочек у босса; мне — в рюкзак", async () => {
    db.heroes.set("acc2", { heroId: "h2", capacity: 1, potionCapacity: 0 });
    packOf("h2").set("custom:cst_other", {
      count: 20,
      marks: { mob: 0, mine: 0, field: 0, loot: 0 },
      wear: 0,
    });
    const mine = await payoutByTop({
      target: target("boss", [
        { kind: "likes", amount: 100 },
        { kind: "custom", itemId: "cst_banana", amount: 3, toPlace: 2 },
      ]),
      hpId: "hp1",
      mapId: "map1",
      cycleNo: 0,
      viewer: "w1",
      q: 30,
      r: 40,
      generation: 2,
    });
    expect(packOf("h1").get(BANANA)).toMatchObject({ count: 3, marks: { mob: 3 } });
    const far = db.bags.get(`lb_${md5("boss:hp1:2:acc2")}`);
    expect(far).toMatchObject({ q: 30, r: 40, droppedBy: "acc2" });
    expect(far?.items[0]).toMatchObject({ count: 3, marks: { mob: 3 } });
    expect(s.queued.every((x) => x.kind === "likes" && x.origin === "mob")).toBe(true);
    expect(mine).toContainEqual({ kind: "custom", amount: 3, packId: "cst_banana", dropped: 0 });
    expect(db.events).toEqual(["30,40"]);
  });

  it("у игрока нет выбранного героя — его предметы мешочком у босса", async () => {
    const mine = await payoutByTop({
      target: target("boss", [{ kind: "custom", itemId: "cst_banana", amount: 2, toPlace: 2 }]),
      hpId: "hp1",
      mapId: "map1",
      cycleNo: 0,
      viewer: "w1",
      q: 30,
      r: 40,
    });
    expect(countOf(db.bags.get(`lb_${md5("boss:hp1:0:acc2")}`), BANANA)).toBe(2);
    expect(mine).toHaveLength(1);
  });
});
