// Износ артефактов (владелец, 22.10.2026): срок по редкости, удар снимает шаг,
// на нуле сломан и дальше не меняется.
import { describe, expect, it } from "vitest";
import {
  ART_LIFE,
  BROKEN_ART_PENALTY,
  artBroken,
  artDisabled,
  artDurability,
  artHit,
  artLifeOf,
  artStepSql,
  artWearOf,
} from "./artWear";

/** Сколько ударов до поломки с нуля — тем же artHit, что повторяет SQL. */
function hitsToBreak(rarity: string): number {
  let wear = 0;
  let hits = 0;
  while (!artBroken(wear)) {
    wear = artHit(wear, rarity);
    hits++;
    if (hits > 1000) throw new Error("не ломается");
  }
  return hits;
}

describe("artWear", () => {
  it("срок службы по редкости: 50 / 100 / 250 / 500, незнакомая — как обычный", () => {
    expect(ART_LIFE).toEqual({ common: 50, rare: 100, epic: 250, legendary: 500 });
    expect(artLifeOf("Legendary")).toBe(500);
    expect(artLifeOf("epic")).toBe(250);
    expect(artLifeOf(null)).toBe(50);
    expect(artLifeOf("mythic")).toBe(50);
  });

  it("каждая редкость ломается ровно на своём ударе — разные сроки", () => {
    expect(hitsToBreak("common")).toBe(50);
    expect(hitsToBreak("rare")).toBe(100);
    expect(hitsToBreak("epic")).toBe(250);
    expect(hitsToBreak("legendary")).toBe(500);
  });

  it("удар снимает шаг 100/срок; за ход до конца ещё цел", () => {
    expect(artHit(0, "common")).toBe(2);
    expect(artHit(0, "rare")).toBe(1);
    expect(artHit(0, "legendary")).toBeCloseTo(0.2, 10);
    expect(artBroken(artHit(98, "common"))).toBe(true);
    expect(artBroken(99.2 /* 248 ударов эпика */)).toBe(false);
    expect(artBroken(artHit(99.2, "epic"))).toBe(false);
  });

  it("сломанный не меняется и выше 100 не бывает", () => {
    expect(artHit(100, "common")).toBe(100);
    expect(artHit(250, "epic")).toBe(100);
    expect(artWearOf(250)).toBe(100);
    expect(artWearOf(-3)).toBe(0);
  });

  it("прочность: новый 100, снято 37,5 — 62,5, сломанный 0; из базы бывает строкой", () => {
    expect(artDurability(0)).toBe(100);
    expect(artDurability(null)).toBe(100);
    expect(artDurability("37.50000000000000000000")).toBe(62.5);
    expect(artDurability(100)).toBe(0);
    expect(artBroken("100.00000000000000000000")).toBe(true);
    expect(artBroken("99.5")).toBe(false);
  });

  it("до ремонта поломка ничего не отнимает: флаг выключен, сломанный не выключен", () => {
    expect(BROKEN_ART_PENALTY).toBe(false);
    expect(artDisabled(100)).toBe(false);
    expect(artDisabled("100.00000000000000000000")).toBe(false);
    expect(artDisabled(37.5)).toBe(false);
  });

  it("со штрафом (вместе с ремонтом) выключается только сломанный", () => {
    expect(artDisabled(100, true)).toBe(true);
    expect(artDisabled(99.5, true)).toBe(false);
    expect(artDisabled(0, true)).toBe(false);
  });

  it("износ списывается и без штрафа: удары доводят до поломки", () => {
    let wear = 0;
    for (let i = 0; i < 125; i++) wear = artHit(wear, "rare");
    expect(artBroken(wear)).toBe(true);
    expect(artDurability(wear)).toBe(0);
    expect(artDisabled(wear)).toBe(false);
  });

  it("SQL шага — точные десятичные дроби из той же таблицы", () => {
    const sql = artStepSql("t.rarity");
    expect(sql).toContain("lower(COALESCE(t.rarity, ''))");
    expect(sql).toContain("WHEN 'rare' THEN 100.0 / 100");
    expect(sql).toContain("WHEN 'epic' THEN 100.0 / 250");
    expect(sql).toContain("WHEN 'legendary' THEN 100.0 / 500");
    expect(sql).toContain("ELSE 100.0 / 50");
  });
});
