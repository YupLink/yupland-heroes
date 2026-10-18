// Где рождаются метки (владелец, 29.09.2026; ПРАВИЛА §8.18): награда с босса —
// «с мобов», объект карты (сундук, монетка, кучка) и прочие награды рейда —
// «собрано прочее» (loot), покупка — без метки. Грядки — в field-origin.test,
// декор — в decor-interact.test. Свой товар с карты с 29.09 едет сразу в рюкзак
// (§8.21, мешочек — loot-bag/*.test) — метка ложится туда же. Базы нет:
// mcpExec подменён.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  queued: [] as Array<{ kind: string; packId?: string | null; origin?: string | null }>,
  deposits: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.beta_raid_object_run r"))
      return [{ account: "acc_w", total: "900", first_at: "2026-09-29" }];
    if (sql.includes("raid_reward_distributed")) return [{ scope_key: "beta:hp1" }];
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/reward-queue", async () => ({
  ...(await vi.importActual<object>("@/server/api/beta-raid/reward-queue")),
  queueEncounterReward: async (r: (typeof s.queued)[number]) => void s.queued.push(r),
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_w" }));
vi.mock("@/server/api/beta-raid/item-alias", async () => ({
  ...(await vi.importActual<object>("@/server/api/beta-raid/item-alias")),
  canonCustomMeta: async () => ({ name: "Банан", image: null }),
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 10, potionCapacity: 0 }),
  assertBackpackRoom: async () => {},
  stackKeyFor: async () => "custom:cst_banana",
  depositToBackpack: async (o: Record<string, unknown>) => void s.deposits.push(o),
}));

const actualQueue = await vi.importActual<typeof import("@/server/api/beta-raid/reward-queue")>(
  "@/server/api/beta-raid/reward-queue",
);
const { grantEncounterRewards } = await import("@/server/api/beta-raid/encounter-rewards");
const { payoutByTop } = await import("@/server/api/beta-raid/encounter-payout");
const { deliverGood } = await import("@/server/api/beta-raid/market-deliver");

const banana = { kind: "custom", itemId: "cst_banana", amount: 3 };
const target = (kind: EncounterTarget["kind"]): EncounterTarget => ({
  kind,
  templateId: `tpl_${kind}`,
  name: kind,
  imageUrl: null,
  backgroundUrl: null,
  badgeLabel: kind,
  maxHp: 10,
  interactionCost: 0,
  rewardConfig: { fillers: [banana], packs: [], split: [100] },
  abilities: [],
  damage: null,
});
const flat = (x: string) => x.replace(/\s+/g, " ");

beforeEach(() => {
  s.sql = [];
  s.queued = [];
  s.deposits = [];
});

describe("очередь «Добычи» помнит происхождение", () => {
  it("строка очереди пишет колонку origin; без метки — NULL (решит boss_id)", async () => {
    const base = { account: "a", mapId: "m", cycleNo: 0, sourceName: "x", kind: "custom" };
    await actualQueue.queueEncounterReward({ ...base, amount: 1, origin: "loot" });
    await actualQueue.queueEncounterReward({ ...base, amount: 1, origin: "mob" });
    await actualQueue.queueEncounterReward({ ...base, amount: 1 });
    expect(flat(s.sql[0])).toContain("source_name, created_at, origin)");
    expect(flat(s.sql[0])).toMatch(/now\(\), 'loot'\);$/);
    expect(flat(s.sql[1])).toMatch(/now\(\), 'mob'\);$/);
    expect(flat(s.sql[2])).toMatch(/now\(\), NULL\);$/);
  });
});

describe("источники → метка", () => {
  const at = { mapId: "m", cycleNo: 0, q: 3, r: 4 };

  it("объект карты (сундук, монетка, кучка, артефакт) → loot, товар — в рюкзак", async () => {
    for (const kind of ["chest", "mine", "artifact"] as const) {
      s.deposits = [];
      await grantEncounterRewards("w", target(kind), at);
      expect(s.queued).toEqual([]);
      // Метки стопки выдачи — разбором по штукам (bag-deliver: помеченное первым).
      expect(s.deposits).toEqual([
        expect.objectContaining({ qty: 3, origin: { mob: 0, mine: 0, field: 0, loot: 3 } }),
      ]);
    }
  });

  it("босс → mob: и при подборе, и при раздаче по топу вклада", async () => {
    await grantEncounterRewards("w", target("boss"), at);
    const mob = { mob: 3, mine: 0, field: 0, loot: 0 };
    expect(s.deposits).toEqual([expect.objectContaining({ origin: mob })]);
    s.deposits = [];
    await payoutByTop({ target: target("boss"), hpId: "hp1", viewer: "w", ...at });
    expect(s.deposits.length).toBeGreaterThan(0);
    expect(s.deposits.every((r) => (r.origin as { mob: number }).mob === r.qty)).toBe(true);
  });

  it("покупка → без метки: в сундук не пойдёт", async () => {
    const item = { id: "mkt_1", kind: "custom", refId: "cst_banana", name: "Банан", image: null };
    await deliverGood({
      wallet: "w",
      account: "acc_w",
      item: item as unknown as Parameters<typeof deliverGood>[0]["item"],
      qty: 2,
      payRef: "mkt-buy:x",
      nonce: "n1",
    });
    expect(s.deposits).toHaveLength(1);
    expect(s.deposits[0]).toMatchObject({ qty: 2 });
    expect(s.deposits[0].origin ?? null).toBeNull();
    expect(s.deposits[0].mob ?? false).toBe(false);
  });
});
