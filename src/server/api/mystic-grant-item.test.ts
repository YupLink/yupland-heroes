// Мистический бокс: у героя и артефакта в призе — id выданного экземпляра, чтобы
// «Посмотреть в Таверне» открыл именно его (Ангелина, ТЗ №4/№37). id — от бокса:
// повторная выдача знает экземпляр; выданное до правки (другой id) — без поля.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ inserted: [] as string[], existing: new Set<string>(), claimed: true }));

vi.mock("../db/pg", () => ({
  sb: { rpc: async () => ({ error: null }) },
  pg: {
    mysticItemTemplates: {
      raw: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "art_1", kind: "art", name: "Меч", image_url: "m.webp", rarity: "rare", level: 2 } }),
          }),
        }),
      }),
    },
    userGameItems: {
      insert: async (row: { id: string }) => {
        s.inserted.push(row.id);
        s.existing.add(row.id);
      },
      findOne: async ({ id }: { id: string }) => (s.existing.has(id) ? { id } : null),
    },
  },
}));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_1" }));
vi.mock("./gifts-once", () => ({ claimDeliverOnce: async () => s.claimed, releaseDeliverOnce: async () => {} }));

const { deliverMysticTier } = await import("./mystic-grant");
const tier = { kind: "artifact", itemTemplateId: "art_1", weight: 1 } as unknown as Parameters<typeof deliverMysticTier>[2];

beforeEach(() => Object.assign(s, { inserted: [], existing: new Set<string>(), claimed: true }));

describe("мистический бокс: id выданного героя/артефакта", () => {
  it("в призе — id экземпляра, тот же, что записан в предметы", async () => {
    const p = await deliverMysticTier("w1", "cpg_42", tier, 0);
    expect(s.inserted).toEqual(["ugi_mb_cpg_42"]);
    expect(p.itemId).toBe("ugi_mb_cpg_42");
    expect(p).toMatchObject({ kind: "artifact", name: "Меч", rarity: "rare" });
  });

  it("повторная выдача того же бокса — тот же id, второй раз не пишется", async () => {
    s.existing.add("ugi_mb_cpg_42");
    s.claimed = false;
    const p = await deliverMysticTier("w1", "cpg_42", tier, 0);
    expect(s.inserted).toEqual([]);
    expect(p.itemId).toBe("ugi_mb_cpg_42");
  });

  it("выдано до правки (экземпляр под другим id) — поля нет, остальное как раньше", async () => {
    s.claimed = false;
    const p = await deliverMysticTier("w1", "cpg_old", tier, 0);
    expect(p.itemId).toBeUndefined();
    expect(p.name).toBe("Меч");
  });
});
