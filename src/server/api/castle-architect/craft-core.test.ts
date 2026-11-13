// Изготовление заготовки: всё, что может отказать без денег, — до оплаты; не
// легла в рюкзак (по ключу выдачи) — оплата возвращается; повтор ключа не
// платит дважды и не выдаёт после возврата; ключ, запертый добором, — не успех.
import { afterEach, describe, expect, it, vi } from "vitest";
import { craftBlueprint, architectError, type CraftDeps, type PayStatus } from "./craft-core";
import type { UndoResult } from "./craft-undo";
import type { ArchitectCost } from "@/lib/castleArchitect";

const COST: ArchitectCost = { wood: 300, stone: 50, gold: 150, diamonds: 0 };

function setup(o: {
  spec?: string | null;
  hero?: boolean;
  level?: number;
  room?: boolean;
  /** Товаров цены в рюкзаке не хватает. */
  goods?: boolean;
  pay?: PayStatus | Error;
  deposit?: Error;
  /** Откат упавшей выдачи: итог или сбой самого оператора. */
  undo?: UndoResult | Error;
  /** Свежее чтение оплаты: вернули ли (добор) — или сбой чтения. */
  refunded?: boolean | Error;
}) {
  const log: string[] = [];
  const deps: CraftDeps = {
    backpack: async () =>
      o.hero === false
        ? null
        : { heroId: "h1", spec: o.spec ?? null, capacity: 8, potionCapacity: 2 },
    level: async () => o.level ?? 0,
    cost: async (kind) => {
      log.push(`cost:${kind}`);
      return COST;
    },
    assertRoom: async () => {
      log.push("room");
      if (o.room === false) throw new Error("market.backpack_need:1:0");
    },
    assertGoods: async () => {
      if (o.goods === false) {
        log.push("goods");
        throw new Error("architect.no_goods:Доска ×2");
      }
    },
    pay: async (cost, bag) => {
      log.push(`pay:${cost.wood}`);
      if (bag.heroId !== "h1") throw new Error("оплата не того рюкзака");
      if (o.pay instanceof Error) throw o.pay;
      return o.pay ?? "paid";
    },
    deposit: async () => {
      log.push("deposit");
      if (o.deposit) throw o.deposit;
    },
    undo: async () => {
      log.push("undo");
      if (o.undo instanceof Error) throw o.undo;
      return o.undo ?? "refunded";
    },
    refunded: async () => {
      log.push("recheck");
      if (o.refunded instanceof Error) throw o.refunded;
      return o.refunded ?? false;
    },
  };
  return { deps, log };
}

afterEach(() => vi.restoreAllMocks());

describe("craftBlueprint", () => {
  it("уровень есть — платит, кладёт в рюкзак", async () => {
    const { deps, log } = setup({ level: 1 });
    await expect(craftBlueprint("wood", deps)).resolves.toEqual({
      ok: true,
      kind: "wood",
      applied: true,
    });
    expect(log).toEqual(["cost:wood", "room", "pay:300", "deposit"]);
  });

  it("без героя — отказ до всего", async () => {
    const { deps, log } = setup({ hero: false, level: 4 });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow("market.need_hero");
    expect(log).toEqual([]);
  });

  it("уровня мало — отказ с нужным уровнем, без оплаты", async () => {
    const { deps, log } = setup({ level: 1 });
    await expect(craftBlueprint("stone", deps)).rejects.toThrow("architect.level_needed:2");
    expect(log).toEqual([]);
  });

  it("Строитель делает дерево и камень без Архитектора", async () => {
    const { deps } = setup({ spec: "Строитель", level: 0 });
    await expect(craftBlueprint("stone", deps)).resolves.toMatchObject({ ok: true, kind: "stone" });
  });

  it("золото и алмазы делаются (21.10): алмазы — с 4-го уровня или Строителю", async () => {
    await expect(craftBlueprint("diamonds", setup({ level: 3 }).deps)).rejects.toThrow(
      "architect.level_needed:4",
    );
    await expect(craftBlueprint("diamonds", setup({ level: 4 }).deps)).resolves.toMatchObject({
      ok: true,
    });
    const builder = setup({ spec: "Строитель", level: 0 }).deps;
    await expect(craftBlueprint("gold", builder)).resolves.toMatchObject({ kind: "gold" });
  });

  it("товаров не хватает — отказ со списком ДО оплаты, после проверки места", async () => {
    const { deps, log } = setup({ level: 1, goods: false });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow("architect.no_goods:Доска ×2");
    expect(log).toEqual(["cost:wood", "room", "goods"]);
  });

  it("рюкзак полон — отказ ДО оплаты", async () => {
    const { deps, log } = setup({ level: 2, room: false });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow("market.backpack_need:1:0");
    expect(log).not.toContain("pay:300");
  });

  it("ресурсов не хватает — понятный ключ, рюкзак не трогали", async () => {
    const { deps, log } = setup({ level: 1, pay: new Error("res_move: в минус") });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow("architect.no_resources");
    expect(log).not.toContain("deposit");
  });

  it("не легла в рюкзак (гонка) — ключ заперт, оплата вернулась, ошибка с меткой", async () => {
    const { deps, log } = setup({ level: 1, deposit: new Error("market.backpack_need:1:0") });
    // Текст — исходный (рюкзак полон), метка — окну: следующее нажатие — новый ключ.
    await expect(craftBlueprint("wood", deps)).rejects.toThrow(
      /^architect\.refunded:market\.backpack_need:1:0$/,
    );
    expect(log).toEqual(["cost:wood", "room", "pay:300", "deposit", "undo"]);
  });

  it("ответ выдачи потерялся, а ключ уже стоял — успех, без возврата", async () => {
    const { deps, log } = setup({ level: 1, deposit: new Error("MCP timeout"), undo: "landed" });
    await expect(craftBlueprint("wood", deps)).resolves.toEqual({
      ok: true,
      kind: "wood",
      applied: true,
    });
    // «Легла» по снимку отката — сверено свежим чтением оплаты.
    expect(log.slice(-2)).toEqual(["undo", "recheck"]);
  });

  it("откат сказал «легла», а ключ запер добор (оплата возвращена) — не успех, с меткой", async () => {
    const { deps } = setup({
      level: 1,
      deposit: new Error("MCP timeout"),
      undo: "landed",
      refunded: true,
    });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow(/^architect\.refunded:MCP timeout$/);
  });

  it("«легла», но оплату не прочли — исходная ошибка БЕЗ метки: повтор решит", async () => {
    const { deps } = setup({
      level: 1,
      deposit: new Error("MCP timeout"),
      undo: "landed",
      refunded: new Error("db down"),
    });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow(/^MCP timeout$/);
  });

  it("ключ стоял, но оплату уже вернули (повтор отката) — не успех, с меткой", async () => {
    const { deps } = setup({ level: 1, deposit: new Error("MCP timeout"), undo: "gone" });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow(/^architect\.refunded:MCP timeout$/);
  });

  it("откат упал — исходная ошибка БЕЗ метки: ключ живёт, повтор доведёт", async () => {
    const { deps, log } = setup({
      level: 1,
      deposit: new Error("market.need_hero"),
      undo: new Error("db down"),
    });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow(/^market\.need_hero$/);
    expect(log).toContain("undo");
  });

  it("выдача бросила не Error — метка поверх строки", async () => {
    const { deps } = setup({ level: 1 });
    deps.deposit = () => Promise.reject("сбой");
    await expect(craftBlueprint("wood", deps)).rejects.toThrow(/^architect\.refunded:сбой$/);
  });

  it("повтор того же ключа: не платит заново, выдача идемпотентна, applied=false", async () => {
    const { deps, log } = setup({ level: 1, pay: "repeat" });
    await expect(craftBlueprint("wood", deps)).resolves.toEqual({
      ok: true,
      kind: "wood",
      applied: false,
    });
    expect(log.slice(-2)).toEqual(["deposit", "recheck"]);
  });

  it("повтор: выдача «прошла» по ключу, который запер добор, — отказ, окно возьмёт новый ключ", async () => {
    const { deps } = setup({ level: 1, pay: "repeat", refunded: true });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow(/^architect\.op_refunded$/);
  });

  it("повтор, оплату не прочли — ошибка чтения без метки (ключ живёт)", async () => {
    const { deps } = setup({ level: 1, pay: "repeat", refunded: new Error("db down") });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow(/^db down$/);
  });

  it("свежая оплата, выдача шла дольше 5 минут — сверка; быстрая — без сверки", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const slow = setup({ level: 1, refunded: true });
    slow.deps.deposit = async () => {
      now += 5 * 60_000 + 1;
    };
    await expect(craftBlueprint("wood", slow.deps)).rejects.toThrow(/^architect\.op_refunded$/);
    const fast = setup({ level: 1, refunded: true });
    await expect(craftBlueprint("wood", fast.deps)).resolves.toMatchObject({ applied: true });
    expect(fast.log).not.toContain("recheck");
  });

  it("ключ уже вернули — заготовку не выдаём", async () => {
    const { deps, log } = setup({ level: 1, pay: "refunded" });
    await expect(craftBlueprint("wood", deps)).rejects.toThrow("architect.op_refunded");
    expect(log).not.toContain("deposit");
  });
});

describe("architectError", () => {
  it("ошибки базы → ключи; прочее — как есть", () => {
    expect(architectError(new Error("res_move: в минус")).message).toBe("architect.no_resources");
    expect(architectError(new Error("architect_level_moved:2")).message).toBe(
      "architect.level_moved",
    );
    expect(architectError(new Error("architect_max_level")).message).toBe("architect.max_level");
    // Гонка мимо предпроверки: имя и недостача из базы, хвост CONTEXT отрезан.
    expect(
      architectError(new Error("architect_no_goods:Доска ×2\nCONTEXT: PL/pgSQL")).message,
    ).toBe("architect.no_goods:Доска ×2");
    expect(architectError(new Error("architect_need_hero")).message).toBe("market.need_hero");
    expect(architectError(new Error("что-то")).message).toBe("что-то");
    expect(architectError("").message).toBe("Не удалось");
  });
});
