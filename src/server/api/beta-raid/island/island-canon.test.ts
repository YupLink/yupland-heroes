// Босс острова обучения — только канон (владелец, 13.11.2026): сверх броска острова — руда
// своей клетки, мировые награды шаблона (токены, паки, артефакты, ресурсы) не выдаются.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async () => [] }));
import { islandCanonExtras } from "./island-drops";
import { ISLAND_ITEMS } from "@/lib/raid/island/catalog";

describe("награды босса острова — канон", () => {
  it("руда клетки остаётся, остальное — нет", () => {
    const rows = [
      { kind: "custom", amount: 2, ref: ISLAND_ITEMS.ore },
      { kind: "custom", amount: 1, ref: "art_JHPef2AEJN" },
      { kind: "resource", amount: 5, ref: "wood" },
      { kind: "token", amount: 1000, ref: "Darai" },
    ];
    expect(islandCanonExtras(rows)).toEqual([{ kind: "custom", amount: 2, ref: ISLAND_ITEMS.ore }]);
  });
});
