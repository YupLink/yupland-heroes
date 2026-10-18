// Сколько забросов можно заказать — по удочкам: «четыре целых и пятая наполовину» = 45.
import { describe, expect, it } from "vitest";
import { stackUses } from "@/lib/raid/toolWear";
import { planTriesFor } from "@/server/api/beta-raid/fishing/fishing-plan";
import { triesForMinutes } from "@/lib/raid/fishing";

describe("ёмкость удочек", () => {
  it("целая удочка с износом 10 % даёт десять забросов", () => {
    expect(stackUses({ count: 1, wear: 0 }, 10)).toBe(10);
  });

  it("четыре целых и пятая, израсходованная наполовину, — 45", () => {
    expect(stackUses({ count: 5, wear: 50 }, 10)).toBe(45);
  });

  it("пустая стопка не даёт ничего", () => {
    expect(stackUses({ count: 0, wear: 0 }, 10)).toBe(0);
  });

  it("удочка без настройки износа — один заброс", () => {
    expect(stackUses({ count: 1, wear: 0 }, 100)).toBe(1);
  });
});

describe("заказ заброса", () => {
  it("минуты переводятся в попытки по интервалу", () => {
    expect(triesForMinutes(60, 1)).toBe(60);
    expect(triesForMinutes(60, 10)).toBe(6);
    expect(triesForMinutes(1, 1)).toBe(1);
  });

  it("больше шестидесяти минут не заказать", () => {
    expect(triesForMinutes(600, 1)).toBe(60);
  });

  it("заказ режется удочками: час при 45 попытках — это 45", () => {
    expect(planTriesFor(60, 1, 45)).toBe(45);
    expect(planTriesFor(10, 1, 45)).toBe(10);
    expect(planTriesFor(60, 1, 0)).toBe(0);
  });
});
