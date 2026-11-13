// Количество за покупку: поле «Сколько» в форме есть только у ресурса, поэтому
// у остальных видов оно всегда 1 — невидимое 250 от прошлого ресурса не
// переезжает на артефакт (владелец, 25.10.2026: «за 1250 покупали не 1 а 250»).
import { describe, expect, it } from "vitest";
import { normalizeGiveAmount } from "./marketItem";

describe("normalizeGiveAmount", () => {
  it("ресурс — как набрано, дробь тоже", () => {
    expect(normalizeGiveAmount("resource", 250)).toBe(250);
    expect(normalizeGiveAmount("resource", 0.5)).toBe(0.5);
  });

  it("не ресурс — всегда одна штука", () => {
    for (const kind of ["art", "hero", "pack", "boss", "custom", "tree"] as const) {
      expect(normalizeGiveAmount(kind, 250), kind).toBe(1);
      expect(normalizeGiveAmount(kind, 0.5), kind).toBe(1);
      expect(normalizeGiveAmount(kind, 1), kind).toBe(1);
    }
  });
});
