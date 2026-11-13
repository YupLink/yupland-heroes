// Пикер «Какой артефакт отдать»: в ломбарде отмечают несколько групп и штук
// (как героев), в остальном маркете — одна группа целиком, как было.
import { describe, expect, it } from "vitest";
import { choiceOf, selFromChoice, selTotal, setSelN, tapSel, type Sel } from "./artPickSel";

const row = (templateId: string, count: number, wear = 0) => ({
  templateId,
  name: `N:${templateId}`,
  count,
  wear,
});
const A = row("a", 3);
const B = row("b", 1, 100);
const A_BROKEN = row("a", 2, 100);
const many = (n: number) => `Артефактов: ${n}`;

describe("tapSel / setSelN", () => {
  it("multi: тап включает группу целиком и снимает её; группы по износу разные", () => {
    let sel: Sel<typeof A> = [];
    sel = tapSel(sel, A, true);
    sel = tapSel(sel, A_BROKEN, true);
    expect(sel).toEqual([
      { a: A, n: 3 },
      { a: A_BROKEN, n: 2 },
    ]);
    expect(tapSel(sel, A, true)).toEqual([{ a: A_BROKEN, n: 2 }]);
  });

  it("без multi: тап выбирает одну группу целиком (как раньше)", () => {
    const sel = tapSel(tapSel([], A, false), B, false);
    expect(sel).toEqual([{ a: B, n: 1 }]);
    expect(tapSel([], A, false)).toEqual([{ a: A, n: 3 }]);
  });

  it("степпер: не больше свободных, ноль снимает отметку", () => {
    const sel = tapSel(tapSel([], A, true), B, true);
    expect(setSelN(sel, A, 9)).toEqual([
      { a: A, n: 3 },
      { a: B, n: 1 },
    ]);
    expect(setSelN(sel, A, 0)).toEqual([{ a: B, n: 1 }]);
    expect(selTotal(setSelN(sel, A, 2))).toBe(3);
  });
});

describe("choiceOf", () => {
  it("multi: count — отмечено штук, группы по порядку отметок, подпись по числу групп", () => {
    const sel = setSelN(tapSel(tapSel([], B, true), A, true), A, 2);
    expect(choiceOf(sel, true, many)).toEqual({
      templateId: "b",
      name: "Артефактов: 3",
      count: 3,
      arts: [
        { templateId: "b", wear: 100, count: 1 },
        { templateId: "a", wear: 0, count: 2 },
      ],
    });
    expect(choiceOf([{ a: A, n: 2 }], true, many)?.name).toBe("N:a");
    expect(choiceOf([], true, many)).toBeNull();
  });

  it("без multi: прежний выбор — count = свободных, износ только не нулевой", () => {
    expect(choiceOf([{ a: A, n: 3 }], false, many)).toEqual({
      templateId: "a",
      name: "N:a",
      count: 3,
    });
    expect(choiceOf([{ a: B, n: 1 }], false, many)?.wear).toBe(100);
  });
});

describe("selFromChoice — открыли пикер снова", () => {
  it("multi: прежние группы в прежнем порядке, число — не больше свободных сейчас", () => {
    const value = {
      templateId: "b",
      name: "",
      count: 6,
      arts: [
        { templateId: "b", wear: 100, count: 1 },
        { templateId: "gone", wear: 0, count: 1 },
        { templateId: "a", wear: 0, count: 4 },
      ],
    };
    expect(selFromChoice([A, B], value, true)).toEqual([
      { a: B, n: 1 },
      { a: A, n: 3 },
    ]);
  });

  it("без multi или старый выбор без групп — та же группа целиком; пусто — ничего", () => {
    const value = { templateId: "a", name: "", count: 2, wear: 100 };
    expect(selFromChoice([A, A_BROKEN], value, false)).toEqual([{ a: A_BROKEN, n: 2 }]);
    expect(selFromChoice([A, A_BROKEN], value, true)).toEqual([{ a: A_BROKEN, n: 2 }]);
    expect(selFromChoice([A], null, true)).toEqual([]);
  });
});
