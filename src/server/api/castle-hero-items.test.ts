// «Вещи героев»: только свои неосновные герои с вещами; где герой — поле (здесь /
// в другом мире), отдых или замок; пустые рюкзаки не попадают.
import { describe, expect, it, vi } from "vitest";
import type { HeroItemsCard } from "./castle-hero-items";

const s = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ handler: (h: () => unknown) => () => h() }) }));
vi.mock("../auth", () => ({ requireWallet: async () => "me.near" }));
vi.mock("./beta-raid/owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./beta-raid/encounter-where", () => ({ myMapId: async () => "rmap_alpha" }));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("count(*)::int")) return [{ n: 7 }];
    return [
      { id: "h1", level: 14, name: "Momo - Copper Button", image: "/uploads/a.jpg", rest_until: null, field_map: "rmap_alpha", field_q: 41, field_r: 18, field_world: "Мир Альфа",
        items: [{ stackKey: "custom:apple", name: "Яблоко", image: "/uploads/apple.png", count: 12, kind: "custom" }] },
      { id: "h2", level: 9, name: "Zuzu", image: null, rest_until: "2026-11-06T20:00:00Z", field_map: null, field_q: null, field_r: null, field_world: null,
        items: JSON.stringify([{ stackKey: "resource:wood", name: "Дерево", image: null, count: 3.5, kind: "resource" }]) },
      { id: "h3", level: 5, name: "Fyrk", image: null, rest_until: null, field_map: "rmap_beta", field_q: 2, field_r: 3, field_world: "Мир Бета",
        items: [{ stackKey: "custom:rod", name: "Удочка", image: null, count: 1, kind: "custom" }] },
      { id: "h4", level: 4, name: "Пустой", image: null, rest_until: null, field_map: null, field_q: null, field_r: null, field_world: null, items: null },
    ];
  },
}));

const api = await import("./castle-hero-items");

describe("вещи героев", () => {
  it("запрос — свой аккаунт, без основного, только с вещами", () => {
    const sql = api.heroItemsSql("acc_me");
    expect(sql).toContain("h.account_id = 'acc_me'");
    expect(sql).toContain("h.selected_at IS NULL");
    expect(sql).toContain("b.count > 0");
    expect(sql).toContain("raid_field_worker");
  });

  it("карточки: поле здесь и в другом мире, отдых, пустой рюкзак — мимо", async () => {
    const out = await (api.getMyHeroesItems as unknown as () => Promise<{ heroes: HeroItemsCard[]; total: number }>)();
    expect(out.total).toBe(7);
    expect(out.heroes.map((h) => h.id)).toEqual(["h1", "h2", "h3"]);
    expect(out.heroes[0].field).toEqual({ q: 41, r: 18, world: "Мир Альфа", here: true });
    expect(out.heroes[0].items[0]).toEqual({ stackKey: "custom:apple", name: "Яблоко", image: "/uploads/apple.png", count: 12, kind: "custom" });
    expect(out.heroes[1].restUntil).toBe("2026-11-06T20:00:00Z");
    expect(out.heroes[1].items[0].count).toBe(3.5);
    expect(out.heroes[2].field?.here).toBe(false);
    expect(s.sql.every((q) => !/\b(INSERT|UPDATE|DELETE)\b/.test(q))).toBe(true);
  });
});
