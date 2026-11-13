// Формула места для сделки «плачу из рюкзака — получаю в рюкзак» (правило
// владельца 23.10). Ей одной судят сервер (предпроверка до денег) и клиент
// (кнопка «Макс»), поэтому сценарии игрока проверяются здесь, без базы.
import { describe, expect, it } from "vitest";
import {
  backpackPaid,
  maxFitUnits,
  priceLines,
  type PayLine,
  tradeRoomError,
  type BagStack,
  type KeyQty,
} from "./backpackTrade";
import { CELL_SIZE } from "./backpackCells";

const CHIP = "custom:cst_fkehwvvgzpw1"; // «Щепа мертвого дерева»
const ROD = "custom:cst_rew3z8sxs897"; // «Удочка»

const room = (stacks: BagStack[], want: KeyQty[], pay: KeyQty[] = [], capacity = 1) =>
  tradeRoomError({ stacks, want, pay, capacity, potionCapacity: 1 });

describe("сценарий игрока: рюкзак 1/1, в ячейке единственная Щепа", () => {
  const stacks = [{ stackKey: CHIP, count: 1 }];

  it("Удочка за 5 дерева + 1 Щепу — проходит: Щепа уходит, ячейка свободна", () => {
    expect(room(stacks, [{ stackKey: ROD, qty: 1 }], [{ stackKey: CHIP, qty: 1 }])).toBeNull();
  });

  it("без учёта оплаты — прежний отказ «нужно 1, свободно 0»", () => {
    expect(room(stacks, [{ stackKey: ROD, qty: 1 }])).toBe("market.backpack_need:1:0");
  });
});

describe("частичное списание", () => {
  it("Щепы две, уходит одна — ячейка остаётся занятой, отказ", () => {
    const stacks = [{ stackKey: CHIP, count: 2 }];
    expect(room(stacks, [{ stackKey: ROD, qty: 1 }], [{ stackKey: CHIP, qty: 1 }])).toBe(
      "market.backpack_need:1:0",
    );
  });

  it(`ячейки — по ceil(count/${CELL_SIZE}): ${CELL_SIZE + 1} → ${CELL_SIZE} освобождает вторую ячейку`, () => {
    const stacks = [{ stackKey: CHIP, count: CELL_SIZE + 1 }];
    const want = [{ stackKey: ROD, qty: 1 }];
    expect(room(stacks, want, [{ stackKey: CHIP, qty: 1 }], 2)).toBeNull();
    // Полная + 2 → полная + 1: всё ещё две ячейки.
    expect(
      room([{ stackKey: CHIP, count: CELL_SIZE + 2 }], want, [{ stackKey: CHIP, qty: 1 }], 2),
    ).toBe("market.backpack_need:1:0");
  });

  it("дробь списывается до тысячных, как в базе: 0,3 − 0,1×3 = пусто", () => {
    const stacks = [{ stackKey: CHIP, count: 0.3 }];
    expect(
      room(stacks, [{ stackKey: ROD, qty: 1 }], [{ stackKey: CHIP, qty: 0.1 * 3 }]),
    ).toBeNull();
  });
});

describe("пачка и одна стопка", () => {
  it("3 удочки за 3 Щепы — Щепа уходит целиком, удочки в одну ячейку", () => {
    const stacks = [{ stackKey: CHIP, count: 3 }];
    expect(room(stacks, [{ stackKey: ROD, qty: 3 }], [{ stackKey: CHIP, qty: 3 }])).toBeNull();
    // 2 удочки за 2 Щепы — одна Щепа остаётся, места нет.
    expect(room(stacks, [{ stackKey: ROD, qty: 2 }], [{ stackKey: CHIP, qty: 2 }])).toBe(
      "market.backpack_need:1:0",
    );
  });

  it("плачу тем же видом, что получаю: сначала минус, потом плюс", () => {
    // Полная ячейка (CELL_SIZE) при ёмкости 1: 1 за 1 — та же полная, место не нужно.
    const stacks = [{ stackKey: ROD, count: CELL_SIZE }];
    expect(room(stacks, [{ stackKey: ROD, qty: 1 }], [{ stackKey: ROD, qty: 1 }])).toBeNull();
    expect(room(stacks, [{ stackKey: ROD, qty: 1 }])).toBe("market.backpack_need:1:0");
  });
});

describe("хранилища и перебор", () => {
  it("оплата зельем освобождает сумку, а не рюкзак", () => {
    const stacks = [
      { stackKey: CHIP, count: 1 },
      { stackKey: "custom:cst_heal", count: 1, potion: true },
    ];
    const pay = [{ stackKey: "custom:cst_heal", qty: 1 }];
    expect(room(stacks, [{ stackKey: ROD, qty: 1 }], pay)).toBe("market.backpack_need:1:0");
  });

  it("рюкзак над ёмкостью: освобождённое не даёт права на новую ячейку сверх неё", () => {
    // 3 ячейки при ёмкости 1; оплата освобождает одну → после выдачи снова 3 > max(1, 2).
    const stacks = [
      { stackKey: CHIP, count: 1 },
      { stackKey: "custom:cst_a", count: 1 },
      { stackKey: "custom:cst_b", count: 1 },
    ];
    expect(room(stacks, [{ stackKey: ROD, qty: 1 }], [{ stackKey: CHIP, qty: 1 }])).toBe(
      "market.backpack_need:1:0",
    );
  });
});

describe("какие цены снимаются с рюкзака", () => {
  // Штучное из инвентаря отличает вызывающий: здесь — артефакт и «любой герой».
  const inv = (res: string, token: string) => res === "art" || token.startsWith("hero_any_");
  const paid = (res: PayLine["res"], token: string | null) =>
    backpackPaid([{ res, token, amount: 1 }], inv).length === 1;

  it("свой товар, босс, пак, именной герой — да; штучные, валюты, без шаблона — нет", () => {
    expect(paid("custom", "cst_x")).toBe(true);
    expect(paid("boss", "rbt_x")).toBe(true);
    expect(paid("pack", "cp_x")).toBe(true);
    expect(paid("hero", "hero_x")).toBe(true);
    expect(paid("hero", "hero_any_rare")).toBe(false);
    expect(paid("art", "art_x")).toBe(false);
    expect(paid("wood", null)).toBe(false);
    expect(paid("token", "DARAI")).toBe(false);
    expect(paid("custom", null)).toBe(false);
  });

  it("обе цены позиции × количество; в рюкзак уходит только предметная", () => {
    const it = {
      priceResource: "wood" as const,
      priceToken: null,
      priceAmount: 5,
      price2Resource: "custom" as const,
      price2Token: "cst_fkehwvvgzpw1",
      price2Amount: 1,
    };
    expect(backpackPaid(priceLines(it, 3), inv)).toEqual([
      { res: "custom", token: "cst_fkehwvvgzpw1", amount: 3 },
    ]);
  });
});

describe("maxFitUnits — «Макс» на клиенте", () => {
  it("берёт наибольшее подходящее, даже когда место не монотонно", () => {
    expect(maxFitUnits(5, (u) => u === 1 || u === 3)).toBe(3);
    expect(maxFitUnits(2.7, () => true)).toBe(2);
    expect(maxFitUnits(10, () => false)).toBe(0);
  });
});
