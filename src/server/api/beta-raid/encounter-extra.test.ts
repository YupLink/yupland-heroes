// Доли новых видов по местам: ресурс — целыми, товар — штучно.
import { describe, it, expect } from "vitest";
import { moneyOnly, extraByPlace } from "./encounter-extra";
import { moneyByPlace } from "./encounter-share";
import { parseRewardConfig } from "../raid-shared";

const cfg = (fillers: unknown[], split = [60, 40]) => parseRewardConfig({ fillers, split });

describe("moneyOnly", () => {
  it("оставляет делимое и убирает ссылочные виды", () => {
    const c = cfg([
      { kind: "likes", amount: 10 },
      { kind: "token", token: "Darai", amount: 5 },
      { kind: "resource", resource: "gold", amount: 100 },
      { kind: "custom", itemId: "cst_a", amount: 2 },
    ]);
    expect(moneyOnly(c).fillers.map((f) => f.kind)).toEqual(["likes", "token"]);
    // Токен по-прежнему идёт своим путём — значит и залог пула карты его видит.
    expect(
      moneyByPlace(moneyOnly(c), 2)
        .flat()
        .map((r) => r.kind),
    ).toContain("Darai");
    // А новые виды в денежную раздачу не попадают вовсе.
    expect(
      moneyByPlace(moneyOnly(c), 2)
        .flat()
        .map((r) => r.kind),
    ).not.toContain("resource");
  });
});

describe("ресурс делится фондом", () => {
  it("целыми и без потери фонда", () => {
    const rows = extraByPlace(cfg([{ kind: "resource", resource: "gold", amount: 100 }]), 2);
    const flat = rows.flat();
    expect(flat.every((r) => Number.isInteger(r.amount))).toBe(true);
    expect(flat.reduce((s, r) => s + r.amount, 0)).toBe(100);
    expect(rows[0][0]).toEqual({ kind: "resource", ref: "gold", amount: 60 });
    expect(rows[1][0]).toEqual({ kind: "resource", ref: "gold", amount: 40 });
  });

  it("доли пустующих мест уходят бившим (как у денег)", () => {
    // Фонд расписан на 10 мест, участник один — забирает всё, а не 25%.
    const c = parseRewardConfig({
      fillers: [{ kind: "resource", resource: "wood", amount: 30 }],
      split: [25, 18, 13, 10, 8, 6, 5, 5, 5, 5],
    });
    expect(extraByPlace(c, 1)[0][0].amount).toBe(30);
  });

  it("троим достаётся ровно фонд, хвост округления у последнего", () => {
    const rows = extraByPlace(
      cfg([{ kind: "resource", resource: "stone", amount: 10 }], [1, 1, 1]),
      3,
    );
    expect(rows.flat().reduce((s, r) => s + r.amount, 0)).toBe(10);
  });
});

describe("свой товар штучно", () => {
  it("уходит первым N местам целиком", () => {
    const rows = extraByPlace(
      cfg([{ kind: "custom", itemId: "cst_a", amount: 2, toPlace: 2 }], [1, 1, 1]),
      3,
    );
    expect(rows[0]).toEqual([{ kind: "custom", ref: "cst_a", amount: 2 }]);
    expect(rows[1]).toEqual([{ kind: "custom", ref: "cst_a", amount: 2 }]);
    expect(rows[2]).toEqual([]);
    // Никаких 0,37 слитка: количество не делится вовсе.
    expect(rows.flat().every((r) => r.amount === 2)).toBe(true);
  });

  it("без места достаётся только первому", () => {
    const rows = extraByPlace(cfg([{ kind: "custom", itemId: "cst_a", amount: 1 }]), 2);
    expect(rows[0]).toHaveLength(1);
    expect(rows[1]).toHaveLength(0);
  });
});

describe("пустые случаи", () => {
  it("без участников и без новых видов — пусто", () => {
    expect(extraByPlace(cfg([{ kind: "likes", amount: 10 }]), 2)).toEqual([[], []]);
    expect(extraByPlace(cfg([{ kind: "resource", resource: "gold", amount: 10 }]), 0)).toEqual([]);
  });
});
