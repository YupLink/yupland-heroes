// Пакет лайков за золото (§8.61): цена пакета в билетах × 500, сначала золото
// (ключ нажатия), потом лайки тем же ключом; сорвались лайки — золото назад.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  ev: [] as string[],
  gold: 100_000,
  applied: true,
  likesErr: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({
  pg: {
    users: { findOne: async () => ({ wallet: "w1", telegram_id: 1 }) },
    likeShopOffers: { findOne: async () => ({ id: "o1", tickets: 2, likes: 30, active: true }) },
    likePurchases: { insert: async () => void st.ev.push("history") },
  },
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w1" }));
vi.mock("../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("../likesAccount", () => ({
  likeAccountId: async () => "acc1",
  likeRow: async () => ({ available: 130 }),
  addLikes: async (_a: string, d: number, _f: string, ref: string) => {
    if (st.likesErr) throw new Error("bridge down");
    st.ev.push(`likes:+${d}:${ref.split(":")[0]}`);
  },
}));
vi.mock("./currency/move", () => ({ accAccountId: async () => "acc1" }));
vi.mock("./gold-move", () => ({
  goldOf: async () => st.gold,
  goldMove: async (_a: string, d: number, kind: string) => {
    // как res_move: в минус не пускает — отказ без движения
    if (d < 0 && st.gold + d < 0) throw new Error(`Не хватает золота: нужно ${-d}`);
    st.ev.push(`${kind}:${d}`);
    return st.applied;
  },
  goldRefund: async (_a: string, amount: number, kind: string) =>
    void st.ev.push(`${kind}_undo:+${amount}`),
}));

const { buyLikePackage } = await import("./likes-gold-buy");
const buy = buyLikePackage as unknown as (a: {
  data: { offerId: string; quantity: number };
}) => Promise<{ likesAdded: number; goldSpent: number }>;

beforeEach(() => Object.assign(st, { ev: [], gold: 100_000, applied: true, likesErr: false }));

describe("пакет лайков за золото", () => {
  it("2 билета × 3 пакета → 3000 золота, потом 90 лайков, потом история", async () => {
    expect(await buy({ data: { offerId: "o1", quantity: 3 } })).toMatchObject({
      likesAdded: 90,
      goldSpent: 3000,
    });
    expect(st.ev).toEqual(["like_purchase:-3000", "likes:+90:lp", "history"]);
  });

  it("не хватает золота — отказ до списания", async () => {
    st.gold = 999;
    await expect(buy({ data: { offerId: "o1", quantity: 1 } })).rejects.toThrow(
      "Не хватает золота: нужно 1000",
    );
    expect(st.ev).toEqual([]);
  });

  it("двойной тап / повтор после записи (ключ уже проведён) — лайки идут тем же ключом", async () => {
    // Золото по этому ключу уже списано; лайки начисляются по ТОМУ ЖЕ ref, и база
    // (like_grant_log) второй раз их не добавит — деньги не пропадают и не двоятся.
    st.applied = false;
    await buy({ data: { offerId: "o1", quantity: 1 } });
    expect(st.ev[0]).toBe("like_purchase:-1000");
    expect(st.ev.some((e) => e.startsWith("likes:+") && e.endsWith(":lp"))).toBe(true);
  });

  it("лайки не начислились — золото возвращается", async () => {
    st.likesErr = true;
    await expect(buy({ data: { offerId: "o1", quantity: 1 } })).rejects.toThrow("bridge down");
    expect(st.ev).toEqual(["like_purchase:-1000", "like_purchase_undo:+1000"]);
  });
});
