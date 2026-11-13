// Шаг на карте, а игрок в замке — подсказка ведёт на «Выход в мир» (владелец, 13.11.2026).
// Шагам, путь которых идёт по замку, выход не подсказываем.
import { describe, expect, it } from "vitest";
import { castlePath, GUIDE_PATHS, RETURN_GATES } from "./guidePaths";

describe("выход из замка в подсказках", () => {
  it("шаги на карте — без замка в пути", () => {
    for (const id of ["chest_backpack", "sell", "boat", "spell", "slime_loot"] as const)
      expect(castlePath(GUIDE_PATHS[id] ?? []), id).toBe(false);
    expect(castlePath([])).toBe(false);
  });

  it("шаги в замке, сундук и топор (уже ведут через ворота) — выход не добавляем", () => {
    for (const id of ["hero", "short_chest", "short_axe", "x_castle"] as const)
      expect(castlePath(GUIDE_PATHS[id] ?? []), id).toBe(true);
  });

  it("ворота — постройка замка «gates»", () => {
    expect(RETURN_GATES.sel).toBe('[data-modular-building="gates"]');
    expect(RETURN_GATES.tip).toBe("island.hop.return_island");
  });
});
