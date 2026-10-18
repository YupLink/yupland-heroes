// Смена основного героя: рамка сразу на тапнутом, галочка — на основном.
import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { heroPickSettled, isCurrentHero, isFramedHero } from "./heroPickFrame";

const knight = { id: "h1", itemId: "i1", templateId: "t-knight" };
const mage = { id: "h2", itemId: "i2", templateId: "t-mage" };
// Спящий: лежит предметом, экземпляра (id) ещё нет.
const sleepyA = { id: null, itemId: "i3", templateId: "t-elf" };
const sleepyB = { id: null, itemId: "i4", templateId: "t-elf" };

describe("рамка и галочка", () => {
  it("без тапа рамка на основном", () => {
    expect(isFramedHero(knight, null, "h1")).toBe(true);
    expect(isFramedHero(mage, null, "h1")).toBe(false);
  });

  it("тап переносит рамку сразу, галочка остаётся на основном", () => {
    expect(isFramedHero(mage, mage, "h1")).toBe(true);
    expect(isFramedHero(knight, mage, "h1")).toBe(false);
    expect(isCurrentHero(knight, "h1")).toBe(true);
    expect(isCurrentHero(mage, "h1")).toBe(false);
  });

  it("спящий герой узнаётся по копии предмета, а не по пустому id", () => {
    expect(isFramedHero(sleepyA, sleepyA, "h1")).toBe(true);
    expect(isFramedHero(sleepyB, sleepyA, "h1")).toBe(false);
  });

  it("без основного спящие не «основные» все разом", () => {
    expect(isCurrentHero(sleepyA, null)).toBe(false);
    expect(isFramedHero(sleepyA, null, null)).toBe(false);
  });

  it("после подтверждения рамка на новом основном", () => {
    expect(isFramedHero(mage, null, "h2")).toBe(true);
    expect(isFramedHero(knight, null, "h2")).toBe(false);
  });
});

describe("ожидание свежих данных после смены", () => {
  it("ждёт список и основного, не перезапуская уже идущие запросы", async () => {
    const refetchQueries = vi.fn().mockResolvedValue(undefined);
    await heroPickSettled({ refetchQueries } as unknown as QueryClient);
    expect(refetchQueries).toHaveBeenCalledWith(
      { queryKey: ["my-heroes"] },
      { cancelRefetch: false },
    );
    expect(refetchQueries).toHaveBeenCalledWith(
      { queryKey: ["my-selected-hero"] },
      { cancelRefetch: false },
    );
  });
});
