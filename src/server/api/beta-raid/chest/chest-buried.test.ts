// Закопанный магический сундук (29.09, §8.15/§8.22) — бугорок: владелец его не
// открывает и не забирает (сеть — через остальные его сундуки), чужой не
// открывает, не берёт из сети, не забирает и не видит охрану; что под
// бугорком сундук, чужому не говорим. Прежняя «Разграбить» — отказ всем.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ buried: true, owner: "acc_o", me: "acc_o", sql: [] as string[] }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_magic_chest") && sql.includes("buried")) {
      return [{ owner_account: s.owner, item_id: "cst_mc", name: "МС", image: null, buried: s.buried }];
    }
    return [];
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      inputValidator: () => fn,
      handler: (h: unknown) => h,
    };
    return fn;
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  myMapId: async () => "rmap_x",
  ownCell: async () => ({ q: 1, r: 2 }),
}));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => s.me }));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => {} }));

const row = await import("@/server/api/beta-raid/chest/chest-row");
const seize = await import("@/server/api/beta-raid/chest/chest-seize");
const foreign = await import("@/server/api/beta-raid/chest/chest-foreign");
type Fn = (a: { data: object }) => Promise<unknown>;
const at = { q: 1, r: 2 };

beforeEach(() => Object.assign(s, { buried: true, owner: "acc_o", me: "acc_o", sql: [] }));

describe("закопанный магический сундук", () => {
  it("владелец не открывает, не кладёт и не забирает: chest.buried", async () => {
    const a = { wallet: "w_me", mapId: "rmap_x", account: "acc_o" };
    await expect(row.chestNearAny(a, 1, 2)).rejects.toThrow("chest.buried");
    s.buried = false;
    await expect(row.chestNearAny(a, 1, 2)).resolves.toMatchObject({
      chest: { owner_account: "acc_o" },
      mine: true,
    });
  });

  it("чужой к бугорку — «сундука нет» для входа, сети и «Забрать сундук»", async () => {
    const a = { wallet: "w_me", mapId: "rmap_x", account: "acc_w" };
    await expect(row.chestNearAny(a, 1, 2)).rejects.toThrow("chest.gone");
    // Свой бугорок — «закопан»: сеть через него не открыть.
    await expect(row.chestNearAny({ ...a, account: "acc_o" }, 1, 2)).rejects.toThrow("chest.buried");
  });

  it("«Разграбить» снята (четвёртая редакция): отказ ключом, база не тронута", async () => {
    Object.assign(s, { me: "acc_w", buried: false });
    await expect((seize.seizeChest as unknown as Fn)({ data: at })).rejects.toThrow("chest.no_plunder");
    expect(s.sql.some((q) => q.includes("DELETE FROM yuplink.raid_magic_chest"))).toBe(false);
  });

  it("чужой не видит охрану и хозяина: «сундука нет»", async () => {
    Object.assign(s, { me: "acc_w" });
    await expect((foreign.getChestGuard as unknown as Fn)({ data: at })).rejects.toThrow("chest.gone");
  });
});
