// Разбор артефакта в окне снаряжения: сломанный (прочность 0) до ремонта
// работает как целый — строки иммунитета и рыбалки не гаснут (владелец, 23.10).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GearItemView } from "@/server/api/heroes-gear";

vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return { ...real, useLang: () => "ru" };
});

const { GearItemLines } = await import("./GearItemLines");

const item = (durability: number): GearItemView => ({
  itemId: "a",
  itemIds: ["a"],
  count: 1,
  templateId: "tpl",
  name: "Шлем",
  imageUrl: null,
  rarity: "rare",
  slot: "Голова",
  statType: "attack",
  statAmount: 3,
  immunities: ["Яд"],
  fishBonusPct: 20,
  statKey: "atk",
  parts: [{ kind: "base", statKey: "atk", label: null, amount: 3, applied: true, reason: null }],
  total: 3,
  durability,
});

const html = (d: number) => renderToStaticMarkup(<GearItemLines item={item(d)} />);

describe("GearItemLines и прочность", () => {
  it("сломанный — иммунитет и рыбалка горят, как у целого", () => {
    expect(html(0)).toBe(html(100));
    expect(html(0)).not.toContain("text-muted-foreground");
  });
});
