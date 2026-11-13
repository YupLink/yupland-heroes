// Подарок «босс» — охрана, снятая с DARAI-шахты (minebag-02): ложится в рюкзак
// выбранного героя стопкой boss:<шаблон> (как из лавки и «Забрать охрану»);
// нет героя или места — бытовой отказ, подарок ждёт; повтор выдачи того же
// подарка (обрыв, второй клейм) второго босса не кладёт — ключ = id подарка.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GiftRow } from "./gifts-deliver";

const s = vi.hoisted(() => ({
  hero: { heroId: "h1", capacity: 8, potionCapacity: 2 } as Record<string, unknown> | null,
  /** Рюкзак: ключ стопки → штук; ключи выдачи — отдельно (raid_backpack_op). */
  pack: new Map<string, number>(),
  ops: new Set<string>(),
  deposits: [] as Array<Record<string, unknown>>,
  full: false,
}));

vi.mock("../db/pg", () => ({ pg: {}, sb: { rpc: async () => ({ error: null }) } }));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_A" }));
vi.mock("./beta-raid/market-backpack", () => ({
  resolveBackpack: async () => s.hero,
  depositToBackpack: async (o: {
    item: { kind: string; refId: string };
    qty: number;
    nonce: string;
  }) => {
    s.deposits.push(o as unknown as Record<string, unknown>);
    if (s.ops.has(`bp:${o.nonce}`)) return; // повтор: ключ лежит — ничего
    if (s.full) throw new Error("market.backpack_need:1:0");
    const key = `${o.item.kind}:${o.item.refId}`;
    s.pack.set(key, (s.pack.get(key) ?? 0) + o.qty);
    s.ops.add(`bp:${o.nonce}`);
  },
}));

const { deliverGift } = await import("./gifts-deliver");
const { bossGiftNonce } = await import("./gifts-deliver-boss");

const gift = (over: Partial<GiftRow> = {}): GiftRow => ({
  id: "gft_abc",
  account_id: "acc_A",
  kind: "boss",
  amount: 1,
  ref_id: "rbt_aJNyRPtX",
  title: "Глава Пиратов (75 Lv)",
  image: "/uploads/boss.webp",
  note: "dmine-guard:",
  status: "claimed",
  created_at: "2026-10-22T10:00:00Z",
  expires_ms: null,
  ...over,
});

beforeEach(() => {
  s.hero = { heroId: "h1", capacity: 8, potionCapacity: 2 };
  s.pack = new Map();
  s.ops = new Set();
  s.deposits.length = 0;
  s.full = false;
});

describe("подарок «босс»", () => {
  it("в рюкзак выбранного героя — стопкой boss:<шаблон>, вид boss, имя и картинка охраны", async () => {
    await deliverGift("w.tg", gift());
    expect(s.pack.get("boss:rbt_aJNyRPtX")).toBe(1);
    expect(s.deposits[0]).toMatchObject({
      heroId: "h1",
      account: "acc_A",
      qty: 1,
      nonce: bossGiftNonce("gft_abc"),
      item: {
        kind: "boss",
        refId: "rbt_aJNyRPtX",
        id: "boss:rbt_aJNyRPtX",
        name: "Глава Пиратов (75 Lv)",
        image: "/uploads/boss.webp",
      },
    });
  });

  it("повтор выдачи того же подарка (обрыв, второй клейм) — второго босса нет", async () => {
    await deliverGift("w.tg", gift());
    await deliverGift("w.tg", gift());
    expect(s.pack.get("boss:rbt_aJNyRPtX")).toBe(1);
    // Ключ стабилен: один и тот же на обе попытки.
    expect(s.deposits.map((d) => d.nonce)).toEqual(["gift:gft_abc", "gift:gft_abc"]);
  });

  it("нет героя — бытовой отказ (подарок вернётся в очередь), рюкзак не тронут", async () => {
    s.hero = null;
    await expect(deliverGift("w.tg", gift())).rejects.toThrow("market.need_hero");
    expect(s.deposits).toHaveLength(0);
  });

  it("нет места — отказ числами, босса нет; освободил место — выдача тем же ключом", async () => {
    s.full = true;
    await expect(deliverGift("w.tg", gift())).rejects.toThrow("market.backpack_need:1:0");
    expect(s.pack.size).toBe(0);
    s.full = false;
    await deliverGift("w.tg", gift());
    expect(s.pack.get("boss:rbt_aJNyRPtX")).toBe(1);
  });

  it("без шаблона — выдавать нечего", async () => {
    await expect(deliverGift("w.tg", gift({ ref_id: " " }))).rejects.toThrow("не указан босс");
  });
});
