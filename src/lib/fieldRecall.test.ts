// Отдых после снятия с грядки издалека: три часа, гасится по часам игрока, а
// до гидрации (now = 0) не гасится вовсе — иначе SSR и клиент разойдутся.
import { describe, expect, it } from "vitest";
import { FIELD_RECALL_REST_H, FIELD_RECALL_REST_MS, heroResting } from "./fieldRecall";

const NOW = Date.parse("2026-09-29T12:00:00Z");

describe("heroResting", () => {
  it("правило владельца — три часа", () => {
    expect(FIELD_RECALL_REST_MS).toBe(10_800_000);
    expect(FIELD_RECALL_REST_H).toBe(3);
  });

  it("срок впереди — отдыхает; вышел — свободен", () => {
    expect(heroResting("2026-09-29T14:59:00Z", NOW)).toBe(true);
    expect(heroResting("2026-09-29T11:59:59Z", NOW)).toBe(false);
    expect(heroResting("2026-09-29T12:00:00Z", NOW)).toBe(false);
  });

  it("срока нет, он битый или это SSR — не гасим", () => {
    expect(heroResting(null, NOW)).toBe(false);
    expect(heroResting(undefined, NOW)).toBe(false);
    expect(heroResting("не дата", NOW)).toBe(false);
    expect(heroResting("2026-09-29T14:59:00Z", 0)).toBe(false);
  });
});
