// Обряд зачарования героев на подменном порту: герои, деньги, журнал и бросок —
// в памяти; порядок шагов и отказы — настоящие (rite-flow).
import { describe, expect, it } from "vitest";
import type { HeroRite, RiteHero } from "@/lib/enchant/heroRite";
import type { AttemptRow } from "@/server/api/beta-raid/enchant/enchant-flow";
import type { PawnHeroRef } from "@/server/api/beta-raid/hero-any";
import { heroRiteAs, riteHeroItemId, type RitePort } from "./rite-flow";

const rite: HeroRite = {
  id: "hrite_1",
  name: "Слияние",
  rarity: "rare",
  need: 3,
  success: 50,
  loseMin: 1,
  loseMax: 2,
  cost: [{ kind: "resource", code: "gold", amount: 100 }],
};

const legRite: HeroRite = { ...rite, id: "hrite_leg", rarity: "legendary", need: 3 };

const hero = (id: string): RiteHero => ({
  itemId: id,
  templateId: `tpl_${id}`,
  name: `Герой ${id}`,
  imageUrl: null,
  rarity: "rare",
  level: 5,
});

/** Модель базы: свободные герои, кошелёк, снимки, журнал, выданные копии. */
function fakePort(o: { gold?: number; rolls: number[]; free?: string[]; takeFails?: boolean }) {
  const free = new Set(o.free ?? ["a", "b", "c", "d"]);
  const snaps = new Map<string, string>(); // op снимка → itemId
  const attempts = new Map<string, AttemptRow>();
  const granted: Array<{ itemId: string; templateId: string }> = [];
  const uniques: string[] = [];
  const dropped: string[] = [];
  const log: string[] = [];
  let gold = o.gold ?? 1000;
  const rolls = [...o.rolls];
  const port: RitePort = {
    spend: async (_w, _a, _res, _t, amount) => {
      if (gold < amount) throw new Error("not_enough gold");
      gold -= amount;
      log.push(`pay ${amount}`);
      return {};
    },
    credit: async (_w, _a, _res, _t, amount) => {
      gold += amount;
      log.push(`refund ${amount}`);
    },
    loadRite: async (_m, _q, _r, id) =>
      id === rite.id ? rite : id === legRite.id ? legRite : null,
    freeHeroes: async () => [...free].map(hero),
    templates: async () => [{ id: "tpl_epic", name: "Эпик", imageUrl: null }],
    readAttempt: async (_a, op) => attempts.get(op) ?? null,
    clearStale: async () => undefined,
    claim: async (c) => {
      if (attempts.has(c.op)) return false;
      attempts.set(c.op, { status: "pending", result: null, error: null });
      return true;
    },
    notePaid: async () => undefined,
    markRefunded: async (_a, op, error) => {
      attempts.set(op, { status: "refunded", result: null, error });
    },
    takeHeroes: async (_r, ids, ref) => {
      if (o.takeFails) throw new Error("market.hero_busy");
      for (const id of ids) {
        free.delete(id);
        snaps.set(`${ref}:${id}`, id);
      }
      log.push(`take ${ids.join(",")}`);
      return ids.map((id) => ({ op: `${ref}:${id}`, itemId: id, templateId: `tpl_${id}` }));
    },
    restoreHeroes: async (refs: PawnHeroRef[]) => {
      for (const r of refs) free.add(r.itemId);
      log.push(`restore ${refs.map((r) => r.itemId).join(",")}`);
    },
    grantHero: async (itemId, templateId) => {
      granted.push({ itemId, templateId });
    },
    makeUnique: async (itemId) => {
      if (!free.has(itemId)) throw new Error("не вернулся");
      uniques.push(itemId);
    },
    dropGone: async (refs) => {
      dropped.push(...refs.map((r) => r.itemId));
    },
    done: async (_a, op, res) => {
      attempts.set(op, { status: "done", result: res, error: null });
    },
    rnd: (min, max) => {
      const v = rolls.shift() ?? min;
      return Math.min(max - 1, Math.max(min, v));
    },
  };
  return { port, free, granted, uniques, dropped, log, gold: () => gold };
}

const input = (over: Partial<{ heroIds: string[]; opId: string }> = {}) => ({
  mapId: "rmap_1",
  q: 1,
  r: 2,
  riteId: rite.id,
  heroIds: ["a", "b", "c"],
  opId: "op_12345678",
  ...over,
});

describe("обряд: успех", () => {
  it("уходят все трое, цена списана, новый эпический герой — копией с ключом попытки", async () => {
    const f = fakePort({ rolls: [0, 0] });
    const res = await heroRiteAs(f.port, "w.near", "acc_1", input());
    expect(res.outcome).toBe("ok");
    expect(res.hero).toMatchObject({ templateId: "tpl_epic", rarity: "epic" });
    expect(res.lost.map((h) => h.itemId)).toEqual(["a", "b", "c"]);
    expect(f.granted).toEqual([
      { itemId: riteHeroItemId("acc_1", "op_12345678"), templateId: "tpl_epic" },
    ]);
    expect(f.dropped).toEqual(["a", "b", "c"]);
    expect(f.gold()).toBe(900);
    expect([...f.free]).toEqual(["d"]);
    // Герои сняты ДО денег: пока идёт попытка, их не продать и не выбрать.
    expect(f.log.slice(0, 2)).toEqual(["take a,b,c", "pay 100"]);
  });

  it("повтор того же нажатия — тот же итог, второй раз не платит", async () => {
    const f = fakePort({ rolls: [0, 0] });
    const first = await heroRiteAs(f.port, "w.near", "acc_1", input());
    const again = await heroRiteAs(f.port, "w.near", "acc_1", input());
    expect(again).toEqual(first);
    expect(f.gold()).toBe(900);
    expect(f.granted).toHaveLength(1);
  });
});

describe("обряд: неудача", () => {
  it("пропадают выпавшие (1–2), остальные возвращаются целиком; цена не возвращается", async () => {
    // 60 % ≥ 50 — неудача; k = 1; пропадает индекс 1 («b»).
    const f = fakePort({ rolls: [600_000, 1, 1] });
    const res = await heroRiteAs(f.port, "w.near", "acc_1", input());
    expect(res.outcome).toBe("gone");
    expect(res.hero).toBeUndefined();
    expect(res.lost.map((h) => h.itemId)).toEqual(["b"]);
    expect(f.dropped).toEqual(["b"]);
    expect(f.log).toContain("restore a,c");
    expect([...f.free].sort()).toEqual(["a", "c", "d"]);
    expect(f.gold()).toBe(900);
  });
});

describe("отказы", () => {
  it("героев не столько, сколько просит обряд, или кто-то занят — до денег", async () => {
    const f = fakePort({ rolls: [] });
    await expect(heroRiteAs(f.port, "w", "acc_1", input({ heroIds: ["a", "b"] }))).rejects.toThrow(
      "herorite.need_count",
    );
    await expect(
      heroRiteAs(f.port, "w", "acc_1", input({ heroIds: ["a", "a", "b"] })),
    ).rejects.toThrow("herorite.need_count");
    await expect(
      heroRiteAs(f.port, "w", "acc_1", input({ heroIds: ["a", "b", "zz"] })),
    ).rejects.toThrow("herorite.hero_busy");
    expect(f.gold()).toBe(1000);
  });

  it("героя увели в миг снятия — ничего не списано, отказ в журнале", async () => {
    const f = fakePort({ rolls: [], takeFails: true });
    await expect(heroRiteAs(f.port, "w", "acc_1", input())).rejects.toThrow("herorite.hero_busy");
    expect(f.gold()).toBe(1000);
    await expect(heroRiteAs(f.port, "w", "acc_1", input())).rejects.toThrow("herorite.hero_busy");
  });

  it("не хватает цены — герои возвращаются, броска нет", async () => {
    const f = fakePort({ gold: 50, rolls: [] });
    await expect(heroRiteAs(f.port, "w", "acc_1", input())).rejects.toThrow("enchant.not_enough");
    expect(f.log).toEqual(["take a,b,c", "restore a,b,c"]);
    expect([...f.free].sort()).toEqual(["a", "b", "c", "d"]);
    expect(f.granted).toHaveLength(0);
  });

  it("новый герой не выдался — герои и цена назад", async () => {
    const f = fakePort({ rolls: [0, 0] });
    f.port.grantHero = async () => {
      throw new Error("db down");
    };
    await expect(heroRiteAs(f.port, "w", "acc_1", input())).rejects.toThrow("enchant.failed");
    expect(f.gold()).toBe(1000);
    expect([...f.free].sort()).toEqual(["a", "b", "c", "d"]);
    expect(f.dropped).toEqual([]);
  });
});

describe("легендарный → уникальный", () => {
  const leg = () => ({ ...input(), riteId: legRite.id, heroIds: ["c", "a", "b"] });

  it("успех — уником становится герой первой ячейки, тот же; остальные уходят, нового нет", async () => {
    const f = fakePort({ rolls: [0] });
    const res = await heroRiteAs(f.port, "w", "acc_1", leg());
    expect(res.outcome).toBe("ok");
    expect(res.hero).toMatchObject({ itemId: "c", rarity: "unique", name: "Герой c" });
    expect(f.uniques).toEqual(["c"]);
    expect(f.granted).toEqual([]);
    expect(res.lost.map((h) => h.itemId)).toEqual(["a", "b"]);
    expect(f.dropped).toEqual(["a", "b"]);
    expect([...f.free].sort()).toEqual(["c", "d"]);
  });

  it("неудача — пропадает случайный, и первый тоже может", async () => {
    // 60 % — неудача; k = 1; перестановка 0↔0 — пропадает первый («c»).
    const f = fakePort({ rolls: [600_000, 1, 0] });
    const res = await heroRiteAs(f.port, "w", "acc_1", leg());
    expect(res.outcome).toBe("gone");
    expect(res.lost.map((h) => h.itemId)).toEqual(["c"]);
    expect(f.uniques).toEqual([]);
    expect([...f.free].sort()).toEqual(["a", "b", "d"]);
  });

  it("уником не стал (сбой) — все герои и цена назад", async () => {
    const f = fakePort({ rolls: [0] });
    f.port.makeUnique = async () => {
      throw new Error("db down");
    };
    await expect(heroRiteAs(f.port, "w", "acc_1", leg())).rejects.toThrow("enchant.failed");
    expect(f.gold()).toBe(1000);
    expect([...f.free].sort()).toEqual(["a", "b", "c", "d"]);
    expect(f.dropped).toEqual([]);
  });
});
