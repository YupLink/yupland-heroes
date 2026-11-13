// Случайный приз бокса (владелец, 04.11.2026): «любой арт по редкости, любого
// героя по редкости, любой товар» — какой именно, решается при открытии.
import { beforeEach, describe, expect, it, vi } from "vitest";

const exec = vi.fn();
vi.mock("../db/mcpClient", () => ({ mcpExec: (...a: unknown[]) => exec(...a) }));

import { heroesOf, pickOne, resolveTier } from "./mystic-resolve";
import { mysticTierSchema } from "./mystic-pool";
import { randomPrizeLabel } from "@/lib/mysticKinds";

const ok = (t: unknown) => mysticTierSchema.safeParse(t).success;

describe("пул: случайные призы", () => {
  it("артефакт и герой — конкретный или редкость; товар — конкретный или «любой»", () => {
    expect(ok({ kind: "artifact", weight: 5, artifactRarity: "epic" })).toBe(true);
    expect(ok({ kind: "hero", weight: 5, heroRarity: "legendary" })).toBe(true);
    expect(ok({ kind: "custom", weight: 5, customAny: true, amountMin: 1, amountMax: 3 })).toBe(
      true,
    );
    expect(ok({ kind: "artifact", weight: 5 })).toBe(false);
    expect(ok({ kind: "hero", weight: 5, artifactRarity: "epic" })).toBe(false);
    expect(ok({ kind: "custom", weight: 5, amountMin: 1, amountMax: 3 })).toBe(false);
  });

  it("подписи в конструкторе", () => {
    expect(randomPrizeLabel({ kind: "artifact", artifactRarity: "epic" })).toBe(
      "Любой эпический артефакт",
    );
    expect(randomPrizeLabel({ kind: "hero", heroRarity: "rare" })).toBe(
      "Любой редкий герой (3–3,5★)",
    );
    expect(randomPrizeLabel({ kind: "custom", customAny: true })).toBe("Любой товар");
    expect(
      randomPrizeLabel({ kind: "artifact", itemTemplateId: "art_1", artifactRarity: "epic" }),
    ).toBeNull();
  });
});

describe("выбор при открытии", () => {
  beforeEach(() => exec.mockReset());

  it("редкость героя — по звёздам: 1–2 обычный, 3–3,5 редкий, 4–4,5 эпический, 5 легендарный", () => {
    const all = [1, 2, 3, 3.5, 4, 4.5, 5].map((level, i) => ({
      id: `h${i}`,
      name: `H${i}`,
      level,
    }));
    expect(heroesOf(all, "common").map((h) => h.level)).toEqual([1, 2]);
    expect(heroesOf(all, "rare").map((h) => h.level)).toEqual([3, 3.5]);
    expect(heroesOf(all, "epic").map((h) => h.level)).toEqual([4, 4.5]);
    expect(heroesOf(all, "legendary").map((h) => h.level)).toEqual([5]);
  });

  it("каждый подходящий выпадает примерно поровну", () => {
    const hits = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const x = pickOne(["a", "b", "c"])!;
      hits.set(x, (hits.get(x) ?? 0) + 1);
    }
    for (const n of hits.values()) expect(n).toBeGreaterThan(1700);
    expect(pickOne([])).toBeNull();
  });

  it("любой эпический артефакт → конкретный шаблон из эпических", async () => {
    exec.mockResolvedValueOnce([{ id: "art_e1", name: "Клинок" }]);
    const t = await resolveTier({ kind: "artifact", weight: 5, artifactRarity: "epic" });
    expect(t).toMatchObject({
      itemTemplateId: "art_e1",
      itemName: "Клинок",
      artifactRarity: "epic",
    });
    const sql = String(exec.mock.calls[0][0]);
    expect(sql).toContain("rarity = 'epic'");
    // Уникальный арт генератора, арт лаборатории и кони из бокса не выпадают (08.11).
    expect(sql).toContain("coalesce(meta->>'unique', '') <> 'true'");
    expect(sql).toContain("coalesce(slot, '') <> 'Конь'");
  });

  it("уникальный герой, который уже у кого-то есть, из бокса не выпадает", async () => {
    exec
      .mockResolvedValueOnce([
        { id: "h5a", name: "Занят", level: 5 },
        { id: "h5b", name: "Свободен", level: 5 },
      ])
      .mockResolvedValueOnce([{ id: "h5a" }]);
    for (let i = 0; i < 20; i++) {
      exec.mockClear();
      const t = await resolveTier({ kind: "hero", weight: 5, heroRarity: "legendary" });
      expect(t).toMatchObject({ itemTemplateId: "h5b" });
      exec
        .mockResolvedValueOnce([
          { id: "h5a", name: "Занят", level: 5 },
          { id: "h5b", name: "Свободен", level: 5 },
        ])
        .mockResolvedValueOnce([{ id: "h5a" }]);
    }
  });

  it("любой легендарный герой → только 5★", async () => {
    exec.mockResolvedValueOnce([
      { id: "h4", name: "Четыре", level: 4 },
      { id: "h5", name: "Пять", level: 5 },
    ]);
    const t = await resolveTier({ kind: "hero", weight: 5, heroRarity: "legendary" });
    expect(t).toMatchObject({ itemTemplateId: "h5", itemName: "Пять" });
  });

  it("любой товар → один из каталога, количество — как в тире", async () => {
    exec.mockResolvedValueOnce([{ id: "cst_x", name: "Хлеб" }]);
    const t = await resolveTier({
      kind: "custom",
      weight: 5,
      customAny: true,
      amountMin: 2,
      amountMax: 4,
    });
    expect(t).toMatchObject({ customId: "cst_x", customName: "Хлеб", amountMin: 2, amountMax: 4 });
  });

  it("подходящих нет — «пусто»; конкретный приз — как есть, без запросов", async () => {
    exec.mockResolvedValueOnce([]);
    expect(
      await resolveTier({ kind: "artifact", weight: 5, artifactRarity: "legendary" }),
    ).toBeNull();
    const fixed = {
      kind: "artifact" as const,
      weight: 5,
      itemTemplateId: "art_1",
      itemName: "Щит",
    };
    expect(await resolveTier(fixed)).toBe(fixed);
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
