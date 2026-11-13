// Ручки лавки зачарования: кто сохраняет (только админ), кто видит, откуда
// зачаровывают (герой рядом). База и окружение — подмены; SQL — текстом.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  wallet: "w_me" as string | null,
  admin: false,
  pos: { q: 0, r: 0 } as { q: number; r: number } | null,
  effect: "enchant" as string | null,
  sql: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let check: ((d: unknown) => unknown) | null = null;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      handler: (h: (a: { data: unknown }) => unknown) => async (a?: { data: unknown }) =>
        h({ data: check ? check(a?.data) : a?.data }),
    };
    return fn;
  },
}));
vi.mock("@/server/auth", () => ({
  getCurrentWallet: () => s.wallet,
  isAdminWallet: (w: string | null) => !!w && s.admin,
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => s.wallet }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => undefined }));
vi.mock("@/server/api/currency/move", () => ({
  accAccountId: async () => "acc_me",
  accBalances: async () => [],
}));
vi.mock("@/server/api/beta-raid/encounter-where", async (orig) => ({
  ...(await orig<typeof import("@/server/api/beta-raid/encounter-where")>()),
  myMapId: async () => "m1",
  playerCell: async () => {
    if (!s.pos) throw new Error("Ты ещё не на карте");
    return s.pos;
  },
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => undefined }));
vi.mock("@/server/api/beta-raid/building-action", () => ({
  loadCellBuilding: async () => (s.effect ? { buildingId: "b1", effect: s.effect } : null),
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.reward_tokens")) return [{ symbol: "Darai" }];
    if (sql.includes("FROM yuplink.raid_custom_item"))
      return [{ id: "cst_ingot", name: "Слиток", image: null }];
    return [];
  },
}));

import { enchantArtifact, getEnchantShop, saveEnchantSpells } from "./enchant-api";

const spell = {
  id: "",
  name: "Огонь",
  rarity: "rare",
  boostMin: 20,
  boostMax: 20,
  success: 70,
  destroy: false,
  destroyChance: 0,
  cost: [{ kind: "resource", code: "gold", amount: 400 }],
  fx: { on: false, pct: 10, cost: { kind: "resource", code: "gold", amount: 40 } },
};
const cell = { mapId: "m1", q: 1, r: 0 };
const writes = () =>
  s.sql.filter((q) => /INSERT INTO yuplink\.raid_enchant_spell|DELETE FROM/.test(q));

beforeEach(() => {
  Object.assign(s, {
    wallet: "w_me",
    admin: false,
    pos: { q: 0, r: 0 },
    effect: "enchant",
    sql: [],
  });
});

describe("saveEnchantSpells — только админ", () => {
  it("не-админ не сохраняет: отказ до любого запроса", async () => {
    await expect(saveEnchantSpells({ data: { ...cell, spells: [spell] } })).rejects.toThrow(
      "enchant.admin_only",
    );
    expect(s.sql).toHaveLength(0);
  });

  it("админ сохраняет: новому заклинанию сервер выдаёт id", async () => {
    s.admin = true;
    s.pos = { q: 30, r: 30 }; // далеко — админу в режиме бога не нужно подходить
    await saveEnchantSpells({ data: { ...cell, spells: [spell] } });
    const [w] = writes();
    expect(w).toMatch(/VALUES \('ench_[a-z0-9]+', 'm1', 1, 0, 0, 'Огонь'/);
  });

  it("цена не из справочников — отказ, ничего не записано", async () => {
    s.admin = true;
    const bad = { ...spell, cost: [{ kind: "token", code: "FAKE", amount: 1 }] };
    await expect(saveEnchantSpells({ data: { ...cell, spells: [bad] } })).rejects.toThrow(
      "enchant.bad_cost",
    );
    expect(writes()).toHaveLength(0);
  });

  it("не лавка зачарования — отказ", async () => {
    s.admin = true;
    s.effect = "market";
    await expect(saveEnchantSpells({ data: { ...cell, spells: [] } })).rejects.toThrow(
      "enchant.no_shop",
    );
  });
});

describe("доступ игрока", () => {
  it("окно: canEdit только у админа; далеко — отказ", async () => {
    expect(await getEnchantShop({ data: cell })).toEqual({ spells: [], canEdit: false });
    s.pos = { q: 5, r: 5 };
    await expect(getEnchantShop({ data: cell })).rejects.toThrow("enchant.far");
    s.admin = true;
    expect((await getEnchantShop({ data: cell })).canEdit).toBe(true);
  });

  it("зачаровать можно только рядом с лавкой и на своей карте", async () => {
    const data = { ...cell, spellId: "ench_1", itemId: "it_1", steps: 0, opId: "op_000001" };
    s.pos = { q: 5, r: 5 };
    await expect(enchantArtifact({ data })).rejects.toThrow("enchant.far");
    s.pos = { q: 0, r: 0 };
    await expect(enchantArtifact({ data: { ...data, mapId: "other" } })).rejects.toThrow(
      "enchant.far",
    );
    // Рядом, но заклинания нет — отказ до денег.
    await expect(enchantArtifact({ data })).rejects.toThrow("enchant.no_spell");
  });
});
