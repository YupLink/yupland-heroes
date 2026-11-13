// Попытка зачарования на подменном порту: деньги, журнал и бросок — в памяти,
// порядок шагов и отказы — настоящие (enchant-flow).
import { beforeEach, describe, expect, it } from "vitest";
import type { EnchantSpell } from "@/lib/enchant/enchant";
import type { MarketPriceResource } from "@/lib/marketItem";
import {
  enchantAs,
  rollEnchant,
  type AttemptRow,
  type EnchantArtRow,
  type EnchantOutcome,
  type FlowPort,
} from "./enchant-flow";
import type { FinishInput } from "./enchant-finish-sql";
import { secureRandomInt } from "@/lib/secureRandom";

const spell: EnchantSpell = {
  id: "ench_1",
  name: "Огонь",
  rarity: "rare",
  boostMin: 10,
  boostMax: 10,
  success: 50,
  destroy: true,
  destroyChance: 20,
  cost: [
    { kind: "resource", code: "gold", amount: 100 },
    { kind: "custom", code: "cst_ingot", amount: 2 },
  ],
  fx: { on: true, pct: 10, cost: { kind: "resource", code: "gold", amount: 10 } },
};

const art = (over: Partial<EnchantArtRow> = {}): EnchantArtRow => ({
  itemId: "it_1",
  templateId: "art_1",
  name: "Кольцо",
  image: null,
  rarity: "rare",
  statType: "Attack",
  statAmount: 6,
  enchantPct: null,
  spellName: null,
  equipped: true,
  ...over,
});

/** Модель базы и кошелька: запас, журнал попыток, состояние предмета. */
function fakePort(opts: {
  have: Record<string, number>;
  rolls: number[];
  item?: EnchantArtRow | null;
}) {
  const wallet: Record<string, number> = { ...opts.have };
  const attempts = new Map<string, AttemptRow & { item: string }>();
  let item: EnchantArtRow | null = opts.item === undefined ? art() : opts.item;
  const log: string[] = [];
  const finishes: Array<{ outcome: EnchantOutcome; f: FinishInput }> = [];
  const rolls = [...opts.rolls];
  const code = (res: MarketPriceResource, token: string | null) => token ?? res;
  const port: FlowPort = {
    spend: async (_w, _a, res, token, amount, ref) => {
      const k = code(res, token);
      if ((wallet[k] ?? 0) < amount) throw new Error("market.not_enough");
      wallet[k] -= amount;
      log.push(`spend ${k} ${amount} ${ref}`);
      return {};
    },
    credit: async (_w, _a, res, token, amount, ref) => {
      const k = code(res, token);
      wallet[k] = (wallet[k] ?? 0) + amount;
      log.push(`credit ${k} ${amount} ${ref}`);
    },
    loadSpell: async (_m, _q, _r, id) => (id === spell.id ? spell : null),
    loadArt: async (_a, id) => (item && item.itemId === id ? item : null),
    readAttempt: async (a, op) => attempts.get(`${a}:${op}`) ?? null,
    clearStale: async () => undefined,
    claim: async (c) => {
      const key = `${c.account}:${c.op}`;
      const busy = [...attempts.values()].some(
        (x) => x.item === c.itemId && x.status === "pending",
      );
      if (attempts.has(key) || busy) return false;
      attempts.set(key, { status: "pending", result: null, error: null, item: c.itemId });
      return true;
    },
    notePaid: async () => undefined,
    markRefunded: async (a, op, error) => {
      const x = attempts.get(`${a}:${op}`);
      if (x?.status === "pending") Object.assign(x, { status: "refunded", error });
    },
    finish: async (outcome, f) => {
      finishes.push({ outcome, f });
      if (!item || item.enchantPct != null) return 0;
      if (outcome === "ok") item = { ...item, enchantPct: f.pct ?? 0 };
      if (outcome === "gone") item = null;
      Object.assign(attempts.get(`${f.account}:${f.op}`)!, { status: "done", result: f.result });
      return 1;
    },
    rnd: (min) => rolls.shift() ?? min,
  };
  return {
    port,
    wallet,
    log,
    finishes,
    attempts,
    setItem: (x: EnchantArtRow | null) => (item = x),
  };
}

const input = (over: Partial<Parameters<typeof enchantAs>[3]> = {}) => ({
  mapId: "m1",
  q: 1,
  r: 2,
  spellId: "ench_1",
  itemId: "it_1",
  steps: 0,
  opId: "op_000001",
  ...over,
});

// Бросок: первое число — исход из [0, 1e6), второе — усиление из [min, max].
const ROLL_OK = 0; // 0 % < успех
const ROLL_GONE = 600_000; // 60 % — между успехом 50 и 50 + 20
const ROLL_NONE = 900_000; // 90 % — «без изменений»

describe("enchantAs — деньги и отказы", () => {
  let f: ReturnType<typeof fakePort>;
  beforeEach(() => {
    f = fakePort({ have: { gold: 1000, cst_ingot: 1 }, rolls: [ROLL_OK, 10] });
  });

  it("не хватает одной позиции — ничего не списано, бросков нет", async () => {
    await expect(enchantAs(f.port, "w", "acc", input())).rejects.toThrow("enchant.not_enough");
    expect(f.wallet).toEqual({ gold: 1000, cst_ingot: 1 });
    expect(f.log).toEqual([
      "spend gold 100 enchant:acc:op_000001:0",
      "credit gold 100 enchant:acc:op_000001:0:undo",
    ]);
    expect(f.finishes).toHaveLength(0);
    // Повтор ключа отвечает тем же отказом и не платит снова.
    await expect(enchantAs(f.port, "w", "acc", input())).rejects.toThrow("enchant.not_enough");
    expect(f.log).toHaveLength(2);
  });

  it("уже зачарован — отказ до денег и до заявки", async () => {
    f.setItem(art({ enchantPct: 20, spellName: "Лёд" }));
    await expect(enchantAs(f.port, "w", "acc", input())).rejects.toThrow("enchant.already");
    expect(f.log).toHaveLength(0);
    expect(f.attempts.size).toBe(0);
  });

  it("чужой/несуществующий артефакт и неизвестное заклинание — отказ до денег", async () => {
    await expect(enchantAs(f.port, "w", "acc", input({ itemId: "nope" }))).rejects.toThrow(
      "enchant.no_item",
    );
    await expect(enchantAs(f.port, "w", "acc", input({ spellId: "x" }))).rejects.toThrow(
      "enchant.no_spell",
    );
    expect(f.log).toHaveLength(0);
  });
});

describe("enchantAs — исходы", () => {
  it("успех: вся цена с шагами до броска, статы вверх, повтор opId без второго списания", async () => {
    const f = fakePort({ have: { gold: 1000, cst_ingot: 5 }, rolls: [ROLL_OK, 15] });
    const res = await enchantAs(f.port, "w", "acc", input({ steps: 2 }));
    // База 100 золота + шаги 10 + 20 — одной слитой позицией; товар отдельно.
    expect(f.wallet).toEqual({ gold: 870, cst_ingot: 3 });
    expect(res).toEqual({ outcome: "ok", pct: 15, before: { Attack: 6 }, after: { Attack: 7 } });
    const again = await enchantAs(f.port, "w", "acc", input({ steps: 2 }));
    expect(again).toEqual(res);
    expect(f.wallet).toEqual({ gold: 870, cst_ingot: 3 });
    expect(f.log.filter((l) => l.startsWith("spend"))).toHaveLength(2);
  });

  it("успех в минус: статы вниз (вверх округлением), пометка та же — второй раз нельзя", async () => {
    const f = fakePort({ have: { gold: 1000, cst_ingot: 5 }, rolls: [ROLL_OK, -20] });
    const res = await enchantAs(f.port, "w", "acc", input());
    expect(res).toEqual({ outcome: "ok", pct: -20, before: { Attack: 6 }, after: { Attack: 5 } });
    expect(f.finishes[0].f.pct).toBe(-20);
    await expect(enchantAs(f.port, "w", "acc", input({ opId: "op_000002" }))).rejects.toThrow(
      "enchant.already",
    );
  });

  it("разрушение: цена не возвращается, итог «gone» уходит в базу (там же снятие с героя)", async () => {
    const f = fakePort({ have: { gold: 1000, cst_ingot: 5 }, rolls: [ROLL_GONE] });
    const res = await enchantAs(f.port, "w", "acc", input());
    expect(res).toEqual({ outcome: "gone" });
    expect(f.finishes.map((x) => x.outcome)).toEqual(["gone"]);
    expect(f.finishes[0].f.itemId).toBe("it_1");
    expect(f.wallet).toEqual({ gold: 900, cst_ingot: 3 });
  });

  it("без изменений: цена не возвращается, можно снова", async () => {
    const f = fakePort({ have: { gold: 1000, cst_ingot: 5 }, rolls: [ROLL_NONE, ROLL_NONE] });
    expect(await enchantAs(f.port, "w", "acc", input())).toEqual({ outcome: "none" });
    expect(await enchantAs(f.port, "w", "acc", input({ opId: "op_000002" }))).toEqual({
      outcome: "none",
    });
    expect(f.wallet).toEqual({ gold: 800, cst_ingot: 1 });
  });

  it("предмет увели во время оплаты — цена возвращена, итога нет", async () => {
    const f = fakePort({ have: { gold: 1000, cst_ingot: 5 }, rolls: [ROLL_OK, 10] });
    const realSpend = f.port.spend;
    f.port.spend = async (...a) => {
      const r = await realSpend(...a);
      f.setItem(null); // продали в соседней вкладке
      return r;
    };
    await expect(enchantAs(f.port, "w", "acc", input())).rejects.toThrow("enchant.item_changed");
    expect(f.wallet).toEqual({ gold: 1000, cst_ingot: 5 });
  });
});

describe("rollEnchant — шансы с шагами", () => {
  const at = (x: number, steps: number) => rollEnchant(spell, steps, (min) => (min === 0 ? x : 10));
  it("граница успеха сдвигается шагами: 50 % → 60 % за 2 шага по 10 %", () => {
    expect(at(550_000, 0).outcome).toBe("gone"); // 55 % — в разрушении (50…70)
    expect(at(550_000, 2).outcome).toBe("ok"); // 55 % < 60 %
    // Остаток 40 делится 30 : 20 → «без изменений» 24, разрушение 16: граница 76 %.
    expect(at(750_000, 2).outcome).toBe("gone");
    expect(at(770_000, 2).outcome).toBe("none");
  });
  it("усиление — целое из диапазона [boostMin, boostMax]", () => {
    const s = { ...spell, boostMin: 50, boostMax: 90 };
    const calls: Array<[number, number]> = [];
    const r = rollEnchant(s, 0, (min, max) => (calls.push([min, max]), min === 0 ? 0 : 77));
    expect(r).toEqual({ outcome: "ok", pct: 77 });
    expect(calls[1]).toEqual([50, 91]);
    // С минусом — тот же бросок: криптослучайно целое из [−20, 50] включительно.
    const neg = { ...spell, success: 100, boostMin: -20, boostMax: 50 };
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(rollEnchant(neg, 0, secureRandomInt).pct ?? NaN);
    expect([...seen].every((p) => Number.isInteger(p) && p >= -20 && p <= 50)).toBe(true);
    expect(Math.min(...seen)).toBeLessThan(0);
  });
});
