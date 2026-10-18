// Бокс выдаёт любой вид приза ровно один раз; количество — одним полем «10-30».
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAmountRange, amountRangeText } from "@/lib/mysticKinds";

const ev: string[] = [];
const st = { onceTaken: new Set<string>() };

vi.mock("../db/pg", () => ({
  pg: {
    chipPacks: { findOne: async () => ({ name: "Бокс удачи", cover_image_url: "/b.png" }) },
    ticketClaims: { insert: async () => void ev.push("ticket_claim") },
    mysticItemTemplates: {
      raw: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "art_1", kind: "artifact", name: "Меч", image_url: null, rarity: "epic" } }),
          }),
        }),
      }),
    },
    userGameItems: { insert: async () => void ev.push("item") },
  },
  sb: { rpc: async (_f: string, a: { p_amount: number }) => (ev.push(`energy:${a.p_amount}`), { error: null }) },
}));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_A" }));
vi.mock("./gifts-once", () => ({
  claimDeliverOnce: async (op: string) => (st.onceTaken.has(op) ? false : (st.onceTaken.add(op), true)),
  releaseDeliverOnce: async (op: string) => void st.onceTaken.delete(op),
}));
vi.mock("./packs", () => ({ grantPackToUser: async (o: { packId: string }) => void ev.push(`pack:${o.packId}`) }));
vi.mock("./tickets-ledger", () => ({ moveTickets: async (o: { delta: number }) => void ev.push(`tickets:${o.delta}`) }));
vi.mock("../likesAccount", () => ({
  likeAccountId: async () => "lk_A",
  addLikes: async (_a: string, n: number, _f: string, ref: string) => void ev.push(`likes:${n}:${ref}`),
}));
vi.mock("./raid-reward-extra", () => ({
  grantExtraReward: async (o: { kind: string; ref: string; amount: number; opRef: string }) =>
    void ev.push(`${o.kind}:${o.ref}:${o.amount}:${o.opRef}`),
}));
vi.mock("./beta-raid/item-alias", () => ({ canonCustomMeta: async () => ({ name: "Зелье силы", image: "/p.png" }) }));
vi.mock("./beta-raid/econ/box-note", () => ({
  noteBoxPrize: async (o: {
    kind: string;
    code: string;
    amount: number;
    name?: string;
    ref: string;
  }) => void ev.push(`journal:${o.kind}:${o.code}:${o.amount}:${o.name ?? "-"}:${o.ref}`),
}));
vi.mock("./currency/move", () => ({
  accMove: async (o: { token: string; delta: number; kind: string; ref: string }) =>
    void ev.push(`acc:${o.token}:${o.delta}:${o.kind}:${o.ref}`),
}));

const { deliverMysticTier, rollAmount } = await import("./mystic-grant");

beforeEach(() => {
  ev.length = 0;
  st.onceTaken.clear();
});

describe("количество одним полем", () => {
  it("«10-30», «7», «30 – 10», «0.5-2» для токена; мусор — null", () => {
    expect(parseAmountRange("10-30")).toEqual({ min: 10, max: 30 });
    expect(parseAmountRange("7")).toEqual({ min: 7, max: 7 });
    expect(parseAmountRange("30 – 10")).toEqual({ min: 10, max: 30 });
    expect(parseAmountRange("0,5-2", true)).toEqual({ min: 0.5, max: 2 });
    expect(parseAmountRange("abc")).toBeNull();
    expect(amountRangeText(10, 30)).toBe("10-30");
    expect(amountRangeText(7, 7)).toBe("7");
  });

  it("бросок в пределах; токен — до сотых, звёзды — целые", () => {
    for (let i = 0; i < 50; i++) {
      const n = rollAmount({ kind: "resource", amountMin: 10, amountMax: 30 });
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(30);
      expect(Number.isInteger(n)).toBe(true);
      expect(Number.isInteger(rollAmount({ kind: "token", token: "STARS", amountMin: 1, amountMax: 5 }))).toBe(true);
      const usdt = rollAmount({ kind: "token", token: "USDT", amountMin: 0.5, amountMax: 2 });
      expect(Math.round(usdt * 100)).toBeCloseTo(usdt * 100, 6);
    }
  });
});

describe("выдача приза бокса", () => {
  it("ресурс и свой товар — через общую выдачу наград, ключ повтора — бокс", async () => {
    const r = await deliverMysticTier("w", "g1", { kind: "resource", resource: "gold" }, 25);
    expect(r).toEqual({ kind: "resource", amount: 25, code: "gold" });
    const c = await deliverMysticTier("w", "g2", { kind: "custom", customId: "cst_x" }, 2);
    expect(c).toMatchObject({ kind: "custom", amount: 2, name: "Зелье силы", image: "/p.png" });
    expect(ev).toEqual([
      "resource:gold:25:mystic:g1",
      "journal:resource:gold:25:-:mystic:g1",
      "custom:cst_x:2:mystic:g2",
      "journal:custom:cst_x:2:Зелье силы:mystic:g2",
    ]);
  });

  it("токен — на единый счёт видом награды; лайки — с ключом бокса", async () => {
    await deliverMysticTier("w", "g3", { kind: "token", token: "Darai" }, 1500);
    await deliverMysticTier("w", "g4", { kind: "likes" }, 40);
    expect(ev).toEqual(["acc:Darai:1500:acc_reward:mystic:g3", "likes:40:mystic:g4"]);
  });

  it("энергия, пак, предмет, билеты — ровно один раз на бокс", async () => {
    for (let i = 0; i < 2; i++) {
      await deliverMysticTier("w", "g5", { kind: "energy" }, 100);
      await deliverMysticTier("w", "g6", { kind: "pack", packId: "cp_box" }, 0);
      await deliverMysticTier("w", "g7", { kind: "artifact", itemTemplateId: "art_1" }, 0);
      await deliverMysticTier("w", "g8", { kind: "tickets" }, 5);
    }
    expect(ev).toEqual(["energy:100", "pack:cp_box", "item", "ticket_claim", "tickets:5"]);
  });

  it("старые заглушки nft/ft — «пусто»", async () => {
    expect(await deliverMysticTier("w", "g9", { kind: "nft" }, 0)).toEqual({ kind: "blank" });
    expect(ev).toEqual([]);
  });

  it("старый тир USDT (любой регистр) — «пусто», на счёт ничего (ПРАВИЛА §8.49а)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const usdt = await deliverMysticTier("w", "g10", { kind: "token", token: "USDT" }, 2);
    const lower = await deliverMysticTier("w", "g11", { kind: "token", token: " usdt " }, 1);
    expect([usdt, lower]).toEqual([{ kind: "blank" }, { kind: "blank" }]);
    expect(ev).toEqual([]);
    warn.mockRestore();
  });
});
