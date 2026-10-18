// Поле количества: разбор набранного и зажим — на выходе, а не на каждой
// клавише; дробь меньше тысячной — полноценное количество.
import { describe, expect, it } from "vitest";
import { clampQty, commitQty, qtyBounds, qtyText, stepQty } from "@/lib/qtyPick";

describe("границы поля", () => {
  it("целая штука снизу, сколько есть — сверху", () => {
    expect(qtyBounds(25, { presets: [5, 25] })).toEqual({
      min: 1,
      max: 25,
      integer: false,
      presets: [5, 25],
    });
  });

  it("стек меньше штуки: окно умеет ровно столько, сколько лежит", () => {
    const b = qtyBounds(0.000178, { presets: [0.000178, 0.000178] });
    expect(b.min).toBe(0.000178);
    expect(b.max).toBe(0.000178);
    expect(clampQty(1, b)).toBe(0.000178);
  });

  it("быстрая доля меньше штуки опускает нижнюю границу до себя", () => {
    expect(qtyBounds(20.5, { presets: [0.5, 20.5] }).min).toBe(0.5);
  });

  it("целое поле: потолок — целая часть", () => {
    expect(qtyBounds(7.9, { integer: true }).max).toBe(7);
  });
});

describe("зажим и шаг", () => {
  const b = qtyBounds(7.738, { presets: [7.738] });

  it("ноль и мусор — к нижней границе, лишнее — к верхней", () => {
    expect(clampQty(0, b)).toBe(1);
    expect(clampQty(Number.NaN, b)).toBe(1);
    expect(clampQty(100, b)).toBe(7.738);
    expect(clampQty(2.5, b)).toBe(2.5);
  });

  it("−/+ шагают целыми, а упираются в точное «всё»", () => {
    expect(stepQty(7.738, -1, b)).toBe(7);
    expect(stepQty(7, 1, b)).toBe(7.738);
    expect(stepQty(1, -1, b)).toBe(1);
    expect(stepQty(2.5, 1, b)).toBe(3);
  });

  it("у стека меньше штуки −/+ никуда не уводят", () => {
    const tiny = qtyBounds(0.000178, { presets: [0.000178] });
    expect(stepQty(0.000178, -1, tiny)).toBe(0.000178);
    expect(stepQty(0.000178, 1, tiny)).toBe(0.000178);
  });
});

describe("разбор набранного (commitQty)", () => {
  const potions = qtyBounds(99, { integer: true });

  it("зелья: руками набирается любое число, а не только 10–19 и 99", () => {
    for (const n of [1, 2, 5, 9, 15, 42, 99]) {
      expect(commitQty(String(n), 1, potions, "ru")).toBe(n);
    }
    expect(commitQty("150", 1, potions, "ru")).toBe(99);
    expect(commitQty("0", 7, potions, "ru")).toBe(1);
  });

  it("пустое поле и мусор — прежнее число, а не «1» посреди набора", () => {
    expect(commitQty("", 7, potions, "ru")).toBe(7);
    expect(commitQty("абв", 7, potions, "ru")).toBe(7);
  });

  it("целое поле отбрасывает дробь, а не склеивает цифры", () => {
    expect(commitQty("2,7", 1, potions, "ru")).toBe(2);
  });

  it("запятая и точка — обе разделители", () => {
    const b = qtyBounds(20, { presets: [20] });
    expect(commitQty("0,5", 1, b, "ru")).toBe(1);
    const half = qtyBounds(20.5, { presets: [0.5, 20.5] });
    expect(commitQty("0,5", 1, half, "ru")).toBe(0.5);
    expect(commitQty("2.25", 1, half, "en")).toBe(2.25);
    expect(commitQty("1 234,5", 1, qtyBounds(5000), "ru")).toBe(1234.5);
  });

  it("набранное, неотличимое от доли на экране, — это доля, точно", () => {
    const total = Number("7.738083231472351586");
    const b = qtyBounds(total, { presets: [total, total] });
    expect(commitQty("7,738", 1, b, "ru")).toBe(total);
    expect(commitQty("7,73", 1, b, "ru")).toBe(7.73);
  });

  it("дробь меньше тысячной набирается и не режется в ноль", () => {
    const b = qtyBounds(0.000454660540250266, { presets: [0.000454660540250266] });
    expect(commitQty("0,000455", 1, b, "ru")).toBe(0.000454660540250266);
  });
});

describe("количество языком игрока", () => {
  it("мельче тысячной — три значащие цифры, а не ноль", () => {
    expect(qtyText(0.000178, "ru")).toBe("0,000178");
    expect(qtyText(0.000178, "en")).toBe("0.000178");
    expect(qtyText(0.000454660540250266, "ru")).toBe("0,000455");
  });

  it("остальное — до трёх знаков, без разрядных пробелов", () => {
    expect(qtyText(7.738083231472352, "ru")).toBe("7,738");
    expect(qtyText(20, "ru")).toBe("20");
    expect(qtyText(1234.5, "ru")).toBe("1234,5");
  });

  it("счётчик на плитке — до сотых; мельче сотой — три значащие цифры", () => {
    expect(qtyText(0.2356088130679914, "ru", 2)).toBe("0,24");
    expect(qtyText(7.738083231472352, "en", 2)).toBe("7.74");
    expect(qtyText(0.0042, "ru", 2)).toBe("0,0042");
    expect(qtyText(0.000454660540250266, "ru", 2)).toBe("0,000455");
    expect(qtyText(20, "ru", 2)).toBe("20");
  });
});
